"""
TrustTrade — dispute / admin payout orchestration.

Two idempotent, escrow-safe helpers used when a dispute is resolved (or an admin
acts manually):

  * release_funds_to_seller — Favour Seller. Runs the legitimate TradeSafe release
    cascade (start → accept → complete, via accept_delivery). If ALL of them fail it
    STOPS and raises an admin alert — it never auto-declines or token-transfers,
    because declining would refund the buyer (wrong direction) and a direct transfer
    bypasses TradeSafe accounting.

  * refund_transaction — Favour Buyer. Returns the held escrow to the buyer via
    allocationRefund, then best-effort withdraws from the buyer token to their bank.

Both are idempotent (guarded on status) and never raise — they return a result dict
and surface failures via status fields + admin alerts.
"""

import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)


def _admin_email() -> str:
    from core.config import settings
    return os.environ.get("ADMIN_ALERT_EMAIL") or getattr(settings, "ADMIN_EMAIL", "") or ""


async def _alert(db, txn: Dict[str, Any], message: str, details: Dict[str, Any]) -> None:
    """Raise a CRITICAL system alert (best-effort)."""
    try:
        from alert_service import trigger_alert, AlertType
        await trigger_alert(
            db=db,
            alert_type=AlertType.SYSTEM_ERROR,
            message=message,
            admin_email=_admin_email(),
            transaction_id=txn.get("transaction_id"),
            share_code=txn.get("share_code"),
            details=details,
        )
    except Exception as exc:
        logger.error(f"[DISPUTE_PAYOUT] alert failed: {exc}")


async def release_funds_to_seller(db, txn: Dict[str, Any], source: str = "dispute") -> Dict[str, Any]:
    """Release held escrow to the seller. Stops + alerts if the release can't complete."""
    transaction_id = txn.get("transaction_id")
    allocation_id = txn.get("tradesafe_allocation_id")
    now_iso = datetime.now(timezone.utc).isoformat()

    if txn.get("release_status") in ("Released", "Refunded"):
        return {"success": txn.get("release_status") == "Released", "skipped": True,
                "reason": f"already {txn.get('release_status')}"}

    if not allocation_id:
        msg = f"Cannot release {transaction_id}: no tradesafe_allocation_id on transaction"
        logger.error(f"[DISPUTE_PAYOUT] {msg}")
        await db.transactions.update_one(
            {"transaction_id": transaction_id},
            {"$set": {"payout_status": "release_failed", "release_error": msg,
                      "payout_sla_status": "critical", "release_failed_at": now_iso}},
        )
        await _alert(db, txn, msg, {"phase": "release", "reason": "missing_allocation_id"})
        return {"success": False, "error": msg}

    from tradesafe_service import accept_delivery

    # accept_delivery runs start → accept → complete internally (with fallback).
    result = await accept_delivery(
        allocation_id,
        seller_token_id=txn.get("tradesafe_seller_token_id"),
        amount=float(txn.get("net_amount") or txn.get("seller_receives") or txn.get("item_price") or 0) or None,
    )

    if not result:
        # Every legitimate release mutation failed. STOP — do NOT decline/transfer.
        msg = (f"Release FAILED for {transaction_id}: TradeSafe rejected the release cascade "
               f"(allocationStartDelivery/AcceptDelivery/CompleteDelivery) on allocation {allocation_id}. "
               f"Manual intervention required — funds remain held in escrow.")
        logger.error(f"[DISPUTE_PAYOUT] {msg}")
        await db.transactions.update_one(
            {"transaction_id": transaction_id},
            {"$set": {"payout_status": "release_failed", "release_error": msg,
                      "payout_sla_status": "critical", "release_failed_at": now_iso}},
        )
        await _alert(db, txn, msg, {"phase": "release", "allocation_id": allocation_id})
        return {"success": False, "error": msg}

    # Released on TradeSafe. Persist state + notify; the FUNDS_RELEASED webhook drives
    # the actual bank withdrawal (the established post-release path).
    ts_state = (result.get("state") or "FUNDS_RELEASED").upper()
    await db.transactions.update_one(
        {"transaction_id": transaction_id},
        {"$set": {
            "tradesafe_state": ts_state,
            "payment_status": "Completed" if ts_state == "FUNDS_RELEASED" else "Delivery Confirmed",
            "release_status": "Released" if ts_state == "FUNDS_RELEASED" else "Awaiting Release",
            "released_at": txn.get("released_at") or now_iso,
            "released_by": source,
            "payout_status": txn.get("payout_status") or "awaiting_bank_payout",
            "release_error": None,
        }},
    )
    try:
        from routes.webhooks import notify_seller_funds_released
        await notify_seller_funds_released(db, txn)
    except Exception as exc:
        logger.error(f"[DISPUTE_PAYOUT] notify after release failed for {transaction_id}: {exc}")

    logger.info(f"[DISPUTE_PAYOUT] {transaction_id} released to seller (state={ts_state}) source={source}")
    return {"success": True, "state": ts_state}


async def refund_transaction(
    db, txn: Dict[str, Any],
    reason: str = "Dispute resolved in the buyer's favour",
    source: str = "dispute",
) -> Dict[str, Any]:
    """Refund held escrow to the buyer (idempotent). Returns {success, ...}."""
    transaction_id = txn.get("transaction_id")
    now_iso = datetime.now(timezone.utc).isoformat()

    if txn.get("refund_status") == "succeeded" or txn.get("release_status") == "Refunded":
        return {"success": True, "skipped": True, "reason": "already refunded"}

    allocation_id = txn.get("tradesafe_allocation_id")
    if not allocation_id:
        msg = f"Cannot refund {transaction_id}: no tradesafe_allocation_id on transaction"
        logger.error(f"[DISPUTE_PAYOUT] {msg}")
        await db.transactions.update_one(
            {"transaction_id": transaction_id},
            {"$set": {"refund_status": "failed", "refund_error": msg, "refund_failed_at": now_iso}},
        )
        await _alert(db, txn, msg, {"phase": "refund", "reason": "missing_allocation_id"})
        return {"success": False, "error": msg}

    # Atomically claim the refund so concurrent callers can't double-refund.
    claim = await db.transactions.update_one(
        {"transaction_id": transaction_id, "refund_status": {"$nin": ["in_progress", "succeeded"]}},
        {"$set": {"refund_status": "in_progress", "refund_started_at": now_iso, "refund_source": source}},
    )
    if claim.modified_count != 1:
        return {"success": False, "skipped": True, "reason": "refund already claimed"}

    from tradesafe_service import refund_allocation, request_token_withdrawal

    # 1. Return the held escrow to the buyer by cancelling the transaction (TradeSafe
    #    has no allocationRefund; refund_allocation self-discovers the right mutation).
    refund_res = await refund_allocation(allocation_id, tradesafe_id=txn.get("tradesafe_id"))
    if not refund_res.get("success"):
        error = refund_res.get("error") or "allocationRefund failed"
        logger.error(f"[DISPUTE_PAYOUT] refund {transaction_id} failed: {error}")
        await db.transactions.update_one(
            {"transaction_id": transaction_id},
            {"$set": {"refund_status": "failed", "refund_error": error, "refund_failed_at": now_iso}},
        )
        await _alert(db, txn, f"Refund FAILED for {transaction_id}: {error}",
                     {"phase": "refund", "allocation_id": allocation_id})
        return {"success": False, "error": error}

    # 2. Best-effort: withdraw from the buyer's token wallet to their bank (WALLET refund
    #    interval). Funds are already back with the buyer even if this lags, so a
    #    withdrawal hiccup doesn't fail the refund — it's recorded for follow-up.
    buyer = None
    if txn.get("buyer_email"):
        buyer = await db.users.find_one({"email": txn["buyer_email"]}, {"_id": 0, "tradesafe_token_id": 1})
    if not buyer and txn.get("buyer_user_id"):
        buyer = await db.users.find_one({"user_id": txn["buyer_user_id"]}, {"_id": 0, "tradesafe_token_id": 1})
    buyer_token = (buyer or {}).get("tradesafe_token_id")
    amount = float(txn.get("total") or txn.get("item_price") or 0)

    refund_withdrawn = False
    withdraw_error = None
    if buyer_token and amount > 0:
        wd = await request_token_withdrawal(buyer_token, int(round(amount * 100)))
        refund_withdrawn = bool(wd.get("success"))
        if not refund_withdrawn:
            withdraw_error = wd.get("error")
            logger.warning(f"[DISPUTE_PAYOUT] refund {transaction_id} token withdraw deferred: {withdraw_error}")
    else:
        withdraw_error = "No buyer token or zero amount — funds returned to buyer escrow token only"

    # 3. Mark refunded.
    await db.transactions.update_one(
        {"transaction_id": transaction_id},
        {"$set": {
            "payment_status": "Refunded",
            "release_status": "Refunded",
            "refund_status": "succeeded",
            "refund_reason": reason,
            "refunded_at": now_iso,
            "refunded_by": source,
            "refund_withdrawn": refund_withdrawn,
            "refund_withdraw_error": withdraw_error,
            "tradesafe_state": refund_res.get("state") or txn.get("tradesafe_state"),
        }},
    )

    # 4. Notify the buyer (best-effort).
    try:
        from email_service import send_refund_email
        await send_refund_email(
            to_email=txn.get("buyer_email", ""),
            to_name=txn.get("buyer_name", "there"),
            share_code=txn.get("share_code", transaction_id),
            amount=amount,
            reason=reason,
        )
    except Exception as exc:
        logger.error(f"[DISPUTE_PAYOUT] refund email failed for {transaction_id}: {exc}")

    logger.info(f"[DISPUTE_PAYOUT] {transaction_id} refunded to buyer "
                f"(withdrawn={refund_withdrawn}) source={source}")
    return {"success": True, "refund_withdrawn": refund_withdrawn, "withdraw_error": withdraw_error}
