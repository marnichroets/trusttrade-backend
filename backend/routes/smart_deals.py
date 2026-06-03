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

from core.config import settings
from core.database import get_database
from core.security import get_user_from_token

logger = logging.getLogger(__name__)
router = APIRouter()

REVIEW_WINDOW_HOURS = 48
ADMIN_DISPUTE_EMAIL = "marnichr@gmail.com"

# Estimated TradeSafe payment-processing fee, mirroring calculate_fees and the normal
# transaction flow. Note: TradeSafe bills this per payment, so each milestone a client
# pays separately incurs its own processing fee (only a single upfront payment avoids that).
TRADESAFE_PROCESSING_FEE_PERCENT = 2.5


class CreateDealRequest(BaseModel):
    title: str = Field(..., min_length=3, max_length=200)
    description: str = Field(..., min_length=1, max_length=2000)
    amount: float = Field(..., gt=0)
    currency: str = Field(default="ZAR")
    freelancer_email: str
    # Defaults to 1 if the client leaves it empty; range is enforced in create_deal
    # so we can return a clear message instead of a raw 422 validation error.
    days_to_deliver: int = Field(default=1)
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

    # Validate minimum transaction amount (R500) — same floor as every other type.
    if body.amount < settings.MINIMUM_TRANSACTION_AMOUNT:
        raise HTTPException(status_code=400, detail=settings.MINIMUM_TRANSACTION_MESSAGE)

    # Delivery window must be a sane 1–60 days (no negatives / zero / huge values).
    if body.days_to_deliver < 1 or body.days_to_deliver > 60:
        raise HTTPException(status_code=400, detail="Delivery days must be between 1 and 60")

    deal_id = generate_deal_id()
    now = utcnow()
    client_name = current_user.name or current_user.email
    freelancer_name = freelancer.get("name") or freelancer["email"]

    # Map the Smart Deal onto the same fee/payout model as a normal transaction so
    # the admin list, finance, the webhook path, and payout all read identical fields.
    #   CLIENT pays the 2% fee  → freelancer receives the full amount (BUYER allocation)
    #   FREELANCER pays the fee → fee deducted from the freelancer payout (SELLER allocation)
    fee_allocation = "SELLER" if (body.fee_paid_by or "CLIENT").upper() == "FREELANCER" else "BUYER"
    platform_fee = max(round(body.amount * settings.PLATFORM_FEE_PERCENT / 100, 2), 5.0)
    processing_fee = round(body.amount * TRADESAFE_PROCESSING_FEE_PERCENT / 100, 2)
    fees = round(platform_fee + processing_fee, 2)
    if fee_allocation == "SELLER":
        net_amount = round(body.amount - fees, 2)           # freelancer payout after fees
        total = round(body.amount, 2)                       # client funds the amount only
    else:
        net_amount = round(body.amount, 2)                  # freelancer gets the full amount
        total = round(body.amount + fees, 2)                # client funds amount + fees

    # "deal title — scope" so the admin transactions list shows a meaningful item.
    item_description = f"{body.title} — {body.description}"

    doc = {
        "deal_id": deal_id,
        "deal_type": "DIGITAL_WORK",
        "transaction_id": deal_id,
        "share_code": deal_id,
        "client_id": current_user.user_id,
        "client_email": current_user.email,
        "client_name": client_name,
        "freelancer_id": str(freelancer["user_id"]),
        "freelancer_email": freelancer["email"],
        "freelancer_name": freelancer_name,
        # ── Normal-transaction fields (mirror routes/transactions.py) so Smart Deals
        #    render and pay out exactly like a normal escrow transaction. ──
        "buyer_user_id": current_user.user_id,
        "buyer_email": current_user.email,
        "buyer_name": client_name,
        "seller_user_id": str(freelancer["user_id"]),
        "seller_email": freelancer["email"],
        "seller_name": freelancer_name,
        "item_description": item_description,
        "item_price": body.amount,
        "delivery_method": "digital",
        "fee_allocation": fee_allocation,
        "platform_fee": platform_fee,
        "trusttrade_fee": platform_fee,
        "processing_fee": processing_fee,
        "net_amount": net_amount,
        "seller_receives": net_amount,
        "total": total,
        "payment_status": "Awaiting Acceptance",
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
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
    }

    await db.transactions.insert_one(doc)
    logger.info(f"[SMART_DEAL] Created {deal_id} by {current_user.email} for {freelancer['email']}")

    from email_service import send_smart_deal_created
    asyncio.create_task(_fire_email(send_smart_deal_created(
        freelancer_email=body.freelancer_email,
        freelancer_name=freelancer.get('name') or body.freelancer_email.split('@')[0],
        client_name=current_user.name or current_user.email.split('@')[0],
        deal_id=deal_id,
        title=body.title,
        amount=body.amount,
        scope=body.description,
        days=body.days_to_deliver,
    )))

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
    result = await create_tradesafe_transaction(
        internal_reference=deal_id,
        title=f"TrustTrade Smart Deal - {deal['title'][:50]}",
        description=deal.get("item_description") or deal.get("description", "Digital work"),
        amount=deal["amount"],
        buyer_name=client_name,
        buyer_email=deal["client_email"],
        seller_name=freelancer_name,
        seller_email=deal["freelancer_email"],
        buyer_mobile=client_mobile,
        seller_mobile=freelancer_mobile,
        # Digital work has no physical handover: deliver immediately + 1 inspection day,
        # exactly like a normal "digital" delivery transaction. Carry the same fee model.
        fee_allocation=deal.get("fee_allocation", "BUYER"),
        days_to_deliver=0,
        days_to_inspect=1,
    )
    if not result or "error" in result:
        raise HTTPException(
            status_code=500,
            detail=(result.get("error", "Failed to create escrow") if result else "Failed to create escrow"),
        )

    tradesafe_id = result.get("id")
    allocation_id = (result.get("allocations") or [{}])[0].get("id")
    seller_token_id = result.get("seller_token_id")
    buyer_token_id = result.get("buyer_token_id")

    # Obtain the hosted TradeSafe payment URL — same as a normal transaction. Send the
    # client back to the deal page after paying so the FUNDS_DEPOSITED webhook can flip
    # the deal to FUNDED. The deal is NEVER marked funded here.
    frontend_url = (settings.FRONTEND_URL or "").rstrip("/")
    deal_url = f"{frontend_url}/smart-deals/{deal_id}"
    redirect_urls = {"success": deal_url, "failure": deal_url, "cancel": deal_url}

    payment_link = None
    payment_method_used = body.payment_method.upper()
    if tradesafe_id:
        try:
            pay_result = await get_payment_link(tradesafe_id, redirect_urls, method=body.payment_method)
            if pay_result:
                payment_link = pay_result.get("payment_link")
                payment_method_used = pay_result.get("method", payment_method_used)
        except Exception as exc:
            logger.error(f"[SMART_DEAL] get_payment_link failed for {deal_id}: {exc}")

    # No hosted link (EFT) → build bank-transfer details + reference for a manual payment.
    # Amount = the deal total already computed at creation (client pays amount + 2% when
    # CLIENT bears the fee; amount only when the freelancer bears it). Never recalculated.
    eft_details = None
    if not payment_link:
        from tradesafe_service import build_eft_payment_details
        eft_amount = deal.get("total") or deal.get("amount") or 0
        share_code = deal.get("share_code", deal_id)
        eft_details = await build_eft_payment_details(
            reference=share_code, amount=eft_amount, tradesafe_id=tradesafe_id
        )
        logger.warning(
            f"[SMART_DEAL] {deal_id}: no hosted payment URL — showing EFT bank details "
            f"(source={eft_details['source']}). Deal stays PAYMENT_PENDING until FUNDS_DEPOSITED."
        )
        # Email the client their EFT details (deduped per deal).
        try:
            import email_service
            from webhook_handler import send_email_with_tracking
            await send_email_with_tracking(
                db, deal_id, "eft_payment_details_buyer",
                deal.get("buyer_email") or deal.get("client_email", ""),
                email_service.send_eft_payment_details_email,
                to_email=deal.get("buyer_email") or deal.get("client_email", ""),
                to_name=deal.get("buyer_name") or deal.get("client_name", "Client"),
                share_code=share_code,
                item_description=deal.get("item_description") or deal.get("title", "Digital work"),
                bank=eft_details["bank"], account_name=eft_details["account_name"],
                account_number=eft_details["account_number"], branch_code=eft_details["branch_code"],
                reference=eft_details["reference"], amount=eft_details["amount"],
                instructions=eft_details["instructions"],
            )
        except Exception as exc:
            logger.error(f"[SMART_DEAL] EFT details email failed for {deal_id}: {exc}")

    now = utcnow()
    await db.transactions.update_one(
        {"deal_id": deal_id},
        {"$set": {
            "status": "PAYMENT_PENDING",
            # tradesafe_id is what the regular webhook path matches on — store it so
            # Smart Deals resolve through the exact same lookup as normal transactions.
            "tradesafe_id": tradesafe_id,
            "tradesafe_token_id": tradesafe_id,
            "tradesafe_transaction_id": tradesafe_id,
            "tradesafe_allocation_id": allocation_id,
            "tradesafe_seller_token_id": seller_token_id,
            "tradesafe_buyer_token_id": buyer_token_id,
            "payment_method": body.payment_method,
            "payment_link": payment_link,
            "eft_details": eft_details,
            "payment_status": "Awaiting Payment",
            "payment_initiated_at": now,
            "updated_at": now,
        }},
    )
    logger.info(
        f"[SMART_DEAL] {deal_id} payment initiated by {current_user.email},"
        f" tradesafe_id={tradesafe_id}, payment_link={bool(payment_link)}, eft={'yes' if eft_details else 'no'}"
    )

    # Deal stays PAYMENT_PENDING until TradeSafe webhook confirms FUNDS_DEPOSITED
    return {
        "deal_id": deal_id,
        "status": "PAYMENT_PENDING",
        "payment_link": payment_link,
        "eft_details": eft_details,
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
            "tradesafe_id": None,
            "tradesafe_token_id": None,
            "tradesafe_transaction_id": None,
            "tradesafe_allocation_id": None,
            "tradesafe_seller_token_id": None,
            "tradesafe_buyer_token_id": None,
            "payment_link": None,
            "eft_details": None,
            "payment_method": None,
            "payment_status": "Awaiting Acceptance",
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

    # Notify TradeSafe that delivery has started so the allocation moves to
    # DELIVERY_REQUESTED state — required before allocationAcceptDelivery can run.
    allocation_id = deal.get("tradesafe_allocation_id")
    if allocation_id:
        try:
            from tradesafe_service import start_delivery
            sd_result = await start_delivery(allocation_id)
            logger.info(f"[SMART_DEAL] start_delivery for {deal_id}: {sd_result}")
        except Exception as exc:
            logger.error(f"[SMART_DEAL] start_delivery failed for {deal_id}: {exc}")
    else:
        logger.warning(f"[SMART_DEAL] {deal_id} has no tradesafe_allocation_id — skipping start_delivery")

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
        seller_token_id = deal.get("tradesafe_seller_token_id")
        deal_amount = deal.get("amount")
        net_amount = deal.get("net_amount") or deal_amount
        payout_result = await accept_delivery(
            allocation_id,
            seller_token_id=seller_token_id,
            amount=float(net_amount) if net_amount else None,
        )
        if not payout_result:
            raise ValueError("TradeSafe accept_delivery returned no result")
        logger.info(f"[SMART_DEAL] Payout released for {deal_id}, allocation={allocation_id}")
        await db.transactions.update_one(
            {"deal_id": deal_id},
            {"$set": {
                "status": "COMPLETE",
                "completed_at": now,
                "updated_at": now,
                "tradesafe_state": "FUNDS_RELEASED",
                "release_status": "Released",
                "payout_status": "awaiting_bank_payout",
                "withdrawal_status": "pending",
                "funds_released_at": now,
                "released_at": now,
                "expected_settlement_window": "up to 2 business days",
                "payout_sla_status": "on_track",
                "net_amount": net_amount,
            }},
        )
        latest_deal = await db.transactions.find_one({"deal_id": deal_id}, {"_id": 0})
        from routes.webhooks import attempt_transaction_withdrawal
        withdrawal_result = await attempt_transaction_withdrawal(
            db,
            latest_deal or {**deal, "net_amount": net_amount},
            source="smart_deal_approve",
        )
        logger.info(f"[SMART_DEAL] withdrawal result for {deal_id}: {withdrawal_result}")

        # Tell the freelancer their funds are on the way — same "funds on their way"
        # email + SMS a normal transaction sends, deduped against the webhook
        # FUNDS_RELEASED path. Ensure net_amount is present for the helper.
        from routes.webhooks import notify_seller_funds_released
        _src = {**(latest_deal or deal)}
        _src.setdefault("net_amount", net_amount)
        asyncio.create_task(_fire_email(notify_seller_funds_released(db, _src)))
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

    banking = freelancer.get("banking_details") or {}
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


# ═════════════════════════════════════════════════════════════════════════════
# MILESTONE SMART DEALS
#
# A milestone deal is a parent document (deal_type=DIGITAL_WORK_MILESTONE) that
# holds the milestone structure + display state. Each milestone, once the buyer
# pays it, gets its OWN child document (deal_type=DIGITAL_WORK_MILESTONE_ITEM)
# with a unique transaction_id ({deal_id}-M{seq}). The child mirrors the same
# fields a normal transaction uses, so it flows through the existing
# fund → webhook → release → withdrawal pipeline UNCHANGED and milestones release
# independently (no shared withdrawal_status to clobber).
#
# Roles: the SELLER (freelancer) creates the deal and defines milestones; the
# BUYER (client) approves the structure, then pays milestones one at a time.
# ═════════════════════════════════════════════════════════════════════════════

MILESTONE_REVIEW_WINDOW_HOURS = REVIEW_WINDOW_HOURS


class MilestoneInput(BaseModel):
    description: str = Field(..., min_length=1, max_length=500)
    amount: float = Field(..., gt=0)


class CreateMilestoneDealRequest(BaseModel):
    title: str = Field(..., min_length=3, max_length=200)
    description: str = Field(default="", max_length=2000)
    currency: str = Field(default="ZAR")
    buyer_email: str
    fee_paid_by: str = Field(default="CLIENT")  # CLIENT | FREELANCER (per the whole deal)
    milestones: list[MilestoneInput] = Field(..., min_length=1, max_length=20)


def _split_fee_across(total_fee: float, amounts: list, deal_total: float) -> list:
    """Split a deal-level fee across stages in proportion to each stage's amount.

    The last stage absorbs the rounding remainder so the parts always sum to exactly
    total_fee. This is how we keep a multi-stage deal's fees identical to a single
    transaction of the same total — we never charge a per-stage minimum on top.
    """
    shares = []
    allocated = 0.0
    for i, amt in enumerate(amounts):
        if i == len(amounts) - 1:
            shares.append(round(total_fee - allocated, 2))
        else:
            share = round(total_fee * (amt / deal_total), 2) if deal_total else 0.0
            allocated = round(allocated + share, 2)
            shares.append(share)
    return shares


def _find_milestone(deal: dict, milestone_id: str) -> Optional[dict]:
    for m in deal.get("milestones", []):
        if m.get("milestone_id") == milestone_id:
            return m
    return None


def _is_milestone_deal(deal: dict) -> bool:
    return deal.get("deal_type") == "DIGITAL_WORK_MILESTONE"


async def _set_milestone_fields(db, parent_deal_id: str, milestone_id: str, fields: dict):
    """Update a single milestone inside the parent's milestones[] array."""
    set_doc = {f"milestones.$[m].{k}": v for k, v in fields.items()}
    set_doc["updated_at"] = utcnow()
    await db.transactions.update_one(
        {"deal_id": parent_deal_id},
        {"$set": set_doc},
        array_filters=[{"m.milestone_id": milestone_id}],
    )


async def _recompute_parent_status(db, parent_deal_id: str):
    """Derive the parent deal status from its milestones."""
    deal = await db.transactions.find_one({"deal_id": parent_deal_id})
    if not deal:
        return
    statuses = [m.get("status") for m in deal.get("milestones", [])]
    if statuses and all(s == "RELEASED" for s in statuses):
        new_status = "COMPLETE"
    elif any(s == "DISPUTED" for s in statuses):
        new_status = "DISPUTED"
    elif any(s in ("PAYMENT_PENDING", "FUNDED", "DELIVERED", "RELEASED") for s in statuses):
        new_status = "IN_PROGRESS"
    elif deal.get("structure_status") == "APPROVED":
        new_status = "STRUCTURE_APPROVED"
    else:
        new_status = "PROPOSED"
    update = {"status": new_status, "updated_at": utcnow()}
    if new_status == "COMPLETE":
        update["completed_at"] = deal.get("completed_at") or utcnow()
    await db.transactions.update_one({"deal_id": parent_deal_id}, {"$set": update})


async def _open_next_milestone(db, deal: dict, released_seq: int):
    """Pay-as-you-go: once a milestone is released, open the next one for payment."""
    nxt = next(
        (m for m in sorted(deal.get("milestones", []), key=lambda x: x.get("seq", 0))
         if m.get("seq", 0) == released_seq + 1),
        None,
    )
    if nxt and nxt.get("status") == "PROPOSED":
        await _set_milestone_fields(db, deal["deal_id"], nxt["milestone_id"], {"status": "AWAITING_PAYMENT"})


async def advance_parent_milestone_released(db, parent_deal_id: str, milestone_id: str):
    """Idempotently mark a milestone RELEASED on the parent, open the next one,
    and recompute the overall deal status. Safe to call from both the manual
    approve endpoint and the FUNDS_RELEASED webhook."""
    deal = await db.transactions.find_one({"deal_id": parent_deal_id})
    if not deal:
        return
    m = _find_milestone(deal, milestone_id)
    if not m:
        return
    if m.get("status") != "RELEASED":
        await _set_milestone_fields(db, parent_deal_id, milestone_id, {
            "status": "RELEASED", "released_at": m.get("released_at") or utcnow(),
        })
    await _open_next_milestone(db, deal, m.get("seq", 0))
    await _recompute_parent_status(db, parent_deal_id)


@router.post("/milestone-deals", status_code=201)
async def create_milestone_deal(body: CreateMilestoneDealRequest, request: Request):
    """Seller creates a milestone deal and defines the milestones. The buyer
    (client) is invited by email and must approve the structure before paying."""
    db = get_database()
    current_user = await get_user_from_token(request, db)
    if not current_user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    buyer = await db.users.find_one({"email": body.buyer_email.strip().lower()})
    if not buyer:
        raise HTTPException(
            status_code=404,
            detail="No TrustTrade account found for that email. Ask your client to sign up first.",
        )
    if str(buyer["user_id"]) == str(current_user.user_id):
        raise HTTPException(status_code=400, detail="You cannot create a deal with yourself")

    # Each milestone is its own escrow transaction, so each must clear the R500 floor.
    for i, ms in enumerate(body.milestones, start=1):
        if ms.amount < settings.MINIMUM_TRANSACTION_AMOUNT:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Milestone {i} is R{ms.amount:,.0f}. Each milestone is paid into escrow "
                    f"separately, so every milestone must be at least "
                    f"R{settings.MINIMUM_TRANSACTION_AMOUNT:,.0f}."
                ),
            )

    deal_id = generate_deal_id()
    now = utcnow()
    seller_name = current_user.name or current_user.email
    buyer_name = buyer.get("name") or buyer["email"]

    # Deal-level fee allocation follows fee_paid_by (same for every milestone).
    fee_allocation = "SELLER" if (body.fee_paid_by or "CLIENT").upper() == "FREELANCER" else "BUYER"

    # Fees are charged on the WHOLE deal once, then split across stages in proportion
    # to each stage's amount — so a multi-stage deal never costs more in TrustTrade
    # fees than a single transaction of the same total. The 2% has a single R5 floor
    # on the deal, NOT one per stage.
    amounts = [ms.amount for ms in body.milestones]
    total_amount = round(sum(amounts), 2)
    deal_platform_fee = max(round(total_amount * settings.PLATFORM_FEE_PERCENT / 100, 2), 5.0)
    deal_processing_fee = round(total_amount * TRADESAFE_PROCESSING_FEE_PERCENT / 100, 2)
    platform_shares = _split_fee_across(deal_platform_fee, amounts, total_amount)
    processing_shares = _split_fee_across(deal_processing_fee, amounts, total_amount)

    milestones = []
    total_fee = deal_platform_fee
    total_processing_fee = deal_processing_fee
    total_net = 0.0
    total_to_fund = 0.0
    for seq, ms in enumerate(body.milestones, start=1):
        platform_fee = platform_shares[seq - 1]
        processing_fee = processing_shares[seq - 1]
        fees = round(platform_fee + processing_fee, 2)
        if fee_allocation == "SELLER":
            net_amount = round(ms.amount - fees, 2)   # freelancer payout after fees
            total = round(ms.amount, 2)               # client funds the amount only
        else:
            net_amount = round(ms.amount, 2)          # freelancer gets the full amount
            total = round(ms.amount + fees, 2)        # client funds amount + fees
        total_net += net_amount
        total_to_fund += total
        milestones.append({
            "milestone_id": f"M{seq}",
            "seq": seq,
            "description": ms.description.strip(),
            "amount": round(ms.amount, 2),
            "platform_fee": platform_fee,
            "processing_fee": processing_fee,
            "net_amount": net_amount,
            "total": total,
            "status": "PROPOSED",
            "child_transaction_id": None,
            "tradesafe_id": None,
            "tradesafe_allocation_id": None,
            "tradesafe_seller_token_id": None,
            "tradesafe_buyer_token_id": None,
            "payment_link": None,
            "eft_details": None,
            "payment_method": None,
            "dispute": None,
            "funded_at": None,
            "delivered_at": None,
            "released_at": None,
            "review_window": {
                "hours": MILESTONE_REVIEW_WINDOW_HOURS,
                "opened_at": None, "expires_at": None, "auto_approved": False,
            },
        })

    doc = {
        "deal_id": deal_id,
        "deal_type": "DIGITAL_WORK_MILESTONE",
        "transaction_id": deal_id,
        "share_code": deal_id,
        # Buyer = client (pays); Seller = freelancer (creator, gets paid).
        "client_id": str(buyer["user_id"]),
        "client_email": buyer["email"],
        "client_name": buyer_name,
        "buyer_user_id": str(buyer["user_id"]),
        "buyer_email": buyer["email"],
        "buyer_name": buyer_name,
        "freelancer_id": str(current_user.user_id),
        "freelancer_email": current_user.email,
        "freelancer_name": seller_name,
        "seller_user_id": str(current_user.user_id),
        "seller_email": current_user.email,
        "seller_name": seller_name,
        "title": body.title,
        "description": body.description,
        "item_description": f"{body.title} — {len(milestones)} stages",
        "currency": body.currency,
        "fee_paid_by": body.fee_paid_by,
        "fee_allocation": fee_allocation,
        "amount": round(total_amount, 2),
        "platform_fee": round(total_fee, 2),
        "trusttrade_fee": round(total_fee, 2),
        "processing_fee": round(total_processing_fee, 2),
        "net_amount": round(total_net, 2),
        "total": round(total_to_fund, 2),
        "milestones": milestones,
        "structure_status": "PROPOSED",
        "status": "PROPOSED",
        "messages": [],
        "dispute": None,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
    }

    await db.transactions.insert_one(doc)
    logger.info(
        f"[MILESTONE_DEAL] Created {deal_id} by seller {current_user.email} for buyer "
        f"{buyer['email']} — {len(milestones)} milestones, total R{total_amount:,.2f}"
    )

    import email_service
    asyncio.create_task(_fire_email(email_service.send_milestone_deal_invite(
        doc, buyer_name, seller_name,
    )))

    return {"deal_id": deal_id, "status": "PROPOSED"}


@router.post("/{deal_id}/approve-structure")
async def approve_structure(deal_id: str, request: Request):
    """Buyer reviews and approves the milestone structure — PROPOSED → STRUCTURE_APPROVED.
    Opens the first milestone for payment."""
    db = get_database()
    current_user = await get_user_from_token(request, db)
    if not current_user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    deal = await get_deal_or_404(deal_id, db)
    if not _is_milestone_deal(deal):
        raise HTTPException(status_code=400, detail="This is not a milestone deal")
    assert_participant(deal, str(current_user.user_id), role="client")
    if deal.get("structure_status") == "APPROVED":
        raise HTTPException(status_code=400, detail="You have already approved this deal")
    if deal["status"] != "PROPOSED":
        raise HTTPException(status_code=400, detail=f"Cannot approve a deal in status: {deal['status']}")

    now = utcnow()
    first = sorted(deal.get("milestones", []), key=lambda x: x.get("seq", 0))[0]
    await db.transactions.update_one(
        {"deal_id": deal_id},
        {"$set": {
            "structure_status": "APPROVED",
            "status": "STRUCTURE_APPROVED",
            "structure_approved_at": now,
            "updated_at": now,
        }},
    )
    await _set_milestone_fields(db, deal_id, first["milestone_id"], {"status": "AWAITING_PAYMENT"})
    logger.info(f"[MILESTONE_DEAL] {deal_id} structure approved by {current_user.email}")

    import email_service
    asyncio.create_task(_fire_email(email_service.send_milestone_structure_approved(
        deal, deal.get("client_name") or deal["client_email"],
        deal.get("freelancer_name") or deal["freelancer_email"],
    )))

    return {"deal_id": deal_id, "status": "STRUCTURE_APPROVED"}


@router.post("/{deal_id}/milestones/{milestone_id}/fund")
async def fund_milestone(deal_id: str, milestone_id: str, body: FundRequest, request: Request):
    """Buyer funds a single milestone into escrow. Creates a per-milestone TradeSafe
    transaction and returns a payment link (or EFT details)."""
    db = get_database()
    current_user = await get_user_from_token(request, db)
    if not current_user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    deal = await get_deal_or_404(deal_id, db)
    if not _is_milestone_deal(deal):
        raise HTTPException(status_code=400, detail="This is not a milestone deal")
    assert_participant(deal, str(current_user.user_id), role="client")
    if deal.get("structure_status") != "APPROVED":
        raise HTTPException(status_code=400, detail="Approve the milestone structure before paying")

    m = _find_milestone(deal, milestone_id)
    if not m:
        raise HTTPException(status_code=404, detail="Milestone not found")
    if m["status"] not in ("AWAITING_PAYMENT", "PAYMENT_PENDING"):
        raise HTTPException(status_code=400, detail=f"This milestone is not open for payment (status: {m['status']})")
    # Pay-as-you-go: every earlier milestone must already be released.
    earlier = [x for x in deal.get("milestones", []) if x.get("seq", 0) < m.get("seq", 0)]
    if any(x.get("status") != "RELEASED" for x in earlier):
        raise HTTPException(status_code=400, detail="Pay milestones in order — finish the previous milestone first")

    child_deal_id = f"{deal_id}-{milestone_id}"

    from tradesafe_service import create_tradesafe_transaction, get_payment_link

    buyer_user = await db.users.find_one({"email": deal["client_email"]})
    seller_user = await db.users.find_one({"email": deal["freelancer_email"]})
    buyer_name = (buyer_user or {}).get("name") or deal.get("client_name") or deal["client_email"]
    seller_name = (seller_user or {}).get("name") or deal.get("freelancer_name") or deal["freelancer_email"]
    buyer_mobile = (buyer_user or {}).get("phone") or (buyer_user or {}).get("mobile")
    seller_mobile = (seller_user or {}).get("phone") or (seller_user or {}).get("mobile")

    milestone_label = f"Milestone {m['seq']}: {m['description']}"
    result = await create_tradesafe_transaction(
        internal_reference=child_deal_id,
        title=f"TrustTrade Smart Deal - {deal['title'][:40]} (M{m['seq']})",
        description=milestone_label[:255],
        amount=m["amount"],
        buyer_name=buyer_name,
        buyer_email=deal["client_email"],
        seller_name=seller_name,
        seller_email=deal["freelancer_email"],
        buyer_mobile=buyer_mobile,
        seller_mobile=seller_mobile,
        fee_allocation=deal.get("fee_allocation", "BUYER"),
        days_to_deliver=0,
        days_to_inspect=1,
    )
    if not result or "error" in result:
        raise HTTPException(
            status_code=500,
            detail=(result.get("error", "Failed to create escrow") if result else "Failed to create escrow"),
        )

    tradesafe_id = result.get("id")
    allocation_id = (result.get("allocations") or [{}])[0].get("id")
    seller_token_id = result.get("seller_token_id")
    buyer_token_id = result.get("buyer_token_id")

    frontend_url = (settings.FRONTEND_URL or "").rstrip("/")
    deal_url = f"{frontend_url}/smart-deals/{deal_id}"
    redirect_urls = {"success": deal_url, "failure": deal_url, "cancel": deal_url}

    payment_link = None
    payment_method_used = body.payment_method.upper()
    if tradesafe_id:
        try:
            pay_result = await get_payment_link(tradesafe_id, redirect_urls, method=body.payment_method)
            if pay_result:
                payment_link = pay_result.get("payment_link")
                payment_method_used = pay_result.get("method", payment_method_used)
        except Exception as exc:
            logger.error(f"[MILESTONE_DEAL] get_payment_link failed for {child_deal_id}: {exc}")

    eft_details = None
    if not payment_link:
        from tradesafe_service import build_eft_payment_details
        eft_details = await build_eft_payment_details(
            reference=child_deal_id, amount=m.get("total") or m["amount"], tradesafe_id=tradesafe_id,
        )
        logger.warning(
            f"[MILESTONE_DEAL] {child_deal_id}: no hosted payment URL — showing EFT details "
            f"(source={eft_details['source']})."
        )

    now = utcnow()
    # Create / refresh the per-milestone child document — this is what the webhook and
    # payout pipeline act on, with its OWN unique transaction_id.
    child_doc = {
        "deal_type": "DIGITAL_WORK_MILESTONE_ITEM",
        "parent_deal_id": deal_id,
        "milestone_id": milestone_id,
        "seq": m["seq"],
        "deal_id": child_deal_id,
        "transaction_id": child_deal_id,
        "share_code": child_deal_id,
        "title": deal["title"],
        "item_description": f"{deal['title']} — {milestone_label}",
        "description": m["description"],
        "currency": deal["currency"],
        "amount": m["amount"],
        "item_price": m["amount"],
        "fee_paid_by": deal.get("fee_paid_by"),
        "fee_allocation": deal.get("fee_allocation", "BUYER"),
        "platform_fee": m["platform_fee"],
        "trusttrade_fee": m["platform_fee"],
        "net_amount": m["net_amount"],
        "seller_receives": m["net_amount"],
        "total": m["total"],
        "client_id": deal.get("client_id"),
        "client_email": deal["client_email"],
        "client_name": deal.get("client_name"),
        "buyer_user_id": deal.get("buyer_user_id"),
        "buyer_email": deal.get("buyer_email") or deal["client_email"],
        "buyer_name": deal.get("buyer_name") or deal.get("client_name"),
        "freelancer_id": deal.get("freelancer_id"),
        "freelancer_email": deal["freelancer_email"],
        "freelancer_name": deal.get("freelancer_name"),
        "seller_user_id": deal.get("seller_user_id"),
        "seller_email": deal.get("seller_email") or deal["freelancer_email"],
        "seller_name": deal.get("seller_name") or deal.get("freelancer_name"),
        "delivery_method": "digital",
        "status": "PAYMENT_PENDING",
        "payment_status": "Awaiting Payment",
        "tradesafe_id": tradesafe_id,
        "tradesafe_token_id": tradesafe_id,
        "tradesafe_transaction_id": tradesafe_id,
        "tradesafe_allocation_id": allocation_id,
        "tradesafe_seller_token_id": seller_token_id,
        "tradesafe_buyer_token_id": buyer_token_id,
        "payment_method": body.payment_method,
        "payment_link": payment_link,
        "eft_details": eft_details,
        "review_window": {
            "hours": MILESTONE_REVIEW_WINDOW_HOURS,
            "opened_at": None, "expires_at": None, "auto_approved": False,
        },
        "dispute": None,
        "payment_initiated_at": now,
        "updated_at": now,
    }
    await db.transactions.update_one(
        {"deal_id": child_deal_id},
        {"$set": child_doc, "$setOnInsert": {"created_at": now.isoformat()}},
        upsert=True,
    )

    # Mirror the escrow handles onto the parent milestone for display + fund/cancel flow.
    await _set_milestone_fields(db, deal_id, milestone_id, {
        "status": "PAYMENT_PENDING",
        "child_transaction_id": child_deal_id,
        "tradesafe_id": tradesafe_id,
        "tradesafe_allocation_id": allocation_id,
        "tradesafe_seller_token_id": seller_token_id,
        "tradesafe_buyer_token_id": buyer_token_id,
        "payment_link": payment_link,
        "eft_details": eft_details,
        "payment_method": body.payment_method,
    })
    if deal["status"] != "IN_PROGRESS":
        await db.transactions.update_one({"deal_id": deal_id}, {"$set": {"status": "IN_PROGRESS", "updated_at": now}})

    logger.info(
        f"[MILESTONE_DEAL] {child_deal_id} payment initiated by {current_user.email}, "
        f"tradesafe_id={tradesafe_id}, payment_link={bool(payment_link)}, eft={'yes' if eft_details else 'no'}"
    )

    return {
        "deal_id": deal_id,
        "milestone_id": milestone_id,
        "status": "PAYMENT_PENDING",
        "payment_link": payment_link,
        "eft_details": eft_details,
        "payment_method": payment_method_used,
        "tradesafe_id": tradesafe_id,
    }


@router.post("/{deal_id}/milestones/{milestone_id}/cancel-payment")
async def cancel_milestone_payment(deal_id: str, milestone_id: str, request: Request):
    """Reset a milestone that is PAYMENT_PENDING back to AWAITING_PAYMENT so the buyer
    can choose a different payment method."""
    db = get_database()
    current_user = await get_user_from_token(request, db)
    if not current_user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    deal = await get_deal_or_404(deal_id, db)
    if not _is_milestone_deal(deal):
        raise HTTPException(status_code=400, detail="This is not a milestone deal")
    assert_participant(deal, str(current_user.user_id), role="client")
    m = _find_milestone(deal, milestone_id)
    if not m:
        raise HTTPException(status_code=404, detail="Milestone not found")
    if m["status"] != "PAYMENT_PENDING":
        raise HTTPException(status_code=400, detail=f"Cannot cancel payment — milestone is {m['status']}")

    child_deal_id = m.get("child_transaction_id") or f"{deal_id}-{milestone_id}"
    await db.transactions.update_one(
        {"deal_id": child_deal_id},
        {"$set": {"status": "CANCELLED", "payment_status": "Cancelled", "updated_at": utcnow()}},
    )
    await _set_milestone_fields(db, deal_id, milestone_id, {
        "status": "AWAITING_PAYMENT",
        "child_transaction_id": None,
        "tradesafe_id": None,
        "tradesafe_allocation_id": None,
        "tradesafe_seller_token_id": None,
        "tradesafe_buyer_token_id": None,
        "payment_link": None,
        "eft_details": None,
        "payment_method": None,
    })
    logger.info(f"[MILESTONE_DEAL] {child_deal_id} payment cancelled by {current_user.email}")
    return {"deal_id": deal_id, "milestone_id": milestone_id, "status": "AWAITING_PAYMENT"}


@router.post("/{deal_id}/milestones/{milestone_id}/deliver")
async def deliver_milestone(deal_id: str, milestone_id: str, request: Request):
    """Seller marks a funded milestone as delivered — FUNDED → DELIVERED."""
    db = get_database()
    current_user = await get_user_from_token(request, db)
    if not current_user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    deal = await get_deal_or_404(deal_id, db)
    if not _is_milestone_deal(deal):
        raise HTTPException(status_code=400, detail="This is not a milestone deal")
    assert_participant(deal, str(current_user.user_id), role="freelancer")
    m = _find_milestone(deal, milestone_id)
    if not m:
        raise HTTPException(status_code=404, detail="Milestone not found")
    if m["status"] != "FUNDED":
        raise HTTPException(status_code=400, detail=f"Cannot deliver — milestone is {m['status']}")

    from datetime import timedelta
    now = utcnow()
    expires_at = now + timedelta(hours=MILESTONE_REVIEW_WINDOW_HOURS)
    child_deal_id = m.get("child_transaction_id") or f"{deal_id}-{milestone_id}"

    await db.transactions.update_one(
        {"deal_id": child_deal_id},
        {"$set": {
            "status": "DELIVERED", "delivered_at": now, "updated_at": now,
            "review_window.opened_at": now, "review_window.expires_at": expires_at,
        }},
    )
    await _set_milestone_fields(db, deal_id, milestone_id, {
        "status": "DELIVERED", "delivered_at": now,
        "review_window.opened_at": now, "review_window.expires_at": expires_at,
    })

    # Move the TradeSafe allocation into DELIVERY_REQUESTED, as the single-deal path does.
    allocation_id = m.get("tradesafe_allocation_id")
    if allocation_id:
        try:
            from tradesafe_service import start_delivery
            sd_result = await start_delivery(allocation_id)
            logger.info(f"[MILESTONE_DEAL] start_delivery for {child_deal_id}: {sd_result}")
        except Exception as exc:
            logger.error(f"[MILESTONE_DEAL] start_delivery failed for {child_deal_id}: {exc}")
    else:
        logger.warning(f"[MILESTONE_DEAL] {child_deal_id} has no allocation_id — skipping start_delivery")

    logger.info(f"[MILESTONE_DEAL] {child_deal_id} delivered by {current_user.email}")

    import email_service
    fresh = await db.transactions.find_one({"deal_id": deal_id})
    asyncio.create_task(_fire_email(email_service.send_milestone_delivered(
        fresh or deal, _find_milestone(fresh or deal, milestone_id) or m,
        (fresh or deal).get("client_name") or deal["client_email"],
        (fresh or deal).get("freelancer_name") or deal["freelancer_email"],
    )))

    return {"deal_id": deal_id, "milestone_id": milestone_id, "status": "DELIVERED"}


async def _release_milestone_escrow(db, deal: dict, m: dict, actor: str):
    """Release one milestone's escrow, run the bank withdrawal, advance the parent
    deal and notify. Returns (ok: bool, error: Optional[str]).

    Shared by the buyer approve flow and the admin force-release so both behave
    identically. The TradeSafe release is idempotent + self-healing (accept_delivery
    re-checks the real allocation by reference), so a retry after a partial release,
    or a stale stored allocation_id, no longer dead-ends.
    """
    deal_id = deal["deal_id"]
    milestone_id = m["milestone_id"]
    child_deal_id = m.get("child_transaction_id") or f"{deal_id}-{milestone_id}"
    allocation_id = m.get("tradesafe_allocation_id")
    seller_token_id = m.get("tradesafe_seller_token_id")
    net_amount = m.get("net_amount") or m.get("amount")
    now = utcnow()

    logger.info(
        f"[MILESTONE_DEAL] release requested ({actor}) deal={deal_id} milestone={milestone_id} "
        f"child={child_deal_id} allocation={allocation_id!r} seller_token={seller_token_id!r} amount={net_amount}"
    )
    if not allocation_id:
        msg = "tradesafe_allocation_id missing — milestone not linked to escrow"
        logger.error(f"[MILESTONE_DEAL] {child_deal_id} cannot release: {msg}")
        await db.transactions.update_one({"deal_id": child_deal_id}, {"$set": {"payout_failed": True, "payout_error": msg, "updated_at": now}})
        return False, msg

    try:
        import tradesafe_service as _ts
        payout_result = await _ts.accept_delivery(
            allocation_id, seller_token_id=seller_token_id,
            amount=float(net_amount) if net_amount else None,
            reference=child_deal_id,
        )
        if not payout_result:
            # Surface the EXACT TradeSafe rejection captured by accept_delivery.
            raise ValueError(_ts.LAST_ACCEPT_DELIVERY_ERROR or "TradeSafe declined the release (no result)")
        logger.info(
            f"[MILESTONE_DEAL] {child_deal_id} released — allocation="
            f"{payout_result.get('id', allocation_id)} state={payout_result.get('state')!r}"
        )

        # If the release self-healed onto a different (correct) allocation than the one
        # stored, persist the correction so the DB stops pointing at the wrong allocation.
        released_alloc = payout_result.get("id")
        if released_alloc and str(released_alloc) != str(allocation_id):
            logger.warning(
                f"[MILESTONE_DEAL] correcting stored allocation for {child_deal_id}: "
                f"{allocation_id!r} -> {released_alloc!r}"
            )
            await _set_milestone_fields(db, deal_id, milestone_id, {"tradesafe_allocation_id": released_alloc})
            await db.transactions.update_one(
                {"deal_id": child_deal_id}, {"$set": {"tradesafe_allocation_id": released_alloc}}
            )

        # Mark the child released (same fields a normal txn gets) then run the
        # idempotent withdrawal — keyed on the child's unique transaction_id.
        await db.transactions.update_one(
            {"deal_id": child_deal_id},
            {"$set": {
                "status": "COMPLETE", "completed_at": now, "updated_at": now,
                "tradesafe_state": "FUNDS_RELEASED", "release_status": "Released",
                "payout_status": "awaiting_bank_payout", "withdrawal_status": "pending",
                "funds_released_at": now, "released_at": now,
                "expected_settlement_window": "up to 2 business days",
                "payout_sla_status": "on_track", "net_amount": net_amount,
                "payout_failed": False, "payout_error": None,
            }},
        )
        child = await db.transactions.find_one({"deal_id": child_deal_id})
        from routes.webhooks import attempt_transaction_withdrawal, notify_seller_funds_released
        withdrawal_result = await attempt_transaction_withdrawal(db, child, source=f"milestone_{actor}")
        logger.info(f"[MILESTONE_DEAL] withdrawal result for {child_deal_id}: {withdrawal_result}")
        asyncio.create_task(_fire_email(notify_seller_funds_released(db, child)))
    except Exception as exc:
        err = str(exc)
        logger.error(f"[MILESTONE_DEAL] Payout failed for {child_deal_id} ({actor}): {err}", exc_info=True)
        await db.transactions.update_one(
            {"deal_id": child_deal_id},
            {"$set": {"payout_failed": True, "payout_error": err, "updated_at": now}},
        )
        return False, err

    # Advance the parent: milestone RELEASED, open the next, recompute overall status.
    await _set_milestone_fields(db, deal_id, milestone_id, {"status": "RELEASED", "released_at": now})
    await _open_next_milestone(db, deal, m.get("seq", 0))
    await _recompute_parent_status(db, deal_id)
    logger.info(f"[MILESTONE_DEAL] {child_deal_id} released & parent advanced ({actor})")

    fresh = await db.transactions.find_one({"deal_id": deal_id})
    import email_service
    asyncio.create_task(_fire_email(email_service.send_milestone_released(
        fresh or deal, _find_milestone(fresh or deal, milestone_id) or m,
        (fresh or deal).get("client_name") or deal["client_email"],
        (fresh or deal).get("freelancer_name") or deal["freelancer_email"],
    )))
    return True, None


@router.post("/{deal_id}/milestones/{milestone_id}/approve")
async def approve_milestone(deal_id: str, milestone_id: str, request: Request):
    """Buyer approves a delivered milestone — releases that milestone's escrow and
    opens the next one for payment. DELIVERED → RELEASED."""
    db = get_database()
    current_user = await get_user_from_token(request, db)
    if not current_user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    deal = await get_deal_or_404(deal_id, db)
    if not _is_milestone_deal(deal):
        raise HTTPException(status_code=400, detail="This is not a milestone deal")
    assert_participant(deal, str(current_user.user_id), role="client")
    m = _find_milestone(deal, milestone_id)
    if not m:
        raise HTTPException(status_code=404, detail="Milestone not found")
    if m["status"] != "DELIVERED":
        raise HTTPException(status_code=400, detail=f"Nothing to approve — milestone is {m['status']}")

    logger.info(f"[MILESTONE_DEAL] approve POST received deal={deal_id} milestone={milestone_id} by {current_user.email}")
    ok, error = await _release_milestone_escrow(db, deal, m, actor="approve")
    if not ok:
        raise HTTPException(status_code=500, detail="Could not release this milestone. Please try again or contact support.")
    return {"deal_id": deal_id, "milestone_id": milestone_id, "status": "RELEASED"}


@router.post("/{deal_id}/milestones/{milestone_id}/admin-release")
async def admin_release_milestone(deal_id: str, milestone_id: str, request: Request):
    """Admin force-release a single milestone's escrow when the buyer's approve has
    failed. Returns the EXACT TradeSafe error on failure so it's visible in the admin
    panel without needing log access."""
    db = get_database()
    current_user = await get_user_from_token(request, db)
    if not current_user or not getattr(current_user, "is_admin", False):
        raise HTTPException(status_code=403, detail="Admin access required")

    deal = await get_deal_or_404(deal_id, db)
    if not _is_milestone_deal(deal):
        raise HTTPException(status_code=400, detail="This is not a milestone deal")
    m = _find_milestone(deal, milestone_id)
    if not m:
        raise HTTPException(status_code=404, detail="Milestone not found")
    if m.get("status") == "RELEASED":
        return {"deal_id": deal_id, "milestone_id": milestone_id, "status": "RELEASED", "note": "already released"}

    logger.info(f"[MILESTONE_DEAL] ADMIN force-release deal={deal_id} milestone={milestone_id} by {current_user.email}")
    ok, error = await _release_milestone_escrow(db, deal, m, actor="admin")
    if not ok:
        raise HTTPException(status_code=502, detail=f"Release failed: {error}")
    return {"deal_id": deal_id, "milestone_id": milestone_id, "status": "RELEASED"}


@router.post("/{deal_id}/milestones/{milestone_id}/dispute")
async def dispute_milestone(deal_id: str, milestone_id: str, body: DisputeRequest, request: Request):
    """Buyer raises a dispute on a single delivered milestone. Only that milestone is
    put on hold; the rest of the deal is unaffected."""
    db = get_database()
    current_user = await get_user_from_token(request, db)
    if not current_user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    deal = await get_deal_or_404(deal_id, db)
    if not _is_milestone_deal(deal):
        raise HTTPException(status_code=400, detail="This is not a milestone deal")
    assert_participant(deal, str(current_user.user_id), role="client")
    m = _find_milestone(deal, milestone_id)
    if not m:
        raise HTTPException(status_code=404, detail="Milestone not found")
    if m["status"] != "DELIVERED":
        raise HTTPException(status_code=400, detail="You can only dispute a milestone after it has been delivered")

    now = utcnow()
    dispute = {
        "raised_by": str(current_user.user_id),
        "raised_by_email": current_user.email,
        "raised_by_name": current_user.name or current_user.email,
        "reason": body.reason,
        "raised_at": now,
        "resolved_at": None,
        "resolution": None,
    }
    await _set_milestone_fields(db, deal_id, milestone_id, {"status": "DISPUTED", "dispute": dispute})
    child_deal_id = m.get("child_transaction_id") or f"{deal_id}-{milestone_id}"
    await db.transactions.update_one(
        {"deal_id": child_deal_id},
        {"$set": {"status": "DISPUTED", "dispute": dispute, "updated_at": now}},
    )
    await _recompute_parent_status(db, deal_id)
    logger.info(f"[MILESTONE_DEAL] {child_deal_id} disputed by {current_user.email}: {body.reason[:80]}")

    fresh = await db.transactions.find_one({"deal_id": deal_id})
    import email_service
    asyncio.create_task(_fire_email(email_service.send_milestone_disputed(
        fresh or deal, _find_milestone(fresh or deal, milestone_id) or m,
        (fresh or deal).get("client_name") or deal["client_email"],
        (fresh or deal).get("freelancer_name") or deal["freelancer_email"],
        body.reason, current_user.name or current_user.email, ADMIN_DISPUTE_EMAIL,
    )))

    return {"deal_id": deal_id, "milestone_id": milestone_id, "status": "DISPUTED"}


@router.get("/")
async def list_deals(request: Request):
    db = get_database()
    current_user = await get_user_from_token(request, db)
    if not current_user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    user_id = str(current_user.user_id)
    cursor = db.transactions.find(
        {
            # Both single-payment Smart Deals and milestone Smart Deals; never the
            # per-milestone child docs (DIGITAL_WORK_MILESTONE_ITEM).
            "deal_type": {"$in": ["DIGITAL_WORK", "DIGITAL_WORK_MILESTONE"]},
            "$or": [{"client_id": user_id}, {"freelancer_id": user_id}],
        },
        {
            "deal_id": 1, "title": 1, "amount": 1, "currency": 1, "status": 1,
            "client_email": 1, "freelancer_email": 1, "created_at": 1,
            "deal_type": 1, "milestones": 1,
        },
    ).sort("created_at", -1).limit(50)

    deals = []
    async for deal in cursor:
        deal["_id"] = str(deal["_id"])
        # Summarise milestone progress for the list view ("2 of 3 released").
        milestones = deal.pop("milestones", None)
        if milestones is not None:
            deal["milestone_count"] = len(milestones)
            deal["milestones_released"] = sum(1 for m in milestones if m.get("status") == "RELEASED")
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
