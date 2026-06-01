"""
TrustTrade — Courier Guy auto-booking orchestration.

Books the Courier Guy (ShipLogic) shipment for a transaction once its escrow is
funded, stores the returned waybill on the transaction, and emails both parties a
tracking link. Designed to be:

  * idempotent  — never books twice (guards on an existing waybill);
  * non-fatal   — any failure is logged and recorded on the transaction but never
                  raised, so it can never break webhook / payment processing.
"""

import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from core.config import settings
from services.courier_guy import book_shipment

logger = logging.getLogger(__name__)


def build_tracking_url(waybill: str) -> str:
    """Build the public Courier Guy tracking URL for a waybill."""
    if not waybill:
        return ""
    try:
        return settings.COURIER_TRACKING_URL_TEMPLATE.format(waybill=waybill)
    except Exception:
        return f"https://www.thecourierguy.co.za/track-trace?ref={waybill}"


def _contact(name: Optional[str], mobile: Optional[str], email: Optional[str]) -> Dict[str, Any]:
    contact = {"name": (name or "TrustTrade User").strip()}
    if mobile:
        contact["mobile_number"] = mobile
    if email:
        contact["email"] = email
    return contact


async def book_courier_for_transaction(
    db,
    transaction: Dict[str, Any],
    email_service=None,
    service_level_id_override: Optional[int] = None,
) -> Optional[Dict[str, Any]]:
    """
    Book the Courier Guy shipment for a funded courier transaction.

    Safe to call from multiple places (webhook + manual sync) — it no-ops if the
    delivery method isn't courier, if the booking details are missing, or if a
    waybill already exists. Returns the booking result dict, or None when skipped
    or on failure.

    service_level_id_override: when set (e.g. an admin manually picking a different
    service level for a stuck transaction), this id is used instead of the one stored
    on the transaction — bypassing the stored code and the re-quote entirely.
    """
    transaction_id = transaction.get("transaction_id")
    try:
        if not settings.COURIER_ENABLED:
            return None
        if (transaction.get("delivery_method") or "").lower() != "courier":
            return None

        # Re-read the freshest copy so a stale in-memory dict (e.g. webhook + manual
        # sync firing close together) can't slip past the already-booked guard.
        fresh = await db.transactions.find_one({"transaction_id": transaction_id}, {"_id": 0})
        if fresh:
            transaction = fresh
        if transaction.get("courier_waybill"):
            logger.info(f"[COURIER_BOOK] {transaction_id} already booked — waybill={transaction.get('courier_waybill')}")
            return None

        # Atomically claim the booking: only one caller can flip the flag from unset
        # to True while no waybill exists. A non-match means someone else owns it.
        claim = await db.transactions.update_one(
            {
                "transaction_id": transaction_id,
                "courier_waybill": {"$in": [None, ""]},
                "courier_booking_in_progress": {"$ne": True},
            },
            {"$set": {"courier_booking_in_progress": True}},
        )
        if claim.matched_count == 0:
            logger.info(f"[COURIER_BOOK] {transaction_id} booking already claimed/done — skipping")
            return None

        details = transaction.get("courier_details") or {}
        pickup_address = details.get("pickup_address")
        delivery_address = details.get("delivery_address")
        parcel = details.get("parcel")
        quote_id = transaction.get("courier_quote_id")

        if not (pickup_address and delivery_address and parcel):
            msg = "Courier booking skipped — pickup/delivery/parcel details missing on transaction"
            logger.warning(f"[COURIER_BOOK] {transaction_id} {msg}")
            await db.transactions.update_one(
                {"transaction_id": transaction_id},
                {"$set": {"courier_booking_error": msg, "courier_booking_in_progress": False}},
            )
            return None

        share_code = transaction.get("share_code") or transaction_id
        pickup_contact = _contact(
            transaction.get("seller_name"), transaction.get("seller_phone"), transaction.get("seller_email")
        )
        delivery_contact = _contact(
            transaction.get("buyer_name"), transaction.get("buyer_phone"), transaction.get("buyer_email")
        )

        service_level_id = (
            service_level_id_override
            if service_level_id_override is not None
            else transaction.get("courier_service_level_id")
        )
        logger.info(
            f"[COURIER_BOOK] {transaction_id} booking shipment — quote={quote_id!r} "
            f"service_level_id={service_level_id!r} override={service_level_id_override!r} ref={share_code}"
        )
        result = await book_shipment(
            quote_id=quote_id,
            pickup={"address": pickup_address, "contact": pickup_contact},
            delivery={"address": delivery_address, "contact": delivery_contact},
            parcel=parcel,
            contact={"reference": share_code},
            collection_preference=transaction.get("courier_collection_preference"),
            service_level_id=service_level_id,
        )

        waybill = (result or {}).get("waybill") or ""
        if not waybill:
            msg = "Courier booking returned no waybill"
            logger.error(f"[COURIER_BOOK] {transaction_id} {msg}: {result}")
            await db.transactions.update_one(
                {"transaction_id": transaction_id},
                {"$set": {"courier_booking_error": msg, "courier_booking_in_progress": False}},
            )
            return None

        tracking_url = build_tracking_url(waybill)
        now = datetime.now(timezone.utc).isoformat()
        timeline = transaction.get("timeline", [])
        timeline.append({
            "status": "Courier Guy Shipment Booked",
            "timestamp": now,
            "by": "TrustTrade System",
            "details": f"Waybill {waybill}",
        })

        await db.transactions.update_one(
            {"transaction_id": transaction_id},
            {"$set": {
                "courier_waybill": waybill,
                "courier_shipment_id": result.get("shipment_id"),
                "courier_tracking_reference": result.get("tracking_reference"),
                "courier_tracking_url": tracking_url,
                "courier_status": result.get("status", "created"),
                "courier_booked_at": now,
                "courier_booking_error": None,
                "courier_booking_in_progress": False,
                "timeline": timeline,
            }},
        )
        logger.info(f"[COURIER_BOOK] {transaction_id} booked — waybill={waybill}")

        # Notify both parties (best-effort; failure here never undoes the booking).
        mailer = email_service
        if mailer is None:
            import email_service as mailer  # lazy import to avoid circular deps

        send = getattr(mailer, "send_courier_booked_email", None)
        if send:
            item_description = transaction.get("item_description", "")
            service_name = transaction.get("courier_service_name") or "Courier Guy"
            preference = transaction.get("courier_collection_preference")
            for email, name, role in (
                (transaction.get("seller_email"), transaction.get("seller_name", "Seller"), "seller"),
                (transaction.get("buyer_email"), transaction.get("buyer_name", "Buyer"), "buyer"),
            ):
                if not email:
                    continue
                try:
                    await send(
                        to_email=email,
                        to_name=name,
                        share_code=share_code,
                        item_description=item_description,
                        waybill=waybill,
                        tracking_url=tracking_url,
                        service_name=service_name,
                        role=role,
                        collection_preference=preference,
                    )
                except Exception as exc:
                    logger.error(f"[COURIER_BOOK] {transaction_id} {role} email failed: {exc}")

        return result

    except Exception as exc:
        # Surface the ACTUAL provider response when it's an HTTP error, so the stored
        # courier_booking_error (shown in the admin panel) names the exact field
        # ShipLogic rejected — not the opaque "Client error 400 Bad Request" message.
        error_detail = str(exc)
        try:
            import httpx
            if isinstance(exc, httpx.HTTPStatusError) and exc.response is not None:
                body = " ".join((exc.response.text or "").split())[:400]
                error_detail = f"HTTP {exc.response.status_code} from ShipLogic: {body}"
        except Exception:
            pass
        logger.error(f"[COURIER_BOOK] {transaction_id} booking failed (non-fatal): {error_detail}", exc_info=True)
        try:
            await db.transactions.update_one(
                {"transaction_id": transaction_id},
                {"$set": {"courier_booking_error": error_detail[:500], "courier_booking_in_progress": False}},
            )
        except Exception:
            pass
        return None
