"""
TrustTrade Webhook Routes
Handles TradeSafe webhook notifications and alerts
"""

import ipaddress
import json
import logging
import os
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, Request

from core.database import get_database
from core.security import get_user_from_token

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["Webhooks"])

DEFAULT_TRADESAFE_IP_RANGES = "197.242.78.0/24,41.203.0.0/16,127.0.0.1"


def _load_tradesafe_ip_ranges() -> list:
    configured_ranges = os.environ.get("TRADESAFE_IP_RANGES") or DEFAULT_TRADESAFE_IP_RANGES
    networks = []
    for item in configured_ranges.split(","):
        value = item.strip()
        if not value:
            continue
        try:
            networks.append(ipaddress.ip_network(value, strict=False))
        except ValueError:
            logger.error(f"[WEBHOOK] Invalid TRADESAFE_IP_RANGES entry ignored: {value!r}")
    if not networks:
        logger.error("[WEBHOOK] No valid TRADESAFE_IP_RANGES configured; webhook allowlist will reject all requests")
    return networks


TRADESAFE_IP_RANGES = _load_tradesafe_ip_ranges()


def _normalize_client_ip(ip: str) -> str:
    ip = (ip or "").strip()
    if ip.startswith("[") and "]" in ip:
        return ip[1:ip.index("]")]
    if ip.count(":") == 1 and "." in ip:
        return ip.rsplit(":", 1)[0]
    return ip


def _is_tradesafe_ip(ip: str) -> bool:
    try:
        client_ip = ipaddress.ip_address(_normalize_client_ip(ip))
    except ValueError:
        return False
    return any(client_ip in network for network in TRADESAFE_IP_RANGES)


async def _bg(coro):
    """Fire-and-forget: run a coroutine and swallow/log any exception."""
    try:
        await coro
    except Exception as exc:
        logger.error(f"[WEBHOOK_BG] {exc}")


async def _handle_smart_deal_funded(deal: dict, db, state: str = "FUNDS_DEPOSITED") -> None:
    """Mark a Smart Deal FUNDED using the SAME fields and emails as a normal
    transaction's FUNDS_DEPOSITED path.

    - payment_status → "Funds Secured", tradesafe_state, release_status, auto_release_at.
    - Buyer (client) gets the "payment secured" email; the seller (freelancer) email
      fires only on FUNDS_DEPOSITED (not FUNDS_RECEIVED), exactly like normal txns.
    - send_email_with_tracking dedups, so re-delivered webhooks never double-send.
    """
    import asyncio

    deal_id = deal["deal_id"]
    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()
    auto_release_at = (now + timedelta(hours=48)).isoformat()
    already_funded = deal.get("status") == "FUNDED"

    await db.transactions.update_one(
        {"deal_id": deal_id},
        {"$set": {
            "status": "FUNDED",
            "payment_status": "Funds Secured",
            "tradesafe_state": state,
            "release_status": "In Escrow",
            "funds_received_at": deal.get("funds_received_at") or now_iso,
            "auto_release_at": auto_release_at,
            "funded_at": deal.get("funded_at") or now,
            "updated_at": now,
        }},
    )
    logger.info(f"[WEBHOOK] Smart deal {deal_id} → FUNDED (payment_status=Funds Secured, state={state})")

    # PAYOUT_SYNC: sync freelancer banking to their TradeSafe token (once).
    if not already_funded:
        from routes.smart_deals import _sync_seller_banking
        asyncio.create_task(_bg(_sync_seller_banking(deal, db)))

    # Same emails as a normal transaction, with the same dedup keys.
    import email_service
    from webhook_handler import send_email_with_tracking, EmailEvent

    ref = deal.get("transaction_id") or deal_id
    share_code = deal.get("share_code", deal_id)
    item_description = deal.get("item_description") or deal.get("title", "Digital work")
    amount = float(deal.get("item_price") or deal.get("amount") or 0)
    buyer_email = deal.get("buyer_email") or deal.get("client_email", "")
    buyer_name = deal.get("buyer_name") or deal.get("client_name") or buyer_email
    seller_email = deal.get("seller_email") or deal.get("freelancer_email", "")
    seller_name = deal.get("seller_name") or deal.get("freelancer_name") or seller_email

    # Buyer/client — "payment secured, work can begin"
    asyncio.create_task(_bg(send_email_with_tracking(
        db, ref, EmailEvent.PAYMENT_SECURED_BUYER, buyer_email,
        email_service.send_immediate_payment_secured_email,
        to_email=buyer_email, to_name=buyer_name, share_code=share_code,
        item_description=item_description, amount=amount, delivery_method="digital",
    )))

    # Seller/freelancer — only once funds have actually cleared (FUNDS_DEPOSITED).
    if state == "FUNDS_DEPOSITED":
        asyncio.create_task(_bg(send_email_with_tracking(
            db, ref, EmailEvent.PAYMENT_SECURED_SELLER, seller_email,
            email_service.send_payment_received_email,
            to_email=seller_email, to_name=seller_name, share_code=share_code,
            item_description=item_description, amount=amount, role="seller", delivery_method="digital",
        )))


async def _handle_milestone_funded(child: dict, db, state: str = "FUNDS_DEPOSITED") -> None:
    """Mark a milestone child FUNDED (same fields as a normal txn), mirror the status
    onto the parent deal's milestones[], sync banking, and notify both parties.
    Only fires the milestone emails on the funding transition (re-delivered webhooks
    that find it already FUNDED are no-ops)."""
    import asyncio

    child_id = child["deal_id"]
    parent_id = child.get("parent_deal_id")
    milestone_id = child.get("milestone_id")
    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()
    auto_release_at = (now + timedelta(hours=48)).isoformat()
    already_funded = child.get("status") == "FUNDED"

    await db.transactions.update_one(
        {"deal_id": child_id},
        {"$set": {
            "status": "FUNDED",
            "payment_status": "Funds Secured",
            "tradesafe_state": state,
            "release_status": "In Escrow",
            "funds_received_at": child.get("funds_received_at") or now_iso,
            "auto_release_at": auto_release_at,
            "funded_at": child.get("funded_at") or now,
            "updated_at": now,
        }},
    )

    # Mirror onto the parent milestone + advance the parent to IN_PROGRESS.
    if parent_id and milestone_id:
        from routes.smart_deals import _set_milestone_fields
        await _set_milestone_fields(db, parent_id, milestone_id, {"status": "FUNDED", "funded_at": now})
        await db.transactions.update_one(
            {"deal_id": parent_id, "status": {"$nin": ["COMPLETE", "DISPUTED"]}},
            {"$set": {"status": "IN_PROGRESS", "updated_at": now}},
        )

    logger.info(f"[WEBHOOK] Milestone {child_id} → FUNDED (state={state})")

    if already_funded:
        return

    # Sync seller banking to their TradeSafe token (once), then notify both parties.
    from routes.smart_deals import _sync_seller_banking
    asyncio.create_task(_bg(_sync_seller_banking(child, db)))

    parent = await db.transactions.find_one({"deal_id": parent_id}) if parent_id else None
    milestone = None
    if parent:
        milestone = next((m for m in parent.get("milestones", []) if m.get("milestone_id") == milestone_id), None)
    if parent and milestone:
        import email_service
        asyncio.create_task(_bg(email_service.send_milestone_funded(
            parent, milestone,
            parent.get("client_name") or parent.get("client_email", ""),
            parent.get("freelancer_name") or parent.get("freelancer_email", ""),
        )))


async def _handle_milestone_released(child: dict, db, state: str = "FUNDS_RELEASED") -> None:
    """Run the proven released → withdrawal pipeline on the milestone child, then
    advance the parent (mark milestone RELEASED, open the next, recompute status)."""
    await handle_released_transaction(db, child, state=state, source="webhook:milestone")
    parent_id = child.get("parent_deal_id")
    milestone_id = child.get("milestone_id")
    if parent_id and milestone_id:
        from routes.smart_deals import advance_parent_milestone_released
        await advance_parent_milestone_released(db, parent_id, milestone_id)


async def attempt_transaction_withdrawal(db, txn: dict, source: str = "webhook") -> dict:
    """
    Idempotently withdraw released seller-token funds to the seller bank account.
    withdrawal_triggered is only true after tokenAccountWithdraw returns true.
    """
    txn_id = txn.get("transaction_id")
    seller_token_id = txn.get("tradesafe_seller_token_id")
    net_amount = txn.get("net_amount")
    status_before = txn.get("withdrawal_status")
    now_iso = datetime.now(timezone.utc).isoformat()

    if not txn_id:
        return {"success": False, "error": "Missing transaction_id"}

    async def _audit(action: str, details: dict):
        try:
            from services.reconciliation_service import write_audit_record
            await write_audit_record(db, action, source, transaction_id=txn_id, details=details)
        except Exception as exc:
            logger.error(f"[FINANCE_AUDIT] failed action={action} txn={txn_id}: {exc}")

    if status_before in ("in_progress", "succeeded", "auto_settled"):
        logger.info(
            f"[WITHDRAWAL] skip txn={txn_id} seller_token_id={seller_token_id} "
            f"requested_amount={net_amount} withdrawal_status_before={status_before} "
            f"withdrawal_status_after={status_before} reason=already_{status_before}"
        )
        return {
            "success": status_before == "succeeded",
            "skipped": True,
            "reason": f"withdrawal already {status_before}",
        }

    try:
        withdrawal_amount = float(net_amount)
    except (TypeError, ValueError):
        withdrawal_amount = 0

    if not seller_token_id:
        error = "Missing seller token ID"
    elif withdrawal_amount <= 0:
        error = "Missing or invalid net_amount"
    else:
        error = None

    logger.info(
        f"[WITHDRAWAL] start txn={txn_id} seller_token_id={seller_token_id} "
        f"requested_amount=R{withdrawal_amount:.2f} withdrawal_status_before={status_before} source={source}"
    )

    if error:
        await db.transactions.update_one(
            {"transaction_id": txn_id},
            {"$set": {
                "withdrawal_status": "failed",
                "withdrawal_triggered": False,
                "withdrawal_error": error,
                "withdrawal_failed_at": now_iso,
                "payout_status": "payout_failed",
                "settlement_status": "withdrawal_failed",
                "settlement_checked_at": now_iso,
                "expected_settlement_window": "up to 2 business days",
                "payout_sla_status": "critical",
            }}
        )
        logger.error(
            f"[WITHDRAWAL] failed txn={txn_id} seller_token_id={seller_token_id} "
            f"requested_amount=R{withdrawal_amount:.2f} withdrawal_status_before={status_before} "
            f"withdrawal_status_after=failed error={error}"
        )
        await _audit("payout_failure", {"error": error, "seller_token_id": seller_token_id, "amount": withdrawal_amount})
        return {"success": False, "error": error}

    # For IMMEDIATE payout tokens TradeSafe automatically transfers funds to the
    # seller's bank account when they are released — calling tokenAccountWithdraw
    # on these tokens is incorrect and will be rejected. Only WALLET tokens need
    # an explicit withdrawal call.
    from tradesafe_service import get_token_details as _get_token_details
    _token_info = await _get_token_details(seller_token_id)
    _payout_interval = (
        ((_token_info or {}).get("settings") or {}).get("payout") or {}
    ).get("interval")

    if _payout_interval == "IMMEDIATE":
        logger.info(
            f"[WITHDRAWAL] auto-payout txn={txn_id} seller_token_id={seller_token_id} "
            f"payout_interval=IMMEDIATE — skipping tokenAccountWithdraw, "
            f"TradeSafe handles IMMEDIATE payouts automatically"
        )
        await _audit("withdrawal_skipped_auto_payout", {
            "seller_token_id": seller_token_id,
            "payout_interval": _payout_interval,
        })
        await db.transactions.update_one(
            {"transaction_id": txn_id},
            {"$set": {
                "withdrawal_status": "auto_settled",
                "withdrawal_triggered": False,
                "payout_status": "auto_settled",
                "settlement_status": "auto_settled",
                "settlement_checked_at": now_iso,
                "payout_interval": _payout_interval,
            }}
        )
        return {
            "success": True,
            "skipped": True,
            "seller_token_id": seller_token_id,
            "payout_interval": _payout_interval,
            "reason": "IMMEDIATE payout — TradeSafe auto-settles, tokenAccountWithdraw not called",
        }

    claim = await db.transactions.update_one(
        {
            "transaction_id": txn_id,
            "withdrawal_status": {"$nin": ["in_progress", "succeeded"]},
        },
        {"$set": {
            "withdrawal_status": "in_progress",
            "withdrawal_requested_at": now_iso,
            "withdrawal_triggered": False,
            "withdrawal_started_at": now_iso,
            "withdrawal_source": source,
            "payout_status": "withdrawal_initiated",
            "settlement_status": "withdrawal_initiated",
            "settlement_checked_at": now_iso,
            "payout_processing_started_at": now_iso,
            "expected_settlement_window": "up to 2 business days",
            "payout_sla_status": "on_track",
        }}
    )

    if claim.modified_count != 1:
        logger.info(
            f"[WITHDRAWAL] duplicate-prevented txn={txn_id} seller_token_id={seller_token_id} "
            f"requested_amount=R{withdrawal_amount:.2f} withdrawal_status_before={status_before}"
        )
        await _audit("withdrawal_duplicate_prevented", {"seller_token_id": seller_token_id, "amount": withdrawal_amount})
        return {"success": False, "skipped": True, "reason": "withdrawal already claimed"}

    logger.info(
        f"[WITHDRAWAL] claimed txn={txn_id} seller_token_id={seller_token_id} "
        f"requested_amount=R{withdrawal_amount:.2f} withdrawal_status_before={status_before} "
        f"withdrawal_status_after=in_progress"
    )
    await _audit("withdrawal_requested", {"seller_token_id": seller_token_id, "amount": withdrawal_amount})

    # Verify the seller token actually holds enough balance before withdrawing.
    # TradeSafe can lag crediting the seller token right after FUNDS_RELEASED, so if
    # the balance is short we wait once (30s) and re-check before attempting payout.
    from tradesafe_service import get_token_details

    async def _token_balance(token_id: str):
        details = await get_token_details(token_id)
        if not details:
            return None
        bal = details.get("balance_rands")
        if bal is None:
            try:
                bal = round(float(details.get("balance") or 0), 2)
            except (TypeError, ValueError):
                bal = None
        return bal

    balance_before = await _token_balance(seller_token_id)
    logger.info(
        f"[WITHDRAWAL] balance-check txn={txn_id} seller_token_id={seller_token_id} "
        f"balance_before={balance_before} required=R{withdrawal_amount:.2f}"
    )
    await _audit("withdrawal_balance_check", {
        "seller_token_id": seller_token_id, "balance": balance_before,
        "required": withdrawal_amount, "phase": "before",
    })

    if balance_before is not None and balance_before < withdrawal_amount:
        import asyncio
        logger.warning(
            f"[WITHDRAWAL] insufficient balance txn={txn_id} seller_token_id={seller_token_id} "
            f"balance=R{balance_before:.2f} < required=R{withdrawal_amount:.2f} — "
            f"waiting 30s for TradeSafe to credit, then retrying once"
        )
        await asyncio.sleep(30)
        balance_after = await _token_balance(seller_token_id)
        logger.info(
            f"[WITHDRAWAL] balance-recheck txn={txn_id} seller_token_id={seller_token_id} "
            f"balance_after={balance_after} required=R{withdrawal_amount:.2f}"
        )
        await _audit("withdrawal_balance_check", {
            "seller_token_id": seller_token_id, "balance": balance_after,
            "required": withdrawal_amount, "phase": "after",
        })

        if balance_after is not None and balance_after < withdrawal_amount:
            error = (
                f"Insufficient seller token balance after retry: "
                f"R{balance_after:.2f} < required R{withdrawal_amount:.2f}"
            )
            finished_at = datetime.now(timezone.utc).isoformat()
            await db.transactions.update_one(
                {"transaction_id": txn_id},
                {"$set": {
                    "withdrawal_status": "failed",
                    "withdrawal_triggered": False,
                    "withdrawal_failed_at": finished_at,
                    "withdrawal_error": error,
                    "payout_status": "payout_failed",
                    "settlement_status": "withdrawal_failed",
                    "settlement_checked_at": finished_at,
                    "expected_settlement_window": "up to 2 business days",
                    "payout_sla_status": "critical",
                }}
            )
            logger.error(
                f"[WITHDRAWAL] failed txn={txn_id} seller_token_id={seller_token_id} "
                f"requested_amount=R{withdrawal_amount:.2f} withdrawal_status_before={status_before} "
                f"withdrawal_status_after=failed error={error}"
            )
            await _audit("payout_failure", {
                "error": error, "seller_token_id": seller_token_id,
                "amount": withdrawal_amount, "balance": balance_after,
            })
            return {"success": False, "error": error, "seller_token_id": seller_token_id, "amount": withdrawal_amount}

    try:
        from tradesafe_service import withdraw_token_funds_result
        tradesafe_response = await withdraw_token_funds_result(
            seller_token_id,
            withdrawal_amount,
            rtc=False,
            transaction_id=txn_id,
            source=source,
        )
        withdrawal_ok = bool(tradesafe_response.get("success"))
    except Exception as exc:
        withdrawal_ok = False
        error = str(exc)
        tradesafe_response = {"success": False, "error": error}
    else:
        error = tradesafe_response.get("error")

    finished_at = datetime.now(timezone.utc).isoformat()

    if withdrawal_ok:
        await db.transactions.update_one(
            {"transaction_id": txn_id},
            {"$set": {
                "withdrawal_status": "succeeded",
                "withdrawal_triggered": True,
                "withdrawal_triggered_at": finished_at,
                "withdrawal_completed_at": finished_at,
                "withdrawal_error": None,
                "payout_status": "payout_processing",
                "settlement_status": "bank_processing",
                "settlement_checked_at": finished_at,
                "payout_processing_started_at": txn.get("payout_processing_started_at") or now_iso,
                "expected_settlement_window": "up to 2 business days",
                "payout_sla_status": "on_track",
                "tradesafe_withdrawal_id": None,
                "bank_reference": None,
                "settlement_reference": None,
            }}
        )
        logger.info(
            f"[WITHDRAWAL] succeeded txn={txn_id} seller_token_id={seller_token_id} "
            f"requested_amount=R{withdrawal_amount:.2f} withdrawal_status_before={status_before} "
            f"withdrawal_status_after=succeeded tradesafe_response={tradesafe_response.get('raw_response')}"
        )
        await _audit("withdrawal_succeeded", {"seller_token_id": seller_token_id, "amount": withdrawal_amount})
        return {"success": True, "seller_token_id": seller_token_id, "amount": withdrawal_amount}

    await db.transactions.update_one(
        {"transaction_id": txn_id},
        {"$set": {
            "withdrawal_status": "failed",
            "withdrawal_triggered": False,
            "withdrawal_failed_at": finished_at,
            "withdrawal_error": error,
            "payout_status": "payout_failed",
            "settlement_status": "withdrawal_failed",
            "settlement_checked_at": finished_at,
            "expected_settlement_window": "up to 2 business days",
            "payout_sla_status": "critical",
        }}
    )
    logger.error(
        f"[WITHDRAWAL] failed txn={txn_id} seller_token_id={seller_token_id} "
        f"requested_amount=R{withdrawal_amount:.2f} withdrawal_status_before={status_before} "
        f"withdrawal_status_after=failed tradesafe_response={tradesafe_response.get('raw_response')} error={error}"
    )
    await _audit("payout_failure", {"error": error, "seller_token_id": seller_token_id, "amount": withdrawal_amount})
    return {"success": False, "error": error, "seller_token_id": seller_token_id, "amount": withdrawal_amount}


async def handle_released_transaction(db, txn: dict, state: str = "FUNDS_RELEASED", source: str = "webhook") -> dict:
    """Persist released state, then run the idempotent withdrawal helper."""
    txn_id = txn.get("transaction_id") or txn.get("deal_id")
    now_iso = datetime.now(timezone.utc).isoformat()

    await db.transactions.update_one(
        {"_id": txn["_id"]},
        {"$set": {
            "tradesafe_state": state,
            "payment_status": "Completed",
            "release_status": "Released",
            "payout_status": txn.get("payout_status") or "awaiting_bank_payout",
            "withdrawal_status": txn.get("withdrawal_status") or "pending",
            "funds_released_at": txn.get("funds_released_at") or now_iso,
            "released_at": txn.get("released_at") or now_iso,
            "expected_settlement_window": "up to 2 business days",
            "payout_sla_status": txn.get("payout_sla_status") or "on_track",
            "last_funds_released_webhook_at": now_iso,
        }}
    )

    latest = await db.transactions.find_one({"_id": txn["_id"]}, {"_id": 0})
    result = await attempt_transaction_withdrawal(db, latest or txn, source=source)
    logger.info(f"[WITHDRAWAL] released-state withdrawal result txn={txn_id}: {result}")

    # The seller MUST always be told their money is on the way the moment funds are
    # released — for IMMEDIATE (auto_settled) AND WALLET (payout_processing) tokens.
    # send_email_with_tracking dedups on FUNDS_RELEASED_SELLER, so this is safe to
    # call on every released-state webhook.
    await notify_seller_funds_released(db, latest or txn)

    return result


async def notify_seller_funds_released(db, txn: dict) -> None:
    """Notify BOTH parties that funds have been released (deduped, best-effort).

    Seller: 'Your payout is on its way' email + SMS.
    Buyer:  'Payment released to the seller — transaction complete' email.
    """
    import email_service
    import sms_service
    from webhook_handler import (
        EmailEvent,
        send_email_with_tracking,
        send_sms_with_tracking,
        has_email_been_sent,
        mark_email_sent,
    )

    txn_id = txn.get("transaction_id") or txn.get("deal_id")
    reference = txn.get("share_code") or txn_id
    item_description = txn.get("item_description") or txn.get("title", "")
    amount = float(txn.get("item_price") or txn.get("amount") or 0)

    seller_email = txn.get("seller_email") or txn.get("freelancer_email") or ""
    seller_name = txn.get("seller_name") or txn.get("freelancer_name") or "Seller"
    seller_phone = txn.get("seller_phone") or txn.get("freelancer_phone")
    # Resolve the seller's real bank name (and phone, for Smart Deals which don't
    # store it on the doc) from their user record.
    bank_name = ""
    if seller_email:
        seller_user = await db.users.find_one(
            {"email": seller_email},
            {"phone": 1, "mobile": 1, "banking_details": 1, "bank_name": 1},
        )
        if seller_user:
            if not seller_phone:
                seller_phone = seller_user.get("phone") or seller_user.get("mobile")
            banking = seller_user.get("banking_details") or {}
            bank_name = banking.get("bank_name") or seller_user.get("bank_name") or ""
    net_amount = float(txn.get("net_amount") or txn.get("seller_receives") or 0)
    # The actual TrustTrade fee charged on this deal (max(2%, R5)), regardless of
    # who paid it — so the payout email never shows R0.00.
    fee_amount = float(txn.get("trusttrade_fee") or txn.get("platform_fee") or 0)
    buyer_total = float(txn.get("total") or amount)
    courier_fee = float(txn.get("courier_fee") or 0)
    arrival_date = email_service.format_payout_arrival_date()

    if seller_email:
        await send_email_with_tracking(
            db, txn_id, EmailEvent.FUNDS_RELEASED_SELLER,
            seller_email,
            email_service.send_funds_released_email,
            to_email=seller_email,
            to_name=seller_name,
            share_code=reference,
            item_description=item_description,
            amount=amount,
            net_amount=net_amount,
            bank_name=bank_name,
            fee_amount=fee_amount,
            buyer_total=buyer_total,
            courier_fee=courier_fee,
        )

    # SMS has no built-in dedup, and this helper may run on several release paths
    # (manual confirm, immediate release, auto-release, AND the later webhook).
    # Guard with the same per-transaction tracking set so the seller gets ONE SMS.
    if seller_phone and not await has_email_been_sent(db, txn_id, "funds_released_sms"):
        sent = await send_sms_with_tracking(
            db, txn_id, "funds_released_sms",
            seller_phone,
            sms_service.send_funds_released_sms,
            to_phone=seller_phone,
            amount=net_amount,
            reference=reference,
            arrival_date=arrival_date,
            bank_name=bank_name,
        )
        if sent:
            await mark_email_sent(db, txn_id, "funds_released_sms")

    # Tell the buyer their payment has been released and the deal is complete.
    buyer_email = txn.get("buyer_email") or txn.get("client_email") or ""
    buyer_name = txn.get("buyer_name") or txn.get("client_name") or "there"
    if buyer_email:
        await send_email_with_tracking(
            db, txn_id, EmailEvent.FUNDS_RELEASED_BUYER,
            buyer_email,
            email_service.send_funds_released_buyer_email,
            to_email=buyer_email,
            to_name=buyer_name,
            share_code=reference,
            item_description=item_description,
            amount=amount,
        )

    logger.info(f"[WITHDRAWAL] buyer+seller notified funds-released txn={txn_id}")


@router.get("/webhook-test")
async def webhook_test():
    return {"status": "ok"}


@router.post("/tradesafe-webhook")
async def tradesafe_webhook(request: Request):
    raw_body = await request.body()
    headers = dict(request.headers)

    # Log the source IP for every inbound webhook request
    client_ip = (
        request.headers.get("x-forwarded-for", "").split(",")[0].strip()
        or request.headers.get("x-real-ip", "")
        or (request.client.host if request.client else "unknown")
    )
    client_ip = _normalize_client_ip(client_ip)

    logger.info("=" * 60)
    logger.info("[WEBHOOK] ===== INCOMING POST /api/tradesafe-webhook =====")
    logger.info(f"[WEBHOOK] incoming ip={client_ip}")
    logger.info(f"[WEBHOOK] Content-Type: {request.headers.get('content-type', 'not-set')}")
    logger.info(f"[WEBHOOK] User-Agent: {request.headers.get('user-agent', 'not-set')}")
    logger.info(f"[WEBHOOK] X-TradeSafe-*: { {k: v for k, v in headers.items() if 'tradesafe' in k.lower()} }")
    logger.info(f"[WEBHOOK] Body size: {len(raw_body)} bytes")
    logger.info(f"[WEBHOOK] Raw body: {raw_body.decode('utf-8', errors='replace')}")
    logger.info("=" * 60)

    if not _is_tradesafe_ip(client_ip):
        logger.warning(f"[WEBHOOK] REJECTED ip={client_ip}")
        raise HTTPException(status_code=401, detail="Unauthorized")
    logger.info(f"[WEBHOOK] ACCEPTED ip={client_ip}")

    # Always return 200 so TradeSafe doesn't keep retrying on parse errors
    if not raw_body:
        logger.warning("[WEBHOOK] Empty body received — possibly a connectivity check from TradeSafe")
        return {"ok": True}

    try:
        payload = json.loads(raw_body)
    except Exception as exc:
        logger.error(f"[WEBHOOK] JSON parse failed: {exc} — raw={raw_body[:200]}")
        return {"ok": True}  # Still 200 to stop retries

    logger.info(f"[WEBHOOK] Parsed payload keys: {list(payload.keys())}")
    logger.info(f"[WEBHOOK] Full payload: {json.dumps(payload, default=str)}")

    # TradeSafe sends { "data": { "id": ..., "state": ..., "reference": ... } }
    # or the flat form { "id": ..., "state": ..., "reference": ... }
    data = payload.get("data") or payload
    tradesafe_id = data.get("id")
    state = (data.get("state") or "").upper()
    reference = data.get("reference") or ""
    event_type = payload.get("event") or payload.get("type") or "unknown"

    logger.info(f"[WEBHOOK] state={state} reference={reference} tradesafe_id={tradesafe_id}")

    # Layer 3: payload structure validation — must carry at least an id or reference
    if not tradesafe_id and not reference:
        logger.warning(f"[WEBHOOK] Rejected malformed payload from ip={client_ip!r}: no id or reference")
        return {"ok": True}  # 200 so TradeSafe doesn't retry a genuinely malformed body

    db = get_database()

    # Layer 4: cross-check that the referenced transaction/deal actually exists in our DB
    # before doing any state changes (prevents replay of fabricated ids)
    known = False
    if reference.startswith("SD-"):
        known = bool(await db.transactions.find_one({"deal_id": reference}, {"_id": 1}))
    if not known and tradesafe_id:
        known = bool(await db.transactions.find_one(
            {"$or": [
                {"tradesafe_id": tradesafe_id},
                {"tradesafe_token_id": tradesafe_id},
                {"tradesafe_transaction_id": tradesafe_id},
            ]}, {"_id": 1}
        ))
    if not known and reference and not reference.startswith("SD-"):
        known = bool(await db.transactions.find_one({"transaction_id": reference}, {"_id": 1}))

    if not known:
        logger.warning(
            f"[WEBHOOK] No matching transaction for tradesafe_id={tradesafe_id!r} "
            f"reference={reference!r} ip={client_ip!r} — ignoring"
        )
        return {"ok": True}

    # ── Smart Deal MILESTONE item path ──────────────────────────────────────
    # Each milestone is its own escrow with reference "{deal_id}-M{seq}" (still
    # "SD-…"-prefixed) and its own tradesafe id. Resolve the child doc first so the
    # generic single-deal / regular-txn paths below never touch it.
    milestone_item = None
    if reference.startswith("SD-") and "-M" in reference:
        milestone_item = await db.transactions.find_one(
            {"deal_id": reference, "deal_type": "DIGITAL_WORK_MILESTONE_ITEM"}
        )
    if milestone_item is None and tradesafe_id:
        milestone_item = await db.transactions.find_one(
            {"$or": [
                {"tradesafe_id": tradesafe_id},
                {"tradesafe_token_id": tradesafe_id},
                {"tradesafe_transaction_id": tradesafe_id},
            ], "deal_type": "DIGITAL_WORK_MILESTONE_ITEM"}
        )

    if milestone_item:
        child_id = milestone_item["deal_id"]
        FUNDED_STATES = {"FUNDS_RECEIVED", "FUNDS_DEPOSITED"}
        RELEASED_STATES = {"FUNDS_RELEASED", "COMPLETE", "COMPLETED"}
        logger.info(
            f"[WEBHOOK] Milestone {child_id} found — current status={milestone_item['status']!r} "
            f"incoming state={state!r}"
        )
        if state in RELEASED_STATES:
            if milestone_item.get("withdrawal_status") in ("in_progress", "succeeded"):
                await db.transactions.update_one(
                    {"_id": milestone_item["_id"]}, {"$set": {"tradesafe_state": state}}
                )
                return {"ok": True, "action": "milestone_release_already_processed", "deal_id": child_id}
            import asyncio
            asyncio.create_task(_bg(_handle_milestone_released(milestone_item, db, state=state)))
            return {"ok": True, "action": "milestone_withdrawal_queued", "deal_id": child_id, "state": state}

        if state not in FUNDED_STATES:
            return {"ok": True, "action": "ignored", "reason": f"state {state!r} not actionable for milestones"}
        if milestone_item["status"] not in ("PAYMENT_PENDING", "FUNDED"):
            logger.info(f"[WEBHOOK] Milestone {child_id} in {milestone_item['status']!r} — skipping")
            return {"ok": True, "action": "already_processed"}
        await _handle_milestone_funded(milestone_item, db, state=state)
        return {"ok": True, "action": "milestone_funded", "deal_id": child_id, "state": state}

    # ── Smart Deal path ─────────────────────────────────────────────────────
    # References start with "SD-"; also try tradesafe_token_id / tradesafe_transaction_id.
    smart_deal = None
    if reference.startswith("SD-"):
        smart_deal = await db.transactions.find_one(
            {"deal_id": reference, "deal_type": "DIGITAL_WORK"}
        )
        logger.info(f"[WEBHOOK] SD reference lookup deal_id={reference!r}: {'found' if smart_deal else 'not found'}")
    if smart_deal is None and tradesafe_id:
        smart_deal = await db.transactions.find_one(
            {"$or": [
                {"tradesafe_token_id": tradesafe_id, "deal_type": "DIGITAL_WORK"},
                {"tradesafe_transaction_id": tradesafe_id, "deal_type": "DIGITAL_WORK"},
            ]}
        )
        logger.info(f"[WEBHOOK] tradesafe_id lookup {tradesafe_id!r}: {'found' if smart_deal else 'not found'}")

    if smart_deal:
        deal_id = smart_deal["deal_id"]
        FUNDED_STATES = {"FUNDS_RECEIVED", "FUNDS_DEPOSITED"}
        RELEASED_STATES = {"FUNDS_RELEASED", "COMPLETE", "COMPLETED"}
        logger.info(f"[WEBHOOK] Smart deal {deal_id} found — current status={smart_deal['status']!r} incoming state={state!r}")
        if state in RELEASED_STATES:
            if smart_deal.get("withdrawal_status") in ("in_progress", "succeeded"):
                await db.transactions.update_one(
                    {"_id": smart_deal["_id"]},
                    {"$set": {"tradesafe_state": state}}
                )
                return {"ok": True, "action": "smart_deal_release_already_processed", "deal_id": deal_id}

            # Advance the Smart Deal lifecycle to COMPLETE (covers auto-release where
            # the client never manually approves) so its status matches a settled txn.
            now = datetime.now(timezone.utc)
            await db.transactions.update_one(
                {"_id": smart_deal["_id"]},
                {"$set": {"status": "COMPLETE", "completed_at": smart_deal.get("completed_at") or now, "updated_at": now}},
            )

            import asyncio
            asyncio.create_task(_bg(
                handle_released_transaction(db, smart_deal, state=state, source="webhook:smart_deal")
            ))
            logger.info(f"[WEBHOOK] Smart deal {deal_id} {state} - status→COMPLETE, withdrawal task queued")
            return {"ok": True, "action": "smart_deal_withdrawal_queued", "deal_id": deal_id, "state": state}

        if state not in FUNDED_STATES:
            logger.info(f"[WEBHOOK] Smart deal {deal_id}: state={state!r} is not a funded state — no action")
            return {"ok": True, "action": "ignored", "reason": f"state {state!r} not actionable for smart deals"}
        if smart_deal["status"] not in ("ACCEPTED", "PAYMENT_PENDING", "FUNDED"):
            logger.info(f"[WEBHOOK] Smart deal {deal_id} in {smart_deal['status']!r} — not awaiting funding, skipping")
            return {"ok": True, "action": "already_processed"}
        # Process both FUNDS_RECEIVED and FUNDS_DEPOSITED (like the regular path):
        # fields advance on either, the seller email is gated to FUNDS_DEPOSITED, and
        # send_email_with_tracking dedups so re-delivered webhooks never double-send.
        await _handle_smart_deal_funded(smart_deal, db, state=state)
        logger.info(f"[WEBHOOK] Smart deal {deal_id} → FUNDED processing triggered (state={state})")
        return {"ok": True, "action": "smart_deal_funded", "deal_id": deal_id, "state": state}

    # ── Regular transaction path ─────────────────────────────────────────────
    txn = None
    if tradesafe_id:
        txn = await db.transactions.find_one({"tradesafe_id": tradesafe_id})
        logger.info(f"[WEBHOOK] Regular txn lookup tradesafe_id={tradesafe_id!r}: {'found' if txn else 'not found'}")
    if txn is None and reference and not reference.startswith("SD-"):
        txn = await db.transactions.find_one({"transaction_id": reference})
        logger.info(f"[WEBHOOK] Regular txn lookup transaction_id={reference!r}: {'found' if txn else 'not found'}")

    if txn:
        txn_id = txn.get("transaction_id", "?")
        # TradeSafe lifecycle for EFT/Ozow:
        #   FUNDS_RECEIVED  → deposit ATTEMPT recorded (not yet cleared)
        #   FUNDS_DEPOSITED → funds ACTUALLY in escrow (cleared, safe to act on)
        # We update local state on either signal so the UI advances, but the
        # "Payment Secured" email/SMS must wait for FUNDS_DEPOSITED to avoid
        # telling the seller "you're paid" while funds are still in flight.
        FUNDED_STATES = {"FUNDS_RECEIVED", "FUNDS_DEPOSITED"}
        EMAIL_TRIGGER_STATES = {"FUNDS_DEPOSITED"}
        # TradeSafe fires FUNDS_RELEASED after allocationCompleteDelivery settles.
        # This is our signal to trigger the bank withdrawal.
        RELEASED_STATES = {"FUNDS_RELEASED", "COMPLETE", "COMPLETED"}

        if state in FUNDED_STATES:
            now_iso = datetime.now(timezone.utc).isoformat()
            auto_release_at = (datetime.now(timezone.utc) + timedelta(hours=48)).isoformat()
            set_fields = {
                "payment_status": "Funds Secured",
                "tradesafe_state": state,
                "funds_received_at": now_iso,
                "auto_release_at": auto_release_at,
                "release_status": "In Escrow",
            }
            await db.transactions.update_one(
                {"_id": txn["_id"]},
                {"$set": set_fields}
            )
            logger.info(f"[WEBHOOK] Regular txn {txn_id} → payment_status=Funds Secured, tradesafe_state={state}, auto_release_at={auto_release_at}")

            if state not in EMAIL_TRIGGER_STATES:
                # FUNDS_RECEIVED only — hold the Payment Secured email until the
                # follow-up FUNDS_DEPOSITED webhook confirms the money actually cleared.
                logger.info(
                    f"[WEBHOOK] {txn_id} state={state!r} — state advanced but Payment Secured "
                    f"emails withheld until FUNDS_DEPOSITED"
                )
            else:
                # Send payment-secured emails via send_email_with_tracking so that the
                # emails_sent[] deduplication array is populated.  The fallback job
                # (background_jobs.py) also uses the same mechanism, which prevents the
                # seller from ever receiving a duplicate "Payment Secured" email.
                import asyncio
                import email_service
                from webhook_handler import send_email_with_tracking, EmailEvent
                delivery_method = txn.get("delivery_method", "courier")
                share_code = txn.get("share_code", txn_id)

                # Buyer confirmation — "your payment is secured, seller will now dispatch"
                asyncio.create_task(_bg(send_email_with_tracking(
                    db, txn_id, EmailEvent.PAYMENT_SECURED_BUYER,
                    txn.get("buyer_email", ""),
                    email_service.send_immediate_payment_secured_email,
                    to_email=txn.get("buyer_email", ""),
                    to_name=txn.get("buyer_name", "Buyer"),
                    share_code=share_code,
                    item_description=txn["item_description"],
                    amount=txn["item_price"],
                    delivery_method=delivery_method,
                )))

                # Seller notification — ONLY fires on FUNDS_DEPOSITED. The emails_sent[]
                # entry prevents the fallback job from sending a second copy.
                asyncio.create_task(_bg(send_email_with_tracking(
                    db, txn_id, EmailEvent.PAYMENT_SECURED_SELLER,
                    txn.get("seller_email", ""),
                    email_service.send_payment_received_email,
                    to_email=txn.get("seller_email", ""),
                    to_name=txn.get("seller_name", "Seller"),
                    share_code=share_code,
                    item_description=txn["item_description"],
                    amount=txn["item_price"],
                    role="seller",
                    delivery_method=delivery_method,
                )))

                # Funds have cleared (FUNDS_DEPOSITED) → auto-book the Courier Guy
                # shipment for courier deliveries. book_courier_for_transaction is
                # idempotent (guards on an existing waybill) and never raises, so it's
                # safe to fire on every FUNDS_DEPOSITED webhook. This is the PRIMARY
                # booking trigger — the fallback job and manual force-sync only exist
                # as backstops if this webhook is delayed or missed.
                if delivery_method == "courier":
                    from services.courier_booking import book_courier_for_transaction
                    asyncio.create_task(_bg(
                        book_courier_for_transaction(db, txn, email_service=email_service)
                    ))

        elif state in RELEASED_STATES and txn.get("withdrawal_status") not in ("in_progress", "succeeded"):
            # Funds settled in seller token wallet — trigger bank payout now.
            seller_token_id = txn.get("tradesafe_seller_token_id")
            net_amount = txn.get("net_amount")
            now_iso = datetime.now(timezone.utc).isoformat()

            logger.info(
                f"[WEBHOOK] FUNDS_RELEASED for {txn_id} — "
                f"seller_token={seller_token_id} net_amount={net_amount}"
            )

            await db.transactions.update_one(
                {"_id": txn["_id"]},
                {"$set": {
                    "tradesafe_state": state,
                    "withdrawal_status": txn.get("withdrawal_status") or "pending",
                    "last_funds_released_webhook_at": now_iso,
                }}
            )

            import asyncio
            asyncio.create_task(_bg(
                handle_released_transaction(db, txn, state=state, source="webhook")
            ))
            logger.info(
                f"[WEBHOOK] Withdrawal task queued for {txn_id}: "
                f"token={seller_token_id} amount=R{net_amount}"
            )

        elif state in RELEASED_STATES and txn.get("withdrawal_status") in ("in_progress", "succeeded"):
            logger.info(f"[WEBHOOK] {txn_id}: withdrawal {txn.get('withdrawal_status')}, skipping duplicate {state!r} event")
            await db.transactions.update_one(
                {"_id": txn["_id"]},
                {"$set": {"tradesafe_state": state, "payment_status": "Completed", "release_status": "Released"}}
            )

        else:
            await db.transactions.update_one(
                {"_id": txn["_id"]},
                {"$set": {"tradesafe_state": state}}
            )
            logger.info(f"[WEBHOOK] Regular txn {txn_id}: tradesafe_state updated to {state!r}")

        return {"ok": True, "action": "regular_txn_updated", "transaction_id": txn_id, "state": state}

    logger.warning(f"[WEBHOOK] No matching transaction found — tradesafe_id={tradesafe_id!r} reference={reference!r}")
    return {"ok": True, "action": "no_match"}


@router.get("/oauth/callback")
async def oauth_callback(request: Request, code: str = None, state: str = None):
    """Handle OAuth callback"""
    logger.info(f"OAuth callback - code: {code}, state: {state}")
    
    if not code:
        raise HTTPException(status_code=400, detail="Authorization code missing")
    
    return {
        "status": "success",
        "message": "OAuth callback received",
        "code": code[:10] + "..." if code else None
    }


# ============ ALERT SYSTEM ENDPOINTS ============

@router.get("/admin/alerts")
async def get_alerts(request: Request, hours: int = 24, limit: int = 100, active_only: bool = False):
    """Get alerts for the admin dashboard"""
    db = get_database()
    
    user = await get_user_from_token(request, db)
    if not user or not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    from alert_service import get_active_alerts, get_all_alerts, get_alert_stats
    
    if active_only:
        alerts = await get_active_alerts(db, limit)
    else:
        alerts = await get_all_alerts(db, hours, limit)
    
    stats = await get_alert_stats(db, hours)
    
    return {
        "alerts": alerts,
        "stats": stats,
        "count": len(alerts)
    }


@router.post("/admin/alerts/{alert_id}/resolve")
async def resolve_alert_endpoint(alert_id: str, request: Request):
    """Mark an alert as resolved"""
    db = get_database()
    
    user = await get_user_from_token(request, db)
    if not user or not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    from alert_service import resolve_alert
    
    success = await resolve_alert(db, alert_id, user.email)
    
    if not success:
        raise HTTPException(status_code=404, detail="Alert not found")
    
    # Log admin action
    await db.admin_actions.insert_one({
        "admin_email": user.email,
        "admin_name": user.name,
        "action": "resolve_alert",
        "alert_id": alert_id,
        "timestamp": datetime.now(timezone.utc).isoformat()
    })
    
    return {"success": True, "alert_id": alert_id, "resolved_by": user.email}


@router.post("/admin/alerts/test")
async def test_alert_endpoint(request: Request):
    """Send a test alert (for testing purposes)"""
    db = get_database()
    
    user = await get_user_from_token(request, db)
    if not user or not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    import os
    from alert_service import trigger_alert, AlertType
    
    admin_email = os.environ.get('ADMIN_ALERT_EMAIL', user.email)
    
    result = await trigger_alert(
        db=db,
        alert_type=AlertType.SYSTEM_ERROR,
        message="This is a test alert to verify the alert system is working correctly.",
        admin_email=admin_email,
        details={"triggered_by": user.email, "test": True}
    )
    
    return {"success": True, "result": result}


# ============ PLATFORM STATS ============

@router.get("/platform/stats")
async def get_platform_stats(request: Request):
    """Get platform-wide statistics for live activity board"""
    db = get_database()
    
    user = await get_user_from_token(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    today_iso = today_start.isoformat()
    
    total_users = await db.users.count_documents({})
    total_transactions = await db.transactions.count_documents({})
    completed_transactions = await db.transactions.count_documents({"release_status": "Released"})
    
    success_rate = round((completed_transactions / total_transactions * 100) if total_transactions > 0 else 0, 1)
    
    completed_today = await db.transactions.count_documents({
        "release_status": "Released",
        "created_at": {"$gte": today_iso}
    })
    
    # Total secured value
    pipeline = [
        {"$match": {"release_status": "Released"}},
        {"$group": {"_id": None, "total": {"$sum": "$total"}}}
    ]
    secured_result = await db.transactions.aggregate(pipeline).to_list(1)
    total_secured = secured_result[0]["total"] if secured_result else 0
    
    # Total escrow value
    all_pipeline = [
        {"$group": {"_id": None, "total": {"$sum": "$total"}}}
    ]
    all_result = await db.transactions.aggregate(all_pipeline).to_list(1)
    total_escrow_value = all_result[0]["total"] if all_result else 0
    
    active_transactions = await db.transactions.count_documents({
        "release_status": {"$ne": "Released"}
    })
    
    pending_confirmations = await db.transactions.count_documents({
        "$or": [
            {"seller_confirmed": False},
            {"payment_status": "Ready for Payment"}
        ]
    })
    
    pending_disputes = await db.disputes.count_documents({"status": "Pending"})
    verified_users = await db.users.count_documents({"verified": True})
    
    fraud_cases_today = await db.disputes.count_documents({
        "is_valid_dispute": True,
        "created_at": {"$gte": today_iso}
    })
    
    return {
        "total_users": total_users,
        "total_transactions": total_transactions,
        "completed_transactions": completed_transactions,
        "success_rate": success_rate,
        "completed_today": completed_today,
        "total_secured": total_secured,
        "total_escrow_value": total_escrow_value,
        "active_transactions": active_transactions,
        "pending_confirmations": pending_confirmations,
        "pending_disputes": pending_disputes,
        "verified_users": verified_users,
        "fraud_cases_today": fraud_cases_today
    }
