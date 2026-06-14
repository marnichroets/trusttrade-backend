"""
TrustTrade — Courier Guy (ShipLogic) tracking webhook handling.

Turns ShipLogic tracking events (collected / in-transit / out-for-delivery /
delivered) into TrustTrade timeline updates + buyer & seller emails, and
auto-dispatches the escrow on collection so the seller never has to click
"Mark as Dispatched" for courier transactions.
"""

import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

# Canonical milestones we surface to users, in lifecycle order.
MILESTONE_ORDER = ["collected", "in_transit", "out_for_delivery", "delivered"]

MILESTONE_LABELS = {
    "collected": "Parcel collected by Courier Guy",
    "in_transit": "Parcel in transit",
    "out_for_delivery": "Parcel out for delivery",
    "delivered": "Parcel delivered",
}


def milestone_from_status(*values: str) -> Optional[str]:
    """Map a ShipLogic status/event string to one of our canonical milestones.

    ShipLogic uses several spellings across accounts (status code, event name,
    human description), so we match defensively on substrings. Returns None when
    the event isn't one of the four milestones we notify on.
    """
    text = " ".join(str(v or "").lower() for v in values)
    if not text.strip():
        return None
    # Order matters: check the most specific phrases first.
    if "out for delivery" in text or "out-for-delivery" in text or "out_for_delivery" in text:
        return "out_for_delivery"
    if "delivered" in text or "delivery-completed" in text or "delivery_completed" in text:
        return "delivered"
    if "collected" in text or "collection-completed" in text or "picked up" in text or "pickup" in text:
        return "collected"
    if ("transit" in text or "in-transit" in text or "at-hub" in text or "at hub" in text
            or "on its way" in text or "depot" in text or "hub" in text):
        return "in_transit"
    return None


async def _dispatch_on_collection(db, transaction: Dict[str, Any]) -> None:
    """Auto-mark a courier transaction as dispatched when the parcel is collected.

    Mirrors the seller's manual "Mark as Dispatched" action: starts delivery on
    TradeSafe and opens the inspection / auto-release window (counted from
    collection). Idempotent — a no-op if the transaction is already dispatched.
    """
    transaction_id = transaction.get("transaction_id")
    if transaction.get("delivery_started_at") or transaction.get("transaction_state") == "DELIVERY_IN_PROGRESS":
        logger.info(f"[COURIER_TRACK] {transaction_id} already dispatched — skipping auto-dispatch")
        return

    # Atomically claim the dispatch so concurrent webhooks can't double-fire.
    now = datetime.now(timezone.utc)
    claim = await db.transactions.update_one(
        {"transaction_id": transaction_id, "delivery_started_at": {"$in": [None, ""]},
         "transaction_state": {"$ne": "DELIVERY_IN_PROGRESS"}},
        {"$set": {"delivery_started_at": now.isoformat()}},
    )
    if claim.modified_count != 1:
        logger.info(f"[COURIER_TRACK] {transaction_id} dispatch already claimed — skipping")
        return

    # Start delivery on TradeSafe (best-effort — the state transition + window must
    # proceed regardless so the buyer can still confirm / auto-release happens).
    allocation_id = transaction.get("tradesafe_allocation_id")
    if allocation_id:
        try:
            from tradesafe_service import start_delivery
            result = await start_delivery(allocation_id)
            logger.info(f"[COURIER_TRACK] {transaction_id} TradeSafe start_delivery: {bool(result)}")
        except Exception as exc:
            logger.error(f"[COURIER_TRACK] {transaction_id} start_delivery failed (non-fatal): {exc}")

    # Compute the auto-release window from the collection time.
    from core.config import settings
    from services.auto_release import (
        compute_auto_release, new_confirm_token,
        human_window, format_release_date, confirm_link,
    )

    seller_email = (transaction.get("seller_email") or "").lower()
    seller_track_doc = await db.users.find_one(
        {"email": seller_email},
        {"_id": 0, "total_trades": 1, "successful_trades": 1, "valid_disputes_count": 1},
    ) if seller_email else None
    release = compute_auto_release(transaction.get("delivery_method"), seller_track_doc, from_time=now)
    token = transaction.get("confirm_receipt_token") or new_confirm_token()

    timeline = transaction.get("timeline", [])
    timeline.append({
        "status": "Dispatched (Courier Guy collection)",
        "timestamp": now.isoformat(),
        "by": "Courier Guy",
        "details": "Parcel collected by Courier Guy — transaction auto-marked as dispatched.",
    })

    await db.transactions.update_one(
        {"transaction_id": transaction_id},
        {"$set": {
            "tradesafe_state": "INITIATED",
            "payment_status": "Delivery in Progress",
            "transaction_state": "DELIVERY_IN_PROGRESS",
            "dispatched_at": now.isoformat(),
            "auto_dispatched": True,
            "auto_release_at": release["auto_release_at_iso"],
            "auto_release_window_hours": release["window_hours"],
            "auto_release_seller_track": release["seller_track"],
            "confirm_receipt_token": token,
            "release_reminder_24h_sent": False,
            "release_reminder_2h_sent": False,
            "timeline": timeline,
        }},
    )
    logger.info(f"[COURIER_TRACK] {transaction_id} auto-dispatched on collection (auto_release_at={release['auto_release_at_iso']})")

    # Notify the buyer their order is on its way — mirrors the manual "Mark as
    # Dispatched" path (tradesafe.py). Without this, a buyer on a courier deal
    # (especially a phone-only invite) gets no dispatch notification at all.
    share_code = transaction.get("share_code") or transaction_id
    buyer_email = transaction.get("buyer_email")
    buyer_phone = transaction.get("buyer_phone")
    window_text = human_window(release["window_hours"])
    release_date = format_release_date(release["auto_release_at"])
    link = confirm_link(settings.FRONTEND_URL, token)

    if buyer_email:
        try:
            import email_service
            await email_service.send_delivery_started_email(
                to_email=buyer_email,
                to_name=transaction.get("buyer_name", "Buyer"),
                share_code=share_code,
                item_description=transaction.get("item_description", ""),
                seller_name=transaction.get("seller_name", "Seller"),
            )
        except Exception as exc:
            logger.error(f"[COURIER_TRACK] {transaction_id} dispatch email failed (non-fatal): {exc}")

    if buyer_phone:
        try:
            from sms_service import send_order_dispatched_sms
            await send_order_dispatched_sms(
                to_phone=buyer_phone,
                buyer_name=transaction.get("buyer_name", "there"),
                seller_name=transaction.get("seller_name", "the seller"),
                window_text=window_text,
                release_date=release_date,
                confirm_link=link,
            )
        except Exception as exc:
            logger.error(f"[COURIER_TRACK] {transaction_id} dispatch SMS failed (non-fatal): {exc}")


async def handle_tracking_event(db, transaction: Dict[str, Any], milestone: str) -> Dict[str, Any]:
    """Process one courier milestone for a transaction: dedup, update the timeline,
    auto-dispatch on collection, and email both parties. Idempotent per milestone."""
    transaction_id = transaction.get("transaction_id")

    # Dedup: only process each milestone once, even if ShipLogic re-delivers it.
    already = set(transaction.get("courier_milestones_notified") or [])
    if milestone in already:
        return {"ok": True, "skipped": True, "reason": "milestone already processed"}

    # Atomically record the milestone so concurrent deliveries don't double-send.
    claim = await db.transactions.update_one(
        {"transaction_id": transaction_id, "courier_milestones_notified": {"$ne": milestone}},
        {"$addToSet": {"courier_milestones_notified": milestone}},
    )
    if claim.modified_count != 1:
        return {"ok": True, "skipped": True, "reason": "milestone claimed concurrently"}

    now_iso = datetime.now(timezone.utc).isoformat()
    waybill = transaction.get("courier_waybill") or ""
    tracking_url = transaction.get("courier_tracking_url") or ""

    # 1. Timeline entry so both parties see status inside TrustTrade.
    timeline = transaction.get("timeline", [])
    timeline.append({
        "status": MILESTONE_LABELS.get(milestone, "Courier update"),
        "timestamp": now_iso,
        "by": "Courier Guy",
        "details": f"Waybill {waybill}" if waybill else "Courier tracking update",
    })
    set_fields = {"courier_status": milestone, "courier_status_updated_at": now_iso, "timeline": timeline}
    if milestone == "delivered":
        set_fields["courier_delivered_at"] = now_iso
    await db.transactions.update_one({"transaction_id": transaction_id}, {"$set": set_fields})

    # 2. Auto-dispatch the escrow on collection (seller never clicks "Mark as Dispatched").
    if milestone == "collected":
        try:
            await _dispatch_on_collection(db, transaction)
        except Exception as exc:
            logger.error(f"[COURIER_TRACK] {transaction_id} auto-dispatch failed (non-fatal): {exc}")

    # 3. Email buyer + seller (best-effort).
    try:
        import email_service
        share_code = transaction.get("share_code") or transaction_id
        for to_email, to_name, role in (
            (transaction.get("buyer_email"), transaction.get("buyer_name", "there"), "buyer"),
            (transaction.get("seller_email"), transaction.get("seller_name", "there"), "seller"),
        ):
            if to_email:
                await email_service.send_courier_tracking_email(
                    to_email=to_email, to_name=to_name, share_code=share_code,
                    milestone=milestone, waybill=waybill, tracking_url=tracking_url, role=role,
                )
    except Exception as exc:
        logger.error(f"[COURIER_TRACK] {transaction_id} tracking emails failed (non-fatal): {exc}")

    logger.info(f"[COURIER_TRACK] {transaction_id} processed milestone={milestone}")
    return {"ok": True, "milestone": milestone, "transaction_id": transaction_id}
