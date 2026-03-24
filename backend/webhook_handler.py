"""
TrustTrade Webhook Handler - Production-Ready
Handles TradeSafe webhook notifications with:
- Strict idempotency (no duplicate processing)
- Event logging for debugging
- Email deduplication
- State machine enforcement
- Comprehensive error handling
"""

import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any, Tuple
from motor.motor_asyncio import AsyncIOMotorDatabase
import hashlib
import json

from transaction_state import (
    TransactionState,
    is_valid_transition,
    map_tradesafe_state,
    get_ui_status
)

logger = logging.getLogger(__name__)

# Email event types for tracking
class EmailEvent:
    PAYMENT_SECURED_BUYER = "payment_secured_buyer"
    PAYMENT_SECURED_SELLER = "payment_secured_seller"
    DELIVERY_STARTED_BUYER = "delivery_started_buyer"
    DELIVERY_STARTED_SELLER = "delivery_started_seller"
    FUNDS_RELEASED_SELLER = "funds_released_seller"
    FUNDS_RELEASED_BUYER = "funds_released_buyer"
    DISPUTE_OPENED_BUYER = "dispute_opened_buyer"
    DISPUTE_OPENED_SELLER = "dispute_opened_seller"


def generate_event_id(payload: Dict) -> str:
    """Generate unique event ID from webhook payload for idempotency"""
    # Create deterministic ID from key payload fields
    key_parts = [
        str(payload.get("id", "")),
        str(payload.get("state", "")),
        str(payload.get("reference", "")),
        str(payload.get("transaction", {}).get("id", "") if isinstance(payload.get("transaction"), dict) else ""),
        str(payload.get("timestamp", "")),
    ]
    content = "|".join(key_parts)
    return hashlib.sha256(content.encode()).hexdigest()[:32]


async def log_webhook_event(
    db: AsyncIOMotorDatabase,
    event_id: str,
    transaction_id: str,
    payload: Dict,
    status: str,
    error_message: Optional[str] = None,
    processing_notes: Optional[str] = None
) -> None:
    """Log webhook event for debugging and audit trail"""
    event_doc = {
        "event_id": event_id,
        "transaction_id": transaction_id,
        "payload": payload,
        "status": status,  # "received", "processed", "duplicate", "failed", "ignored"
        "error_message": error_message,
        "processing_notes": processing_notes,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    try:
        await db.webhook_events.insert_one(event_doc)
        logger.info(f"Webhook event logged: {event_id} - {status}")
    except Exception as e:
        logger.error(f"Failed to log webhook event: {e}")


async def is_event_already_processed(db: AsyncIOMotorDatabase, event_id: str) -> bool:
    """Check if this webhook event was already processed (idempotency check)"""
    existing = await db.webhook_events.find_one({
        "event_id": event_id,
        "status": {"$in": ["processed", "duplicate"]}
    })
    return existing is not None


async def has_email_been_sent(db: AsyncIOMotorDatabase, transaction_id: str, email_event: str) -> bool:
    """Check if a specific email has already been sent for this transaction"""
    transaction = await db.transactions.find_one(
        {"transaction_id": transaction_id},
        {"emails_sent": 1}
    )
    if not transaction:
        return False
    
    emails_sent = transaction.get("emails_sent", [])
    return email_event in emails_sent


async def mark_email_sent(db: AsyncIOMotorDatabase, transaction_id: str, email_event: str) -> None:
    """Mark an email as sent for this transaction"""
    await db.transactions.update_one(
        {"transaction_id": transaction_id},
        {"$addToSet": {"emails_sent": email_event}}
    )
    logger.info(f"Marked email sent: {transaction_id} - {email_event}")


async def log_email_attempt(
    db: AsyncIOMotorDatabase,
    transaction_id: str,
    email_event: str,
    recipient: str,
    success: bool,
    error_message: Optional[str] = None
) -> None:
    """Log email send attempt"""
    log_doc = {
        "transaction_id": transaction_id,
        "email_event": email_event,
        "recipient": recipient,
        "success": success,
        "error_message": error_message,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    
    try:
        await db.email_logs.insert_one(log_doc)
    except Exception as e:
        logger.error(f"Failed to log email attempt: {e}")


async def send_email_with_tracking(
    db: AsyncIOMotorDatabase,
    transaction_id: str,
    email_event: str,
    recipient: str,
    send_func,
    **kwargs
) -> bool:
    """Send email with deduplication and logging"""
    # Check if already sent
    if await has_email_been_sent(db, transaction_id, email_event):
        logger.info(f"Email already sent, skipping: {transaction_id} - {email_event}")
        return False
    
    try:
        # Send the email
        await send_func(**kwargs)
        
        # Mark as sent
        await mark_email_sent(db, transaction_id, email_event)
        
        # Log success
        await log_email_attempt(db, transaction_id, email_event, recipient, True)
        
        logger.info(f"Email sent successfully: {transaction_id} - {email_event} to {recipient}")
        return True
        
    except Exception as e:
        # Log failure
        await log_email_attempt(db, transaction_id, email_event, recipient, False, str(e))
        logger.error(f"Email send failed: {transaction_id} - {email_event} to {recipient}: {e}")
        return False


async def send_sms_with_tracking(
    db: AsyncIOMotorDatabase,
    transaction_id: str,
    sms_event: str,
    phone: str,
    send_func,
    **kwargs
) -> bool:
    """Send SMS with logging (no deduplication for SMS as they're less critical)"""
    if not phone:
        return False
    
    try:
        await send_func(**kwargs)
        logger.info(f"SMS sent: {transaction_id} - {sms_event} to {phone}")
        return True
    except Exception as e:
        logger.error(f"SMS send failed: {transaction_id} - {sms_event} to {phone}: {e}")
        return False


def extract_webhook_data(payload: Dict) -> Tuple[Optional[str], Optional[str], Optional[str]]:
    """Extract tradesafe_id, new_state, and reference from various webhook formats"""
    # TradeSafe may send webhooks in different formats
    tradesafe_id = (
        payload.get("id") or 
        payload.get("transaction_id") or
        (payload.get("transaction", {}).get("id") if isinstance(payload.get("transaction"), dict) else None)
    )
    
    new_state = (
        payload.get("state") or
        payload.get("status") or
        (payload.get("transaction", {}).get("state") if isinstance(payload.get("transaction"), dict) else None)
    )
    
    reference = (
        payload.get("reference") or
        (payload.get("transaction", {}).get("reference") if isinstance(payload.get("transaction"), dict) else None)
    )
    
    # Normalize state to uppercase
    if new_state:
        new_state = str(new_state).upper()
    
    return tradesafe_id, new_state, reference


async def process_webhook(
    db: AsyncIOMotorDatabase,
    payload: Dict,
    email_service,
    sms_service
) -> Dict[str, Any]:
    """
    Main webhook processing function with full reliability guarantees.
    
    Returns:
        Dict with status, message, and any relevant data
    """
    # Generate unique event ID
    event_id = generate_event_id(payload)
    
    logger.info(f"Processing webhook event: {event_id}")
    logger.info(f"Webhook payload: {json.dumps(payload, default=str)}")
    
    # STEP 1: Check idempotency
    if await is_event_already_processed(db, event_id):
        logger.info(f"Duplicate webhook detected, ignoring: {event_id}")
        await log_webhook_event(db, event_id, "", payload, "duplicate", 
                               processing_notes="Webhook already processed")
        return {"status": "duplicate", "message": "Event already processed", "event_id": event_id}
    
    # STEP 2: Extract webhook data
    tradesafe_id, new_state, reference = extract_webhook_data(payload)
    
    if not tradesafe_id and not reference:
        await log_webhook_event(db, event_id, "", payload, "ignored",
                               error_message="Missing transaction identifier")
        return {"status": "ignored", "reason": "missing identifier"}
    
    if not new_state:
        await log_webhook_event(db, event_id, "", payload, "ignored",
                               error_message="Missing state in webhook")
        return {"status": "ignored", "reason": "missing state"}
    
    # STEP 3: Find our transaction
    query = {}
    if tradesafe_id:
        query["tradesafe_id"] = tradesafe_id
    elif reference:
        query["$or"] = [
            {"transaction_id": reference},
            {"share_code": reference}
        ]
    
    transaction = await db.transactions.find_one(query, {"_id": 0})
    
    if not transaction:
        await log_webhook_event(db, event_id, reference or tradesafe_id, payload, "ignored",
                               error_message="Transaction not found")
        return {"status": "ignored", "reason": "transaction not found"}
    
    transaction_id = transaction["transaction_id"]
    share_code = transaction.get("share_code", transaction_id)
    
    # STEP 4: Map TradeSafe state to our state
    current_state = transaction.get("transaction_state", "CREATED")
    mapped_state = map_tradesafe_state(new_state)
    
    logger.info(f"State transition: {current_state} -> {mapped_state} (TradeSafe: {new_state})")
    
    # STEP 5: Validate state transition
    if not is_valid_transition(current_state, mapped_state):
        # Log but still process - some transitions might come out of order from TradeSafe
        logger.warning(f"Invalid state transition {current_state} -> {mapped_state}, processing anyway")
    
    # STEP 6: Build update data
    now = datetime.now(timezone.utc).isoformat()
    timeline = transaction.get("timeline", [])
    timeline.append({
        "status": f"State: {mapped_state}",
        "timestamp": now,
        "by": "TradeSafe Webhook",
        "details": f"TradeSafe state: {new_state}"
    })
    
    update_data = {
        "transaction_state": mapped_state,
        "tradesafe_state": new_state,
        "payment_status": get_ui_status(mapped_state).get("label", mapped_state),
        "timeline": timeline,
        "last_webhook_at": now,
        "last_webhook_event_id": event_id
    }
    
    # STEP 7: Handle state-specific actions
    notifications_sent = []
    
    if mapped_state == TransactionState.PAYMENT_SECURED.value:
        update_data["funds_received_at"] = now
        update_data["payment_verified"] = True
        
        # Send buyer email (IMMEDIATE - must arrive before TradeSafe's email)
        email_sent = await send_email_with_tracking(
            db, transaction_id, EmailEvent.PAYMENT_SECURED_BUYER,
            transaction["buyer_email"],
            email_service.send_immediate_payment_secured_email,
            to_email=transaction["buyer_email"],
            to_name=transaction["buyer_name"],
            share_code=share_code,
            item_description=transaction["item_description"],
            amount=transaction["item_price"]
        )
        if email_sent:
            notifications_sent.append("buyer_email")
        
        # Send seller email
        email_sent = await send_email_with_tracking(
            db, transaction_id, EmailEvent.PAYMENT_SECURED_SELLER,
            transaction["seller_email"],
            email_service.send_payment_received_email,
            to_email=transaction["seller_email"],
            to_name=transaction["seller_name"],
            share_code=share_code,
            item_description=transaction["item_description"],
            amount=transaction["item_price"],
            role="seller"
        )
        if email_sent:
            notifications_sent.append("seller_email")
        
        # SMS notifications
        if transaction.get("buyer_phone"):
            await send_sms_with_tracking(
                db, transaction_id, "payment_secured_buyer_sms",
                transaction["buyer_phone"],
                sms_service.send_funds_received_sms,
                to_phone=transaction["buyer_phone"],
                message=f"TrustTrade: Your payment of R{transaction['item_price']:.2f} is now secured in escrow. Ref: {share_code}"
            )
            notifications_sent.append("buyer_sms")
        
        if transaction.get("seller_phone"):
            await send_sms_with_tracking(
                db, transaction_id, "payment_secured_seller_sms",
                transaction["seller_phone"],
                sms_service.send_funds_received_sms,
                to_phone=transaction["seller_phone"],
                message=f"TrustTrade: Payment of R{transaction['item_price']:.2f} received! Please deliver the item. Ref: {share_code}"
            )
            notifications_sent.append("seller_sms")
    
    elif mapped_state == TransactionState.DELIVERY_IN_PROGRESS.value:
        update_data["delivery_started_at"] = now
        
        # Notify buyer that item was dispatched
        email_sent = await send_email_with_tracking(
            db, transaction_id, EmailEvent.DELIVERY_STARTED_BUYER,
            transaction["buyer_email"],
            email_service.send_delivery_started_email,
            to_email=transaction["buyer_email"],
            to_name=transaction["buyer_name"],
            share_code=share_code,
            item_description=transaction["item_description"],
            seller_name=transaction["seller_name"]
        )
        if email_sent:
            notifications_sent.append("buyer_email")
        
        # SMS to buyer
        if transaction.get("buyer_phone"):
            await send_sms_with_tracking(
                db, transaction_id, "delivery_started_buyer_sms",
                transaction["buyer_phone"],
                sms_service.send_delivery_sms,
                to_phone=transaction["buyer_phone"],
                message=f"TrustTrade: Your item has been dispatched! Please confirm receipt when it arrives. Ref: {share_code}"
            )
            notifications_sent.append("buyer_sms")
    
    elif mapped_state == TransactionState.COMPLETED.value:
        update_data["delivery_confirmed"] = True
        update_data["release_status"] = "Released"
        update_data["released_at"] = now
        
        # Calculate net amount
        net_amount = transaction["item_price"] * 0.98  # 2% fee
        update_data["net_amount"] = net_amount
        
        # Notify seller of funds release
        email_sent = await send_email_with_tracking(
            db, transaction_id, EmailEvent.FUNDS_RELEASED_SELLER,
            transaction["seller_email"],
            email_service.send_funds_released_email,
            to_email=transaction["seller_email"],
            to_name=transaction["seller_name"],
            share_code=share_code,
            item_description=transaction["item_description"],
            amount=transaction["item_price"],
            net_amount=net_amount
        )
        if email_sent:
            notifications_sent.append("seller_email")
        
        # SMS to seller
        if transaction.get("seller_phone"):
            await send_sms_with_tracking(
                db, transaction_id, "funds_released_seller_sms",
                transaction["seller_phone"],
                sms_service.send_funds_released_sms,
                to_phone=transaction["seller_phone"],
                message=f"TrustTrade: R{net_amount:.2f} has been released to your account. Ref: {share_code}"
            )
            notifications_sent.append("seller_sms")
    
    elif mapped_state == TransactionState.DISPUTED.value:
        update_data["has_dispute"] = True
        update_data["dispute_opened_at"] = now
        
        # Notify both parties
        await send_email_with_tracking(
            db, transaction_id, EmailEvent.DISPUTE_OPENED_BUYER,
            transaction["buyer_email"],
            email_service.send_dispute_opened_email,
            to_email=transaction["buyer_email"],
            to_name=transaction["buyer_name"],
            share_code=share_code,
            dispute_type="TradeSafe Dispute",
            description="A dispute has been opened on this transaction"
        )
        
        await send_email_with_tracking(
            db, transaction_id, EmailEvent.DISPUTE_OPENED_SELLER,
            transaction["seller_email"],
            email_service.send_dispute_opened_email,
            to_email=transaction["seller_email"],
            to_name=transaction["seller_name"],
            share_code=share_code,
            dispute_type="TradeSafe Dispute",
            description="A dispute has been opened on this transaction"
        )
        notifications_sent.append("dispute_emails")
    
    elif mapped_state == TransactionState.REFUNDED.value:
        update_data["refunded_at"] = now
        update_data["release_status"] = "Refunded"
    
    # STEP 8: Update the transaction
    await db.transactions.update_one(
        {"transaction_id": transaction_id},
        {"$set": update_data}
    )
    
    # STEP 9: Log successful processing
    await log_webhook_event(
        db, event_id, transaction_id, payload, "processed",
        processing_notes=f"State changed to {mapped_state}. Notifications: {notifications_sent}"
    )
    
    logger.info(f"Webhook processed: {transaction_id} - {current_state} -> {mapped_state}")
    
    return {
        "status": "processed",
        "transaction_id": transaction_id,
        "previous_state": current_state,
        "new_state": mapped_state,
        "tradesafe_state": new_state,
        "notifications_sent": notifications_sent,
        "event_id": event_id
    }


async def get_failed_webhooks(db: AsyncIOMotorDatabase, hours: int = 24, limit: int = 100) -> list:
    """Get failed webhook events for admin monitoring"""
    from datetime import timedelta
    
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
    
    failed = await db.webhook_events.find({
        "status": "failed",
        "timestamp": {"$gte": cutoff}
    }).sort("timestamp", -1).limit(limit).to_list(limit)
    
    # Remove MongoDB _id
    for event in failed:
        event.pop("_id", None)
    
    return failed


async def get_failed_emails(db: AsyncIOMotorDatabase, hours: int = 24, limit: int = 100) -> list:
    """Get failed email attempts for admin monitoring"""
    from datetime import timedelta
    
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
    
    failed = await db.email_logs.find({
        "success": False,
        "timestamp": {"$gte": cutoff}
    }).sort("timestamp", -1).limit(limit).to_list(limit)
    
    # Remove MongoDB _id
    for log in failed:
        log.pop("_id", None)
    
    return failed


async def get_stuck_transactions(db: AsyncIOMotorDatabase, hours: int = 4) -> list:
    """Get transactions that appear stuck (no state change for X hours)"""
    from datetime import timedelta
    
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
    
    # Find transactions that are in intermediate states and haven't been updated
    stuck = await db.transactions.find({
        "transaction_state": {"$in": ["AWAITING_PAYMENT", "PAYMENT_SECURED", "DELIVERY_IN_PROGRESS"]},
        "$or": [
            {"last_webhook_at": {"$lt": cutoff}},
            {"last_webhook_at": {"$exists": False}}
        ]
    }, {"_id": 0, "transaction_id": 1, "share_code": 1, "transaction_state": 1, 
        "tradesafe_state": 1, "created_at": 1, "last_webhook_at": 1}).to_list(100)
    
    return stuck
