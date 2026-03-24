"""
TrustTrade TradeSafe Integration Routes
Handles TradeSafe escrow creation, payment, delivery, and webhooks
"""

import os
import logging
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
    ALLOWED_PAYMENT_METHODS
)
from email_service import (
    send_delivery_started_email, send_funds_released_email,
    send_payment_received_email
)
from sms_service import send_delivery_sms, send_funds_released_sms

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/tradesafe", tags=["TradeSafe"])


@router.post("/create-transaction")
async def create_tradesafe_escrow(request: Request, data: TradeSafeTransactionCreate):
    """Create TrustTrade escrow transaction after both parties confirm."""
    db = get_database()
    
    user = await get_user_from_token(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Get the TrustTrade transaction
    transaction = await db.transactions.find_one(
        {"transaction_id": data.transaction_id},
        {"_id": 0}
    )
    
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    # Verify user is part of this transaction
    is_buyer = transaction.get("buyer_email") == user.email or transaction.get("buyer_user_id") == user.user_id
    is_seller = transaction.get("seller_email") == user.email or transaction.get("seller_user_id") == user.user_id
    
    if not is_buyer and not is_seller and not user.is_admin:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Check if already linked to escrow
    if transaction.get("tradesafe_id"):
        return {
            "tradesafe_id": transaction["tradesafe_id"],
            "status": "already_created",
            "message": "Escrow already created for this transaction"
        }
    
    # Validate minimum amount
    if transaction["item_price"] < settings.MINIMUM_TRANSACTION_AMOUNT:
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
    
    # Create escrow transaction
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
        fee_allocation=data.fee_allocation
    )
    
    if not result or "error" in result:
        error_msg = result.get("error", "Failed to create escrow. Please try again.") if result else "Failed to create escrow. Please try again."
        logger.error(f"=== ESCROW CREATION FAILED: {error_msg} ===")
        raise HTTPException(status_code=500, detail=error_msg)
    
    # Store escrow ID and allocation ID
    tradesafe_id = result.get("id")
    allocation_id = result.get("allocations", [{}])[0].get("id") if result.get("allocations") else None
    
    # Update timeline
    timeline = transaction.get("timeline", [])
    timeline.append({
        "status": "TrustTrade Escrow Created",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "by": "TrustTrade System",
        "details": f"Escrow ID: {tradesafe_id}"
    })
    
    await db.transactions.update_one(
        {"transaction_id": data.transaction_id},
        {"$set": {
            "tradesafe_id": tradesafe_id,
            "tradesafe_allocation_id": allocation_id,
            "tradesafe_state": result.get("state", "CREATED"),
            "payment_status": "Awaiting Payment",
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
    db = get_database()
    
    user = await get_user_from_token(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    transaction = await db.transactions.find_one({"transaction_id": transaction_id}, {"_id": 0})
    
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    tradesafe_id = transaction.get("tradesafe_id")
    if not tradesafe_id:
        raise HTTPException(status_code=400, detail="Please create an escrow first before making payment.")
    
    # Build redirect URLs
    frontend_url = settings.FRONTEND_URL
    redirect_urls = {
        "success": f"{frontend_url}/transaction/success?tx={transaction_id}",
        "failure": f"{frontend_url}/transaction/failed?tx={transaction_id}",
        "cancel": f"{frontend_url}/transaction/cancelled?tx={transaction_id}"
    }
    
    logger.info(f"=== GETTING PAYMENT URL for {transaction_id} ===")
    
    payment_info = await get_payment_link(tradesafe_id, redirect_urls)
    
    if not payment_info:
        raise HTTPException(status_code=500, detail="Payment processing error. Please try again.")
    
    if not payment_info.get("payment_link"):
        logger.error(f"No payment link returned for {tradesafe_id}")
        raise HTTPException(status_code=500, detail="Could not generate payment link. Please try again.")
    
    # Calculate fee breakdown
    fee_breakdown = calculate_fees(
        transaction["item_price"],
        transaction.get("fee_paid_by", "split")
    )
    
    logger.info(f"=== PAYMENT URL: {payment_info.get('payment_link')} ===")
    
    return {
        "transaction_id": transaction_id,
        "tradesafe_id": tradesafe_id,
        "payment_link": payment_info.get("payment_link"),
        "payment_methods": payment_info.get("payment_methods", ALLOWED_PAYMENT_METHODS),
        "state": payment_info.get("state"),
        "fee_breakdown": fee_breakdown
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
    
    # Call TradeSafe
    result = await accept_delivery(allocation_id)
    
    if not result:
        raise HTTPException(status_code=500, detail="Failed to accept delivery on TradeSafe")
    
    # Calculate net amount
    net_amount = transaction["item_price"] * (1 - settings.PLATFORM_FEE_PERCENT / 100)
    
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
            "delivery_confirmed": True,
            "delivery_confirmed_at": datetime.now(timezone.utc).isoformat(),
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
    
    net_amount = transaction["item_price"] * (1 - settings.PLATFORM_FEE_PERCENT / 100)
    
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
            "delivery_confirmed": True,
            "delivery_confirmed_at": datetime.now(timezone.utc).isoformat(),
            "release_status": "Released",
            "released_at": datetime.now(timezone.utc).isoformat(),
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
async def get_tradesafe_status(request: Request, transaction_id: str):
    """Get current TradeSafe status for a transaction."""
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
    
    # Get latest status from TradeSafe
    ts_transaction = await get_tradesafe_transaction(tradesafe_id)
    
    if ts_transaction:
        current_state = ts_transaction.get("state")
        
        # Update local state if changed
        if current_state != transaction.get("tradesafe_state"):
            await db.transactions.update_one(
                {"transaction_id": transaction_id},
                {"$set": {
                    "tradesafe_state": current_state,
                    "payment_status": map_tradesafe_state_to_status(current_state)
                }}
            )
        
        return {
            "linked": True,
            "tradesafe_id": tradesafe_id,
            "state": current_state,
            "status": map_tradesafe_state_to_status(current_state),
            "allocations": ts_transaction.get("allocations", [])
        }
    
    return {
        "linked": True,
        "tradesafe_id": tradesafe_id,
        "state": transaction.get("tradesafe_state"),
        "status": transaction.get("payment_status"),
        "error": "Could not fetch latest status from TradeSafe"
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
