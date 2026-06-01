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

def _map_exc(label: str, exc: Exception) -> HTTPException:
    """Convert service exceptions to appropriate HTTP errors with friendly messages."""
    if isinstance(exc, RuntimeError):
        logger.error(f"[COURIER] {label}: {exc}")
        return HTTPException(status_code=503, detail="Courier service is not configured")
    if isinstance(exc, LookupError):
        logger.warning(f"[COURIER] {label}: {exc}")
        return HTTPException(status_code=404, detail=str(exc))
    if isinstance(exc, httpx.HTTPStatusError):
        logger.error(f"[COURIER] {label} HTTP {exc.response.status_code}: {exc.response.text[:200]}")
        if exc.response.status_code in (401, 403):
            return HTTPException(status_code=502, detail="Courier service authentication failed")
        if exc.response.status_code == 422:
            return HTTPException(status_code=422, detail="Invalid address or parcel details")
        return HTTPException(status_code=502, detail="Courier service unavailable")
    if isinstance(exc, (httpx.ConnectError, httpx.TimeoutException)):
        logger.error(f"[COURIER] {label} connection error: {exc}")
        return HTTPException(status_code=502, detail="Courier service unavailable")
    logger.error(f"[COURIER] {label}: {exc}")
    return HTTPException(status_code=502, detail="Courier service unavailable")


@router.post("/quote")
async def quote(request: Request, body: QuoteRequest):
    """Get delivery price options for a parcel."""
    db = get_database()
    user = await get_user_from_token(request, db)
    _require_courier(user)

    try:
        rates = await get_quote(
            pickup_address=body.pickup_address.model_dump(exclude_none=True),
            delivery_address=body.delivery_address.model_dump(exclude_none=True),
            parcel=body.parcel.model_dump(exclude_none=True),
        )
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
