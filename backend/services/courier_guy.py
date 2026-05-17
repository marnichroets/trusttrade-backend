"""
TrustTrade - Courier Guy (ShipLogic) Integration
Handles delivery quotes, bookings, and tracking via the ShipLogic REST API.
"""

import logging
from typing import Any, Dict, List

import httpx

from core.config import settings

logger = logging.getLogger(__name__)


def _headers() -> Dict[str, str]:
    return {
        "Authorization": f"Bearer {settings.SHIPLOGIC_API_KEY}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


async def get_quote(
    pickup_address: Dict[str, Any],
    delivery_address: Dict[str, Any],
    parcel: Dict[str, Any],
) -> List[Dict[str, Any]]:
    """
    Fetch delivery rate options from ShipLogic.

    pickup_address / delivery_address keys:
        street_address, local_area, city, code, zone, country, type

    parcel keys:
        submitted_length_cm, submitted_width_cm, submitted_height_cm,
        submitted_weight_kg, declared_value (optional)
    """
    payload = {
        "collection_address": pickup_address,
        "delivery_address": delivery_address,
        "parcels": [
            {
                "submitted_length_cm": parcel.get("submitted_length_cm", 10),
                "submitted_width_cm": parcel.get("submitted_width_cm", 10),
                "submitted_height_cm": parcel.get("submitted_height_cm", 10),
                "submitted_weight_kg": parcel.get("submitted_weight_kg", 1.0),
            }
        ],
        "declared_value": parcel.get("declared_value") or 0,
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            f"{settings.SHIPLOGIC_API_URL}/shipments/rates",
            json=payload,
            headers=_headers(),
        )
        resp.raise_for_status()
        data = resp.json()

    rates = data.get("rates", data if isinstance(data, list) else [])
    logger.info(f"[COURIER] Quote returned {len(rates)} rate(s)")
    return rates


async def book_shipment(
    quote_id: str,
    pickup: Dict[str, Any],
    delivery: Dict[str, Any],
    parcel: Dict[str, Any],
    contact: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Book a shipment with ShipLogic and return the waybill details.

    pickup / delivery shape:
        { "address": {...}, "contact": {"name": ..., "mobile_number": ...} }

    quote_id is the service level code returned by get_quote (e.g. "ECO", "ONX").
    """
    parcel_payload = {
        "submitted_length_cm": parcel.get("submitted_length_cm", 10),
        "submitted_width_cm": parcel.get("submitted_width_cm", 10),
        "submitted_height_cm": parcel.get("submitted_height_cm", 10),
        "submitted_weight_kg": parcel.get("submitted_weight_kg", 1.0),
        "packaging": parcel.get("packaging", "BOX"),
        "reference1": contact.get("reference", ""),
    }

    payload = {
        "collection_address": pickup["address"],
        "delivery_address": delivery["address"],
        "collection_contact": pickup.get("contact", {}),
        "delivery_contact": delivery.get("contact", {}),
        "parcels": [parcel_payload],
        "opt_in_rates": [{"service_level": {"code": quote_id}}] if quote_id else [],
        "opt_in_time_based_rates": [],
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            f"{settings.SHIPLOGIC_API_URL}/shipments",
            json=payload,
            headers=_headers(),
        )
        resp.raise_for_status()
        data = resp.json()

    waybill = (
        data.get("short_tracking_reference")
        or data.get("tracking_reference")
        or str(data.get("id", ""))
    )
    logger.info(f"[COURIER] Shipment booked — waybill={waybill}")
    return {
        "waybill": waybill,
        "shipment_id": data.get("id"),
        "tracking_reference": data.get("tracking_reference"),
        "collection_date": data.get("collection_date"),
        "status": data.get("state", "created"),
    }


async def track_shipment(waybill: str) -> Dict[str, Any]:
    """
    Return the current tracking status and event history for a shipment.
    """
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(
            f"{settings.SHIPLOGIC_API_URL}/shipments/{waybill}/tracking-events",
            headers=_headers(),
        )
        resp.raise_for_status()
        data = resp.json()

    events = data.get("tracking_events", data.get("events", []))
    latest = events[0] if events else {}
    logger.info(f"[COURIER] Track {waybill} — events={len(events)}")
    return {
        "waybill": waybill,
        "status": latest.get("status") or latest.get("description", "Unknown"),
        "timestamp": latest.get("created_at") or latest.get("timestamp"),
        "events": events,
    }
