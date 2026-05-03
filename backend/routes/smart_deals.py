"""
routes/smart_deals.py
Smart Deals — Digital Work (escrow without file vault)
"""

import os
import uuid
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from motor.motor_asyncio import AsyncIOMotorDatabase

from core.database import get_database
from core.security import get_user_from_token

logger = logging.getLogger(__name__)
router = APIRouter()

REVIEW_WINDOW_HOURS = 48

class CreateDealRequest(BaseModel):
    title: str = Field(..., min_length=3, max_length=200)
    description: str = Field(..., min_length=10, max_length=2000)
    amount: float = Field(..., gt=0)
    currency: str = Field(default="ZAR")
    freelancer_email: str
    days_to_deliver: int = Field(..., gt=0, le=365)
    fee_paid_by: str = Field(default="CLIENT")

class DisputeRequest(BaseModel):
    reason: str = Field(..., min_length=10, max_length=1000)

def generate_deal_id() -> str:
    return "SD-" + uuid.uuid4().hex[:8].upper()

def utcnow() -> datetime:
    return datetime.now(timezone.utc)

async def get_deal_or_404(deal_id: str, db: AsyncIOMotorDatabase):
    deal = await db.transactions.find_one({"deal_id": deal_id})
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    return deal

def assert_participant(deal: dict, user_id: str, role: Optional[str] = None):
    is_client = str(deal.get("client_id")) == user_id
    is_freelancer = str(deal.get("freelancer_id")) == user_id
    if role == "client" and not is_client:
        raise HTTPException(status_code=403, detail="Only the client can do this")
    if role == "freelancer" and not is_freelancer:
        raise HTTPException(status_code=403, detail="Only the freelancer can do this")
    if not (is_client or is_freelancer):
        raise HTTPException(status_code=403, detail="Not a participant in this deal")

@router.post("/", status_code=201)
async def create_deal(
    body: CreateDealRequest,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: dict = Depends(get_current_user),
):
    freelancer = await db.users.find_one({"email": body.freelancer_email})
    if not freelancer:
        raise HTTPException(status_code=404, detail="No TrustTrade account found for that email. Ask your freelancer to sign up first.")
    if str(freelancer["_id"]) == str(current_user["_id"]):
        raise HTTPException(status_code=400, detail="You cannot create a deal with yourself")

    deal_id = generate_deal_id()
    now = utcnow()

    doc = {
        "deal_id": deal_id,
        "deal_type": "DIGITAL_WORK",
        "transaction_id": deal_id,
        "client_id": str(current_user["_id"]),
        "client_email": current_user["email"],
        "freelancer_id": str(freelancer["_id"]),
        "freelancer_email": freelancer["email"],
        "tradesafe_token_id": None,
        "title": body.title,
        "description": body.description,
        "amount": body.amount,
        "currency": body.currency,
        "fee_paid_by": body.fee_paid_by,
        "days_to_deliver": body.days_to_deliver,
        "status": "PENDING",
        "vault": None,
        "review_window": {
            "hours": REVIEW_WINDOW_HOURS, "opened_at": None,
            "expires_at": None, "auto_approved": False,
        },
        "dispute": None,
        "created_at": now,
        "updated_at": now,
    }

    await db.transactions.insert_one(doc)
    logger.info(f"[SMART_DEAL] Created {deal_id} by {current_user['email']} for {freelancer['email']}")
    return {"deal_id": deal_id, "status": "PENDING"}

@router.post("/{deal_id}/fund")
async def fund_deal(
    deal_id: str,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: dict = Depends(get_current_user),
):
    deal = await get_deal_or_404(deal_id, db)
    assert_participant(deal, str(current_user["_id"]), role="client")
    if deal["status"] != "PENDING":
        raise HTTPException(status_code=400, detail=f"Cannot fund a deal in status: {deal['status']}")

    from tradesafe_service import create_tradesafe_transaction

    client_user = await db.users.find_one({"email": deal["client_email"]})
    freelancer_user = await db.users.find_one({"email": deal["freelancer_email"]})
    client_name = (client_user or {}).get("name") or deal["client_email"]
    freelancer_name = (freelancer_user or {}).get("name") or deal["freelancer_email"]
    client_mobile = (client_user or {}).get("phone") or (client_user or {}).get("mobile")
    freelancer_mobile = (freelancer_user or {}).get("phone") or (freelancer_user or {}).get("mobile")
    fee_allocation = "SELLER_AGENT" if deal["fee_paid_by"] == "FREELANCER" else "BUYER_AGENT"

    result = await create_tradesafe_transaction(
        internal_reference=deal_id,
        title=f"TrustTrade Smart Deal - {deal['title'][:50]}",
        description=deal.get("description", "Digital work"),
        amount=deal["amount"],
        buyer_name=client_name,
        buyer_email=deal["client_email"],
        seller_name=freelancer_name,
        seller_email=deal["freelancer_email"],
        buyer_mobile=client_mobile,
        seller_mobile=freelancer_mobile,
        fee_allocation=fee_allocation,
    )
    if not result or "error" in result:
        raise HTTPException(
            status_code=500,
            detail=(result.get("error", "Failed to create escrow") if result else "Failed to create escrow"),
        )

    tradesafe_id = result.get("id")
    allocation_id = result.get("allocations", [{}])[0].get("id") if result.get("allocations") else None
    seller_token_id = result.get("seller_token_id")

    await db.transactions.update_one(
        {"deal_id": deal_id},
        {"$set": {
            "status": "FUNDED",
            "tradesafe_token_id": tradesafe_id,
            "tradesafe_allocation_id": allocation_id,
            "tradesafe_seller_token_id": seller_token_id,
            "funded_at": utcnow(),
            "updated_at": utcnow(),
        }}
    )
    logger.info(f"[SMART_DEAL] {deal_id} funded by {current_user['email']}")
    return {"deal_id": deal_id, "status": "FUNDED"}

@router.post("/{deal_id}/approve")
async def approve_deal(
    deal_id: str,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: dict = Depends(get_current_user),
):
    deal = await get_deal_or_404(deal_id, db)
    assert_participant(deal, str(current_user["_id"]), role="client")
    if deal["status"] != "DELIVERED":
        raise HTTPException(status_code=400, detail=f"Nothing to approve — deal is in status: {deal['status']}")

    now = utcnow()

    await db.transactions.update_one(
        {"deal_id": deal_id},
        {"$set": {
            "status": "APPROVED",
            "approved_at": now,
            "updated_at": now,
        }}
    )

    try:
        from tradesafe_service import accept_delivery
        allocation_id = deal.get("tradesafe_allocation_id")
        if not allocation_id:
            raise ValueError("Deal not linked to TradeSafe escrow — tradesafe_allocation_id missing")
        payout_result = await accept_delivery(allocation_id)
        if not payout_result:
            raise ValueError("TradeSafe accept_delivery returned no result")
        logger.info(f"[SMART_DEAL] Payout released via TradeSafe for {deal_id}, allocation {allocation_id}")
        await db.transactions.update_one(
            {"deal_id": deal_id},
            {"$set": {"status": "COMPLETE", "completed_at": now, "updated_at": now}}
        )
    except Exception as e:
        logger.error(f"[SMART_DEAL] Payout failed for {deal_id}: {e}")
        await db.transactions.update_one(
            {"deal_id": deal_id},
            {"$set": {"payout_failed": True, "payout_error": str(e), "updated_at": now}}
        )

    logger.info(f"[SMART_DEAL] {deal_id} approved by {current_user['email']}")
    return {"deal_id": deal_id, "status": "COMPLETE"}

@router.post("/{deal_id}/dispute")
async def dispute_deal(
    deal_id: str,
    body: DisputeRequest,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: dict = Depends(get_current_user),
):
    deal = await get_deal_or_404(deal_id, db)
    assert_participant(deal, str(current_user["_id"]), role="client")
    if deal["status"] not in ("DELIVERED",):
        raise HTTPException(status_code=400, detail="You can only dispute after the freelancer has delivered")

    now = utcnow()
    await db.transactions.update_one(
        {"deal_id": deal_id},
        {"$set": {
            "status": "DISPUTED",
            "dispute": {
                "raised_by": str(current_user["_id"]),
                "raised_by_email": current_user["email"],
                "reason": body.reason,
                "raised_at": now,
                "resolved_at": None, "resolution": None,
            },
            "updated_at": now,
        }}
    )
    logger.info(f"[SMART_DEAL] {deal_id} disputed by {current_user['email']}")
    return {"deal_id": deal_id, "status": "DISPUTED"}

@router.get("/")
async def list_deals(
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: dict = Depends(get_current_user),
):
    user_id = str(current_user["_id"])
    cursor = db.transactions.find(
        {"deal_type": "DIGITAL_WORK", "$or": [{"client_id": user_id}, {"freelancer_id": user_id}]},
        {"deal_id": 1, "title": 1, "amount": 1, "currency": 1, "status": 1,
         "client_email": 1, "freelancer_email": 1, "created_at": 1}
    ).sort("created_at", -1).limit(50)
    deals = []
    async for deal in cursor:
        deal["_id"] = str(deal["_id"])
        deals.append(deal)
    return {"deals": deals, "count": len(deals)}

@router.get("/{deal_id}")
async def get_deal(
    deal_id: str,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: dict = Depends(get_current_user),
):
    deal = await get_deal_or_404(deal_id, db)
    assert_participant(deal, str(current_user["_id"]))
    deal["_id"] = str(deal["_id"])
    return deal

async def auto_approve_expired_deals(db: AsyncIOMotorDatabase):
    now = utcnow()
    cursor = db.transactions.find({
        "deal_type": "DIGITAL_WORK",
        "status": "DELIVERED",
        "review_window.expires_at": {"$lt": now},
    })
    count = 0
    async for deal in cursor:
        deal_id = deal["deal_id"]
        try:
            await db.transactions.update_one(
                {"deal_id": deal_id},
                {"$set": {
                    "status": "COMPLETE", "review_window.auto_approved": True,
                    "approved_at": now, "updated_at": now,
                }}
            )
            logger.info(f"[SMART_DEAL] Auto-approved {deal_id}")
            count += 1
        except Exception as e:
            logger.error(f"[SMART_DEAL] Auto-approve failed for {deal_id}: {e}")
    return count