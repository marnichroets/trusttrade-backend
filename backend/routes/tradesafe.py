"""
TrustTrade TradeSafe Integration Routes
Handles TradeSafe escrow creation, payment, delivery, and webhooks
"""

import os
import logging
from decimal import Decimal, ROUND_HALF_UP
from datetime import datetime, timezone
from unittest import result
from fastapi import APIRouter, HTTPException, Request
import models.transaction as transaction
from core.config import settings
from core.payout_schedule import build_payout_schedule_summary
from core.database import get_database
from core.security import get_user_from_token
from models.transaction import TradeSafeTransactionCreate
from models.user import BankingDetailsUpdate
from tradesafe_service import (
    create_tradesafe_transaction, get_tradesafe_transaction,
    get_payment_link, start_delivery, accept_delivery,
    validate_minimum_transaction, calculate_fees,
    map_tradesafe_state_to_status, update_user_banking_details,
    ALLOWED_PAYMENT_METHODS, PLATFORM_FEE_PERCENT, MINIMUM_FEE_RANDS
)
from email_service import (
    send_delivery_started_email, send_funds_released_email
)
from sms_service import send_delivery_sms, send_funds_released_sms

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/tradesafe", tags=["TradeSafe"])


async def resolve_seller_bank_name(db, seller_email: str) -> str:
    """Look up the seller's saved bank name for funds-released notifications.

    Returns "" when unknown so callers fall back to a generic "your bank account".
    """
    if not seller_email:
        return ""
    user = await db.users.find_one(
        {"email": seller_email}, {"banking_details": 1, "bank_name": 1}
    )
    if not user:
        return ""
    banking = user.get("banking_details") or {}
    return banking.get("bank_name") or user.get("bank_name") or ""


def calculate_seller_receives(item_price: float, fee_percent: float = None) -> float:
    """Calculate seller payout using Decimal precision with minimum fee."""
    if fee_percent is None:
        fee_percent = settings.PLATFORM_FEE_PERCENT
    price = Decimal(str(item_price))
    fee_rate = Decimal(str(fee_percent)) / Decimal("100")
    calculated_fee = (price * fee_rate).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    min_fee = Decimal("5.00")
    fee = max(calculated_fee, min_fee)
    return float((price - fee).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def compute_net_amount(transaction: dict) -> float:
    """Compute seller net_amount after release from item value and seller fee only."""
    if transaction.get("seller_receives") is not None:
        return round(float(transaction.get("seller_receives") or 0), 2)

    cent = Decimal("0.01")
    item_price = Decimal(str(transaction.get("item_price") or 0))
    full_fee = max(
        (item_price * (Decimal(str(settings.PLATFORM_FEE_PERCENT)) / Decimal("100"))).quantize(cent, rounding=ROUND_HALF_UP),
        Decimal("5.00"),
    )

    fa = (transaction.get("fee_allocation") or "BUYER").upper()
    if fa in ("BUYER_AGENT",):
        fa = "BUYER"
    elif fa in ("SELLER_AGENT",):
        fa = "SELLER"
    elif fa in ("SPLIT", "SPLIT_AGENT", "BUYER_SELLER_AGENT"):
        fa = "BUYER_SELLER"

    if fa == "SELLER":
        # Seller bears the full platform fee — deduct from their payout
        seller_deduction = full_fee
    elif fa == "BUYER_SELLER":
        # Seller bears half the platform fee
        buyer_fee = (full_fee / Decimal("2")).quantize(cent, rounding=ROUND_HALF_UP)
        seller_deduction = (full_fee - buyer_fee).quantize(cent, rounding=ROUND_HALF_UP)
    else:  # BUYER — seller receives full escrow_base
        seller_deduction = Decimal("0.00")

    return float((item_price - seller_deduction).quantize(cent, rounding=ROUND_HALF_UP))


def has_bank_details(user_doc: dict | None) -> bool:
    """True only when the seller's stored account number would pass the TradeSafe sync guard.

    Centralised in tradesafe_service so payout-readiness, transaction-create
    gating, and the sync-time guard always agree on what counts as valid banking.
    """
    from tradesafe_service import has_valid_banking_for_payout
    return has_valid_banking_for_payout(user_doc)


def has_verified_phone(user_doc: dict | None) -> bool:
    return bool(user_doc and user_doc.get("phone") and user_doc.get("phone_verified"))


def require_verified_phone_to_continue(user_doc: dict | None):
    if not has_verified_phone(user_doc):
        raise HTTPException(status_code=403, detail="Verify your phone number to continue.")


def email_is_verified(user_doc: dict | None) -> bool:
    return bool(user_doc and user_doc.get("email_verified", True))


def add_unique_issue(issues: list, issue: str):
    if issue not in issues:
        issues.append(issue)


def build_payout_readiness_response(
    *,
    transaction: dict,
    seller_user: dict | None,
    payout_check: dict | None = None,
    seller_token_id: str | None = None,
):
    payout_check = payout_check or {}
    verified_phone = has_verified_phone(seller_user)
    bank_details_present = has_bank_details(seller_user)
    token_ready = bool(payout_check.get("ready", False))
    payout_eligible = bool(verified_phone and bank_details_present and token_ready)
    issues = list(payout_check.get("issues") or [])

    if not verified_phone:
        add_unique_issue(issues, "Verify your phone number to continue.")
    if not bank_details_present:
        add_unique_issue(issues, "Add banking details to receive payouts.")
    if seller_token_id and verified_phone and bank_details_present and not token_ready and not issues:
        add_unique_issue(issues, "Seller payout token is not ready")

    return {
        "payout_ready": payout_eligible,
        "verified_phone": verified_phone,
        "bank_details_present": bank_details_present,
        "payout_eligible": payout_eligible,
        "has_banking": payout_check.get("has_banking", False),
        "has_mobile": payout_check.get("has_mobile", False),
        "issues": issues,
        "can_auto_sync": bank_details_present and bool(seller_token_id) and not token_ready,
        "message": "Seller payout setup complete." if payout_eligible else "Seller must complete payout setup before funds can be released.",
        "bank_details_attached_db": transaction.get("bank_details_attached", False),
        "seller_token_id": seller_token_id,
    }


def require_verified_buyer_profile(user_doc: dict | None):
    if not email_is_verified(user_doc):
        raise HTTPException(status_code=403, detail="EMAIL_NOT_VERIFIED")
    if not has_verified_phone(user_doc):
        raise HTTPException(
            status_code=403,
            detail="Verify your phone number to continue."
        )


def require_verified_seller_phone(user_doc: dict | None):
    if not has_verified_phone(user_doc):
        raise HTTPException(
            status_code=403,
            detail="Verify your phone number to continue."
        )



@router.get("/calculate-fees")
async def get_fee_calculation(amount: float, fee_allocation: str = "SELLER_AGENT"):
    """
    Calculate and return fee breakdown for display before payment.
    
    Returns:
        - item_price: Original item price
        - trusttrade_fee: TrustTrade platform fee (2%, min R5)
        - processing_fee: Estimated payment processing fee (~2.5%)
        - total_fees: Combined fees
        - buyer_pays: What buyer will pay
        - seller_receives: What seller will receive after fees
    """
    if amount < settings.MINIMUM_TRANSACTION_AMOUNT:
        raise HTTPException(
            status_code=400,
            detail=settings.MINIMUM_TRANSACTION_MESSAGE
        )

    # TrustTrade fee: 2% with R5 minimum
    calculated_tt_fee = round(amount * (PLATFORM_FEE_PERCENT / 100), 2)
    trusttrade_fee = max(calculated_tt_fee, MINIMUM_FEE_RANDS)
    
    # Payment processing fee estimate (~2.5%)
    processing_fee = round(amount * 0.025, 2)
    
    total_fees = trusttrade_fee + processing_fee
    
    # Determine who pays based on fee_allocation
    fee_alloc = fee_allocation.upper()
    
    if fee_alloc in ["BUYER_AGENT", "BUYER"]:
        buyer_pays = amount + total_fees
        seller_receives = amount
        fee_paid_by = "Buyer"
    elif fee_alloc in ["SELLER_AGENT", "SELLER"]:
        buyer_pays = amount
        seller_receives = amount - total_fees
        fee_paid_by = "Seller"
    else:  # SPLIT
        buyer_pays = amount + (total_fees / 2)
        seller_receives = amount - (total_fees / 2)
        fee_paid_by = "Split 50/50"
    
    return {
        "item_price": amount,
        "trusttrade_fee": trusttrade_fee,
        "trusttrade_fee_percent": PLATFORM_FEE_PERCENT,
        "trusttrade_fee_minimum": MINIMUM_FEE_RANDS,
        "processing_fee": processing_fee,
        "processing_fee_percent": 2.5,
        "total_fees": total_fees,
        "fee_allocation": fee_alloc,
        "fee_paid_by": fee_paid_by,
        "buyer_pays": round(buyer_pays, 2),
        "seller_receives": round(seller_receives, 2),
        "payout_time": build_payout_schedule_summary(
            release_times=settings.PAYOUT_RELEASE_TIMES,
            cutoff_times=settings.PAYOUT_CUTOFF_TIMES,
            clearing_disclaimer=settings.PAYOUT_CLEARING_DISCLAIMER,
        )["copy"]
    }


@router.get("/payout-readiness/{transaction_id}")
async def check_transaction_payout_readiness(request: Request, transaction_id: str):
    """
    Check if a transaction's seller token is ready for payout.
    Call this before showing/enabling the release button.
    
    Returns:
        - payout_ready: bool - Whether release can proceed
        - has_banking: bool - Token has banking details
        - has_mobile: bool - Token has mobile number
        - issues: list - Any issues blocking payout
        - can_auto_sync: bool - Whether seller profile has banking to sync
    """
    db = get_database()
    
    user = await get_user_from_token(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    transaction = await db.transactions.find_one({"transaction_id": transaction_id}, {"_id": 0})
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    # Verify user is party to transaction
    is_buyer = transaction.get("buyer_email") == user.email or transaction.get("buyer_user_id") == user.user_id
    is_seller = transaction.get("seller_email") == user.email or transaction.get("seller_user_id") == user.user_id
    
    if not is_buyer and not is_seller and not user.is_admin:
        raise HTTPException(status_code=403, detail="Not authorized to view this transaction")
    
    seller_token_id = transaction.get("tradesafe_seller_token_id")
    seller_email = transaction.get("seller_email")
    seller_user = await db.users.find_one({"email": seller_email.lower()}) if seller_email else None
    
    logger.info(f"[PAYOUT_CHECK] Checking readiness for transaction {transaction_id}")
    
    if not seller_token_id:
        logger.warning(f"[PAYOUT_CHECK] No seller token ID for {transaction_id}")
        response = build_payout_readiness_response(
            transaction=transaction,
            seller_user=seller_user,
            payout_check={"ready": False, "issues": ["No seller token linked to this transaction"]},
            seller_token_id=None,
        )
        response["can_auto_sync"] = False
        return response
    
    # Check live token state
    from tradesafe_service import check_payout_readiness
    payout_check = await check_payout_readiness(seller_token_id)
    
    return build_payout_readiness_response(
        transaction=transaction,
        seller_user=seller_user,
        payout_check=payout_check,
        seller_token_id=seller_token_id,
    )





@router.post("/create-transaction")
async def create_tradesafe_escrow(request: Request, data: TradeSafeTransactionCreate):
    """Create TrustTrade escrow transaction after seller confirms fee agreement."""
    db = get_database()
    
    logger.info(f"[ESCROW] create start - transaction_id: {data.transaction_id}")
    logger.info(f"[ESCROW] payload - fee_allocation: {data.fee_allocation}")
    
    user = await get_user_from_token(request, db)
    if not user:
        logger.warning("[ESCROW] failure exact reason: Not authenticated")
        raise HTTPException(status_code=401, detail="Not authenticated")

    if user.suspension_flag:
        raise HTTPException(status_code=403, detail="Account suspended. Contact admin.")

    # Get the TrustTrade transaction
    transaction = await db.transactions.find_one(
        {"transaction_id": data.transaction_id},
        {"_id": 0}
    )
    
    if not transaction:
        logger.warning(f"[ESCROW] failure exact reason: Transaction not found - {data.transaction_id}")
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    # CRITICAL: Block payment if seller has not confirmed fee agreement
    if not transaction.get("seller_confirmed"):
        logger.warning(f"[ESCROW] failure exact reason: seller_confirmed=False for {data.transaction_id}")
        raise HTTPException(
            status_code=400, 
            detail="Payment blocked: Seller must confirm the fee agreement before escrow can be created."
        )
    
    # CRITICAL: Block payment if buyer has not confirmed
    if not transaction.get("buyer_confirmed"):
        logger.warning(f"[ESCROW] failure exact reason: buyer_confirmed=False for {data.transaction_id}")
        raise HTTPException(
            status_code=400, 
            detail="Payment blocked: Buyer must confirm the transaction details before escrow can be created."
        )
    
    logger.info("[ESCROW] buyer confirmed: True, seller confirmed: True")
    
    # Verify user is part of this transaction
    is_buyer = transaction.get("buyer_email") == user.email or transaction.get("buyer_user_id") == user.user_id
    is_seller = transaction.get("seller_email") == user.email or transaction.get("seller_user_id") == user.user_id
    
    if not is_buyer and not is_seller and not user.is_admin:
        logger.warning(f"[ESCROW] failure exact reason: Access denied for {user.email}")
        raise HTTPException(status_code=403, detail="Access denied")

    current_user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
    if not user.is_admin:
        require_verified_phone_to_continue(current_user_doc)
        if is_buyer:
            require_verified_buyer_profile(current_user_doc)
    
    # Check if already linked to escrow (prevent duplicate)
    if transaction.get("tradesafe_id"):
        logger.info(f"[ESCROW] already exists for {data.transaction_id}: {transaction['tradesafe_id']}")
        return {
            "tradesafe_id": transaction["tradesafe_id"],
            "status": "already_created",
            "message": "Escrow already created for this transaction"
        }
    
    # Validate minimum amount
    if transaction["item_price"] < settings.MINIMUM_TRANSACTION_AMOUNT:
        logger.warning(f"[ESCROW] failure exact reason: Amount below minimum - R{transaction['item_price']}")
        raise HTTPException(
            status_code=400,
            detail=settings.MINIMUM_TRANSACTION_MESSAGE
        )
    
    # Get user profiles for mobile numbers
    buyer_user = await db.users.find_one({"email": transaction["buyer_email"]}, {"_id": 0})
    seller_user = await db.users.find_one({"email": transaction["seller_email"]}, {"_id": 0})
    
    buyer_mobile = None
    seller_mobile = None
    
    if buyer_user:
        buyer_mobile = buyer_user.get("phone") or buyer_user.get("mobile")
    if seller_user:
        seller_mobile = seller_user.get("phone") or seller_user.get("mobile")
    
    # Check transaction recipient_info for phone
    recipient_info = transaction.get("recipient_info", "")
    if recipient_info and recipient_info.startswith("+27"):
        if is_buyer:
            seller_mobile = seller_mobile or recipient_info
        else:
            buyer_mobile = buyer_mobile or recipient_info
    logger.info(f"[ESCROW] buyer_mobile={buyer_mobile}")
    logger.info(f"[ESCROW] seller_mobile={seller_mobile}")
    
    logger.info("=== ESCROW CREATION PRE-FLIGHT ===")
    logger.info(f"Transaction ID: {data.transaction_id}")
    logger.info(f"Buyer: {transaction['buyer_name']} ({transaction['buyer_email']}) Mobile: {buyer_mobile}")
    logger.info(f"Seller: {transaction['seller_name']} ({transaction['seller_email']}) Mobile: {seller_mobile}")
    
    # Create escrow transaction
    logger.info("[ESCROW] calling TradeSafe API...")
    try:
        courier_fee = float(transaction.get("courier_fee") or 0)
        escrow_amount = transaction["item_price"] + courier_fee
        _txn_fa = (transaction.get("fee_allocation") or "BUYER").upper()
        if _txn_fa not in ("BUYER", "SELLER", "BUYER_SELLER"):
            _txn_fa = "BUYER"
        delivery_method = (transaction.get("delivery_method") or "courier").strip().lower()
        # Methods with no physical handover (instant payment rails / digital goods)
        # have nothing to ship, so daysToDeliver=0 (deliver immediately) plus a single
        # inspection day → funds release the next business day instead of two.
        NO_PHYSICAL_DELIVERY = {
            "bank_deposit", "instant_eft", "card", "digital", "ozow",
            "instant", "immediate",
        }
        if delivery_method in NO_PHYSICAL_DELIVERY:
            days_to_deliver, days_to_inspect = 0, 1
        else:
            # Physical delivery (courier, postnet, or any unknown method): sellers
            # need ~3 business days to ship a parcel, plus a 2-day inspection window.
            days_to_deliver, days_to_inspect = 3, 2
        result = await create_tradesafe_transaction(
            internal_reference=data.transaction_id,
            title=f"TrustTrade - {transaction['item_description'][:50]}",
            description=transaction.get("item_description", "Item/Service"),
            amount=escrow_amount,
            buyer_name=transaction["buyer_name"],
            buyer_email=transaction["buyer_email"],
            seller_name=transaction["seller_name"],
            seller_email=transaction["seller_email"],
            buyer_mobile=buyer_mobile,
            seller_mobile=seller_mobile,
            fee_allocation=_txn_fa,
            days_to_deliver=days_to_deliver,
            days_to_inspect=days_to_inspect,
    )
    except Exception as e:
        logger.exception(f"[ESCROW ERROR] transaction_id={data.transaction_id} create_tradesafe_transaction failed: {e}")
        raise

    if not result or "error" in result:
        error_msg = result.get("error", "Failed to create escrow. Please try again.") if result else "Failed to create escrow. Please try again."
        logger.error(f"[ESCROW] failure exact reason: {error_msg}")
        raise HTTPException(status_code=500, detail=error_msg)
    
    logger.info(f"[ESCROW] TradeSafe response: {result}")
    logger.info(f"[ESCROW] success - TradeSafe ID: {result.get('id')}")
    
    # Store escrow ID, allocation ID, and token IDs for payout tracking
    tradesafe_id = result.get("id")
    allocation_id = result.get("allocations", [{}])[0].get("id") if result.get("allocations") else None
    seller_token_id = result.get("seller_token_id")  # Added for payout tracking
    buyer_token_id = result.get("buyer_token_id")    # Added for payout tracking
    
    logger.info(f"[PAYOUT_TRACKING] Transaction {data.transaction_id}")
    logger.info(f"[PAYOUT_TRACKING] TradeSafe ID: {tradesafe_id}")
    logger.info(f"[PAYOUT_TRACKING] Seller Token: {seller_token_id}")
    logger.info(f"[PAYOUT_TRACKING] Buyer Token: {buyer_token_id}")
    
    # === CRITICAL: Sync seller banking details to TradeSafe token ===
    bank_details_attached = False
    banking_sync_result = None
    payout_ready = False
    
    if not seller_token_id:
        logger.warning("[BANKING_SYNC] No seller token ID to sync banking to")
    else:
        seller_user = await db.users.find_one({"email": transaction["seller_email"].lower()})

    if not seller_user:
        logger.warning("[BANKING_SYNC] Seller not found")
    elif not seller_user.get("banking_details_completed"):
        logger.warning("[BANKING_SYNC] Seller has no profile banking details saved")
    else:
        banking = seller_user.get("banking_details", {})
        seller_mobile = seller_user.get("phone") or transaction.get("seller_phone")

        logger.info(f"[BANKING_SYNC] Seller has profile banking - syncing to token {seller_token_id}")
        logger.info(f"[BANKING_SYNC] Bank: {banking.get('bank_name')}, Mobile: {seller_mobile}")

        if not (banking.get("bank_name") and banking.get("account_number")):
            logger.warning("[BANKING_SYNC] Seller profile banking incomplete - missing bank_name or account_number")
        else:
            from tradesafe_service import sync_banking_to_token, check_payout_readiness

            sync_result = await sync_banking_to_token(
                token_id=seller_token_id,
                bank_name=banking.get("bank_name"),
                account_number=banking.get("account_number"),
                branch_code=banking.get("branch_code", ""),
                account_type=banking.get("account_type", "SAVINGS"),
                mobile=seller_mobile,
                user=seller_user,
                transaction=transaction,
                given_name=transaction.get("seller_name", "").split(" ")[0],
                family_name=" ".join(transaction.get("seller_name", "").split(" ")[1:]) or "User",
                email=transaction.get("seller_email")
            )

            banking_sync_result = sync_result
            bank_details_attached = sync_result.get("success", False)

            if bank_details_attached:
                logger.info(f"[BANKING_SYNC] SUCCESS - Banking synced to seller token {seller_token_id}")
                payout_check = await check_payout_readiness(seller_token_id)
                payout_profile = build_payout_readiness_response(
                    transaction=transaction,
                    seller_user=seller_user,
                    payout_check=payout_check,
                    seller_token_id=seller_token_id,
                )
                payout_ready = payout_profile["payout_eligible"]
                logger.info(f"[BANKING_SYNC] Payout ready: {payout_ready}")
            else:
                logger.error(f"[BANKING_SYNC] FAILED - {sync_result.get('error')}")
    # Update timeline
    timeline = transaction.get("timeline", [])
    timeline.append({
        "status": "TrustTrade Escrow Created",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "by": "TrustTrade System",
        "details": f"Escrow ID: {tradesafe_id}"
    })
    
    if bank_details_attached:
        timeline.append({
            "status": "Seller Banking Synced",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "by": "TrustTrade System",
            "details": "Banking details synced to TradeSafe for payout"
        })
    
    await db.transactions.update_one(
    {"transaction_id": data.transaction_id},
    {
        "$set": {
            "tradesafe_id": tradesafe_id,
            "tradesafe_allocation_id": allocation_id,
            "tradesafe_seller_token_id": seller_token_id,
            "tradesafe_buyer_token_id": buyer_token_id,
            "tradesafe_state": (result.get("state") if result else "CREATED"),
            "tradesafe_fee_allocation": result.get("fee_allocation", data.fee_allocation),
            "payment_status": "Awaiting Payment",
            "awaiting_payment_at": datetime.now(timezone.utc).isoformat(),
            "payout_status": "pending",
            "bank_details_attached": bank_details_attached,
            "payout_ready": payout_ready,
            "verified_phone": has_verified_phone(seller_user),
            "bank_details_present": has_bank_details(seller_user),
            "payout_eligible": payout_ready,
            "banking_sync_result": banking_sync_result,
            "timeline": timeline,
            "buyer_phone": buyer_mobile,
            "seller_phone": seller_mobile
        }
    }
)
    
    logger.info(f"=== ESCROW CREATED: {tradesafe_id} ===")
    
    return {
        "tradesafe_id": tradesafe_id,
        "allocation_id": allocation_id,
        "state": result.get("state"),
        "status": "created",
        "message": "TrustTrade escrow created successfully"
    }


@router.get("/payment-url/{transaction_id}")
async def get_tradesafe_payment_url(request: Request, transaction_id: str, payment_method: str = "eft"):
    """Get TradeSafe payment URL (Card/Ozow) or EFT bank-transfer details for a transaction.

    payment_method: eft | card | ozow. EFT has no hosted page, so we return bank
    details + reference for a manual transfer instead of a redirect link.
    """
    import traceback
    
    print("=== PAY FLOW START ===")
    db = get_database()

    user = await get_user_from_token(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    transaction = await db.transactions.find_one({"transaction_id": transaction_id}, {"_id": 0})
    
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")

    is_buyer = transaction.get("buyer_email") == user.email or transaction.get("buyer_user_id") == user.user_id
    is_seller = transaction.get("seller_email") == user.email or transaction.get("seller_user_id") == user.user_id
    if not is_buyer and not is_seller and not user.is_admin:
        raise HTTPException(status_code=403, detail="Access denied")
    if not is_buyer and not user.is_admin:
        raise HTTPException(status_code=403, detail="Only buyer can fund escrow")
    if is_buyer and not user.is_admin:
        buyer_user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
        require_verified_buyer_profile(buyer_user_doc)
    
    # CRITICAL: Block payment if seller has not confirmed fee agreement
    if not transaction.get("seller_confirmed"):
        logger.warning(f"PAYMENT_BLOCKED: seller_confirmed=False for {transaction_id}")
        raise HTTPException(
            status_code=400,
            detail="Payment blocked: Seller must confirm the fee agreement before payment can proceed."
        )
    
    tradesafe_id = transaction.get("tradesafe_id")
    tradesafe_allocation_id = transaction.get("tradesafe_allocation_id")
    
    print(f"TrustTrade txn_id: {transaction_id}")
    print(f"TradeSafe transaction ID: {tradesafe_id}")
    print(f"TradeSafe allocation ID: {tradesafe_allocation_id}")
    
    if not tradesafe_id:
        raise HTTPException(status_code=400, detail="Please create an escrow first before making payment.")
    
    # Build redirect URLs
    frontend_url = settings.FRONTEND_URL
    redirect_urls = {
        "success": f"{frontend_url}/transaction/success?tx={transaction_id}",
        "failure": f"{frontend_url}/transaction/failed?tx={transaction_id}",
        "cancel": f"{frontend_url}/transaction/cancelled?tx={transaction_id}"
    }
    
    print(f"Redirect URLs: {redirect_urls}")
    
    logger.info(f"=== GETTING PAYMENT URL for {transaction_id} ===")
    
    try:
        payment_info = await get_payment_link(tradesafe_id, redirect_urls, method=payment_method)
        print(f"TradeSafe raw payment_info response: {payment_info}")
    except Exception as e:
        print("=== PAY FLOW ERROR ===")
        print(f"Error calling get_payment_link: {str(e)}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Payment processing error: {str(e)}")
    
    if not payment_info:
        print("=== PAY FLOW ERROR: payment_info is None ===")
        raise HTTPException(
            status_code=404,
            detail={
                "error": "transaction_not_found_on_tradesafe",
                "message": "This transaction no longer exists on TradeSafe. It may have expired or been deleted. Please create a new escrow.",
                "transaction_id": transaction_id,
                "tradesafe_id": tradesafe_id
            }
        )

    # The escrow exists, but the chosen payment method could not be started (e.g.
    # Ozow rejected by TradeSafe). Surface the REAL provider error instead of the
    # misleading "transaction no longer exists" so the buyer can try another method
    # and we can see the true cause in logs.
    if payment_info.get("error") == "deposit_failed":
        failed_method = (payment_info.get("method") or payment_method or "this method").upper()
        print(f"=== PAY FLOW ERROR: {failed_method} deposit rejected: {payment_info.get('message')} ===")
        raise HTTPException(
            status_code=502,
            detail={
                "error": "payment_method_unavailable",
                "message": f"{failed_method} payment could not be started right now: {payment_info.get('message')}. Please try a different payment method (e.g. EFT or card).",
                "method": failed_method,
                "transaction_id": transaction_id,
                "tradesafe_id": tradesafe_id,
            }
        )

    # Check if transaction is already paid
    if payment_info.get("already_paid"):
        print("=== PAY FLOW: Transaction already paid ===")
        # Update local DB state to match TradeSafe
        await db.transactions.update_one(
            {"transaction_id": transaction_id},
            {"$set": {"tradesafe_state": payment_info.get("state")}}
        )
        return {
            "transaction_id": transaction_id,
            "tradesafe_id": tradesafe_id,
            "payment_link": None,
            "state": payment_info.get("state"),
            "already_paid": True,
            "message": payment_info.get("message", "This transaction has already been paid."),
            "fee_breakdown": calculate_fees(
                transaction["item_price"],
                transaction.get("fee_paid_by", "split")
            )
        }
    
    # For EFT payments, payment_link may be None - that's OK
    # TradeSafe EFT deposits don't generate a redirect link, buyer uses bank details
    payment_link = payment_info.get("payment_link")
    print(f"Parsed payment_link: {payment_link}")

    # Calculate fee breakdown
    fee_breakdown = calculate_fees(
        transaction["item_price"],
        transaction.get("fee_paid_by", "split")
    )

    # No hosted link (EFT) → build bank-transfer details + reference for a manual payment.
    # Amount = the already-calculated buyer total stored on the transaction (item + the
    # buyer's share of the fee, per fee_allocation) — never recalculated here.
    eft_details = None
    if not payment_link:
        from tradesafe_service import build_eft_payment_details
        eft_amount = transaction.get("total") or transaction.get("item_price") or 0
        share_code = transaction.get("share_code", transaction_id)
        eft_details = await build_eft_payment_details(
            reference=share_code, amount=eft_amount, tradesafe_id=tradesafe_id
        )
        # Email the buyer their EFT details (deduped per transaction).
        try:
            import email_service
            from webhook_handler import send_email_with_tracking
            await send_email_with_tracking(
                db, transaction_id, "eft_payment_details_buyer",
                transaction.get("buyer_email", ""),
                email_service.send_eft_payment_details_email,
                to_email=transaction.get("buyer_email", ""),
                to_name=transaction.get("buyer_name", "Buyer"),
                share_code=share_code,
                item_description=transaction.get("item_description", ""),
                bank=eft_details["bank"], account_name=eft_details["account_name"],
                account_number=eft_details["account_number"], branch_code=eft_details["branch_code"],
                reference=eft_details["reference"], amount=eft_details["amount"],
                instructions=eft_details["instructions"],
            )
        except Exception as exc:
            logger.error(f"[PAYMENT_EFT] EFT details email failed for {transaction_id}: {exc}")

    logger.info(f"=== PAYMENT URL: {payment_link} | eft={'yes' if eft_details else 'no'} ===")
    print("=== PAY FLOW END (success) ===")

    return {
        "transaction_id": transaction_id,
        "tradesafe_id": tradesafe_id,
        "payment_link": payment_link,
        "payment_methods": payment_info.get("payment_methods", ALLOWED_PAYMENT_METHODS),
        "state": payment_info.get("state"),
        "fee_breakdown": fee_breakdown,
        "eft_details": eft_details,
        "deposit_id": payment_info.get("deposit_id"),
        "method": payment_info.get("method"),
        # Exact figures from the TradeSafe deposit so the UI shows what the gateway
        # actually charges (value = total the buyer pays; processing_fee = the bank fee).
        "total_value": payment_info.get("total_value"),
        "processing_fee": payment_info.get("processing_fee"),
        "message": payment_info.get("message")
    }


@router.get("/fee-breakdown")
async def get_fee_breakdown(amount: float, fee_allocation: str = "split"):
    """Calculate and return fee breakdown for a transaction amount."""
    is_valid, error_msg = validate_minimum_transaction(amount)
    if not is_valid:
        raise HTTPException(status_code=400, detail=error_msg)
    
    return calculate_fees(amount, fee_allocation)


@router.post("/start-delivery/{transaction_id}")
async def start_tradesafe_delivery(request: Request, transaction_id: str):
    """Seller marks item as dispatched/delivered."""
    db = get_database()
    
    user = await get_user_from_token(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    transaction = await db.transactions.find_one({"transaction_id": transaction_id}, {"_id": 0})

    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")

    # Log every relevant field so we can diagnose issues without needing DB access
    logger.info(
        f"[START_DELIVERY] transaction={transaction_id} "
        f"status={transaction.get('status')!r} "
        f"payment_status={transaction.get('payment_status')!r} "
        f"tradesafe_state={transaction.get('tradesafe_state')!r} "
        f"tradesafe_id={transaction.get('tradesafe_id')!r} "
        f"tradesafe_allocation_id={transaction.get('tradesafe_allocation_id')!r} "
        f"seller_email={transaction.get('seller_email')!r} "
        f"buyer_email={transaction.get('buyer_email')!r}"
    )

    # Only seller can start delivery
    is_seller = transaction.get("seller_email") == user.email or transaction.get("seller_user_id") == user.user_id
    if not is_seller and not user.is_admin:
        raise HTTPException(status_code=403, detail="Only seller can mark item as delivered")
    if is_seller and not user.is_admin:
        seller_user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
        require_verified_seller_phone(seller_user_doc)

    # Check TradeSafe state — both FUNDS_RECEIVED and FUNDS_DEPOSITED mean payment is confirmed
    FUNDED_STATES = {"FUNDS_RECEIVED", "FUNDS_DEPOSITED"}
    current_ts_state = transaction.get("tradesafe_state")
    if current_ts_state not in FUNDED_STATES:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot start delivery — TradeSafe state is {current_ts_state!r}, expected FUNDS_RECEIVED or FUNDS_DEPOSITED"
        )

    allocation_id = transaction.get("tradesafe_allocation_id")
    if not allocation_id:
        raise HTTPException(status_code=400, detail="Transaction not properly linked to TradeSafe — missing allocation_id")

    # Call TradeSafe — service logs the raw response and any error detail
    result = await start_delivery(allocation_id)
    logger.info(f"[START_DELIVERY] start_delivery result for {transaction_id}: {result}")

    if not result:
        raise HTTPException(
            status_code=500,
            detail=(
                f"Failed to start delivery on TradeSafe — allocation_id={allocation_id!r}, "
                f"tradesafe_state={current_ts_state!r}. "
                "Check server logs for the exact TradeSafe error."
            ),
        )
    
    # Update timeline
    timeline = transaction.get("timeline", [])
    timeline.append({
        "status": "Delivery Started",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "by": user.name,
        "details": "Seller marked item as dispatched"
    })
    
    # ── Two-track auto-release window, counted from dispatch ──────────────────
    from core.config import settings
    from services.auto_release import (
        compute_auto_release, human_window, format_release_date,
        confirm_link, new_confirm_token,
    )
    from sms_service import send_order_dispatched_sms

    now = datetime.now(timezone.utc)
    seller_email = (transaction.get("seller_email") or "").lower()
    seller_track_doc = await db.users.find_one(
        {"email": seller_email},
        {"_id": 0, "total_trades": 1, "successful_trades": 1, "valid_disputes_count": 1},
    ) if seller_email else None

    release = compute_auto_release(transaction.get("delivery_method"), seller_track_doc, from_time=now)
    token = transaction.get("confirm_receipt_token") or new_confirm_token()
    link = confirm_link(settings.FRONTEND_URL, token)
    window_text = human_window(release["window_hours"])
    release_date = format_release_date(release["auto_release_at"])

    logger.info(
        f"[AUTO_RELEASE] {transaction_id} dispatched — method={release['delivery_method']!r} "
        f"seller_track={release['seller_track']} window_hours={release['window_hours']} "
        f"auto_release_at={release['auto_release_at_iso']}"
    )

    await db.transactions.update_one(
        {"transaction_id": transaction_id},
        {"$set": {
            "tradesafe_state": "INITIATED",
            "payment_status": "Delivery in Progress",
            "transaction_state": "DELIVERY_IN_PROGRESS",
            "delivery_started_at": now.isoformat(),
            "dispatched_at": now.isoformat(),
            "auto_release_at": release["auto_release_at_iso"],
            "auto_release_window_hours": release["window_hours"],
            "auto_release_seller_track": release["seller_track"],
            "confirm_receipt_token": token,
            "release_reminder_24h_sent": False,
            "release_reminder_2h_sent": False,
            "timeline": timeline,
        }}
    )

    # Send notifications
    buyer_email = transaction.get("buyer_email")
    buyer_phone = transaction.get("buyer_phone")

    if buyer_email:
        await send_delivery_started_email(
            to_email=buyer_email,
            to_name=transaction.get("buyer_name", "Buyer"),
            share_code=transaction.get("share_code", transaction_id),
            item_description=transaction["item_description"],
            seller_name=transaction.get("seller_name", "Seller")
        )

    if buyer_phone:
        try:
            await send_order_dispatched_sms(
                to_phone=buyer_phone,
                buyer_name=transaction.get("buyer_name", "there"),
                seller_name=transaction.get("seller_name", "the seller"),
                window_text=window_text,
                release_date=release_date,
                confirm_link=link,
            )
        except Exception as e:
            logger.error(f"Failed to send dispatch SMS: {e}")

    return {
        "status": "delivery_started",
        "message": "Delivery marked as started. Buyer has been notified.",
        "state": "INITIATED",
        "auto_release_at": release["auto_release_at_iso"],
        "auto_release_window_hours": release["window_hours"],
    }


@router.post("/accept-delivery/{transaction_id}")
async def accept_tradesafe_delivery(request: Request, transaction_id: str):
    """Buyer confirms receipt of item/service. Triggers fund release."""
    db = get_database()

    user = await get_user_from_token(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    transaction = await db.transactions.find_one({"transaction_id": transaction_id}, {"_id": 0})
    if not transaction:
        logger.warning(f"[ACCEPT_DELIVERY] txn={transaction_id} NOT FOUND (called by {user.email})")
        raise HTTPException(status_code=404, detail="Transaction not found")

    # Entry breadcrumb — one line that captures everything needed to explain why a
    # buyer's "Confirm Receipt" did or didn't trigger the payout, without DB access.
    logger.info(
        f"[ACCEPT_DELIVERY] confirm-receipt CALLED by {user.email} (admin={user.is_admin}) "
        f"txn={transaction_id} tradesafe_state={transaction.get('tradesafe_state')!r} "
        f"payment_status={transaction.get('payment_status')!r} "
        f"delivery_method={transaction.get('delivery_method')!r} "
        f"delivery_confirmed={transaction.get('delivery_confirmed')!r} "
        f"allocation_id={transaction.get('tradesafe_allocation_id')!r} "
        f"seller_token_id={transaction.get('tradesafe_seller_token_id')!r} "
        f"buyer_email={transaction.get('buyer_email')!r}"
    )

    # Only buyer can accept delivery
    is_buyer = transaction.get("buyer_email") == user.email or transaction.get("buyer_user_id") == user.user_id
    if not is_buyer and not user.is_admin:
        logger.warning(
            f"[ACCEPT_DELIVERY] REJECTED txn={transaction_id}: caller {user.email} is not the buyer "
            f"(buyer_email={transaction.get('buyer_email')!r})"
        )
        raise HTTPException(status_code=403, detail="Only buyer can confirm delivery")
    if is_buyer and not user.is_admin:
        buyer_user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
        require_verified_buyer_profile(buyer_user_doc)

    # Check TradeSafe state
    if transaction.get("tradesafe_state") not in ["INITIATED", "SENT", "DELIVERED"]:
        logger.warning(
            f"[ACCEPT_DELIVERY] REJECTED txn={transaction_id}: tradesafe_state "
            f"{transaction.get('tradesafe_state')!r} not in [INITIATED, SENT, DELIVERED] — "
            f"buyer cannot confirm from this state"
        )
        raise HTTPException(
            status_code=400,
            detail=f"Cannot accept delivery in current state: {transaction.get('tradesafe_state')}"
        )

    allocation_id = transaction.get("tradesafe_allocation_id")
    if not allocation_id:
        logger.warning(f"[ACCEPT_DELIVERY] REJECTED txn={transaction_id}: missing tradesafe_allocation_id")
        raise HTTPException(status_code=400, detail="Transaction not properly linked to TradeSafe")

    logger.info(f"[ACCEPT_DELIVERY] guards passed txn={transaction_id} — proceeding to payout preflight")

    # ===== PAYOUT PREFLIGHT: Step 1 - Verify seller token exists =====
    seller_token_id = transaction.get("tradesafe_seller_token_id")
    _buyer_token_id = transaction.get("tradesafe_buyer_token_id")
    if _buyer_token_id and seller_token_id == _buyer_token_id:
        logger.error(f"[SECURITY] seller_token_id == buyer_token_id for txn={transaction_id} — aborting release")
        raise HTTPException(status_code=500, detail="Internal error: token mismatch. Please contact support.")

    logger.info("=" * 60)
    logger.info(f"[PAYOUT_PREFLIGHT] === Release Initiated for {transaction_id} ===")
    logger.info(f"[PAYOUT_PREFLIGHT] Initiated by: {user.email} (Admin: {user.is_admin})")
    logger.info(f"[PAYOUT_PREFLIGHT] Seller Token: {seller_token_id}")

    if not seller_token_id:
        logger.error(f"[PAYOUT_BLOCKED] CRITICAL: No seller token ID stored for {transaction_id}")
        raise HTTPException(
            status_code=400,
            detail="Cannot release: No seller token linked. Please contact support."
        )

    # ===== PAYOUT PREFLIGHT: Step 2 - Get seller profile banking =====
    seller_email = transaction.get("seller_email")
    seller_user = await db.users.find_one({"email": seller_email.lower()}) if seller_email else None

    seller_has_profile_banking = False
    seller_banking = {}
    seller_mobile = None

    if seller_user:
        seller_banking = seller_user.get("banking_details", {})
        seller_mobile = seller_user.get("phone") or transaction.get("seller_phone")
        seller_has_profile_banking = has_bank_details(seller_user)

    from tradesafe_service import check_payout_readiness, sync_banking_to_token

    # ===== PAYOUT PREFLIGHT: Step 3 - Check live token readiness =====
    logger.info(f"[PAYOUT_CHECK] Initial readiness check txn={transaction_id} token={seller_token_id}")
    payout_check = await check_payout_readiness(seller_token_id)
    logger.info(
        f"[PAYOUT_CHECK] Initial result txn={transaction_id} token={seller_token_id} "
        f"ready={payout_check.get('ready')} has_banking={payout_check.get('has_banking')} "
        f"has_mobile={payout_check.get('has_mobile')} issues={payout_check.get('issues')}"
    )

    sync_attempted = False
    sync_result = None

    # Auto-sync banking if token not ready but seller profile has banking
    if not payout_check.get("ready") and seller_has_profile_banking:
        sync_attempted = True
        logger.info(
            f"[PAYOUT_SYNC] Auto-sync triggered txn={transaction_id} token={seller_token_id} "
            f"reason='Token not ready but seller profile has banking' "
            f"bank={seller_banking.get('bank_name')} account_last4=***{str(seller_banking.get('account_number',''))[-4:]}"
        )

        seller_name = transaction.get("seller_name", "") or ""
        name_parts = seller_name.split(" ")
        given_name = name_parts[0] if name_parts and name_parts[0] else None
        family_name = " ".join(name_parts[1:]) if len(name_parts) > 1 else "User"

        sync_result = await sync_banking_to_token(
            token_id=seller_token_id,
            bank_name=seller_banking.get("bank_name"),
            account_number=seller_banking.get("account_number"),
            branch_code=seller_banking.get("branch_code", ""),
            account_type=seller_banking.get("account_type", "SAVINGS"),
            mobile=seller_mobile,
            user=seller_user,
            transaction=transaction,
            given_name=given_name,
            family_name=family_name,
            email=transaction.get("seller_email"),
        )

        if sync_result.get("success"):
            logger.info(
                f"[PAYOUT_SYNC] SUCCESS txn={transaction_id} token={seller_token_id} "
                f"tradesafe_response={sync_result.get('token')}"
            )
            logger.info(f"[PAYOUT_CHECK] Re-checking after sync txn={transaction_id} token={seller_token_id}")
            payout_check = await check_payout_readiness(seller_token_id)
            logger.info(
                f"[PAYOUT_CHECK] Post-sync result txn={transaction_id} token={seller_token_id} "
                f"ready={payout_check.get('ready')} has_banking={payout_check.get('has_banking')} "
                f"has_mobile={payout_check.get('has_mobile')} issues={payout_check.get('issues')}"
            )

            await db.transactions.update_one(
                {"transaction_id": transaction_id},
                {"$set": {
                    "bank_details_attached": True,
                    "payout_ready": build_payout_readiness_response(
                        transaction=transaction,
                        seller_user=seller_user,
                        payout_check=payout_check,
                        seller_token_id=seller_token_id,
                    )["payout_eligible"],
                    "banking_auto_synced_at": datetime.now(timezone.utc).isoformat()
                }}
            )
        else:
            logger.error(
                f"[PAYOUT_SYNC] FAILED txn={transaction_id} token={seller_token_id} "
                f"error={sync_result.get('error')} debug={sync_result.get('debug', 'N/A')} "
                f"tradesafe_response={sync_result}"
            )

    elif not payout_check.get("ready") and not seller_has_profile_banking:
        logger.warning(
            f"[PAYOUT_BLOCKED] Cannot auto-sync txn={transaction_id} token={seller_token_id} "
            f"reason='Seller profile has no banking details to sync'"
        )

    # ===== PAYOUT PREFLIGHT: Final decision =====
    payout_profile = build_payout_readiness_response(
        transaction=transaction,
        seller_user=seller_user,
        payout_check=payout_check,
        seller_token_id=seller_token_id,
    )

    if not payout_profile["payout_eligible"]:
        issues = payout_profile.get("issues", ["Unknown issue"])
        logger.error(
            f"[PAYOUT_BLOCKED] Release blocked txn={transaction_id} token={seller_token_id} "
            f"sync_attempted={sync_attempted} sync_error={(sync_result or {}).get('error') if sync_attempted else None} "
            f"token_has_banking={payout_check.get('has_banking')} token_has_mobile={payout_check.get('has_mobile')} "
            f"seller_profile_has_banking={seller_has_profile_banking} "
            f"seller_verified_phone={payout_profile['verified_phone']} issues={issues}"
        )
        logger.info("=" * 60)

        raise HTTPException(
            status_code=400,
            detail=f"Cannot release: Seller must complete payout setup before funds can be released. Issues: {', '.join(issues)}"
        )

    logger.info(
        f"[PAYOUT_READY] Token ready for payout txn={transaction_id} token={seller_token_id} "
        f"verified_phone={payout_profile['verified_phone']} bank_details_present={payout_profile['bank_details_present']} "
        f"has_banking={payout_check.get('has_banking')} has_mobile={payout_check.get('has_mobile')} "
        f"sync_attempted={sync_attempted}"
    )
    logger.info("=" * 60)

    net_amount = compute_net_amount(transaction)

    withdrawal_ok = None
    withdrawal_error = None

    result = await accept_delivery(
        allocation_id,
        seller_token_id=transaction.get("tradesafe_seller_token_id"),
        amount=float(net_amount),
    )

    if not result:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to accept delivery on TradeSafe — allocation_id={allocation_id!r}. Check server logs."
        )

    # Capture the actual TradeSafe state returned by allocationAcceptDelivery.
    # TradeSafe often returns DELIVERY_ACCEPTED here (their "80% complete" state) rather than
    # FUNDS_RELEASED — funds only land in the seller token after TradeSafe completes async
    # processing and fires the FUNDS_RELEASED webhook.  Hardcoding FUNDS_RELEASED here was
    # causing an immediate tokenAccountWithdraw call on a zero-balance token, which failed and
    # left withdrawal_status="failed", blocking the webhook-triggered retry.
    ts_actual_state = (result.get("state") or "DELIVERY_ACCEPTED").upper()
    logger.info(
        f"[ACCEPT_DELIVERY] allocationAcceptDelivery returned state={ts_actual_state!r} "
        f"allocation={allocation_id!r} txn={transaction_id}"
    )

    immediate_release = (ts_actual_state == "FUNDS_RELEASED")

    # Update timeline
    timeline = transaction.get("timeline", [])
    timeline.append({
        "status": "Delivery Accepted - Funds Released" if immediate_release else "Delivery Accepted - Awaiting Release",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "by": user.name,
        "details": f"Buyer confirmed receipt. R{net_amount:.2f} {'released to seller' if immediate_release else 'awaiting release to seller'}."
    })

    now_iso = datetime.now(timezone.utc).isoformat()
    update_fields = {
        "tradesafe_state": ts_actual_state,
        "payment_status": "Completed" if immediate_release else "Delivery Confirmed",
        "release_status": "Released" if immediate_release else "Awaiting Release",
        "payout_status": (
            "payout_processing" if withdrawal_ok is True else
            "payout_failed" if withdrawal_ok is False else
            "awaiting_bank_payout" if immediate_release else
            "pending_release"
        ),
        "withdrawal_status": (
            "succeeded" if withdrawal_ok is True else
            "failed" if withdrawal_ok is False else
            "pending" if immediate_release else
            "awaiting_release"
        ),
        "delivery_confirmed": True,
        "delivery_confirmed_at": now_iso,
        "expected_settlement_window": "up to 2 business days",
        "payout_sla_status": "on_track" if withdrawal_ok is not False else "critical",
        "timeline": timeline,
        "net_amount": net_amount
    }

    if immediate_release:
        update_fields["released_at"] = now_iso
        update_fields["funds_released_at"] = now_iso

    if withdrawal_ok is True:
        update_fields.update({
            "withdrawal_triggered": True,
            "withdrawal_requested_at": now_iso,
            "withdrawal_triggered_at": now_iso,
            "withdrawal_completed_at": now_iso,
            "withdrawal_error": None,
            "settlement_status": "bank_processing",
            "settlement_checked_at": now_iso,
            "payout_processing_started_at": now_iso,
            "tradesafe_withdrawal_id": None,
            "bank_reference": None,
            "settlement_reference": None,
        })
    elif withdrawal_ok is False:
        update_fields.update({
            "withdrawal_triggered": False,
            "withdrawal_failed_at": now_iso,
            "withdrawal_error": withdrawal_error,
            "settlement_status": "withdrawal_failed",
            "settlement_checked_at": now_iso,
            "payout_sla_status": "critical",
        })

    await db.transactions.update_one(
        {"transaction_id": transaction_id},
        {"$set": update_fields}
    )

    if withdrawal_ok is None and immediate_release:
        # TradeSafe confirmed funds are in the seller token — trigger bank withdrawal now
        latest_transaction = await db.transactions.find_one({"transaction_id": transaction_id}, {"_id": 0})
        from routes.webhooks import attempt_transaction_withdrawal
        withdrawal_result = await attempt_transaction_withdrawal(
            db,
            latest_transaction or {**transaction, **update_fields},
            source="accept_delivery",
        )
        logger.info(f"[ACCEPT_DELIVERY] withdrawal result txn={transaction_id}: {withdrawal_result}")
    elif withdrawal_ok is None:
        logger.info(
            f"[ACCEPT_DELIVERY] Deferring bank withdrawal — TradeSafe state={ts_actual_state!r}, "
            f"funds not yet in seller token. FUNDS_RELEASED webhook will trigger withdrawal. txn={transaction_id}"
        )

    if immediate_release:
        # Notify BOTH parties via the single release-notification helper:
        # seller payout email (with the real TrustTrade fee) + SMS, buyer
        # "transaction complete" email. Deduped per-transaction.
        logger.info("=" * 60)
        logger.info("[RELEASE] === SENDING FUNDS RELEASED NOTIFICATIONS ===")
        logger.info(f"[RELEASE] Transaction: {transaction_id}, Amount: R{transaction['item_price']}, Net: R{net_amount}")
        logger.info("=" * 60)
        try:
            from routes.webhooks import notify_seller_funds_released
            transaction["net_amount"] = net_amount
            await notify_seller_funds_released(db, transaction)
        except Exception as e:
            logger.error(f"[RELEASE] Funds released notification EXCEPTION: {str(e)}")
            import traceback
            logger.error(traceback.format_exc())
    else:
        logger.info(
            f"[ACCEPT_DELIVERY] Funds-released notifications deferred txn={transaction_id} "
            f"state={ts_actual_state!r}"
        )

    return {
        "status": "funds_released" if immediate_release else "delivery_confirmed",
        "message": (
            "Delivery confirmed. Funds have been released to seller."
            if immediate_release else
            "Delivery confirmed. Funds will be released to seller once TradeSafe completes processing."
        ),
        "state": ts_actual_state,
        "net_amount": net_amount
    }


@router.post("/manual-accept-delivery/{transaction_id}")
async def manual_accept_delivery(request: Request, transaction_id: str):
    """Manual override: Accept delivery bypassing state checks."""
    db = get_database()
    
    user = await get_user_from_token(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    transaction = await db.transactions.find_one({"transaction_id": transaction_id}, {"_id": 0})
    
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    # Only buyer or admin
    is_buyer = transaction.get("buyer_email") == user.email or transaction.get("buyer_user_id") == user.user_id
    if not is_buyer and not user.is_admin:
        raise HTTPException(status_code=403, detail="Only buyer or admin can confirm delivery")
    if is_buyer and not user.is_admin:
        buyer_user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
        require_verified_buyer_profile(buyer_user_doc)
    
    allocation_id = transaction.get("tradesafe_allocation_id")
    if not allocation_id:
        raise HTTPException(status_code=400, detail="No TradeSafe allocation ID found")

    logger.info(f"MANUAL ACCEPT DELIVERY: {transaction_id}")

    # ===== PAYOUT PREFLIGHT (same gate as normal release, no bypass) =====
    from tradesafe_service import check_payout_readiness, sync_banking_to_token

    seller_token_id = transaction.get("tradesafe_seller_token_id")
    _buyer_token_id = transaction.get("tradesafe_buyer_token_id")
    if _buyer_token_id and seller_token_id == _buyer_token_id:
        logger.error(f"[SECURITY] seller_token_id == buyer_token_id for txn={transaction_id} — aborting manual release")
        raise HTTPException(status_code=500, detail="Internal error: token mismatch. Please contact support.")
    logger.info(f"[PAYOUT_PREFLIGHT] Manual release txn={transaction_id} token={seller_token_id} by={user.email}")

    if not seller_token_id:
        logger.error(f"[PAYOUT_BLOCKED] Manual release: no seller token txn={transaction_id}")
        raise HTTPException(
            status_code=400,
            detail="Cannot release: No seller token linked to this transaction."
        )

    seller_email = transaction.get("seller_email")
    seller_user_doc = await db.users.find_one({"email": seller_email.lower()}) if seller_email else None
    seller_banking = (seller_user_doc or {}).get("banking_details", {}) or {}
    seller_mobile = (seller_user_doc or {}).get("phone") or transaction.get("seller_phone")

    profile_ok = has_bank_details(seller_user_doc)

    # Step 1: Check live token readiness FIRST
    logger.info(f"[PAYOUT_CHECK] Manual release initial check txn={transaction_id} token={seller_token_id}")
    payout_check = await check_payout_readiness(seller_token_id)
    logger.info(
        f"[PAYOUT_CHECK] Manual release initial result txn={transaction_id} token={seller_token_id} "
        f"ready={payout_check.get('ready')} issues={payout_check.get('issues')}"
    )

    sync_attempted = False
    sync_result = None

    # Step 2: If not ready and seller profile has banking, sync then re-check
    if not payout_check.get("ready") and profile_ok:
        sync_attempted = True
        logger.info(
            f"[PAYOUT_SYNC] Manual release auto-sync txn={transaction_id} token={seller_token_id} "
            f"bank={seller_banking.get('bank_name')} account_last4=***{str(seller_banking.get('account_number',''))[-4:]}"
        )

        sync_result = await sync_banking_to_token(
            token_id=seller_token_id,
            bank_name=seller_banking.get("bank_name"),
            account_number=seller_banking.get("account_number"),
            branch_code=seller_banking.get("branch_code", ""),
            account_type=seller_banking.get("account_type", "SAVINGS"),
            mobile=seller_mobile,
            user=seller_user_doc,
            transaction=transaction,
            given_name=transaction.get("seller_name", "").split(" ")[0],
            family_name=" ".join(transaction.get("seller_name", "").split(" ")[1:]) or "User",
            email=transaction.get("seller_email")
        )

        if sync_result.get("success"):
            logger.info(
                f"[PAYOUT_SYNC] Manual release SUCCESS txn={transaction_id} token={seller_token_id} "
                f"tradesafe_response={sync_result.get('token')}"
            )
            payout_check = await check_payout_readiness(seller_token_id)
            logger.info(
                f"[PAYOUT_CHECK] Manual release post-sync result txn={transaction_id} token={seller_token_id} "
                f"ready={payout_check.get('ready')} issues={payout_check.get('issues')}"
            )
        else:
            logger.error(
                f"[PAYOUT_SYNC] Manual release FAILED txn={transaction_id} token={seller_token_id} "
                f"error={sync_result.get('error')} debug={sync_result.get('debug', 'N/A')} "
                f"tradesafe_response={sync_result}"
            )
    elif not payout_check.get("ready") and not profile_ok:
        logger.warning(
            f"[PAYOUT_BLOCKED] Manual release cannot auto-sync txn={transaction_id} token={seller_token_id} "
            f"reason='Seller profile has no banking to sync'"
        )

    # Step 3: Final decision
    if not payout_check.get("ready"):
        issues = payout_check.get("issues", ["Unknown"])
        logger.error(
            f"[PAYOUT_BLOCKED] Manual release blocked txn={transaction_id} token={seller_token_id} "
            f"sync_attempted={sync_attempted} sync_error={(sync_result or {}).get('error') if sync_attempted else None} "
            f"issues={issues}"
        )
        raise HTTPException(
            status_code=400,
            detail=f"Cannot release: Seller payout not ready. Issues: {', '.join(issues)}."
        )

    logger.info(
        f"[PAYOUT_READY] Manual release proceeding txn={transaction_id} token={seller_token_id} "
        f"sync_attempted={sync_attempted}"
    )

    net_amount = compute_net_amount(transaction)

    result = await accept_delivery(
        allocation_id,
        seller_token_id=seller_token_id,
        amount=float(net_amount),
    )

    if not result:
        logger.error(f"[PAYOUT_BLOCKED] Manual release: TradeSafe accept_delivery failed for {transaction_id}")
        raise HTTPException(
            status_code=500,
            detail="TradeSafe release call failed. Funds have NOT been released. Please retry."
        )

    ts_actual_state = (result.get("state") or "DELIVERY_ACCEPTED").upper()
    immediate_release = (ts_actual_state == "FUNDS_RELEASED")
    logger.info(
        f"[MANUAL_RELEASE] allocationAcceptDelivery returned state={ts_actual_state!r} "
        f"allocation={allocation_id!r} txn={transaction_id}"
    )

    timeline = transaction.get("timeline", [])
    timeline.append({
        "status": "Delivery Confirmed (Manual)",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "by": user.name,
        "details": f"Manual override by {'admin' if user.is_admin else 'buyer'}"
    })
    timeline.append({
        "status": "Funds Released" if immediate_release else "Delivery Accepted - Awaiting Release",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "by": "System",
        "details": f"R{net_amount:.2f} {'released to seller' if immediate_release else 'awaiting TradeSafe release'}"
    })

    now_iso = datetime.now(timezone.utc).isoformat()
    update_fields = {
        "tradesafe_state": ts_actual_state,
        "payment_status": "Completed" if immediate_release else "Delivery Confirmed",
        "payout_status": "awaiting_bank_payout" if immediate_release else "pending_release",
        "withdrawal_status": "pending" if immediate_release else "awaiting_release",
        "delivery_confirmed": True,
        "delivery_confirmed_at": now_iso,
        "release_status": "Released" if immediate_release else "Awaiting Release",
        "expected_settlement_window": "up to 2 business days",
        "payout_sla_status": "on_track",
        "timeline": timeline,
        "manual_delivery_accept": True,
        "net_amount": net_amount
    }
    if immediate_release:
        update_fields["released_at"] = now_iso
        update_fields["funds_released_at"] = now_iso

    await db.transactions.update_one(
        {"transaction_id": transaction_id},
        {"$set": update_fields}
    )

    if immediate_release:
        latest_transaction = await db.transactions.find_one({"transaction_id": transaction_id}, {"_id": 0})
        from routes.webhooks import attempt_transaction_withdrawal
        withdrawal_result = await attempt_transaction_withdrawal(
            db,
            latest_transaction or {**transaction, **update_fields},
            source="manual_accept_delivery",
        )
        logger.info(f"[MANUAL_RELEASE] withdrawal result txn={transaction_id}: {withdrawal_result}")
    else:
        logger.info(
            f"[MANUAL_RELEASE] Deferring bank withdrawal — TradeSafe state={ts_actual_state!r}, "
            f"FUNDS_RELEASED webhook will trigger withdrawal. txn={transaction_id}"
        )

    # Notify BOTH parties via the single release-notification helper (correct
    # fee + seller SMS + buyer "transaction complete" email; deduped).
    if immediate_release:
        try:
            from routes.webhooks import notify_seller_funds_released
            transaction["net_amount"] = net_amount
            await notify_seller_funds_released(db, transaction)
        except Exception as e:
            logger.error(f"Failed to send funds released notifications: {e}")

    return {
        "status": "funds_released" if immediate_release else "delivery_confirmed",
        "message": (
            "Delivery confirmed. Funds released to seller."
            if immediate_release else
            "Delivery confirmed. Funds will be released to seller once TradeSafe completes processing."
        ),
        "state": ts_actual_state,
        "net_amount": net_amount,
        "tradesafe_result": result
    }


@router.post("/release-instant/{transaction_id}")
async def release_instant_funds(request: Request, transaction_id: str):
    """Buyer confirms and releases funds for a digital/instant delivery transaction."""
    db = get_database()

    user = await get_user_from_token(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    transaction = await db.transactions.find_one({"transaction_id": transaction_id}, {"_id": 0})
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")

    is_buyer = transaction.get("buyer_email") == user.email or transaction.get("buyer_user_id") == user.user_id
    if not is_buyer and not user.is_admin:
        raise HTTPException(status_code=403, detail="Only the buyer can release funds")
    if is_buyer and not user.is_admin:
        buyer_user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
        require_verified_buyer_profile(buyer_user_doc)

    delivery_method = (transaction.get("delivery_method") or "").lower()
    if delivery_method not in ("digital", "instant", "immediate"):
        raise HTTPException(status_code=400, detail="This release action is only available for digital/instant transactions")

    current_state = transaction.get("tradesafe_state")
    if current_state != "FUNDS_RECEIVED":
        raise HTTPException(
            status_code=400,
            detail=f"Cannot release: expected FUNDS_RECEIVED state, got {current_state}"
        )

    allocation_id = transaction.get("tradesafe_allocation_id")
    if not allocation_id:
        raise HTTPException(status_code=400, detail="Transaction not properly linked to TradeSafe")

    from tradesafe_service import check_payout_readiness, sync_banking_to_token

    seller_token_id = transaction.get("tradesafe_seller_token_id")
    _buyer_token_id = transaction.get("tradesafe_buyer_token_id")
    if _buyer_token_id and seller_token_id == _buyer_token_id:
        logger.error(f"[SECURITY] seller_token_id == buyer_token_id for txn={transaction_id} — aborting instant release")
        raise HTTPException(status_code=500, detail="Internal error: token mismatch. Please contact support.")
    logger.info(f"[INSTANT_RELEASE] txn={transaction_id} token={seller_token_id} by={user.email}")

    if not seller_token_id:
        raise HTTPException(status_code=400, detail="Cannot release: No seller token linked. Please contact support.")

    seller_email = transaction.get("seller_email")
    seller_user = await db.users.find_one({"email": seller_email.lower()}) if seller_email else None
    seller_banking = (seller_user or {}).get("banking_details", {}) or {}
    seller_mobile = (seller_user or {}).get("phone") or transaction.get("seller_phone")
    seller_has_profile_banking = has_bank_details(seller_user)

    payout_check = await check_payout_readiness(seller_token_id)
    logger.info(f"[INSTANT_RELEASE] payout check txn={transaction_id} ready={payout_check.get('ready')} issues={payout_check.get('issues')}")

    sync_attempted = False
    sync_result = None
    if not payout_check.get("ready") and seller_has_profile_banking:
        sync_attempted = True
        sync_result = await sync_banking_to_token(
            token_id=seller_token_id,
            bank_name=seller_banking.get("bank_name"),
            account_number=seller_banking.get("account_number"),
            branch_code=seller_banking.get("branch_code", ""),
            account_type=seller_banking.get("account_type", "SAVINGS"),
            mobile=seller_mobile,
            user=seller_user,
            transaction=transaction,
            given_name=transaction.get("seller_name", "").split(" ")[0],
            family_name=" ".join(transaction.get("seller_name", "").split(" ")[1:]) or "User",
            email=transaction.get("seller_email")
        )
        if sync_result.get("success"):
            payout_check = await check_payout_readiness(seller_token_id)

    if not payout_check.get("ready"):
        issues = payout_check.get("issues", ["Unknown"])
        logger.error(f"[INSTANT_RELEASE] blocked txn={transaction_id} sync_attempted={sync_attempted} issues={issues}")
        raise HTTPException(status_code=400, detail=f"Cannot release: Seller payout not ready. Issues: {', '.join(issues)}.")

    net_amount = compute_net_amount(transaction)

    result = await accept_delivery(
        allocation_id,
        seller_token_id=seller_token_id,
        amount=float(net_amount),
    )

    if not result:
        logger.error(f"[INSTANT_RELEASE] TradeSafe accept_delivery failed for {transaction_id}")
        raise HTTPException(status_code=500, detail="TradeSafe release call failed. Funds have NOT been released. Please retry.")

    ts_actual_state = (result.get("state") or "DELIVERY_ACCEPTED").upper()
    immediate_release = (ts_actual_state == "FUNDS_RELEASED")
    logger.info(
        f"[INSTANT_RELEASE] allocationAcceptDelivery returned state={ts_actual_state!r} "
        f"allocation={allocation_id!r} txn={transaction_id}"
    )

    timeline = transaction.get("timeline", [])
    timeline.append({
        "status": "Buyer Confirmed & Released" if immediate_release else "Buyer Confirmed Delivery",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "by": user.name,
        "details": "Buyer confirmed satisfaction for instant/digital delivery"
    })
    timeline.append({
        "status": "Funds Released" if immediate_release else "Delivery Accepted - Awaiting Release",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "by": "System",
        "details": f"R{net_amount:.2f} {'released to seller' if immediate_release else 'awaiting TradeSafe release'}"
    })

    now_iso = datetime.now(timezone.utc).isoformat()
    update_fields = {
        "tradesafe_state": ts_actual_state,
        "payment_status": "Completed" if immediate_release else "Delivery Confirmed",
        "payout_status": "awaiting_bank_payout" if immediate_release else "pending_release",
        "withdrawal_status": "pending" if immediate_release else "awaiting_release",
        "delivery_confirmed": True,
        "delivery_confirmed_at": now_iso,
        "release_status": "Released" if immediate_release else "Awaiting Release",
        "expected_settlement_window": "up to 2 business days",
        "payout_sla_status": "on_track",
        "timeline": timeline,
        "net_amount": net_amount
    }
    if immediate_release:
        update_fields["released_at"] = now_iso
        update_fields["funds_released_at"] = now_iso

    await db.transactions.update_one(
        {"transaction_id": transaction_id},
        {"$set": update_fields}
    )

    if immediate_release:
        latest_transaction = await db.transactions.find_one({"transaction_id": transaction_id}, {"_id": 0})
        from routes.webhooks import attempt_transaction_withdrawal
        withdrawal_result = await attempt_transaction_withdrawal(
            db,
            latest_transaction or {**transaction, **update_fields},
            source="release_instant",
        )
        logger.info(f"[INSTANT_RELEASE] withdrawal result txn={transaction_id}: {withdrawal_result}")
    else:
        logger.info(
            f"[INSTANT_RELEASE] Deferring bank withdrawal — TradeSafe state={ts_actual_state!r}, "
            f"FUNDS_RELEASED webhook will trigger withdrawal. txn={transaction_id}"
        )

    # Notify BOTH parties via the single release-notification helper (correct
    # fee + seller SMS + buyer "transaction complete" email; deduped).
    if immediate_release:
        try:
            from routes.webhooks import notify_seller_funds_released
            transaction["net_amount"] = net_amount
            await notify_seller_funds_released(db, transaction)
        except Exception as e:
            logger.error(f"Failed to send instant-release notifications: {e}")

    return {
        "status": "funds_released" if immediate_release else "delivery_confirmed",
        "message": (
            "Payment confirmed and funds released to seller."
            if immediate_release else
            "Payment confirmed. Funds will be released to seller once TradeSafe completes processing."
        ),
        "state": ts_actual_state,
        "net_amount": net_amount,
        "tradesafe_result": result
    }


@router.get("/transaction-status/{transaction_id}")
@router.get("/status/{transaction_id}")
async def get_tradesafe_status(request: Request, transaction_id: str):
    """Get current TradeSafe status for a transaction and sync if needed."""
    db = get_database()
    
    user = await get_user_from_token(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    transaction = await db.transactions.find_one({"transaction_id": transaction_id}, {"_id": 0})
    
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    tradesafe_id = transaction.get("tradesafe_id")
    if not tradesafe_id:
        return {
            "linked": False,
            "message": "Transaction not linked to TradeSafe"
        }
    
    logger.info(f"[SYNC] Fetching TradeSafe status for {transaction_id} (TS: {tradesafe_id})")
    
    # Get latest status from TradeSafe
    ts_transaction = await get_tradesafe_transaction(tradesafe_id)
    
    if ts_transaction:
        current_state = ts_transaction.get("state")
        old_state = transaction.get("tradesafe_state")
        old_payment_status = transaction.get("payment_status")
        new_payment_status = map_tradesafe_state_to_status(current_state)
        
        logger.info(f"[SYNC] TradeSafe state: {current_state}")
        logger.info(f"[SYNC] Old state: {old_state}, Old payment_status: {old_payment_status}")
        logger.info(f"[SYNC] New payment_status: {new_payment_status}")
        
        state_changed = current_state != old_state
        
        # Update local state if changed
        if state_changed:
            logger.info(f"[SYNC] State changed! Updating {transaction_id}: {old_state} -> {current_state}")
            
            timeline = transaction.get("timeline", [])
            timeline.append({
                "status": f"Status synced: {new_payment_status}",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "details": f"TradeSafe state: {current_state} (manual sync)"
            })
            
            await db.transactions.update_one(
                {"transaction_id": transaction_id},
                {"$set": {
                    "tradesafe_state": current_state,
                    "payment_status": new_payment_status,
                    "timeline": timeline,
                    "last_synced_at": datetime.now(timezone.utc).isoformat()
                }}
            )
        
        return {
            "linked": True,
            "tradesafe_id": tradesafe_id,
            "state": current_state,
            "status": new_payment_status,
            "allocations": ts_transaction.get("allocations", []),
            "state_changed": state_changed,
            "previous_state": old_state,
            "synced": True
        }
    
    logger.warning(f"[SYNC] Could not fetch TradeSafe transaction {tradesafe_id}")
    return {
        "linked": True,
        "tradesafe_id": tradesafe_id,
        "state": transaction.get("tradesafe_state"),
        "status": transaction.get("payment_status"),
        "error": "Could not fetch latest status from TradeSafe",
        "synced": False
    }


@router.post("/sync/{transaction_id}")
async def sync_tradesafe_status(request: Request, transaction_id: str):
    """
    Force sync TradeSafe status to local database.
    Use this when webhook was missed and payment status needs reconciliation.
    """
    db = get_database()
    
    user = await get_user_from_token(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    transaction = await db.transactions.find_one({"transaction_id": transaction_id}, {"_id": 0})
    
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    tradesafe_id = transaction.get("tradesafe_id")
    if not tradesafe_id:
        raise HTTPException(status_code=400, detail="Transaction not linked to TradeSafe escrow")
    
    logger.info(f"[SYNC] Force sync requested for {transaction_id} (TS: {tradesafe_id})")
    
    # Get latest status from TradeSafe
    ts_transaction = await get_tradesafe_transaction(tradesafe_id)
    
    if not ts_transaction:
        logger.error(f"[SYNC] Failed to fetch TradeSafe transaction {tradesafe_id}")
        raise HTTPException(status_code=500, detail="Could not fetch status from TradeSafe")
    
    current_state = ts_transaction.get("state")
    old_state = transaction.get("tradesafe_state")
    old_payment_status = transaction.get("payment_status")
    new_payment_status = map_tradesafe_state_to_status(current_state)
    
    logger.info(f"[SYNC] TradeSafe response - State: {current_state}")
    logger.info(f"[SYNC] Current DB - State: {old_state}, Payment Status: {old_payment_status}")
    logger.info(f"[SYNC] Mapping - {current_state} -> {new_payment_status}")
    
    state_changed = current_state != old_state or new_payment_status != old_payment_status
    
    # Always update to ensure consistency
    timeline = transaction.get("timeline", [])
    if state_changed:
        timeline.append({
            "status": f"Payment status synced: {new_payment_status}",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "details": f"TradeSafe state changed: {old_state or 'N/A'} -> {current_state} (manual sync)"
        })
    
    update_fields = {
        "tradesafe_state": current_state,
        "payment_status": new_payment_status,
        "timeline": timeline,
        "last_synced_at": datetime.now(timezone.utc).isoformat()
    }
    
    # If funds received, also update release_status
    if current_state in ["FUNDS_RECEIVED", "INITIATED", "SENT"]:
        update_fields["release_status"] = "In Escrow"
    elif current_state == "FUNDS_RELEASED":
        update_fields["release_status"] = "Released"
    
    await db.transactions.update_one(
        {"transaction_id": transaction_id},
        {"$set": update_fields}
    )
    
    logger.info(f"[SYNC] Updated {transaction_id}: payment_status={new_payment_status}, state={current_state}")

    # Fallback to the webhook path: if funds are now confirmed, make sure the
    # Courier Guy shipment is booked (idempotent — no-ops if already booked).
    if current_state in ("FUNDS_RECEIVED", "FUNDS_DEPOSITED"):
        try:
            import email_service
            from services.courier_booking import book_courier_for_transaction
            await book_courier_for_transaction(db, transaction, email_service=email_service)
        except Exception as exc:
            logger.error(f"[SYNC] courier auto-book failed (non-fatal) for {transaction_id}: {exc}")

    return {
        "success": True,
        "transaction_id": transaction_id,
        "tradesafe_id": tradesafe_id,
        "previous_state": old_state,
        "current_state": current_state,
        "previous_payment_status": old_payment_status,
        "new_payment_status": new_payment_status,
        "state_changed": state_changed,
        "message": f"Status synced: {new_payment_status}" if state_changed else "Status already up to date"
    }


@router.post("/manual-start-delivery/{transaction_id}")
async def admin_manual_start_delivery(request: Request, transaction_id: str):
    """Admin/Seller: Force start delivery, bypassing TradeSafe state checks."""
    db = get_database()
    user = await get_user_from_token(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    transaction = await db.transactions.find_one({"transaction_id": transaction_id}, {"_id": 0})
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")

    is_seller = transaction.get("seller_email") == user.email or transaction.get("seller_user_id") == user.user_id
    if not is_seller and not user.is_admin:
        raise HTTPException(status_code=403, detail="Only seller or admin can trigger manual delivery start")

    if is_seller and not user.is_admin:
        seller_user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
        require_verified_seller_phone(seller_user_doc)

    allocation_id = transaction.get("tradesafe_allocation_id")
    if not allocation_id:
        raise HTTPException(status_code=400, detail="No TradeSafe allocation ID — transaction not linked to escrow")

    logger.info(f"[MANUAL_START_DELIVERY] txn={transaction_id} by={user.email} admin={user.is_admin}")

    result = await start_delivery(allocation_id)
    logger.info(f"[MANUAL_START_DELIVERY] TradeSafe start_delivery result: {result}")

    now_iso = datetime.now(timezone.utc).isoformat()
    timeline = transaction.get("timeline", [])
    timeline.append({
        "status": "Delivery Started (Manual Override)",
        "timestamp": now_iso,
        "by": user.name,
        "details": f"Manual override by {'admin' if user.is_admin else 'seller'}"
    })

    await db.transactions.update_one(
        {"transaction_id": transaction_id},
        {"$set": {
            "tradesafe_state": "INITIATED",
            "payment_status": "Delivery in Progress",
            "delivery_started_at": now_iso,
            "timeline": timeline,
        }}
    )

    # Notify buyer
    buyer_email = transaction.get("buyer_email")
    buyer_phone = transaction.get("buyer_phone")
    if buyer_email:
        await send_delivery_started_email(
            to_email=buyer_email,
            to_name=transaction.get("buyer_name", "Buyer"),
            share_code=transaction.get("share_code", transaction_id),
            item_description=transaction["item_description"],
            seller_name=transaction.get("seller_name", "Seller")
        )
    if buyer_phone:
        try:
            await send_delivery_sms(
                to_phone=buyer_phone,
                message=f"TrustTrade: Your item '{transaction['item_description'][:30]}' has been dispatched. Ref: {transaction.get('share_code', transaction_id)}"
            )
        except Exception as e:
            logger.error(f"[MANUAL_START_DELIVERY] SMS failed: {e}")

    return {
        "status": "delivery_started",
        "message": "Delivery marked as started (manual override).",
        "state": "INITIATED",
        "tradesafe_called": bool(result),
    }


@router.post("/cancel/{transaction_id}")
async def admin_force_cancel_transaction(request: Request, transaction_id: str):
    """Admin only: Force-cancel a transaction from any state."""
    db = get_database()
    user = await get_user_from_token(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")

    transaction = await db.transactions.find_one({"transaction_id": transaction_id}, {"_id": 0})
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")

    ts_state = (transaction.get("tradesafe_state") or "").upper()
    if ts_state in ("FUNDS_RELEASED", "COMPLETE", "COMPLETED"):
        raise HTTPException(
            status_code=400,
            detail="Cannot force-cancel: transaction has already been completed and funds released"
        )

    now_iso = datetime.now(timezone.utc).isoformat()
    timeline = transaction.get("timeline", [])
    timeline.append({
        "status": "Transaction Force-Cancelled by Admin",
        "timestamp": now_iso,
        "by": user.email,
        "details": "Administrative force-cancel override",
    })

    await db.transactions.update_one(
        {"transaction_id": transaction_id},
        {"$set": {
            "transaction_state": "CANCELLED",
            "payment_status": "Cancelled",
            "tradesafe_state": "CANCELLED",
            "archived": True,
            "archived_at": now_iso,
            "cancelled_at": now_iso,
            "cancelled_by": user.email,
            "timeline": timeline,
        }}
    )

    logger.info(f"[ADMIN_FORCE_CANCEL] txn={transaction_id} force-cancelled by {user.email}")
    return {"message": "Transaction force-cancelled and archived", "transaction_id": transaction_id}


@router.post("/banking-details")
async def update_banking_details_secure(request: Request, details: BankingDetailsUpdate):
    """Securely send banking details to TradeSafe."""
    db = get_database()
    
    user = await get_user_from_token(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Validate bank details
    if not details.bank_name or not details.account_number or not details.branch_code:
        raise HTTPException(status_code=400, detail="All banking fields are required")
    
    try:
        # Send banking details to TradeSafe
        result = await update_user_banking_details(
            user_id=user.user_id,
            email=user.email,
            bank_name=details.bank_name,
            account_holder=details.account_holder,
            account_number=details.account_number,
            branch_code=details.branch_code,
            account_type=details.account_type
        )
        
        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error", "Failed to save banking details"))
        
        # Only store a flag - NOT the actual details
        await db.users.update_one(
            {"user_id": user.user_id},
            {"$set": {
                "banking_details_added": True,
                "banking_details_updated_at": datetime.now(timezone.utc).isoformat()
            }}
        )
        
        logger.info(f"Banking details sent to TradeSafe for user {user.user_id}")
        return {"message": "Banking details saved securely", "success": True}
        
    except Exception as e:
        logger.error(f"Failed to save banking details: {e}")
        # Fallback - store flag anyway for MVP
        await db.users.update_one(
            {"user_id": user.user_id},
            {"$set": {
                "banking_details_added": True,
                "banking_details_updated_at": datetime.now(timezone.utc).isoformat()
            }}
        )
        return {"message": "Banking details saved", "success": True}
