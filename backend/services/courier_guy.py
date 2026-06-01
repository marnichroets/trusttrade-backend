"""
TrustTrade - Courier Guy (ShipLogic) Integration
Handles delivery quotes, bookings, and tracking via the ShipLogic REST API.
"""

import logging
from typing import Any, Dict, List, Optional

import httpx

from core.config import settings

logger = logging.getLogger(__name__)


def _headers() -> Dict[str, str]:
    if not settings.SHIPLOGIC_API_KEY:
        raise RuntimeError("SHIPLOGIC_API_KEY is not configured")
    return {
        "Authorization": f"Bearer {settings.SHIPLOGIC_API_KEY}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


def _response_snippet(resp, limit: int = 500) -> str:
    """Return a compact, log-safe response snippet for upstream diagnostics."""
    text = resp.text or ""
    return " ".join(text.strip().split())[:limit]


def _content_type(resp) -> str:
    return (resp.headers.get("content-type") or "").lower()


def _is_json_content_type(content_type: str) -> bool:
    media_type = content_type.split(";", 1)[0].strip()
    return media_type == "application/json" or media_type.endswith("+json")


def _log_shiplogic_response(label: str, resp, context: Optional[Dict[str, Any]] = None) -> None:
    context = context or {}
    context_text = " ".join(f"{key}={value!r}" for key, value in context.items() if value is not None)
    try:
        request_url = str(resp.request.url)
    except RuntimeError:
        request_url = None
    logger.error(
        "[COURIER] ShipLogic %s response status=%s content_type=%r url=%r %s snippet=%r",
        label,
        resp.status_code,
        resp.headers.get("content-type"),
        request_url,
        context_text,
        _response_snippet(resp),
    )


def _ensure_api_response(resp, label: str) -> None:
    """Fail fast when ShipLogic returns HTML or another non-JSON success response."""
    content_type = _content_type(resp)
    head = (resp.text or "").lstrip()[:128].lower()
    if "text/html" in content_type or head.startswith("<!doctype") or head.startswith("<html"):
        raise RuntimeError(
            f"ShipLogic {label} returned an HTML page (HTTP {resp.status_code}), not JSON. "
            f"SHIPLOGIC_API_URL is misconfigured - it must be the ShipLogic API host "
            f"(e.g. https://api.shiplogic.com), not a website. "
            f"Current SHIPLOGIC_API_URL={settings.SHIPLOGIC_API_URL!r}"
        )
    if resp.is_success and content_type and not _is_json_content_type(content_type):
        raise RuntimeError(
            f"ShipLogic {label} returned non-JSON content (HTTP {resp.status_code}, "
            f"content-type={resp.headers.get('content-type')!r}). "
            f"Expected JSON from SHIPLOGIC_API_URL={settings.SHIPLOGIC_API_URL!r}"
        )


def _shiplogic_json(resp, label: str, context: Optional[Dict[str, Any]] = None) -> Any:
    _ensure_api_response(resp, label)
    try:
        return resp.json()
    except ValueError as exc:
        _log_shiplogic_response(label, resp, context)
        raise RuntimeError(
            f"ShipLogic {label} returned invalid JSON (HTTP {resp.status_code}, "
            f"content-type={resp.headers.get('content-type')!r})"
        ) from exc


def _provider_id() -> Optional[Any]:
    """The ShipLogic provider_id for rate requests, if configured (env). Sent as an
    int when numeric. Returns None when unset so the field is simply omitted."""
    pid = (settings.SHIPLOGIC_PROVIDER_ID or "").strip()
    if not pid:
        return None
    return int(pid) if pid.isdigit() else pid


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
    provider_id = _provider_id()
    if provider_id is not None:
        payload["provider_id"] = provider_id

    quote_context = {
        "base_url": settings.SHIPLOGIC_API_URL,
        "pickup_city": pickup_address.get("city"),
        "pickup_code": pickup_address.get("code"),
        "delivery_city": delivery_address.get("city"),
        "delivery_code": delivery_address.get("code"),
        "weight_kg": parcel.get("submitted_weight_kg", 1.0),
        "length_cm": parcel.get("submitted_length_cm", 10),
        "width_cm": parcel.get("submitted_width_cm", 10),
        "height_cm": parcel.get("submitted_height_cm", 10),
        "provider_id_set": provider_id is not None,
    }
    logger.info(
        "[COURIER] Quote request base_url=%r pickup_city=%r pickup_code=%r "
        "delivery_city=%r delivery_code=%r weight_kg=%r dimensions_cm=%rx%rx%r "
        "provider_id_set=%r",
        quote_context["base_url"],
        quote_context["pickup_city"],
        quote_context["pickup_code"],
        quote_context["delivery_city"],
        quote_context["delivery_code"],
        quote_context["weight_kg"],
        quote_context["length_cm"],
        quote_context["width_cm"],
        quote_context["height_cm"],
        quote_context["provider_id_set"],
    )
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            f"{settings.SHIPLOGIC_API_URL}/rates",
            json=payload,
            headers=_headers(),
        )
        try:
            _ensure_api_response(resp, "quote")
        except RuntimeError:
            _log_shiplogic_response("quote", resp, quote_context)
            raise
        if not resp.is_success:
            _log_shiplogic_response("quote", resp, quote_context)
        resp.raise_for_status()
        data = _shiplogic_json(resp, "quote", quote_context)

    raw = data.get("rates", data if isinstance(data, list) else [])
    # Normalise: expose top-level `rate` (VAT-inclusive) as `price` so callers
    # have a single unambiguous field regardless of ShipLogic response shape.
    rates = [
        {**r, "price": r.get("rate", 0)}
        for r in raw
    ]
    logger.info(f"[COURIER] Quote returned {len(rates)} rate(s)")
    return rates


async def book_shipment(
    quote_id: str,
    pickup: Dict[str, Any],
    delivery: Dict[str, Any],
    parcel: Dict[str, Any],
    contact: Dict[str, Any],
    collection_preference: str = None,
) -> Dict[str, Any]:
    """
    Book a shipment with ShipLogic and return the waybill details.

    pickup / delivery shape:
        { "address": {...}, "contact": {"name": ..., "mobile_number": ...} }

    quote_id is the service level code returned by get_quote (e.g. "ECO", "ONX").

    collection_preference:
        "collection" — Courier Guy collects the parcel from the seller's address.
        "dropoff"    — Seller drops the parcel at a Courier Guy point themselves, so
                       no collection leg is scheduled. Anything else defaults to collection.
    """
    is_dropoff = (collection_preference or "").lower() == "dropoff"

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
        # Tell Courier Guy whether the sender wants a collection or is dropping the parcel
        # off themselves. special_instructions_collection is a standard ShipLogic field.
        "special_instructions_collection": (
            "Customer drop-off at Courier Guy point — no collection required."
            if is_dropoff
            else "Collect parcel from sender's address."
        ),
    }
    logger.info(f"[COURIER] Booking — collection_preference={'dropoff' if is_dropoff else 'collection'}")

    booking_context = {
        "base_url": settings.SHIPLOGIC_API_URL,
        "quote_id": quote_id,
        "collection_preference": "dropoff" if is_dropoff else "collection",
        "pickup_city": pickup.get("address", {}).get("city"),
        "pickup_code": pickup.get("address", {}).get("code"),
        "delivery_city": delivery.get("address", {}).get("city"),
        "delivery_code": delivery.get("address", {}).get("code"),
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            f"{settings.SHIPLOGIC_API_URL}/shipments",
            json=payload,
            headers=_headers(),
        )
        try:
            _ensure_api_response(resp, "book")
        except RuntimeError:
            _log_shiplogic_response("book", resp, booking_context)
            raise
        if not resp.is_success:
            _log_shiplogic_response("book", resp, booking_context)
        resp.raise_for_status()
        data = _shiplogic_json(resp, "book", booking_context)

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
    Raises LookupError if the waybill is not found (404).
    """
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(
            f"{settings.SHIPLOGIC_API_URL}/shipments/{waybill}/tracking-events",
            headers=_headers(),
        )
        tracking_context = {
            "base_url": settings.SHIPLOGIC_API_URL,
            "waybill": waybill,
        }
        try:
            _ensure_api_response(resp, "track")
        except RuntimeError:
            _log_shiplogic_response("track", resp, tracking_context)
            raise
        if resp.status_code == 404:
            raise LookupError(f"Waybill '{waybill}' not found")
        if not resp.is_success:
            _log_shiplogic_response("track", resp, tracking_context)
        resp.raise_for_status()
        data = _shiplogic_json(resp, "track", tracking_context)

    events = data.get("tracking_events", data.get("events", []))
    latest = events[0] if events else {}
    logger.info(f"[COURIER] Track {waybill} — events={len(events)}")
    return {
        "waybill": waybill,
        "status": latest.get("status") or latest.get("description", "Unknown"),
        "timestamp": latest.get("created_at") or latest.get("timestamp"),
        "events": events,
    }
