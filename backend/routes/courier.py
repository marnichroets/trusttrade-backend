"""
TrustTrade Courier Routes
Delivery quotes, bookings, and tracking via Courier Guy (ShipLogic).
"""

import logging
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from core.config import settings
from core.database import get_database
from core.security import get_user_from_token
from services.courier_guy import book_shipment, get_quote, track_shipment

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/courier", tags=["Courier"])


# ── Pydantic models ───────────────────────────────────────────────────────────

class Address(BaseModel):
    street_address: str
    local_area: str
    city: str
    code: str
    zone: Optional[str] = None
    country: str = "ZA"
    type: str = "residential"


class Parcel(BaseModel):
    submitted_length_cm: float = 10.0
    submitted_width_cm: float = 10.0
    submitted_height_cm: float = 10.0
    submitted_weight_kg: float = 1.0
    declared_value: Optional[float] = None
    packaging: str = "BOX"


class Contact(BaseModel):
    name: str
    mobile_number: str
    email: Optional[str] = None


class QuoteRequest(BaseModel):
    pickup_address: Address
    delivery_address: Address
    parcel: Parcel


class BookRequest(BaseModel):
    quote_id: str
    pickup_address: Address
    delivery_address: Address
    pickup_contact: Contact
    delivery_contact: Contact
    parcel: Parcel
    reference: Optional[str] = None
    collection_preference: Optional[str] = None  # "collection" (Courier Guy collects) or "dropoff" (seller drops off)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _require_courier(user):
    if not settings.COURIER_ENABLED:
        raise HTTPException(status_code=503, detail="Courier service is not enabled")
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")


# ── Routes ────────────────────────────────────────────────────────────────────

def _mask_key(key: Optional[str]) -> str:
    """Mask an API key for logs: show length + first/last 4 only, never the secret."""
    if not key:
        return "<MISSING>"
    k = str(key).strip()
    if len(k) <= 8:
        return f"len={len(k)} <too-short-to-mask>"
    return f"len={len(k)} prefix={k[:4]!r} suffix={k[-4:]!r}"


def _log_courier_config(label: str) -> None:
    """Log the ShipLogic config actually loaded at request time (key masked), so we
    can confirm from the logs whether the live API key/URL are being read correctly
    (e.g. after a Railway env update) without ever printing the secret."""
    logger.info(
        "[COURIER] %s config: COURIER_ENABLED=%r SHIPLOGIC_API_URL=%r api_key=%s "
        "provider_id=%r",
        label,
        settings.COURIER_ENABLED,
        settings.SHIPLOGIC_API_URL,
        _mask_key(settings.SHIPLOGIC_API_KEY),
        (settings.SHIPLOGIC_PROVIDER_ID or None),
    )


def _map_exc(label: str, exc: Exception) -> HTTPException:
    """Convert service exceptions to appropriate HTTP errors with friendly messages.
    Logs the full upstream detail (including ShipLogic's response body) so the exact
    auth/rates failure is visible in the logs."""
    if isinstance(exc, RuntimeError):
        # Raised for missing/invalid config or non-JSON responses — message carries the detail.
        logger.error(f"[COURIER] {label} config/runtime error: {exc}")
        _log_courier_config(label)
        return HTTPException(status_code=503, detail="Courier service is not configured")
    if isinstance(exc, LookupError):
        logger.warning(f"[COURIER] {label}: {exc}")
        return HTTPException(status_code=404, detail=str(exc))
    if isinstance(exc, httpx.HTTPStatusError):
        status = exc.response.status_code
        # Log the FULL ShipLogic error body (not truncated to 200) so an auth error
        # ("invalid api key") vs a rates error ("cannot get rates") is unmistakable.
        logger.error(
            "[COURIER] %s ShipLogic HTTP %s url=%r body=%r",
            label, status, str(exc.request.url) if exc.request else None,
            (exc.response.text or "")[:2000],
        )
        if status in (401, 403):
            _log_courier_config(label)
            logger.error(f"[COURIER] {label}: ShipLogic AUTH FAILED (HTTP {status}) — check SHIPLOGIC_API_KEY")
            return HTTPException(status_code=502, detail="Courier service authentication failed")
        if status == 422:
            return HTTPException(status_code=422, detail="Invalid address or parcel details")
        if status == 500:
            logger.error(f"[COURIER] {label}: ShipLogic returned 500 — likely a rates/route error for this address pair")
        return HTTPException(status_code=502, detail="Courier service unavailable")
    if isinstance(exc, (httpx.ConnectError, httpx.TimeoutException)):
        logger.error(f"[COURIER] {label} connection error: {exc}")
        return HTTPException(status_code=502, detail="Courier service unavailable")
    logger.exception(f"[COURIER] {label} unexpected error: {exc}")
    return HTTPException(status_code=502, detail="Courier service unavailable")


@router.post("/quote")
async def quote(request: Request, body: QuoteRequest):
    """Get delivery price options for a parcel."""
    db = get_database()
    user = await get_user_from_token(request, db)
    _require_courier(user)

    # Always record the config used + route being quoted, so a failing quote shows
    # exactly which key/URL was loaded and the pickup→delivery pair in question.
    _log_courier_config("Quote")
    logger.info(
        "[COURIER] Quote request user=%s pickup=%r/%r delivery=%r/%r",
        getattr(user, "email", "?"),
        body.pickup_address.city, body.pickup_address.code,
        body.delivery_address.city, body.delivery_address.code,
    )

    try:
        rates = await get_quote(
            pickup_address=body.pickup_address.model_dump(exclude_none=True),
            delivery_address=body.delivery_address.model_dump(exclude_none=True),
            parcel=body.parcel.model_dump(exclude_none=True),
        )
        logger.info(f"[COURIER] Quote success — {len(rates)} rate(s) returned")
        return {"rates": rates}
    except Exception as exc:
        raise _map_exc("Quote", exc)


@router.post("/book")
async def book(request: Request, body: BookRequest):
    """Book a shipment and receive a waybill number."""
    db = get_database()
    user = await get_user_from_token(request, db)
    _require_courier(user)

    try:
        result = await book_shipment(
            quote_id=body.quote_id,
            pickup={
                "address": body.pickup_address.model_dump(exclude_none=True),
                "contact": body.pickup_contact.model_dump(exclude_none=True),
            },
            delivery={
                "address": body.delivery_address.model_dump(exclude_none=True),
                "contact": body.delivery_contact.model_dump(exclude_none=True),
            },
            parcel=body.parcel.model_dump(exclude_none=True),
            contact={"reference": body.reference or ""},
            collection_preference=body.collection_preference,
        )
        return result
    except Exception as exc:
        raise _map_exc("Book", exc)


@router.get("/track/{waybill}")
async def track(request: Request, waybill: str):
    """Return current tracking status and event history for a waybill."""
    db = get_database()
    user = await get_user_from_token(request, db)
    _require_courier(user)

    try:
        result = await track_shipment(waybill)
        return result
    except Exception as exc:
        raise _map_exc("Track", exc)
