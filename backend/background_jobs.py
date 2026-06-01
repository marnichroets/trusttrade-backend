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
        
        # Check if funds have been received — only act on confirmed payment states.
        # NOTE: FUNDS_RECEIVED = deposit attempted; FUNDS_DEPOSITED = actually cleared.
        # The Payment Secured email must only fire on FUNDS_DEPOSITED, same rule as
        # the primary webhook path in routes/webhooks.py.
        if ts_state in ["FUNDS_RECEIVED", "FUNDS_DEPOSITED"]:
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

                auto_release_at = (datetime.now(timezone.utc) + timedelta(hours=48)).isoformat()
                # Update transaction
                update_data = {
                    "transaction_state": TransactionState.PAYMENT_SECURED.value,
                    "tradesafe_state": ts_state,
                    "payment_status": "Paid",
                    "payment_verified": True,
                    "payment_verified_at": now,
                    "payment_verified_by": "fallback_job",
                    "funds_received_at": now,
                    "auto_release_at": auto_release_at,
                    "timeline": timeline
                }

                await db.transactions.update_one(
                    {"transaction_id": transaction_id},
                    {"$set": update_data}
                )

                # Send Payment Secured emails ONLY on FUNDS_DEPOSITED (funds cleared).
                # FUNDS_RECEIVED is a precursor state and would email prematurely.
                if ts_state == "FUNDS_DEPOSITED":
                    await send_fallback_payment_notifications(db, txn)

                    # Backstop courier booking: if the primary webhook was delayed or
                    # missed, make sure the Courier Guy shipment is booked here too.
                    # book_courier_for_transaction is idempotent and only acts on
                    # courier deliveries, so this can never double-book or misfire.
                    try:
                        import email_service
                        from services.courier_booking import book_courier_for_transaction
                        await book_courier_for_transaction(db, txn, email_service=email_service)
                    except Exception as e:
                        logger.error(f"FALLBACK: courier auto-book failed (non-fatal) for {transaction_id}: {e}")

                    return {"updated": True, "action": "state_updated_to_PAYMENT_SECURED_with_email"}

                logger.info(
                    f"FALLBACK: {transaction_id} state advanced on {ts_state} but Payment Secured "
                    f"emails withheld until FUNDS_DEPOSITED"
                )
                return {"updated": True, "action": "state_updated_to_PAYMENT_SECURED_no_email"}
        
        return {"updated": False, "reason": "no_payment_detected", "ts_state": ts_state}
        
    except Exception as e:
        logger.error(f"TradeSafe API error for {tradesafe_id}: {e}")
        return {"updated": False, "reason": "api_exception", "error": str(e)}


async def expire_stale_payment_transactions(db: AsyncIOMotorDatabase) -> Dict[str, Any]:
    """
    Mark unpaid transactions as expired after 72 hours.

    This is a read-friendly cleanup pass: it only updates stale unpaid
    transactions and leaves the records in place for history review.
    """
    logger.info("=== Running unpaid transaction expiry check ===")

    summary = {
        "checked": 0,
        "expired": 0,
        "errors": 0,
    }

    try:
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=72)).isoformat()
        candidates = await db.transactions.find({
            "$and": [
                {
                    "$or": [
                        {"awaiting_payment_at": {"$lt": cutoff}},
                        {"awaiting_payment_at": {"$exists": False}, "created_at": {"$lt": cutoff}},
                    ]
                },
                {
                    "$or": [
                        {"archived": {"$ne": True}},
                        {"archived": {"$exists": False}},
                    ]
                }
            ],
            "transaction_state": "AWAITING_PAYMENT",
            "payment_status": {"$in": ["Awaiting Payment", "Ready for Payment", "Pending Payment"]},
        }, {"_id": 0}).to_list(250)

        summary["checked"] = len(candidates)
        if not candidates:
            return summary

        now_iso = datetime.now(timezone.utc).isoformat()
        expiry_note = "Transaction expired due to no payment"

        for txn in candidates:
            try:
                transaction_id = txn.get("transaction_id")
                timeline = txn.get("timeline", [])
                timeline.append({
                    "status": "Transaction expired",
                    "timestamp": now_iso,
                    "by": "System",
                    "details": expiry_note,
                })

                update_data = {
                    "transaction_state": "EXPIRED",
                    "payment_status": "Expired",
                    "release_status": "Not Released",
                    "expired_at": now_iso,
                    "archived_at": now_iso,
                    "archived": True,
                    "timeline": timeline,
                }

                await db.transactions.update_one(
                    {"transaction_id": transaction_id},
                    {"$set": update_data}
                )
                summary["expired"] += 1
                logger.info(f"Expired stale unpaid transaction {transaction_id}")
            except Exception as exc:
                summary["errors"] += 1
                logger.error(f"Failed to expire unpaid transaction {txn.get('transaction_id')}: {exc}")
    except Exception as exc:
        summary["errors"] += 1
        logger.error(f"Expiry job failed: {exc}")

    logger.info(f"Unpaid transaction expiry complete: {summary}")
    return summary


async def expire_inactive_pre_escrow_transactions(db: AsyncIOMotorDatabase) -> Dict[str, Any]:
    """
    Mark stale pre-escrow transactions as expired after 48 hours of inactivity.

    Targets transactions where both parties never completed confirmation and no
    TradeSafe escrow was ever created. This is distinct from the unpaid-payment
    expiry, which handles transactions that reached AWAITING_PAYMENT.
    """
    logger.info("=== Running pre-escrow inactivity expiry check ===")

    summary = {
        "checked": 0,
        "expired": 0,
        "errors": 0,
    }

    try:
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=48)).isoformat()
        candidates = await db.transactions.find({
            "transaction_state": {"$in": ["CREATED", "PENDING_CONFIRMATION"]},
            "tradesafe_id": {"$in": [None, ""]},
            "created_at": {"$lt": cutoff},
            "$or": [
                {"archived": {"$ne": True}},
                {"archived": {"$exists": False}},
            ],
        }, {"_id": 0}).to_list(250)

        summary["checked"] = len(candidates)
        if not candidates:
            return summary

        now_iso = datetime.now(timezone.utc).isoformat()

        for txn in candidates:
            try:
                transaction_id = txn.get("transaction_id")
                timeline = txn.get("timeline", [])
                timeline.append({
                    "status": "Transaction expired",
                    "timestamp": now_iso,
                    "by": "System",
                    "details": "Transaction expired due to 48 hours of inactivity before escrow was created",
                })

                await db.transactions.update_one(
                    {"transaction_id": transaction_id},
                    {"$set": {
                        "transaction_state": "EXPIRED",
                        "payment_status": "Expired",
                        "release_status": "Not Released",
                        "expired_at": now_iso,
                        "archived_at": now_iso,
                        "archived": True,
                        "timeline": timeline,
                    }}
                )
                summary["expired"] += 1
                logger.info(f"Expired inactive pre-escrow transaction {transaction_id}")
            except Exception as exc:
                summary["errors"] += 1
                logger.error(f"Failed to expire pre-escrow transaction {txn.get('transaction_id')}: {exc}")
    except Exception as exc:
        summary["errors"] += 1
        logger.error(f"Pre-escrow inactivity expiry job failed: {exc}")

    logger.info(f"Pre-escrow inactivity expiry complete: {summary}")
    return summary


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


async def book_pending_courier_shipments(db: AsyncIOMotorDatabase) -> Dict[str, Any]:
    """
    Backstop courier booking for funded courier transactions with no waybill yet.

    The PRIMARY trigger is the live TradeSafe webhook (routes/webhooks.py). The
    payment-verification fallback (verify_pending_payments) only looks at txns still
    in a pending/awaiting state, so once payment_status is already "Funds Secured" it
    no longer matches there. This job closes that gap: it targets courier transactions
    that are funded (in escrow) but still have no courier_waybill, and calls the
    idempotent book_courier_for_transaction — which atomically claims the booking and
    no-ops if a waybill already exists or another caller owns it.
    """
    logger.info("=== Running pending courier booking check ===")

    summary = {"checked": 0, "booked": 0, "errors": 0}

    try:
        # delivery_method=courier AND funded/payment-secured AND no waybill yet,
        # excluding deals that are already released or refunded (booking would be moot).
        candidates = await db.transactions.find({
            "delivery_method": "courier",
            "courier_waybill": {"$in": [None, ""]},
            "courier_booking_in_progress": {"$ne": True},
            "$or": [
                {"payment_status": "Funds Secured"},
                {"tradesafe_state": {"$in": ["FUNDS_DEPOSITED", "FUNDS_RECEIVED"]}},
            ],
            "release_status": {"$nin": ["Released", "Refunded"]},
        }, {"_id": 0}).to_list(100)

        summary["checked"] = len(candidates)
        if not candidates:
            return summary

        logger.info(f"Found {len(candidates)} funded courier transaction(s) without a waybill")

        import email_service
        from services.courier_booking import book_courier_for_transaction

        for txn in candidates:
            transaction_id = txn.get("transaction_id")
            try:
                result = await book_courier_for_transaction(db, txn, email_service=email_service)
                if result and result.get("waybill"):
                    summary["booked"] += 1
                    logger.info(f"FALLBACK: courier booked for {transaction_id} — waybill={result.get('waybill')}")
            except Exception as e:
                summary["errors"] += 1
                logger.error(f"FALLBACK: courier booking failed for {transaction_id}: {e}")
    except Exception as e:
        summary["errors"] += 1
        logger.error(f"Pending courier booking job failed: {e}")

    logger.info(f"Pending courier booking check complete: {summary}")
    return summary


def _parse_iso_utc(value) -> Optional[datetime]:
    if not value:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    try:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


async def send_release_reminders(db: AsyncIOMotorDatabase) -> Dict[str, Any]:
    """SMS reminders 24h and 2h before auto-release for dispatched, unconfirmed transactions."""
    import sms_service
    from services.auto_release import confirm_link
    from core.config import settings

    logger.info("=== Running auto-release reminders ===")
    summary = {"checked": 0, "sent_24h": 0, "sent_2h": 0, "errors": 0}
    now = datetime.now(timezone.utc)

    try:
        candidates = await db.transactions.find({
            "transaction_state": "DELIVERY_IN_PROGRESS",
            "auto_release_at": {"$exists": True, "$ne": None},
            "release_status": {"$nin": ["Released", "Refunded"]},
            "has_dispute": {"$ne": True},
            "auto_release_hold": {"$ne": True},
            "buyer_reported_problem": {"$ne": True},
        }, {"_id": 0}).to_list(200)
        summary["checked"] = len(candidates)

        for txn in candidates:
            tid = txn.get("transaction_id")
            try:
                release_at = _parse_iso_utc(txn.get("auto_release_at"))
                if not release_at:
                    continue
                hours_left = (release_at - now).total_seconds() / 3600.0
                phone = txn.get("buyer_phone")
                token = txn.get("confirm_receipt_token")
                link = confirm_link(settings.FRONTEND_URL, token) if token else settings.FRONTEND_URL

                # Final reminder — within 2 hours of release.
                if 0 < hours_left <= 2 and not txn.get("release_reminder_2h_sent"):
                    claim = await db.transactions.update_one(
                        {"transaction_id": tid, "release_reminder_2h_sent": {"$ne": True}},
                        {"$set": {"release_reminder_2h_sent": True}},
                    )
                    if claim.modified_count == 1:
                        if phone:
                            await sms_service.send_release_reminder_sms(phone, "in about 2 hours", link)
                        summary["sent_2h"] += 1
                # 24-hour reminder.
                elif 2 < hours_left <= 24 and not txn.get("release_reminder_24h_sent"):
                    claim = await db.transactions.update_one(
                        {"transaction_id": tid, "release_reminder_24h_sent": {"$ne": True}},
                        {"$set": {"release_reminder_24h_sent": True}},
                    )
                    if claim.modified_count == 1:
                        if phone:
                            await sms_service.send_release_reminder_sms(phone, "tomorrow", link)
                        summary["sent_24h"] += 1
            except Exception as e:
                summary["errors"] += 1
                logger.error(f"Release reminder failed for {tid}: {e}")
    except Exception as e:
        summary["errors"] += 1
        logger.error(f"Release reminder job failed: {e}")

    logger.info(f"Auto-release reminders complete: {summary}")
    return summary


async def process_dispatch_auto_releases(db: AsyncIOMotorDatabase, tradesafe_service) -> Dict[str, Any]:
    """
    Auto-release to the seller when the inspection window expires and the buyer took no
    action — the core 'if you do nothing, payment releases' guarantee. Skips disputed,
    held, or buyer-flagged transactions. Uses the escrow-safe release helper.
    """
    logger.info("=== Running dispatch auto-release check ===")
    summary = {"checked": 0, "released": 0, "errors": 0}
    now_iso = datetime.now(timezone.utc).isoformat()

    try:
        from services.dispute_payouts import release_funds_to_seller

        eligible = await db.transactions.find({
            "transaction_state": "DELIVERY_IN_PROGRESS",
            "auto_release_at": {"$lte": now_iso},
            "release_status": {"$nin": ["Released", "Refunded"]},
            "has_dispute": {"$ne": True},
            "auto_release_hold": {"$ne": True},
            "buyer_reported_problem": {"$ne": True},
            "auto_released": {"$ne": True},
        }, {"_id": 0}).to_list(100)
        summary["checked"] = len(eligible)

        for txn in eligible:
            tid = txn.get("transaction_id")
            try:
                # Atomically claim so two workers can't both release.
                claim = await db.transactions.update_one(
                    {"transaction_id": tid, "auto_released": {"$ne": True},
                     "release_status": {"$nin": ["Released", "Refunded"]}},
                    {"$set": {"auto_released": True, "auto_released_at": now_iso}},
                )
                if claim.modified_count != 1:
                    continue

                timeline = txn.get("timeline", [])
                timeline.append({
                    "status": "Funds auto-released (inspection window passed)",
                    "timestamp": now_iso,
                    "by": "System",
                    "details": "Buyer took no action before the auto-release date.",
                })
                await db.transactions.update_one({"transaction_id": tid}, {"$set": {"timeline": timeline}})

                result = await release_funds_to_seller(db, txn, source="auto_release_timeout")
                if result.get("success"):
                    summary["released"] += 1
                    logger.info(f"[AUTO_RELEASE] {tid} auto-released to seller")
                else:
                    summary["errors"] += 1
                    logger.error(f"[AUTO_RELEASE] {tid} release failed: {result}")
            except Exception as e:
                summary["errors"] += 1
                logger.error(f"[AUTO_RELEASE] error for {tid}: {e}")
    except Exception as e:
        summary["errors"] += 1
        logger.error(f"Dispatch auto-release job failed: {e}")

    logger.info(f"Dispatch auto-release complete: {summary}")
    return summary


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
    
    # Notify BOTH parties via the single release-notification helper (correct
    # fee + seller SMS + buyer "transaction complete" email; deduped).
    from routes.webhooks import notify_seller_funds_released
    txn["net_amount"] = net_amount
    await notify_seller_funds_released(db, txn)

    logger.info(f"Auto-release complete for {transaction_id}")


async def check_webhook_health(db: AsyncIOMotorDatabase) -> Dict[str, Any]:
    """
    Check for webhook processing issues and trigger alerts.
    """
    logger.info("=== Checking webhook health ===")
    
    from datetime import timedelta
    from alert_service import trigger_alert, AlertType
    import os
    
    # Get admin email for alerts
    admin_email = os.environ.get('ADMIN_ALERT_EMAIL', '')
    
    summary = {
        "failed_webhooks_24h": 0,
        "failed_emails_24h": 0,
        "stuck_transactions": 0
    }
    
    try:
        cutoff_24h = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
        cutoff_10min = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
        cutoff_5min = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
        
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
        
        # Count stuck transactions (no update in 10 minutes while in active state)
        summary["stuck_transactions"] = await db.transactions.count_documents({
            "transaction_state": {"$in": ["AWAITING_PAYMENT", "PAYMENT_SECURED", "DELIVERY_IN_PROGRESS"]},
            "$or": [
                {"last_webhook_at": {"$lt": cutoff_10min}},
                {"last_webhook_at": {"$exists": False}, "updated_at": {"$lt": cutoff_10min}},
                {"last_webhook_at": {"$exists": False}, "updated_at": {"$exists": False}, "created_at": {"$lt": cutoff_10min}}
            ]
        })
        
        # Check for payment not synced (payment received but state not updated within 5 min)
        payment_stuck = await db.transactions.count_documents({
            "tradesafe_state": {"$in": ["FUNDS_RECEIVED"]},
            "transaction_state": {"$ne": "PAYMENT_SECURED"},
            "funds_received_at": {"$lt": cutoff_5min}
        })
        
        # TRIGGER ALERTS for critical issues
        if admin_email:
            # Alert for stuck transactions
            if summary["stuck_transactions"] > 0:
                stuck_txns = await db.transactions.find({
                    "transaction_state": {"$in": ["AWAITING_PAYMENT", "PAYMENT_SECURED", "DELIVERY_IN_PROGRESS"]},
                    "$or": [
                        {"last_webhook_at": {"$lt": cutoff_10min}},
                        {"last_webhook_at": {"$exists": False}}
                    ]
                }, {"transaction_id": 1, "share_code": 1, "transaction_state": 1}).limit(5).to_list(5)
                
                for txn in stuck_txns:
                    await trigger_alert(
                        db=db,
                        alert_type=AlertType.TRANSACTION_STUCK,
                        message=f"Transaction {txn.get('share_code', txn.get('transaction_id'))} has no updates for >10 minutes. Current state: {txn.get('transaction_state')}",
                        admin_email=admin_email,
                        transaction_id=txn.get("transaction_id"),
                        share_code=txn.get("share_code")
                    )
            
            # Alert for payment not synced
            if payment_stuck > 0:
                stuck_payments = await db.transactions.find({
                    "tradesafe_state": {"$in": ["FUNDS_RECEIVED"]},
                    "transaction_state": {"$ne": "PAYMENT_SECURED"}
                }, {"transaction_id": 1, "share_code": 1, "tradesafe_state": 1, "transaction_state": 1}).limit(5).to_list(5)
                
                for txn in stuck_payments:
                    await trigger_alert(
                        db=db,
                        alert_type=AlertType.PAYMENT_NOT_SYNCED,
                        message=f"Payment received for {txn.get('share_code', txn.get('transaction_id'))} but state not updated. TradeSafe: {txn.get('tradesafe_state')}, Our state: {txn.get('transaction_state')}",
                        admin_email=admin_email,
                        transaction_id=txn.get("transaction_id"),
                        share_code=txn.get("share_code")
                    )
        
        # Log warnings
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

            # Expire stale unpaid transactions - every iteration
            try:
                await expire_stale_payment_transactions(db)
            except Exception as e:
                logger.error(f"Expiry job failed: {e}")

            # Expire pre-escrow transactions with no activity for 48 hours - every iteration
            try:
                await expire_inactive_pre_escrow_transactions(db)
            except Exception as e:
                logger.error(f"Pre-escrow inactivity expiry job failed: {e}")

            # Backstop: book courier for funded courier txns missing a waybill - every iteration
            try:
                await book_pending_courier_shipments(db)
            except Exception as e:
                logger.error(f"Pending courier booking job failed: {e}")

            # Auto-release reminders (24h + 2h before) - every iteration
            try:
                await send_release_reminders(db)
            except Exception as e:
                logger.error(f"Release reminder job failed: {e}")

            # Auto-release on inspection-window expiry - every iteration
            try:
                await process_dispatch_auto_releases(db, tradesafe_service)
            except Exception as e:
                logger.error(f"Dispatch auto-release job failed: {e}")
            
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
