"""
TrustTrade Webhook Routes
Handles TradeSafe webhook notifications and alerts
"""

import json
import logging
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, Request

from core.database import get_database
from core.security import get_user_from_token

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["Webhooks"])


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


@router.get("/webhook-test")
async def webhook_test():
    return {"status": "ok"}


@router.post("/tradesafe-webhook")
async def tradesafe_webhook(request: Request):
    raw_body = await request.body()
    headers = dict(request.headers)

    logger.info("=" * 60)
    logger.info("[WEBHOOK] ===== INCOMING POST /api/tradesafe-webhook =====")
    logger.info(f"[WEBHOOK] Content-Type: {request.headers.get('content-type', 'not-set')}")
    logger.info(f"[WEBHOOK] User-Agent: {request.headers.get('user-agent', 'not-set')}")
    logger.info(f"[WEBHOOK] X-TradeSafe-*: { {k: v for k, v in headers.items() if 'tradesafe' in k.lower()} }")
    logger.info(f"[WEBHOOK] Body size: {len(raw_body)} bytes")
    logger.info(f"[WEBHOOK] Raw body: {raw_body.decode('utf-8', errors='replace')}")
    logger.info("=" * 60)

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

    logger.info(f"[WEBHOOK] Extracted — event={event_type!r} state={state!r} reference={reference!r} tradesafe_id={tradesafe_id!r}")

    db = get_database()

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
        logger.info(f"[WEBHOOK] Smart deal {deal_id} found — current status={smart_deal['status']!r} incoming state={state!r}")
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
            await db.transactions.update_one(
                {"_id": txn["_id"]},
                {"$set": {
                    "payment_status": "Paid",
                    "tradesafe_state": state,
                    "funds_received_at": now_iso,
                    "auto_release_at": auto_release_at,
                }}
            )
            logger.info(f"[WEBHOOK] Regular txn {txn_id} → payment_status=Paid, auto_release_at={auto_release_at} (state={state})")

        elif state in RELEASED_STATES and not txn.get("withdrawal_triggered"):
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
                    "payout_status": "withdrawal_initiated",
                    "withdrawal_triggered": True,
                    "withdrawal_triggered_at": now_iso,
                }}
            )

            if seller_token_id and net_amount:
                import asyncio
                from tradesafe_service import withdraw_token_funds
                asyncio.create_task(_bg(
                    withdraw_token_funds(seller_token_id, float(net_amount), rtc=True)
                ))
                logger.info(
                    f"[WEBHOOK] Withdrawal task queued for {txn_id}: "
                    f"token={seller_token_id} amount=R{net_amount}"
                )
            else:
                logger.warning(
                    f"[WEBHOOK] FUNDS_RELEASED for {txn_id} but missing seller_token_id "
                    f"or net_amount — withdrawal skipped. Manual withdrawal required."
                )

        elif state in RELEASED_STATES and txn.get("withdrawal_triggered"):
            logger.info(f"[WEBHOOK] {txn_id}: withdrawal already triggered, skipping duplicate {state!r} event")
            await db.transactions.update_one(
                {"_id": txn["_id"]},
                {"$set": {"tradesafe_state": state}}
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
