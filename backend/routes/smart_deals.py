"""
routes/smart_deals.py
Smart Deals — Digital Work (escrow without file vault)
"""

import uuid
import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from motor.motor_asyncio import AsyncIOMotorDatabase

from core.database import get_database
from core.security import get_user_from_token

logger = logging.getLogger(__name__)
router = APIRouter()

REVIEW_WINDOW_HOURS = 48
ADMIN_DISPUTE_EMAIL = "marnichr@gmail.com"


class CreateDealRequest(BaseModel):
    title: str = Field(..., min_length=3, max_length=200)
    description: str = Field(..., min_length=1, max_length=2000)
    amount: float = Field(..., gt=0)
    currency: str = Field(default="ZAR")
    freelancer_email: str
    days_to_deliver: int = Field(..., gt=0, le=365)
    fee_paid_by: str = Field(default="CLIENT")


class FundRequest(BaseModel):
    payment_method: str = Field(default="eft")  # eft | card | ozow


class DisputeRequest(BaseModel):
    reason: str = Field(..., min_length=10, max_length=1000)


class MessageRequest(BaseModel):
    content: str = Field(..., min_length=1, max_length=2000)


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


async def _fire_email(coro):
    """Fire-and-forget: log but never surface email errors to the caller."""
    try:
        await coro
    except Exception as exc:
        logger.error(f"[SMART_DEAL_EMAIL] {exc}")


# ─────────────────────────────────────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/", status_code=201)
async def create_deal(body: CreateDealRequest, request: Request):
    db = get_database()
    current_user = await get_user_from_token(request, db)
    if not current_user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    freelancer = await db.users.find_one({"email": body.freelancer_email.strip().lower()})
    if not freelancer:
        raise HTTPException(
            status_code=404,
            detail="No TrustTrade account found for that email. Ask your freelancer to sign up first.",
        )
    if str(freelancer["user_id"]) == str(current_user.user_id):
        raise HTTPException(status_code=400, detail="You cannot create a deal with yourself")

    deal_id = generate_deal_id()
    now = utcnow()
    client_name = current_user.name or current_user.email
    freelancer_name = freelancer.get("name") or freelancer["email"]

    doc = {
        "deal_id": deal_id,
        "deal_type": "DIGITAL_WORK",
        "transaction_id": deal_id,
        "client_id": current_user.user_id,
        "client_email": current_user.email,
        "client_name": client_name,
        "freelancer_id": str(freelancer["user_id"]),
        "freelancer_email": freelancer["email"],
        "freelancer_name": freelancer_name,
        "tradesafe_token_id": None,
        "title": body.title,
        "description": body.description,
        "amount": body.amount,
        "currency": body.currency,
        "fee_paid_by": body.fee_paid_by,
        "days_to_deliver": body.days_to_deliver,
        "status": "PENDING",
        "vault": None,
        "messages": [],
        "review_window": {
            "hours": REVIEW_WINDOW_HOURS, "opened_at": None,
            "expires_at": None, "auto_approved": False,
        },
        "dispute": None,
        "created_at": now,
        "updated_at": now,
    }

    await db.transactions.insert_one(doc)
    logger.info(f"[SMART_DEAL] Created {deal_id} by {current_user.email} for {freelancer['email']}")

    from email_service import send_smart_deal_created
    asyncio.create_task(send_smart_deal_created(
        freelancer_email=body.freelancer_email,
        freelancer_name=freelancer.get('first_name') or body.freelancer_email.split('@')[0],
        client_name=current_user.name or current_user.email.split('@')[0],
        deal_id=deal_id,
        title=body.title,
        amount=body.amount,
        scope=body.description,
        days=body.days_to_deliver,
    ))

    return {"deal_id": deal_id, "status": "PENDING"}


@router.post("/{deal_id}/accept")
async def accept_deal(deal_id: str, request: Request):
    """Freelancer accepts the deal — PENDING → ACCEPTED."""
    db = get_database()
    current_user = await get_user_from_token(request, db)
    if not current_user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    deal = await get_deal_or_404(deal_id, db)
    assert_participant(deal, str(current_user.user_id), role="freelancer")
    if deal["status"] != "PENDING":
        raise HTTPException(status_code=400, detail=f"Cannot accept a deal in status: {deal['status']}")

    now = utcnow()
    await db.transactions.update_one(
        {"deal_id": deal_id},
        {"$set": {"status": "ACCEPTED", "accepted_at": now, "updated_at": now}},
    )
    logger.info(f"[SMART_DEAL] {deal_id} accepted by {current_user.email}")

    import email_service
    asyncio.create_task(_fire_email(
        email_service.send_smart_deal_accepted(
            deal,
            deal.get("client_name") or deal["client_email"],
            deal.get("freelancer_name") or deal["freelancer_email"],
        )
    ))

    return {"deal_id": deal_id, "status": "ACCEPTED"}


@router.post("/{deal_id}/fund")
async def fund_deal(deal_id: str, body: FundRequest, request: Request):
    """Client funds escrow — creates TradeSafe transaction, returns payment link. ACCEPTED → FUNDED."""
    db = get_database()
    current_user = await get_user_from_token(request, db)
    if not current_user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    deal = await get_deal_or_404(deal_id, db)
    assert_participant(deal, str(current_user.user_id), role="client")
    if deal["status"] != "ACCEPTED":
        raise HTTPException(
            status_code=400,
            detail=f"Cannot fund a deal in status: {deal['status']}. Freelancer must accept first.",
        )

    from tradesafe_service import create_tradesafe_transaction, get_payment_link

    client_user = await db.users.find_one({"email": deal["client_email"]})
    freelancer_user = await db.users.find_one({"email": deal["freelancer_email"]})
    client_name = (client_user or {}).get("name") or deal.get("client_name") or deal["client_email"]
    freelancer_name = (freelancer_user or {}).get("name") or deal.get("freelancer_name") or deal["freelancer_email"]
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
    allocation_id = (result.get("allocations") or [{}])[0].get("id")
    seller_token_id = result.get("seller_token_id")

    # Obtain payment link from TradeSafe
    payment_link = None
    payment_method_used = body.payment_method.upper()
    if tradesafe_id:
        try:
            pay_result = await get_payment_link(tradesafe_id)
            if pay_result:
                payment_link = pay_result.get("payment_link")
                payment_method_used = pay_result.get("method", payment_method_used)
        except Exception as exc:
            logger.error(f"[SMART_DEAL] get_payment_link failed for {deal_id}: {exc}")

    now = utcnow()
    await db.transactions.update_one(
        {"deal_id": deal_id},
        {"$set": {
            "status": "PAYMENT_PENDING",
            "tradesafe_token_id": tradesafe_id,
            "tradesafe_allocation_id": allocation_id,
            "tradesafe_seller_token_id": seller_token_id,
            "payment_method": body.payment_method,
            "payment_link": payment_link,
            "payment_initiated_at": now,
            "updated_at": now,
        }},
    )
    logger.info(
        f"[SMART_DEAL] {deal_id} payment initiated by {current_user.email},"
        f" tradesafe_id={tradesafe_id}, payment_link={bool(payment_link)}"
    )

    # Deal stays PAYMENT_PENDING until TradeSafe webhook confirms FUNDS_RECEIVED
    return {
        "deal_id": deal_id,
        "status": "PAYMENT_PENDING",
        "payment_link": payment_link,
        "payment_method": payment_method_used,
        "tradesafe_id": tradesafe_id,
    }


@router.post("/{deal_id}/cancel-payment")
async def cancel_payment(deal_id: str, request: Request):
    """Reset a PAYMENT_PENDING deal to ACCEPTED so the client can choose a different payment method."""
    db = get_database()
    current_user = await get_user_from_token(request, db)
    if not current_user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    deal = await get_deal_or_404(deal_id, db)
    assert_participant(deal, str(current_user.user_id), role="client")
    if deal["status"] != "PAYMENT_PENDING":
        raise HTTPException(
            status_code=400,
            detail=f"Cannot cancel payment — deal is in status: {deal['status']}",
        )

    now = utcnow()
    await db.transactions.update_one(
        {"deal_id": deal_id},
        {"$set": {
            "status": "ACCEPTED",
            "tradesafe_token_id": None,
            "tradesafe_allocation_id": None,
            "tradesafe_seller_token_id": None,
            "payment_link": None,
            "payment_method": None,
            "payment_initiated_at": None,
            "updated_at": now,
        }},
    )
    logger.info(f"[SMART_DEAL] {deal_id} payment cancelled by {current_user.email}, reset to ACCEPTED")

    return {"deal_id": deal_id, "status": "ACCEPTED"}


@router.post("/{deal_id}/deliver")
async def deliver_deal(deal_id: str, request: Request):
    """Freelancer marks work as delivered — FUNDED → DELIVERED."""
    db = get_database()
    current_user = await get_user_from_token(request, db)
    if not current_user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    deal = await get_deal_or_404(deal_id, db)
    assert_participant(deal, str(current_user.user_id), role="freelancer")
    if deal["status"] != "FUNDED":
        raise HTTPException(
            status_code=400,
            detail=f"Cannot mark as delivered — deal is in status: {deal['status']}",
        )

    now = utcnow()
    from datetime import timedelta
    expires_at = now + timedelta(hours=REVIEW_WINDOW_HOURS)

    await db.transactions.update_one(
        {"deal_id": deal_id},
        {"$set": {
            "status": "DELIVERED",
            "delivered_at": now,
            "updated_at": now,
            "review_window.opened_at": now,
            "review_window.expires_at": expires_at,
        }},
    )
    logger.info(f"[SMART_DEAL] {deal_id} delivered by {current_user.email}")

    import email_service
    asyncio.create_task(_fire_email(
        email_service.send_smart_deal_delivered(
            deal,
            deal.get("client_name") or deal["client_email"],
            deal.get("freelancer_name") or deal["freelancer_email"],
        )
    ))

    return {"deal_id": deal_id, "status": "DELIVERED"}


@router.post("/{deal_id}/approve")
async def approve_deal(deal_id: str, request: Request):
    """Client manually approves delivery — DELIVERED → COMPLETE. Triggers TradeSafe payout."""
    db = get_database()
    current_user = await get_user_from_token(request, db)
    if not current_user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    deal = await get_deal_or_404(deal_id, db)
    assert_participant(deal, str(current_user.user_id), role="client")
    if deal["status"] != "DELIVERED":
        raise HTTPException(
            status_code=400,
            detail=f"Nothing to approve — deal is in status: {deal['status']}",
        )

    now = utcnow()
    await db.transactions.update_one(
        {"deal_id": deal_id},
        {"$set": {"status": "APPROVED", "approved_at": now, "updated_at": now}},
    )

    try:
        from tradesafe_service import accept_delivery
        allocation_id = deal.get("tradesafe_allocation_id")
        if not allocation_id:
            raise ValueError("tradesafe_allocation_id missing — deal not linked to escrow")
        payout_result = await accept_delivery(allocation_id)
        if not payout_result:
            raise ValueError("TradeSafe accept_delivery returned no result")
        logger.info(f"[SMART_DEAL] Payout released for {deal_id}, allocation={allocation_id}")
        await db.transactions.update_one(
            {"deal_id": deal_id},
            {"$set": {"status": "COMPLETE", "completed_at": now, "updated_at": now}},
        )
    except Exception as exc:
        logger.error(f"[SMART_DEAL] Payout failed for {deal_id}: {exc}")
        await db.transactions.update_one(
            {"deal_id": deal_id},
            {"$set": {"payout_failed": True, "payout_error": str(exc), "updated_at": now}},
        )

    logger.info(f"[SMART_DEAL] {deal_id} approved by {current_user.email}")

    import email_service
    asyncio.create_task(_fire_email(
        email_service.send_smart_deal_approved(
            deal,
            deal.get("client_name") or deal["client_email"],
            deal.get("freelancer_name") or deal["freelancer_email"],
        )
    ))

    return {"deal_id": deal_id, "status": "COMPLETE"}


@router.post("/{deal_id}/dispute")
async def dispute_deal(deal_id: str, body: DisputeRequest, request: Request):
    """Client raises a dispute — DELIVERED → DISPUTED. Emails both parties + admin."""
    db = get_database()
    current_user = await get_user_from_token(request, db)
    if not current_user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    deal = await get_deal_or_404(deal_id, db)
    assert_participant(deal, str(current_user.user_id), role="client")
    if deal["status"] not in ("DELIVERED",):
        raise HTTPException(
            status_code=400,
            detail="You can only dispute after the freelancer has delivered",
        )

    now = utcnow()
    await db.transactions.update_one(
        {"deal_id": deal_id},
        {"$set": {
            "status": "DISPUTED",
            "dispute": {
                "raised_by": str(current_user.user_id),
                "raised_by_email": current_user.email,
                "raised_by_name": current_user.name or current_user.email,
                "reason": body.reason,
                "raised_at": now,
                "resolved_at": None,
                "resolution": None,
            },
            "updated_at": now,
        }},
    )
    logger.info(f"[SMART_DEAL] {deal_id} disputed by {current_user.email}: {body.reason[:80]}")

    import email_service
    asyncio.create_task(_fire_email(
        email_service.send_smart_deal_disputed(
            deal,
            deal.get("client_name") or deal["client_email"],
            deal.get("freelancer_name") or deal["freelancer_email"],
            body.reason,
            current_user.name or current_user.email,
            ADMIN_DISPUTE_EMAIL,
        )
    ))

    return {"deal_id": deal_id, "status": "DISPUTED"}


@router.post("/{deal_id}/messages", status_code=201)
async def post_message(deal_id: str, body: MessageRequest, request: Request):
    """Either party sends a message. Stored in deal.messages[]."""
    db = get_database()
    current_user = await get_user_from_token(request, db)
    if not current_user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    deal = await get_deal_or_404(deal_id, db)
    assert_participant(deal, str(current_user.user_id))

    message = {
        "message_id": uuid.uuid4().hex,
        "sender_id": current_user.user_id,
        "sender_email": current_user.email,
        "sender_name": current_user.name or current_user.email,
        "content": body.content,
        "sent_at": utcnow(),
    }
    await db.transactions.update_one(
        {"deal_id": deal_id},
        {"$push": {"messages": message}, "$set": {"updated_at": utcnow()}},
    )
    return message


async def _sync_seller_banking(deal: dict, db: AsyncIOMotorDatabase):
    """Sync freelancer banking details to their TradeSafe token (PAYOUT_SYNC)."""
    deal_id = deal.get("deal_id", "?")
    seller_token_id = deal.get("tradesafe_seller_token_id")
    if not seller_token_id:
        logger.warning(f"[PAYOUT_SYNC] No seller token for deal {deal_id} — skipping")
        return

    freelancer = await db.users.find_one({"email": deal["freelancer_email"]})
    if not freelancer:
        logger.warning(f"[PAYOUT_SYNC] Freelancer not found for deal {deal_id} — skipping")
        return

    banking = freelancer.get("banking") or {}
    bank_name = banking.get("bank_name") or freelancer.get("bank_name")
    account_number = banking.get("account_number") or freelancer.get("account_number")
    branch_code = banking.get("branch_code") or freelancer.get("branch_code") or "000000"
    account_type = banking.get("account_type") or freelancer.get("account_type") or "savings"

    if not bank_name or not account_number:
        logger.warning(
            f"[PAYOUT_SYNC] No banking details for {deal['freelancer_email']} — "
            "token will lack banking info until freelancer sets it up"
        )
        return

    from tradesafe_service import sync_banking_to_token
    try:
        result = await sync_banking_to_token(
            token_id=seller_token_id,
            bank_name=bank_name,
            account_number=account_number,
            branch_code=branch_code,
            account_type=account_type,
            email=deal["freelancer_email"],
        )
        logger.info(f"[PAYOUT_SYNC] Deal {deal_id}: {result.get('success')} — {result}")
    except Exception as exc:
        logger.error(f"[PAYOUT_SYNC] Failed for deal {deal_id}: {exc}")


@router.get("/")
async def list_deals(request: Request):
    db = get_database()
    current_user = await get_user_from_token(request, db)
    if not current_user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    user_id = str(current_user.user_id)
    cursor = db.transactions.find(
        {
            "deal_type": "DIGITAL_WORK",
            "$or": [{"client_id": user_id}, {"freelancer_id": user_id}],
        },
        {
            "deal_id": 1, "title": 1, "amount": 1, "currency": 1, "status": 1,
            "client_email": 1, "freelancer_email": 1, "created_at": 1,
        },
    ).sort("created_at", -1).limit(50)

    deals = []
    async for deal in cursor:
        deal["_id"] = str(deal["_id"])
        deals.append(deal)
    return {"deals": deals, "count": len(deals)}


@router.get("/{deal_id}")
async def get_deal(deal_id: str, request: Request):
    db = get_database()
    current_user = await get_user_from_token(request, db)
    if not current_user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    deal = await get_deal_or_404(deal_id, db)
    assert_participant(deal, str(current_user.user_id))
    deal["_id"] = str(deal["_id"])
    return deal


# ─────────────────────────────────────────────────────────────────────────────
# Background utility (kept for reference — NOT called automatically;
# client must manually approve via POST /{deal_id}/approve)
# ─────────────────────────────────────────────────────────────────────────────

async def auto_approve_expired_deals(db: AsyncIOMotorDatabase):
    """
    NOT used in production. Payment is only released when the client manually
    approves via POST /{deal_id}/approve. This function exists only as a utility
    for admin tooling if ever needed.
    """
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
                }},
            )
            logger.info(f"[SMART_DEAL] Auto-approved {deal_id}")
            count += 1
        except Exception as exc:
            logger.error(f"[SMART_DEAL] Auto-approve failed for {deal_id}: {exc}")
    return count
