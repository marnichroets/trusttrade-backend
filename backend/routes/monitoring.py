"""
TrustTrade Monitoring Routes
Handles system health monitoring, webhook status, email tracking, and alerts
"""

import logging
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, Request

from core.database import get_database
from core.security import get_user_from_token
from models.user import User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/admin/monitoring", tags=["Monitoring"])


async def require_admin(request: Request, db) -> User:
    """Require admin user"""
    user = await get_user_from_token(request, db)
    if not user or not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


@router.get("/webhooks")
async def get_webhook_monitoring(request: Request, hours: int = 24):
    """Get webhook processing statistics and failures"""
    db = get_database()
    await require_admin(request, db)
    
    from webhook_handler import get_failed_webhooks
    
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
    
    total_received = await db.webhook_events.count_documents({"timestamp": {"$gte": cutoff}})
    total_processed = await db.webhook_events.count_documents({"status": "processed", "timestamp": {"$gte": cutoff}})
    total_failed = await db.webhook_events.count_documents({"status": "failed", "timestamp": {"$gte": cutoff}})
    total_duplicates = await db.webhook_events.count_documents({"status": "duplicate", "timestamp": {"$gte": cutoff}})
    
    failed_webhooks = await get_failed_webhooks(db, hours, limit=20)
    
    return {
        "period_hours": hours,
        "stats": {
            "total_received": total_received,
            "total_processed": total_processed,
            "total_failed": total_failed,
            "total_duplicates": total_duplicates,
            "success_rate": round((total_processed / total_received * 100) if total_received > 0 else 100, 2)
        },
        "recent_failures": failed_webhooks
    }


@router.get("/emails")
async def get_email_monitoring(request: Request, hours: int = 24):
    """Get email sending statistics and failures"""
    db = get_database()
    await require_admin(request, db)
    
    from webhook_handler import get_failed_emails
    
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
    
    total_sent = await db.email_logs.count_documents({"success": True, "timestamp": {"$gte": cutoff}})
    total_failed = await db.email_logs.count_documents({"success": False, "timestamp": {"$gte": cutoff}})
    
    failed_emails = await get_failed_emails(db, hours, limit=20)
    
    return {
        "period_hours": hours,
        "stats": {
            "total_sent": total_sent,
            "total_failed": total_failed,
            "success_rate": round((total_sent / (total_sent + total_failed) * 100) if (total_sent + total_failed) > 0 else 100, 2)
        },
        "recent_failures": failed_emails
    }


@router.get("/transactions")
async def get_stuck_transactions_monitoring(request: Request):
    """Get transactions that appear to be stuck"""
    db = get_database()
    await require_admin(request, db)
    
    from webhook_handler import get_stuck_transactions
    
    stuck = await get_stuck_transactions(db, hours=4)
    
    return {
        "stuck_count": len(stuck),
        "transactions": stuck
    }


@router.get("/summary")
async def get_monitoring_summary(request: Request):
    """Get overall system health summary"""
    db = get_database()
    await require_admin(request, db)
    
    cutoff_24h = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    cutoff_4h = (datetime.now(timezone.utc) - timedelta(hours=4)).isoformat()
    
    webhook_failed = await db.webhook_events.count_documents({"status": "failed", "timestamp": {"$gte": cutoff_24h}})
    email_failed = await db.email_logs.count_documents({"success": False, "timestamp": {"$gte": cutoff_24h}})
    
    stuck_count = await db.transactions.count_documents({
        "transaction_state": {"$in": ["AWAITING_PAYMENT", "PAYMENT_SECURED", "DELIVERY_IN_PROGRESS"]},
        "$or": [
            {"last_webhook_at": {"$lt": cutoff_4h}},
            {"last_webhook_at": {"$exists": False}}
        ]
    })
    
    active_disputes = await db.disputes.count_documents({"status": "Pending"})
    
    health_status = "healthy"
    if webhook_failed > 5 or email_failed > 10 or stuck_count > 3:
        health_status = "warning"
    if webhook_failed > 20 or email_failed > 50 or stuck_count > 10:
        health_status = "critical"
    
    return {
        "health_status": health_status,
        "metrics": {
            "webhook_failures_24h": webhook_failed,
            "email_failures_24h": email_failed,
            "stuck_transactions": stuck_count,
            "active_disputes": active_disputes
        },
        "timestamp": datetime.now(timezone.utc).isoformat()
    }


@router.get("/dashboard")
async def get_monitoring_dashboard(request: Request):
    """Get comprehensive dashboard metrics for real-time monitoring"""
    db = get_database()
    await require_admin(request, db)
    
    now = datetime.now(timezone.utc)
    cutoff_24h = (now - timedelta(hours=24)).isoformat()
    cutoff_10min = (now - timedelta(minutes=10)).isoformat()
    cutoff_5min = (now - timedelta(minutes=5)).isoformat()
    
    # Transaction metrics
    total_active = await db.transactions.count_documents({
        "transaction_state": {"$nin": ["COMPLETED", "CANCELLED", "REFUNDED"]}
    })
    
    awaiting_payment = await db.transactions.count_documents({
        "transaction_state": {"$in": ["AWAITING_PAYMENT", "CREATED", "PENDING_CONFIRMATION"]}
    })
    
    payments_secured_24h = await db.transactions.count_documents({
        "transaction_state": "PAYMENT_SECURED",
        "funds_received_at": {"$gte": cutoff_24h}
    })
    
    # Webhook metrics
    webhook_total = await db.webhook_events.count_documents({"timestamp": {"$gte": cutoff_24h}})
    webhook_processed = await db.webhook_events.count_documents({"status": "processed", "timestamp": {"$gte": cutoff_24h}})
    webhook_failed = await db.webhook_events.count_documents({"status": "failed", "timestamp": {"$gte": cutoff_24h}})
    webhook_duplicates = await db.webhook_events.count_documents({"status": "duplicate", "timestamp": {"$gte": cutoff_24h}})
    
    # Email metrics
    email_sent = await db.email_logs.count_documents({"success": True, "timestamp": {"$gte": cutoff_24h}})
    email_failed = await db.email_logs.count_documents({"success": False, "timestamp": {"$gte": cutoff_24h}})
    
    # Stuck transactions
    stuck_transactions = await db.transactions.find({
        "transaction_state": {"$in": ["AWAITING_PAYMENT", "PAYMENT_SECURED", "DELIVERY_IN_PROGRESS"]},
        "$or": [
            {"last_webhook_at": {"$lt": cutoff_10min}},
            {"last_webhook_at": {"$exists": False}, "updated_at": {"$lt": cutoff_10min}},
            {"last_webhook_at": {"$exists": False}, "updated_at": {"$exists": False}, "created_at": {"$lt": cutoff_10min}}
        ]
    }, {"_id": 0, "transaction_id": 1, "share_code": 1, "transaction_state": 1,
        "tradesafe_state": 1, "created_at": 1, "last_webhook_at": 1, "updated_at": 1,
        "buyer_name": 1, "seller_name": 1, "item_price": 1}).to_list(50)
    
    # Payment stuck
    payment_stuck = await db.transactions.find({
        "tradesafe_state": {"$in": ["FUNDS_RECEIVED"]},
        "transaction_state": {"$ne": "PAYMENT_SECURED"},
        "funds_received_at": {"$lt": cutoff_5min}
    }, {"_id": 0, "transaction_id": 1, "share_code": 1, "transaction_state": 1,
        "tradesafe_state": 1, "funds_received_at": 1}).to_list(50)
    
    active_disputes = await db.disputes.count_documents({"status": "Pending"})
    
    # Health status
    health_status = "healthy"
    alerts = []
    
    if webhook_failed > 0:
        alerts.append({"type": "webhook_failure", "count": webhook_failed, "severity": "high" if webhook_failed > 5 else "medium"})
    if email_failed > 0:
        alerts.append({"type": "email_failure", "count": email_failed, "severity": "high" if email_failed > 10 else "medium"})
    if len(stuck_transactions) > 0:
        alerts.append({"type": "stuck_transaction", "count": len(stuck_transactions), "severity": "high"})
    if len(payment_stuck) > 0:
        alerts.append({"type": "payment_stuck", "count": len(payment_stuck), "severity": "critical"})
    
    if any(a["severity"] == "critical" for a in alerts):
        health_status = "critical"
    elif any(a["severity"] == "high" for a in alerts):
        health_status = "warning"
    
    return {
        "health_status": health_status,
        "metrics": {
            "transactions": {
                "total_active": total_active,
                "awaiting_payment": awaiting_payment,
                "payments_secured_24h": payments_secured_24h
            },
            "webhooks": {
                "total_24h": webhook_total,
                "processed": webhook_processed,
                "failed": webhook_failed,
                "duplicates": webhook_duplicates,
                "success_rate": round((webhook_processed / webhook_total * 100) if webhook_total > 0 else 100, 1)
            },
            "emails": {
                "sent_24h": email_sent,
                "failed_24h": email_failed,
                "success_rate": round((email_sent / (email_sent + email_failed) * 100) if (email_sent + email_failed) > 0 else 100, 1)
            },
            "disputes": {
                "active": active_disputes
            }
        },
        "stuck_transactions": stuck_transactions,
        "payment_stuck": payment_stuck,
        "alerts": alerts,
        "timestamp": now.isoformat()
    }


@router.get("/webhook-events")
async def get_webhook_events(request: Request, limit: int = 50, status: str = None):
    """Get recent webhook events"""
    db = get_database()
    await require_admin(request, db)
    
    query = {}
    if status:
        query["status"] = status
    
    events = await db.webhook_events.find(query, {"_id": 0}).sort("timestamp", -1).limit(limit).to_list(limit)
    
    return {"events": events, "count": len(events)}


@router.get("/email-logs")
async def get_email_logs(request: Request, limit: int = 50, success: bool = None):
    """Get recent email logs"""
    db = get_database()
    await require_admin(request, db)
    
    query = {}
    if success is not None:
        query["success"] = success
    
    logs = await db.email_logs.find(query, {"_id": 0}).sort("timestamp", -1).limit(limit).to_list(limit)
    
    return {"logs": logs, "count": len(logs)}


@router.post("/retry-webhook/{event_id}")
async def retry_webhook(event_id: str, request: Request):
    """Retry processing a failed webhook event"""
    db = get_database()
    user = await require_admin(request, db)
    
    from webhook_handler import process_webhook
    import email_service
    import sms_service
    
    event = await db.webhook_events.find_one({"event_id": event_id})
    if not event:
        raise HTTPException(status_code=404, detail="Webhook event not found")
    
    payload = event.get("payload", {})
    
    # Log admin action
    await db.admin_actions.insert_one({
        "admin_email": user.email,
        "admin_name": user.name,
        "action": "retry_webhook",
        "event_id": event_id,
        "transaction_id": event.get("transaction_id"),
        "timestamp": datetime.now(timezone.utc).isoformat()
    })
    
    # Mark old event as superseded
    await db.webhook_events.update_one(
        {"event_id": event_id},
        {"$set": {"status": "retry_superseded", "retried_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    # Process the webhook again
    result = await process_webhook(db, payload, email_service, sms_service)
    
    logger.info(f"Admin {user.email} retried webhook {event_id}: {result}")
    
    return {"success": True, "result": result}


@router.post("/resend-email/{transaction_id}/{email_type}")
async def resend_email(transaction_id: str, email_type: str, request: Request):
    """Resend a specific email for a transaction"""
    db = get_database()
    user = await require_admin(request, db)
    
    from webhook_handler import mark_email_sent, log_email_attempt
    import email_service
    
    transaction = await db.transactions.find_one({"transaction_id": transaction_id}, {"_id": 0})
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    share_code = transaction.get("share_code", transaction_id)
    
    # Log admin action
    await db.admin_actions.insert_one({
        "admin_email": user.email,
        "admin_name": user.name,
        "action": "resend_email",
        "email_type": email_type,
        "transaction_id": transaction_id,
        "timestamp": datetime.now(timezone.utc).isoformat()
    })
    
    # Remove the email from sent list
    await db.transactions.update_one(
        {"transaction_id": transaction_id},
        {"$pull": {"emails_sent": email_type}}
    )
    
    try:
        if email_type == "payment_secured_buyer":
            await email_service.send_immediate_payment_secured_email(
                to_email=transaction["buyer_email"],
                to_name=transaction["buyer_name"],
                share_code=share_code,
                item_description=transaction["item_description"],
                amount=transaction["item_price"]
            )
            recipient = transaction["buyer_email"]
        elif email_type == "payment_secured_seller":
            await email_service.send_payment_received_email(
                to_email=transaction["seller_email"],
                to_name=transaction["seller_name"],
                share_code=share_code,
                item_description=transaction["item_description"],
                amount=transaction["item_price"],
                role="seller"
            )
            recipient = transaction["seller_email"]
        elif email_type == "delivery_started_buyer":
            await email_service.send_delivery_started_email(
                to_email=transaction["buyer_email"],
                to_name=transaction["buyer_name"],
                share_code=share_code,
                item_description=transaction["item_description"],
                seller_name=transaction["seller_name"]
            )
            recipient = transaction["buyer_email"]
        elif email_type == "funds_released_seller":
            net_amount = transaction["item_price"] * 0.98
            await email_service.send_funds_released_email(
                to_email=transaction["seller_email"],
                to_name=transaction["seller_name"],
                share_code=share_code,
                item_description=transaction["item_description"],
                amount=transaction["item_price"],
                net_amount=net_amount
            )
            recipient = transaction["seller_email"]
        else:
            raise HTTPException(status_code=400, detail=f"Unknown email type: {email_type}")
        
        await mark_email_sent(db, transaction_id, email_type)
        await log_email_attempt(db, transaction_id, email_type, recipient, True)
        
        logger.info(f"Admin {user.email} resent email {email_type} for {transaction_id}")
        
        return {"success": True, "email_type": email_type, "recipient": recipient}
        
    except Exception as e:
        await log_email_attempt(db, transaction_id, email_type, "", False, str(e))
        logger.error(f"Admin resend email failed: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to send email: {str(e)}")


@router.post("/update-transaction-status/{transaction_id}")
async def admin_update_transaction_status(transaction_id: str, request: Request):
    """Manually update transaction status (admin override)"""
    db = get_database()
    user = await require_admin(request, db)
    
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")
    
    new_state = body.get("new_state")
    reason = body.get("reason", "Admin manual override")
    
    if not new_state:
        raise HTTPException(status_code=400, detail="new_state is required")
    
    valid_states = ["CREATED", "PENDING_CONFIRMATION", "AWAITING_PAYMENT", "PAYMENT_SECURED",
                    "DELIVERY_IN_PROGRESS", "DELIVERED", "COMPLETED", "DISPUTED", "CANCELLED", "REFUNDED"]
    if new_state not in valid_states:
        raise HTTPException(status_code=400, detail=f"Invalid state. Must be one of: {valid_states}")
    
    transaction = await db.transactions.find_one({"transaction_id": transaction_id}, {"_id": 0})
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    old_state = transaction.get("transaction_state", "UNKNOWN")
    
    # Log admin action
    await db.admin_actions.insert_one({
        "admin_email": user.email,
        "admin_name": user.name,
        "action": "update_transaction_status",
        "transaction_id": transaction_id,
        "old_state": old_state,
        "new_state": new_state,
        "reason": reason,
        "timestamp": datetime.now(timezone.utc).isoformat()
    })
    
    # Update timeline
    timeline = transaction.get("timeline", [])
    timeline.append({
        "status": f"Admin Override: {old_state} -> {new_state}",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "by": f"Admin ({user.email})",
        "details": reason
    })
    
    update_data = {
        "transaction_state": new_state,
        "payment_status": new_state.replace("_", " ").title(),
        "timeline": timeline,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "last_admin_action_at": datetime.now(timezone.utc).isoformat(),
        "last_admin_action_by": user.email
    }
    
    if new_state == "PAYMENT_SECURED":
        update_data["payment_verified"] = True
        update_data["funds_received_at"] = update_data.get("funds_received_at") or datetime.now(timezone.utc).isoformat()
    elif new_state == "COMPLETED":
        update_data["delivery_confirmed"] = True
        update_data["release_status"] = "Released"
        update_data["released_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.transactions.update_one(
        {"transaction_id": transaction_id},
        {"$set": update_data}
    )
    
    logger.info(f"Admin {user.email} updated transaction {transaction_id}: {old_state} -> {new_state}")
    
    return {
        "success": True,
        "transaction_id": transaction_id,
        "old_state": old_state,
        "new_state": new_state,
        "admin": user.email
    }


@router.get("/actions")
async def get_admin_actions(request: Request, limit: int = 50):
    """Get recent admin actions for audit trail"""
    db = get_database()
    await require_admin(request, db)
    
    actions = await db.admin_actions.find({}, {"_id": 0}).sort("timestamp", -1).limit(limit).to_list(limit)
    
    return {"actions": actions, "count": len(actions)}
