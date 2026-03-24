"""
TrustTrade Background Jobs
Handles fallback payment verification, auto-release, and webhook recovery.
"""

import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any
from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger(__name__)

# Track processed events for idempotency
processed_events: set = set()


async def verify_pending_payments(db: AsyncIOMotorDatabase, tradesafe_service):
    """
    Fallback payment verification job.
    Runs every 2-5 minutes to check TradeSafe for payment status.
    Handles cases where webhooks are delayed or fail.
    """
    logger.info("Running fallback payment verification...")
    
    try:
        # Find transactions awaiting payment that were created more than 5 minutes ago
        cutoff_time = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
        
        pending_transactions = await db.transactions.find({
            "transaction_state": {"$in": ["AWAITING_PAYMENT", "CREATED", "PENDING_CONFIRMATION"]},
            "tradesafe_id": {"$exists": True, "$ne": None},
            "created_at": {"$lt": cutoff_time},
            "payment_verified": {"$ne": True}
        }).to_list(100)
        
        logger.info(f"Found {len(pending_transactions)} pending transactions to verify")
        
        for txn in pending_transactions:
            try:
                await verify_single_transaction(db, txn, tradesafe_service)
            except Exception as e:
                logger.error(f"Error verifying transaction {txn.get('transaction_id')}: {e}")
                
    except Exception as e:
        logger.error(f"Payment verification job failed: {e}")


async def verify_single_transaction(db: AsyncIOMotorDatabase, txn: Dict, tradesafe_service):
    """Verify a single transaction's payment status with TradeSafe"""
    transaction_id = txn.get("transaction_id")
    tradesafe_id = txn.get("tradesafe_id")
    
    if not tradesafe_id:
        return
    
    logger.info(f"Verifying payment for {transaction_id} (TradeSafe: {tradesafe_id})")
    
    # Query TradeSafe for current status
    try:
        ts_status = await tradesafe_service.get_transaction_status(tradesafe_id)
        
        if not ts_status:
            logger.warning(f"Could not get TradeSafe status for {tradesafe_id}")
            return
        
        ts_state = ts_status.get("state", "").upper()
        
        # Check if funds have been received
        if ts_state in ["FUNDS_RECEIVED", "INITIATED", "SENT", "DELIVERED", "FUNDS_RELEASED"]:
            current_state = txn.get("transaction_state")
            
            # Only update if not already in a more advanced state
            if current_state in ["AWAITING_PAYMENT", "CREATED", "PENDING_CONFIRMATION"]:
                logger.info(f"FALLBACK: Payment detected for {transaction_id}, updating state to PAYMENT_SECURED")
                
                # Update transaction
                await db.transactions.update_one(
                    {"transaction_id": transaction_id},
                    {"$set": {
                        "transaction_state": "PAYMENT_SECURED",
                        "tradesafe_state": ts_state,
                        "payment_status": "Funds in Escrow",
                        "payment_verified": True,
                        "payment_verified_at": datetime.now(timezone.utc).isoformat(),
                        "payment_verified_by": "fallback_job",
                        "funds_received_at": datetime.now(timezone.utc).isoformat()
                    },
                    "$push": {
                        "timeline": {
                            "status": "Payment Secured (Verified)",
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                            "by": "System",
                            "details": "Payment verified via fallback check"
                        }
                    }}
                )
                
                # Check if email was already sent
                if not txn.get("payment_email_sent"):
                    # Send emails
                    await send_payment_secured_notifications(db, txn)
                    
                    await db.transactions.update_one(
                        {"transaction_id": transaction_id},
                        {"$set": {"payment_email_sent": True}}
                    )
                
    except Exception as e:
        logger.error(f"TradeSafe API error for {tradesafe_id}: {e}")


async def send_payment_secured_notifications(db: AsyncIOMotorDatabase, txn: Dict):
    """Send payment secured emails and SMS"""
    from email_service import send_immediate_payment_secured_email, send_payment_received_email
    from sms_service import send_funds_received_sms
    
    transaction_id = txn.get("transaction_id")
    share_code = txn.get("share_code", transaction_id)
    
    try:
        # Send buyer email FIRST (priority)
        await send_immediate_payment_secured_email(
            to_email=txn["buyer_email"],
            to_name=txn["buyer_name"],
            share_code=share_code,
            item_description=txn["item_description"],
            amount=txn["item_price"]
        )
        
        # Send seller email
        await send_payment_received_email(
            to_email=txn["seller_email"],
            to_name=txn["seller_name"],
            share_code=share_code,
            item_description=txn["item_description"],
            amount=txn["item_price"],
            role="seller"
        )
        
        # SMS notifications
        if txn.get("buyer_phone"):
            await send_funds_received_sms(
                to_phone=txn["buyer_phone"],
                message=f"TrustTrade: Your payment is secured in escrow. Ref: {share_code}"
            )
        
        if txn.get("seller_phone"):
            await send_funds_received_sms(
                to_phone=txn["seller_phone"],
                message=f"TrustTrade: Payment received! Please deliver the item. Ref: {share_code}"
            )
            
        logger.info(f"Payment notifications sent for {transaction_id}")
        
    except Exception as e:
        logger.error(f"Failed to send payment notifications for {transaction_id}: {e}")


async def process_auto_releases(db: AsyncIOMotorDatabase, tradesafe_service):
    """
    Process automatic fund releases based on delivery method timers.
    """
    logger.info("Running auto-release check...")
    
    try:
        now = datetime.now(timezone.utc)
        
        # Find transactions eligible for auto-release
        eligible = await db.transactions.find({
            "transaction_state": "DELIVERED",
            "delivery_confirmed": True,
            "auto_release_at": {"$lte": now.isoformat()},
            "has_dispute": {"$ne": True},
            "auto_released": {"$ne": True}
        }).to_list(100)
        
        logger.info(f"Found {len(eligible)} transactions eligible for auto-release")
        
        for txn in eligible:
            try:
                await process_single_auto_release(db, txn, tradesafe_service)
            except Exception as e:
                logger.error(f"Auto-release failed for {txn.get('transaction_id')}: {e}")
                
    except Exception as e:
        logger.error(f"Auto-release job failed: {e}")


async def process_single_auto_release(db: AsyncIOMotorDatabase, txn: Dict, tradesafe_service):
    """Process auto-release for a single transaction"""
    transaction_id = txn.get("transaction_id")
    allocation_id = txn.get("tradesafe_allocation_id")
    
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
    
    # Update transaction
    await db.transactions.update_one(
        {"transaction_id": transaction_id},
        {"$set": {
            "transaction_state": "COMPLETED",
            "tradesafe_state": "FUNDS_RELEASED",
            "payment_status": "Completed",
            "release_status": "Released",
            "released_at": datetime.now(timezone.utc).isoformat(),
            "auto_released": True,
            "net_amount": net_amount
        },
        "$push": {
            "timeline": {
                "status": "Funds Auto-Released",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "by": "System",
                "details": f"Automatic release after delivery window. R{net_amount:.2f} released to seller."
            }
        }}
    )
    
    # Send notification
    from email_service import send_funds_released_email
    from sms_service import send_funds_released_sms
    
    await send_funds_released_email(
        to_email=txn["seller_email"],
        to_name=txn["seller_name"],
        share_code=txn.get("share_code", transaction_id),
        item_description=txn["item_description"],
        amount=item_price,
        net_amount=net_amount
    )
    
    if txn.get("seller_phone"):
        await send_funds_released_sms(
            to_phone=txn["seller_phone"],
            message=f"TrustTrade: R{net_amount:.2f} auto-released to your account. Ref: {txn.get('share_code', transaction_id)}"
        )


async def check_webhook_failures(db: AsyncIOMotorDatabase):
    """
    Check for and retry failed webhook processing.
    Alert admin after repeated failures.
    """
    logger.info("Checking for webhook failures...")
    
    try:
        # Find failed webhooks from the last 24 hours
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
        
        failed_webhooks = await db.webhook_logs.find({
            "status": "failed",
            "timestamp": {"$gte": cutoff},
            "retry_count": {"$lt": 3}
        }).to_list(100)
        
        for webhook in failed_webhooks:
            # Increment retry count
            await db.webhook_logs.update_one(
                {"_id": webhook["_id"]},
                {"$inc": {"retry_count": 1}}
            )
            
            # Log for admin alert
            if webhook.get("retry_count", 0) >= 2:
                logger.warning(f"Webhook repeatedly failing: {webhook.get('webhook_id')} - Transaction: {webhook.get('transaction_id')}")
                
    except Exception as e:
        logger.error(f"Webhook failure check failed: {e}")


def is_event_processed(event_id: str) -> bool:
    """Check if an event has already been processed (idempotency)"""
    return event_id in processed_events


def mark_event_processed(event_id: str):
    """Mark an event as processed"""
    processed_events.add(event_id)
    # Keep set from growing indefinitely - remove old entries periodically
    if len(processed_events) > 10000:
        # Remove oldest half
        processed_events.clear()


async def start_background_jobs(db: AsyncIOMotorDatabase, tradesafe_service, interval_minutes: int = 3):
    """
    Start background jobs that run periodically.
    - Payment verification: every 3 minutes
    - Auto-release check: every 5 minutes
    - Webhook failure check: every 10 minutes
    """
    logger.info(f"Starting background jobs with {interval_minutes} minute interval")
    
    iteration = 0
    while True:
        try:
            iteration += 1
            
            # Payment verification - every iteration
            await verify_pending_payments(db, tradesafe_service)
            
            # Auto-release - every other iteration (6 minutes)
            if iteration % 2 == 0:
                await process_auto_releases(db, tradesafe_service)
            
            # Webhook failures - every 4th iteration (12 minutes)
            if iteration % 4 == 0:
                await check_webhook_failures(db)
                
        except Exception as e:
            logger.error(f"Background job iteration failed: {e}")
        
        await asyncio.sleep(interval_minutes * 60)
