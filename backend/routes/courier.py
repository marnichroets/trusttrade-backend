"""
TrustTrade Courier Routes
Delivery quotes, bookings, and tracking via Courier Guy (ShipLogic).
"""

import logging
from typing import Optional

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


# ── Helpers ───────────────────────────────────────────────────────────────────

def _require_courier(user):
    if not settings.COURIER_ENABLED:
        raise HTTPException(status_code=503, detail="Courier service is not enabled")
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/quote")
async def quote(request: Request, body: QuoteRequest):
    """Get delivery price options for a parcel."""
    db = get_database()
    user = await get_user_from_token(request, db)
    _require_courier(user)

    try:
        rates = await get_quote(
            pickup_address=body.pickup_address.model_dump(),
            delivery_address=body.delivery_address.model_dump(),
            parcel=body.parcel.model_dump(),
        )
        return {"rates": rates}
    except Exception as exc:
        logger.error(f"[COURIER] Quote error: {exc}")
        raise HTTPException(status_code=502, detail=f"Courier service error: {exc}")


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
                "address": body.pickup_address.model_dump(),
                "contact": body.pickup_contact.model_dump(),
            },
            delivery={
                "address": body.delivery_address.model_dump(),
                "contact": body.delivery_contact.model_dump(),
            },
            parcel=body.parcel.model_dump(),
            contact={"reference": body.reference or ""},
        )
        return result
    except Exception as exc:
        logger.error(f"[COURIER] Book error: {exc}")
        raise HTTPException(status_code=502, detail=f"Courier service error: {exc}")


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
        logger.error(f"[COURIER] Track error: {exc}")
        raise HTTPException(status_code=502, detail=f"Courier service error: {exc}")
