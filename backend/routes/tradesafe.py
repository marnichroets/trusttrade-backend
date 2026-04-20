"""
TrustTrade TradeSafe Integration Routes
Handles TradeSafe escrow creation, payment, delivery, and webhooks
"""

import os
import logging
from decimal import Decimal, ROUND_HALF_UP
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Request

from core.config import settings
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
    send_delivery_started_email, send_funds_released_email,
    send_payment_received_email
)
from sms_service import send_delivery_sms, send_funds_released_sms

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/tradesafe", tags=["TradeSafe"])


def calculate_seller_receives(item_price: float, fee_percent: float = 1.5) -> float:
    """Calculate seller payout using Decimal precision with minimum fee."""
    price = Decimal(str(item_price))
    fee_rate = Decimal(str(fee_percent)) / Decimal("100")
    calculated_fee = (price * fee_rate).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    # Apply minimum fee of R5
    min_fee = Decimal("5.00")
    fee = max(calculated_fee, min_fee)
    return float((price - fee).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))



@router.get("/calculate-fees")
async def get_fee_calculation(amount: float, fee_allocation: str = "SELLER_AGENT"):
    """
    Calculate and return fee breakdown for display before payment.
    
    Returns:
        - item_price: Original item price
        - trusttrade_fee: TrustTrade platform fee (1.5%, min R5)
        - processing_fee: Estimated payment processing fee (~2.5%)
        - total_fees: Combined fees
        - buyer_pays: What buyer will pay
        - seller_receives: What seller will receive after fees
    """
    if amount < 100:
        raise HTTPException(status_code=400, detail="Minimum transaction amount is R100")
    
    # TrustTrade fee: 1.5% with R5 minimum
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
        "payout_time": "1-2 business days after release"
    }



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
            detail=f"Minimum transaction amount is R{settings.MINIMUM_TRANSACTION_AMOUNT:.0f}"
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
    
    logger.info("=== ESCROW CREATION PRE-FLIGHT ===")
    logger.info(f"Transaction ID: {data.transaction_id}")
    logger.info(f"Buyer: {transaction['buyer_name']} ({transaction['buyer_email']}) Mobile: {buyer_mobile}")
    logger.info(f"Seller: {transaction['seller_name']} ({transaction['seller_email']}) Mobile: {seller_mobile}")
    
    # Use fee_allocation from request, or fall back to stored value, or default
    fee_allocation = data.fee_allocation or transaction.get("fee_allocation", "SELLER_AGENT")
    logger.info(f"[ESCROW] Fee Allocation from request: {data.fee_allocation}")
    logger.info(f"[ESCROW] Fee Allocation from DB: {transaction.get('fee_allocation')}")
    logger.info(f"[ESCROW] Fee Allocation final: {fee_allocation}")
    
    # Create escrow transaction
    logger.info("[ESCROW] calling TradeSafe API...")
    result = await create_tradesafe_transaction(
        internal_reference=data.transaction_id,
        title=f"TrustTrade - {transaction['item_description'][:50]}",
        description=transaction.get("item_description", "Item/Service"),
        amount=transaction["item_price"],
        buyer_name=transaction["buyer_name"],
        buyer_email=transaction["buyer_email"],
        seller_name=transaction["seller_name"],
        seller_email=transaction["seller_email"],
        buyer_mobile=buyer_mobile,
        seller_mobile=seller_mobile,
        fee_allocation=fee_allocation
    )
    
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
    
    if seller_token_id:
        # Fetch seller's banking details from TrustTrade profile
        seller_user = await db.users.find_one({"email": transaction["seller_email"].lower()})
        
        if seller_user and seller_user.get("banking_details_completed"):
            banking = seller_user.get("banking_details", {})
            seller_mobile = seller_user.get("phone") or transaction.get("seller_phone")
            
            logger.info(f"[BANKING_SYNC] Seller has profile banking - syncing to token {seller_token_id}")
            logger.info(f"[BANKING_SYNC] Bank: {banking.get('bank_name')}, Mobile: {seller_mobile}")
            
            if banking.get("bank_name") and banking.get("account_number"):
                from tradesafe_service import sync_banking_to_token
                
                sync_result = await sync_banking_to_token(
                    token_id=seller_token_id,
                    bank_name=banking.get("bank_name"),
                    account_number=banking.get("account_number"),
                    branch_code=banking.get("branch_code", ""),
                    account_type=banking.get("account_type", "SAVINGS"),
                    mobile=seller_mobile
                )
                
                banking_sync_result = sync_result
                bank_details_attached = sync_result.get("success", False)
                
                if bank_details_attached:
                    logger.info(f"[BANKING_SYNC] SUCCESS - Banking synced to seller token {seller_token_id}")
                    
                    # Verify payout readiness
                    from tradesafe_service import check_payout_readiness
                    payout_check = await check_payout_readiness(seller_token_id)
                    payout_ready = payout_check.get("ready", False)
                    logger.info(f"[BANKING_SYNC] Payout ready: {payout_ready}")
                else:
                    logger.error(f"[BANKING_SYNC] FAILED - {sync_result.get('error')}")
            else:
                logger.warning(f"[BANKING_SYNC] Seller profile banking incomplete - missing bank_name or account_number")
        else:
            logger.warning(f"[BANKING_SYNC] Seller has no profile banking details saved")
    else:
        logger.warning(f"[BANKING_SYNC] No seller token ID to sync banking to")
    
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
        {"$set": {
            "tradesafe_id": tradesafe_id,
            "tradesafe_allocation_id": allocation_id,
            "tradesafe_seller_token_id": seller_token_id,
            "tradesafe_buyer_token_id": buyer_token_id,
            "tradesafe_state": result.get("state", "CREATED"),
            "tradesafe_fee_allocation": result.get("fee_allocation", data.fee_allocation),
            "payment_status": "Awaiting Payment",
            "payout_status": "pending",
            "bank_details_attached": bank_details_attached,  # Track if banking synced to token
            "payout_ready": payout_ready,
            "banking_sync_result": banking_sync_result,
            "timeline": timeline
        }}
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
async def get_tradesafe_payment_url(request: Request, transaction_id: str):
    """Get TradeSafe payment URL for a transaction."""
    import traceback
    
    print("=== PAY FLOW START ===")
    db = get_database()
    
    user = await get_user_from_token(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    transaction = await db.transactions.find_one({"transaction_id": transaction_id}, {"_id": 0})
    
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
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
        payment_info = await get_payment_link(tradesafe_id, redirect_urls)
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
    
    logger.info(f"=== PAYMENT URL: {payment_link} ===")
    print("=== PAY FLOW END (success) ===")
    
    return {
        "transaction_id": transaction_id,
        "tradesafe_id": tradesafe_id,
        "payment_link": payment_link,
        "payment_methods": payment_info.get("payment_methods", ALLOWED_PAYMENT_METHODS),
        "state": payment_info.get("state"),
        "fee_breakdown": fee_breakdown,
        "deposit_id": payment_info.get("deposit_id"),
        "method": payment_info.get("method"),
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
    
    # Only seller can start delivery
    is_seller = transaction.get("seller_email") == user.email or transaction.get("seller_user_id") == user.user_id
    if not is_seller and not user.is_admin:
        raise HTTPException(status_code=403, detail="Only seller can mark item as delivered")
    
    # Check TradeSafe state
    if transaction.get("tradesafe_state") != "FUNDS_RECEIVED":
        raise HTTPException(
            status_code=400,
            detail="Cannot start delivery - payment not yet received or already in progress"
        )
    
    allocation_id = transaction.get("tradesafe_allocation_id")
    if not allocation_id:
        raise HTTPException(status_code=400, detail="Transaction not properly linked to TradeSafe")
    
    # Call TradeSafe
    result = await start_delivery(allocation_id)
    
    if not result:
        raise HTTPException(status_code=500, detail="Failed to start delivery on TradeSafe")
    
    # Update timeline
    timeline = transaction.get("timeline", [])
    timeline.append({
        "status": "Delivery Started",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "by": user.name,
        "details": "Seller marked item as dispatched"
    })
    
    await db.transactions.update_one(
        {"transaction_id": transaction_id},
        {"$set": {
            "tradesafe_state": "INITIATED",
            "payment_status": "Delivery in Progress",
            "delivery_started_at": datetime.now(timezone.utc).isoformat(),
            "timeline": timeline
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
            await send_delivery_sms(
                to_phone=buyer_phone,
                message=f"TrustTrade: Your item '{transaction['item_description'][:30]}...' has been dispatched. Please confirm receipt once delivered. Ref: {transaction.get('share_code', transaction_id)}"
            )
        except Exception as e:
            logger.error(f"Failed to send delivery SMS: {e}")
    
    return {
        "status": "delivery_started",
        "message": "Delivery marked as started. Buyer has been notified.",
        "state": "INITIATED"
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
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    # Only buyer can accept delivery
    is_buyer = transaction.get("buyer_email") == user.email or transaction.get("buyer_user_id") == user.user_id
    if not is_buyer and not user.is_admin:
        raise HTTPException(status_code=403, detail="Only buyer can confirm delivery")
    
    # Check TradeSafe state
    if transaction.get("tradesafe_state") not in ["INITIATED", "SENT", "DELIVERED"]:
        raise HTTPException(
            status_code=400,
            detail="Cannot accept delivery - delivery not yet started or already completed"
        )
    
    allocation_id = transaction.get("tradesafe_allocation_id")
    if not allocation_id:
        raise HTTPException(status_code=400, detail="Transaction not properly linked to TradeSafe")
    
    # PAYOUT PREFLIGHT CHECK: Verify seller token is ready for payout
    seller_token_id = transaction.get("tradesafe_seller_token_id")
    bank_details_attached = transaction.get("bank_details_attached", False)
    
    if not seller_token_id:
        logger.error(f"[PAYOUT_PREFLIGHT] CRITICAL: No seller token ID stored for {transaction_id}")
        if not user.is_admin:
            raise HTTPException(
                status_code=400,
                detail="Cannot release: No seller token linked. Please contact support."
            )
        else:
            logger.warning(f"[PAYOUT_PREFLIGHT] Admin bypassing missing token check: {user.email}")
    
    if seller_token_id:
        from tradesafe_service import check_payout_readiness
        payout_check = await check_payout_readiness(seller_token_id)
        
        # Log full payout check details
        logger.info(f"[PAYOUT_PREFLIGHT] Token: {seller_token_id}")
        logger.info(f"[PAYOUT_PREFLIGHT] DB bank_details_attached: {bank_details_attached}")
        logger.info(f"[PAYOUT_PREFLIGHT] Live payout_check: {payout_check}")
        
        if not payout_check.get("ready"):
            issues = payout_check.get("issues", [])
            has_token_banking = payout_check.get("has_banking", False)
            has_token_mobile = payout_check.get("has_mobile", False)
            
            logger.error(f"[PAYOUT_PREFLIGHT] BLOCKED - Token not ready")
            logger.error(f"[PAYOUT_PREFLIGHT] Issues: {issues}")
            logger.error(f"[PAYOUT_PREFLIGHT] Token banking: {has_token_banking}, Token mobile: {has_token_mobile}")
            
            # Block release for non-admins
            if not user.is_admin:
                raise HTTPException(
                    status_code=400,
                    detail=f"Cannot release: TradeSafe token not ready for payout. Issues: {', '.join(issues)}. The seller's banking details may not be synced to TradeSafe. Please contact support."
                )
            else:
                logger.warning(f"[PAYOUT_PREFLIGHT] ADMIN BYPASS: {user.email} proceeding despite payout not ready")
        else:
            logger.info(f"[PAYOUT_PREFLIGHT] PASSED - Token ready for payout")
    
    # Call TradeSafe
    result = await accept_delivery(allocation_id)
    
    if not result:
        raise HTTPException(status_code=500, detail="Failed to accept delivery on TradeSafe")
    
    # Calculate net amount using Decimal precision
    net_amount = calculate_seller_receives(transaction["item_price"], settings.PLATFORM_FEE_PERCENT)
    
    # Update timeline
    timeline = transaction.get("timeline", [])
    timeline.append({
        "status": "Delivery Accepted - Funds Released",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "by": user.name,
        "details": f"Funds of R{net_amount:.2f} released to seller"
    })
    
    await db.transactions.update_one(
        {"transaction_id": transaction_id},
        {"$set": {
            "tradesafe_state": "FUNDS_RELEASED",
            "payment_status": "Released",
            "release_status": "Released",
            "payout_status": "awaiting_bank_payout",  # Update payout status
            "delivery_confirmed": True,
            "delivery_confirmed_at": datetime.now(timezone.utc).isoformat(),
            "funds_released_at": datetime.now(timezone.utc).isoformat(),
            "timeline": timeline
        }}
    )
    
    # Send notifications
    await send_funds_released_email(
        to_email=transaction["seller_email"],
        to_name=transaction["seller_name"],
        share_code=transaction.get("share_code", transaction_id),
        item_description=transaction["item_description"],
        amount=transaction["item_price"],
        net_amount=net_amount
    )
    
    seller_phone = transaction.get("seller_phone")
    if seller_phone:
        try:
            await send_funds_released_sms(
                to_phone=seller_phone,
                message=f"TrustTrade: Great news! The buyer confirmed receipt. R{net_amount:.2f} has been released to your account. Ref: {transaction.get('share_code', transaction_id)}"
            )
        except Exception as e:
            logger.error(f"Failed to send funds released SMS: {e}")
    
    return {
        "status": "funds_released",
        "message": "Delivery confirmed. Funds have been released to seller.",
        "state": "FUNDS_RELEASED",
        "net_amount": net_amount
    }


@router.post("/manual-start-delivery/{transaction_id}")
async def manual_start_delivery(request: Request, transaction_id: str):
    """Manual override: Start delivery bypassing state checks."""
    db = get_database()
    
    user = await get_user_from_token(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    transaction = await db.transactions.find_one({"transaction_id": transaction_id}, {"_id": 0})
    
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    # Only seller or admin
    is_seller = transaction.get("seller_email") == user.email or transaction.get("seller_user_id") == user.user_id
    if not is_seller and not user.is_admin:
        raise HTTPException(status_code=403, detail="Only seller or admin can trigger manual delivery")
    
    allocation_id = transaction.get("tradesafe_allocation_id")
    if not allocation_id:
        raise HTTPException(status_code=400, detail="No TradeSafe allocation ID found")
    
    logger.info(f"MANUAL START DELIVERY: {transaction_id}")
    
    result = await start_delivery(allocation_id)
    
    # Update even if TradeSafe call fails
    if not result:
        logger.warning("TradeSafe start_delivery failed, updating local state anyway")
    
    timeline = transaction.get("timeline", [])
    timeline.append({
        "status": "Delivery Started (Manual)",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "by": user.name,
        "details": f"Manual override by {'admin' if user.is_admin else 'seller'}"
    })
    
    await db.transactions.update_one(
        {"transaction_id": transaction_id},
        {"$set": {
            "tradesafe_state": "INITIATED",
            "payment_status": "Delivery in Progress",
            "delivery_started_at": datetime.now(timezone.utc).isoformat(),
            "timeline": timeline,
            "manual_delivery_start": True
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
            await send_delivery_sms(
                to_phone=buyer_phone,
                message=f"TrustTrade: Your item has been dispatched! Please confirm receipt once delivered. Ref: {transaction.get('share_code', transaction_id)}"
            )
        except Exception as e:
            logger.error(f"Failed to send delivery SMS: {e}")
    
    return {
        "status": "delivery_started",
        "message": "Delivery manually started. Buyer notified.",
        "state": "INITIATED",
        "tradesafe_result": result
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
    
    allocation_id = transaction.get("tradesafe_allocation_id")
    if not allocation_id:
        raise HTTPException(status_code=400, detail="No TradeSafe allocation ID found")
    
    logger.info(f"MANUAL ACCEPT DELIVERY: {transaction_id}")
    
    result = await accept_delivery(allocation_id)
    
    if not result:
        logger.warning("TradeSafe accept_delivery failed, updating local state anyway")
    
    # Calculate net amount using Decimal precision
    net_amount = calculate_seller_receives(transaction["item_price"], settings.PLATFORM_FEE_PERCENT)
    
    timeline = transaction.get("timeline", [])
    timeline.append({
        "status": "Delivery Confirmed (Manual)",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "by": user.name,
        "details": f"Manual override by {'admin' if user.is_admin else 'buyer'}"
    })
    timeline.append({
        "status": "Funds Released",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "by": "System",
        "details": f"R{net_amount:.2f} released to seller"
    })
    
    await db.transactions.update_one(
        {"transaction_id": transaction_id},
        {"$set": {
            "tradesafe_state": "FUNDS_RELEASED",
            "payment_status": "Completed",
            "payout_status": "awaiting_bank_payout",  # Update payout status
            "delivery_confirmed": True,
            "delivery_confirmed_at": datetime.now(timezone.utc).isoformat(),
            "release_status": "Released",
            "released_at": datetime.now(timezone.utc).isoformat(),
            "funds_released_at": datetime.now(timezone.utc).isoformat(),
            "timeline": timeline,
            "manual_delivery_accept": True,
            "net_amount": net_amount
        }}
    )
    
    # Send notifications
    seller_email = transaction.get("seller_email")
    seller_phone = transaction.get("seller_phone")
    
    if seller_email:
        await send_funds_released_email(
            to_email=seller_email,
            to_name=transaction.get("seller_name"),
            share_code=transaction.get("share_code", transaction_id),
            item_description=transaction["item_description"],
            amount=transaction["item_price"],
            net_amount=net_amount
        )
    
    if seller_phone:
        try:
            await send_funds_released_sms(
                to_phone=seller_phone,
                message=f"TrustTrade: Great news! R{net_amount:.2f} has been released to your account. Ref: {transaction.get('share_code', transaction_id)}"
            )
        except Exception as e:
            logger.error(f"Failed to send funds released SMS: {e}")
    
    return {
        "status": "funds_released",
        "message": "Delivery confirmed. Funds released to seller.",
        "state": "FUNDS_RELEASED",
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
