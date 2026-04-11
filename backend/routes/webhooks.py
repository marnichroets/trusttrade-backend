"""
TrustTrade Webhook Routes
Handles TradeSafe webhook notifications and alerts
"""

import logging
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, Request

from core.database import get_database
from core.security import get_user_from_token

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["Webhooks"])


@router.post("/tradesafe-webhook")
async def handle_tradesafe_webhook(request: Request):
    """
    Production-ready webhook handler for TradeSafe transaction state changes.
    Features:
    - Strict idempotency (duplicate webhooks ignored)
    - All events logged for debugging
    - Email deduplication (no duplicate emails)
    - State machine enforcement
    - Comprehensive error handling
    """
    db = get_database()
    
    from webhook_handler import process_webhook, log_webhook_event, generate_event_id
    import email_service
    import sms_service
    
    try:
        payload = await request.json()
    except Exception as e:
        logger.error(f"[WEBHOOK] Invalid JSON payload: {e}")
        raise HTTPException(status_code=400, detail="Invalid JSON payload")
    
    logger.info("[WEBHOOK] === TradeSafe Webhook Received ===")
    logger.info(f"[WEBHOOK] Payload: {payload}")
    
    # Extract key info for logging
    event_type = payload.get("event", payload.get("type", "unknown"))
    transaction_id = payload.get("transaction", {}).get("id") or payload.get("transactionId")
    state = payload.get("transaction", {}).get("state") or payload.get("state")
    
    logger.info(f"[WEBHOOK] Event: {event_type}, TradeSafe ID: {transaction_id}, State: {state}")
    
    try:
        result = await process_webhook(db, payload, email_service, sms_service)
        logger.info(f"[WEBHOOK] Processing result: {result}")
        return result
        
    except Exception as e:
        logger.error(f"[WEBHOOK] Processing error: {e}")
        
        try:
            event_id = generate_event_id(payload)
            await log_webhook_event(db, event_id, "", payload, "failed", str(e))
        except Exception:
            pass
        
        return {"status": "error_logged", "message": str(e)}


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
