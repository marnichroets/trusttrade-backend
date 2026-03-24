"""
TrustTrade Background Jobs - Production-Ready
Handles:
- Fallback payment verification (queries TradeSafe directly)
- Auto-release processing
- Webhook failure recovery
- Stuck transaction detection
"""

import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any
from motor.motor_asyncio import AsyncIOMotorDatabase

from transaction_state import (
    TransactionState,
    calculate_auto_release_time,
    get_auto_release_hours,
    map_tradesafe_state
)

logger = logging.getLogger(__name__)


async def verify_pending_payments(db: AsyncIOMotorDatabase, tradesafe_service) -> Dict[str, Any]:
    """
    Fallback payment verification job.
    Runs every 2-5 minutes to check TradeSafe for payment status.
    Handles cases where webhooks are delayed or fail.
    
    Returns summary of actions taken.
    """
    logger.info("=== FALLBACK: Running payment verification ===")
    
    summary = {
        "checked": 0,
        "updated": 0,
        "errors": 0,
        "details": []
    }
    
    try:
        # Find transactions awaiting payment that were created more than 5 minutes ago
        cutoff_time = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
        
        # Query for transactions that might have missed webhooks
        pending_transactions = await db.transactions.find({
            "$or": [
                {"transaction_state": {"$in": ["AWAITING_PAYMENT", "CREATED", "PENDING_CONFIRMATION"]}},
                {"tradesafe_state": {"$in": ["CREATED", "PENDING", None]}},
                {"payment_status": {"$in": ["Awaiting Payment", "Ready for Payment", "Pending Seller Confirmation"]}}
            ],
            "tradesafe_id": {"$exists": True, "$ne": None},
            "created_at": {"$lt": cutoff_time},
            "payment_verified": {"$ne": True}
        }).to_list(100)
        
        summary["checked"] = len(pending_transactions)
        logger.info(f"Found {len(pending_transactions)} pending transactions to verify")
        
        for txn in pending_transactions:
            try:
                result = await verify_single_transaction(db, txn, tradesafe_service)
                if result.get("updated"):
                    summary["updated"] += 1
                    summary["details"].append({
                        "transaction_id": txn.get("transaction_id"),
                        "action": result.get("action")
                    })
            except Exception as e:
                summary["errors"] += 1
                logger.error(f"Error verifying transaction {txn.get('transaction_id')}: {e}")
                
    except Exception as e:
        logger.error(f"Payment verification job failed: {e}")
        summary["errors"] += 1
    
    logger.info(f"Payment verification complete: {summary}")
    return summary


async def verify_single_transaction(
    db: AsyncIOMotorDatabase, 
    txn: Dict, 
    tradesafe_service
) -> Dict[str, Any]:
    """Verify a single transaction's payment status with TradeSafe"""
    transaction_id = txn.get("transaction_id")
    tradesafe_id = txn.get("tradesafe_id")
    
    if not tradesafe_id:
        return {"updated": False, "reason": "no_tradesafe_id"}
    
    logger.info(f"Verifying payment for {transaction_id} (TradeSafe: {tradesafe_id})")
    
    try:
        # Query TradeSafe for current status
        ts_status = await tradesafe_service.get_tradesafe_transaction(tradesafe_id)
        
        if not ts_status:
            logger.warning(f"Could not get TradeSafe status for {tradesafe_id}")
            return {"updated": False, "reason": "api_error"}
        
        ts_state = (ts_status.get("state") or "").upper()
        
        logger.info(f"TradeSafe state for {transaction_id}: {ts_state}")
        
        # Check if funds have been received
        if ts_state in ["FUNDS_RECEIVED", "INITIATED", "SENT", "DELIVERED", "FUNDS_RELEASED"]:
            current_state = txn.get("transaction_state")
            
            # Only update if not already in a more advanced state
            if current_state in ["AWAITING_PAYMENT", "CREATED", "PENDING_CONFIRMATION", None]:
                logger.info(f"FALLBACK: Payment detected for {transaction_id}, updating state to PAYMENT_SECURED")
                
                now = datetime.now(timezone.utc).isoformat()
                
                # Build timeline entry
                timeline = txn.get("timeline", [])
                timeline.append({
                    "status": "Payment Secured (Fallback Verified)",
                    "timestamp": now,
                    "by": "System",
                    "details": f"Payment verified via fallback job. TradeSafe state: {ts_state}"
                })
                
                # Update transaction
                update_data = {
                    "transaction_state": TransactionState.PAYMENT_SECURED.value,
                    "tradesafe_state": ts_state,
                    "payment_status": "Funds in Escrow",
                    "payment_verified": True,
                    "payment_verified_at": now,
                    "payment_verified_by": "fallback_job",
                    "funds_received_at": now,
                    "timeline": timeline
                }
                
                await db.transactions.update_one(
                    {"transaction_id": transaction_id},
                    {"$set": update_data}
                )
                
                # Send emails ONLY if not already sent
                await send_fallback_payment_notifications(db, txn)
                
                return {"updated": True, "action": "state_updated_to_PAYMENT_SECURED"}
        
        return {"updated": False, "reason": "no_payment_detected", "ts_state": ts_state}
        
    except Exception as e:
        logger.error(f"TradeSafe API error for {tradesafe_id}: {e}")
        return {"updated": False, "reason": "api_exception", "error": str(e)}


async def send_fallback_payment_notifications(db: AsyncIOMotorDatabase, txn: Dict) -> None:
    """Send payment secured notifications via fallback (with deduplication)"""
    from webhook_handler import (
        send_email_with_tracking, 
        send_sms_with_tracking,
        EmailEvent
    )
    import email_service
    import sms_service
    
    transaction_id = txn.get("transaction_id")
    share_code = txn.get("share_code", transaction_id)
    
    logger.info(f"Sending fallback payment notifications for {transaction_id}")
    
    try:
        # Send buyer email (with deduplication)
        await send_email_with_tracking(
            db, transaction_id, EmailEvent.PAYMENT_SECURED_BUYER,
            txn["buyer_email"],
            email_service.send_immediate_payment_secured_email,
            to_email=txn["buyer_email"],
            to_name=txn["buyer_name"],
            share_code=share_code,
            item_description=txn["item_description"],
            amount=txn["item_price"]
        )
        
        # Send seller email (with deduplication)
        await send_email_with_tracking(
            db, transaction_id, EmailEvent.PAYMENT_SECURED_SELLER,
            txn["seller_email"],
            email_service.send_payment_received_email,
            to_email=txn["seller_email"],
            to_name=txn["seller_name"],
            share_code=share_code,
            item_description=txn["item_description"],
            amount=txn["item_price"],
            role="seller"
        )
        
        # SMS notifications
        if txn.get("buyer_phone"):
            await send_sms_with_tracking(
                db, transaction_id, "payment_secured_buyer_sms",
                txn["buyer_phone"],
                sms_service.send_funds_received_sms,
                to_phone=txn["buyer_phone"],
                message=f"TrustTrade: Your payment is secured in escrow. Ref: {share_code}"
            )
        
        if txn.get("seller_phone"):
            await send_sms_with_tracking(
                db, transaction_id, "payment_secured_seller_sms",
                txn["seller_phone"],
                sms_service.send_funds_received_sms,
                to_phone=txn["seller_phone"],
                message=f"TrustTrade: Payment received! Please deliver the item. Ref: {share_code}"
            )
            
        logger.info(f"Fallback notifications sent for {transaction_id}")
        
    except Exception as e:
        logger.error(f"Failed to send fallback notifications for {transaction_id}: {e}")


async def process_auto_releases(db: AsyncIOMotorDatabase, tradesafe_service) -> Dict[str, Any]:
    """
    Process automatic fund releases based on delivery method timers.
    """
    logger.info("=== Running auto-release check ===")
    
    summary = {
        "checked": 0,
        "released": 0,
        "errors": 0
    }
    
    try:
        now = datetime.now(timezone.utc)
        now_iso = now.isoformat()
        
        # Find transactions eligible for auto-release
        eligible = await db.transactions.find({
            "transaction_state": TransactionState.DELIVERED.value,
            "delivery_confirmed": True,
            "auto_release_at": {"$lte": now_iso},
            "has_dispute": {"$ne": True},
            "auto_released": {"$ne": True}
        }).to_list(100)
        
        summary["checked"] = len(eligible)
        logger.info(f"Found {len(eligible)} transactions eligible for auto-release")
        
        for txn in eligible:
            try:
                await process_single_auto_release(db, txn, tradesafe_service)
                summary["released"] += 1
            except Exception as e:
                summary["errors"] += 1
                logger.error(f"Auto-release failed for {txn.get('transaction_id')}: {e}")
                
    except Exception as e:
        logger.error(f"Auto-release job failed: {e}")
        summary["errors"] += 1
    
    return summary


async def process_single_auto_release(
    db: AsyncIOMotorDatabase, 
    txn: Dict, 
    tradesafe_service
) -> None:
    """Process auto-release for a single transaction"""
    from webhook_handler import send_email_with_tracking, send_sms_with_tracking, EmailEvent
    import email_service
    import sms_service
    
    transaction_id = txn.get("transaction_id")
    allocation_id = txn.get("tradesafe_allocation_id")
    share_code = txn.get("share_code", transaction_id)
    
    logger.info(f"Auto-releasing funds for {transaction_id}")
    
    # Call TradeSafe to release funds
    if allocation_id:
        try:
            result = await tradesafe_service.accept_delivery(allocation_id)
            if result:
                logger.info(f"TradeSafe release successful for {transaction_id}")
        except Exception as e:
            logger.error(f"TradeSafe release failed for {transaction_id}: {e}")
    
    # Calculate net amount
    item_price = txn.get("item_price", 0)
    net_amount = item_price * 0.98  # 2% fee
    
    now = datetime.now(timezone.utc).isoformat()
    
    # Build timeline entry
    timeline = txn.get("timeline", [])
    timeline.append({
        "status": "Funds Auto-Released",
        "timestamp": now,
        "by": "System",
        "details": f"Automatic release after delivery window. R{net_amount:.2f} released to seller."
    })
    
    # Update transaction
    await db.transactions.update_one(
        {"transaction_id": transaction_id},
        {"$set": {
            "transaction_state": TransactionState.COMPLETED.value,
            "tradesafe_state": "FUNDS_RELEASED",
            "payment_status": "Completed",
            "release_status": "Released",
            "released_at": now,
            "auto_released": True,
            "net_amount": net_amount,
            "timeline": timeline
        }}
    )
    
    # Send notifications (with deduplication)
    await send_email_with_tracking(
        db, transaction_id, EmailEvent.FUNDS_RELEASED_SELLER,
        txn["seller_email"],
        email_service.send_funds_released_email,
        to_email=txn["seller_email"],
        to_name=txn["seller_name"],
        share_code=share_code,
        item_description=txn["item_description"],
        amount=item_price,
        net_amount=net_amount
    )
    
    if txn.get("seller_phone"):
        await send_sms_with_tracking(
            db, transaction_id, "auto_release_sms",
            txn["seller_phone"],
            sms_service.send_funds_released_sms,
            to_phone=txn["seller_phone"],
            message=f"TrustTrade: R{net_amount:.2f} auto-released to your account. Ref: {share_code}"
        )
    
    logger.info(f"Auto-release complete for {transaction_id}")


async def check_webhook_health(db: AsyncIOMotorDatabase) -> Dict[str, Any]:
    """
    Check for webhook processing issues and alert admin.
    """
    logger.info("=== Checking webhook health ===")
    
    from datetime import timedelta
    
    summary = {
        "failed_webhooks_24h": 0,
        "failed_emails_24h": 0,
        "stuck_transactions": 0
    }
    
    try:
        cutoff_24h = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
        
        # Count failed webhooks
        summary["failed_webhooks_24h"] = await db.webhook_events.count_documents({
            "status": "failed",
            "timestamp": {"$gte": cutoff_24h}
        })
        
        # Count failed emails
        summary["failed_emails_24h"] = await db.email_logs.count_documents({
            "success": False,
            "timestamp": {"$gte": cutoff_24h}
        })
        
        # Count stuck transactions (no update in 4 hours while in intermediate state)
        cutoff_4h = (datetime.now(timezone.utc) - timedelta(hours=4)).isoformat()
        summary["stuck_transactions"] = await db.transactions.count_documents({
            "transaction_state": {"$in": ["AWAITING_PAYMENT", "PAYMENT_SECURED", "DELIVERY_IN_PROGRESS"]},
            "$or": [
                {"last_webhook_at": {"$lt": cutoff_4h}},
                {"last_webhook_at": {"$exists": False}}
            ]
        })
        
        # Log warnings if issues found
        if summary["failed_webhooks_24h"] > 0:
            logger.warning(f"ALERT: {summary['failed_webhooks_24h']} failed webhooks in last 24h")
        
        if summary["failed_emails_24h"] > 0:
            logger.warning(f"ALERT: {summary['failed_emails_24h']} failed emails in last 24h")
        
        if summary["stuck_transactions"] > 0:
            logger.warning(f"ALERT: {summary['stuck_transactions']} stuck transactions")
            
    except Exception as e:
        logger.error(f"Webhook health check failed: {e}")
    
    return summary


async def start_background_jobs(
    db: AsyncIOMotorDatabase, 
    tradesafe_service, 
    interval_minutes: int = 3
) -> None:
    """
    Start background jobs that run periodically.
    - Payment verification: every 3 minutes
    - Auto-release check: every 6 minutes (every 2nd iteration)
    - Webhook health check: every 15 minutes (every 5th iteration)
    """
    logger.info(f"Starting background jobs with {interval_minutes} minute interval")
    
    iteration = 0
    
    while True:
        try:
            iteration += 1
            logger.info(f"=== Background job iteration {iteration} ===")
            
            # Payment verification - every iteration (3 minutes)
            try:
                await verify_pending_payments(db, tradesafe_service)
            except Exception as e:
                logger.error(f"Payment verification failed: {e}")
            
            # Auto-release - every 2nd iteration (6 minutes)
            if iteration % 2 == 0:
                try:
                    await process_auto_releases(db, tradesafe_service)
                except Exception as e:
                    logger.error(f"Auto-release job failed: {e}")
            
            # Webhook health check - every 5th iteration (15 minutes)
            if iteration % 5 == 0:
                try:
                    await check_webhook_health(db)
                except Exception as e:
                    logger.error(f"Webhook health check failed: {e}")
                
        except Exception as e:
            logger.error(f"Background job iteration {iteration} failed: {e}")
        
        # Sleep for interval
        await asyncio.sleep(interval_minutes * 60)
