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


async def _handle_smart_deal_funded(deal: dict, db) -> None:
    """Mark a Smart Deal FUNDED, run PAYOUT_SYNC, and send the funded email."""
    import asyncio

    deal_id = deal["deal_id"]
    now = datetime.now(timezone.utc)

    await db.transactions.update_one(
        {"deal_id": deal_id},
        {"$set": {"status": "FUNDED", "funded_at": now, "updated_at": now}},
    )
    logger.info(f"[WEBHOOK] Smart deal {deal_id} → FUNDED")

    # PAYOUT_SYNC: sync freelancer banking details to their TradeSafe token
    from routes.smart_deals import _sync_seller_banking
    asyncio.create_task(_bg(_sync_seller_banking(deal, db)))

    # Notify both parties
    import email_service
    client_name = deal.get("client_name") or deal["client_email"]
    freelancer_name = deal.get("freelancer_name") or deal["freelancer_email"]
    asyncio.create_task(_bg(
        email_service.send_smart_deal_funded(deal, client_name, freelancer_name)
    ))


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

    if status_before in ("in_progress", "succeeded"):
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
    return result


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

            import asyncio
            asyncio.create_task(_bg(
                handle_released_transaction(db, smart_deal, state=state, source="webhook:smart_deal")
            ))
            logger.info(f"[WEBHOOK] Smart deal {deal_id} {state} - withdrawal task queued")
            return {"ok": True, "action": "smart_deal_withdrawal_queued", "deal_id": deal_id, "state": state}

        if state not in FUNDED_STATES:
            logger.info(f"[WEBHOOK] Smart deal {deal_id}: state={state!r} is not a funded state — no action")
            return {"ok": True, "action": "ignored", "reason": f"state {state!r} not actionable for smart deals"}
        if smart_deal["status"] not in ("ACCEPTED", "PAYMENT_PENDING"):
            logger.info(f"[WEBHOOK] Smart deal {deal_id} already in {smart_deal['status']!r} — skipping duplicate")
            return {"ok": True, "action": "already_processed"}
        await _handle_smart_deal_funded(smart_deal, db)
        logger.info(f"[WEBHOOK] Smart deal {deal_id} → FUNDED processing triggered")
        return {"ok": True, "action": "smart_deal_funded", "deal_id": deal_id}

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
        FUNDED_STATES = {"FUNDS_RECEIVED", "FUNDS_DEPOSITED"}
        # TradeSafe fires FUNDS_RELEASED after allocationCompleteDelivery settles.
        # This is our signal to trigger the bank withdrawal.
        RELEASED_STATES = {"FUNDS_RELEASED", "COMPLETE", "COMPLETED"}

        if state in FUNDED_STATES:
            now_iso = datetime.now(timezone.utc).isoformat()
            auto_release_at = (datetime.now(timezone.utc) + timedelta(hours=48)).isoformat()
            should_send_payment_email = not txn.get("payment_secured_email_sent_at")
            set_fields = {
                "payment_status": "Funds Secured",
                "tradesafe_state": state,
                "funds_received_at": now_iso,
                "auto_release_at": auto_release_at,
                "release_status": "In Escrow",
            }
            if should_send_payment_email:
                set_fields["payment_secured_email_sent_at"] = now_iso
            await db.transactions.update_one(
                {"_id": txn["_id"]},
                {"$set": set_fields}
            )
            logger.info(f"[WEBHOOK] Regular txn {txn_id} → payment_status=Funds Secured, tradesafe_state={state}, auto_release_at={auto_release_at}")
            if should_send_payment_email:
                import asyncio
                import email_service
                delivery_method = txn.get("delivery_method", "courier")
                share_code = txn.get("share_code", txn_id)
                asyncio.create_task(_bg(email_service.send_payment_received_email(
                    to_email=txn["buyer_email"],
                    to_name=txn.get("buyer_name", "Buyer"),
                    share_code=share_code,
                    item_description=txn["item_description"],
                    amount=txn["item_price"],
                    role="buyer",
                    delivery_method=delivery_method,
                )))
                asyncio.create_task(_bg(email_service.send_payment_received_email(
                    to_email=txn["seller_email"],
                    to_name=txn.get("seller_name", "Seller"),
                    share_code=share_code,
                    item_description=txn["item_description"],
                    amount=txn["item_price"],
                    role="seller",
                    delivery_method=delivery_method,
                )))

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
