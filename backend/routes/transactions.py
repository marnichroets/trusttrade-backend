"""
TrustTrade Transaction Routes
Handles transaction creation, listing, and management
"""

import logging
import uuid
import random
import string
from datetime import datetime, timezone
from typing import List
from pathlib import Path
from fastapi import APIRouter, HTTPException, Request

from core.database import get_database
from core.security import get_user_from_token, normalize_email
from core.config import (
    MINIMUM_TRANSACTION_AMOUNT, MAXIMUM_TRANSACTION_AMOUNT,
    PLATFORM_FEE_PERCENT, FRONTEND_URL
)
from models.transaction import (
    Transaction, TransactionCreate, TransactionUpdate, TransactionPreview,
    RatingSubmit, SellerConfirmation
)
from services.email_service import (
    send_transaction_created_email, send_payment_received_email,
    send_funds_released_email, send_delivery_confirmed_email
)
from services.sms_service import (
    normalize_phone_number, phones_match, send_transaction_invite_sms
)
from services.risk_service import assess_transaction_risk
from services.pdf_generator import generate_escrow_agreement_pdf

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/transactions", tags=["Transactions"])


def generate_share_code() -> str:
    """Generate a short, user-friendly share code like TT-483920"""
    numbers = ''.join(random.choices(string.digits, k=6))
    return f"TT-{numbers}"


@router.post("", response_model=Transaction, status_code=201)
async def create_transaction(request: Request, transaction_data: TransactionCreate):
    """Create a new transaction"""
    db = get_database()
    user = await get_user_from_token(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Check if user is suspended
    if user.suspension_flag:
        raise HTTPException(status_code=403, detail="Account suspended. Contact admin.")
    
    # Check if seller has banking details (required to receive funds)
    if transaction_data.creator_role == "seller":
        user_doc = await db.users.find_one({"user_id": user.user_id})
        if not user_doc or not user_doc.get("banking_details_added"):
            raise HTTPException(
                status_code=400, 
                detail="Please add your banking details before creating a transaction as a seller. Go to Settings > Banking Details."
            )
    
    # Validate minimum transaction amount
    if transaction_data.item_price < MINIMUM_TRANSACTION_AMOUNT:
        raise HTTPException(
            status_code=400, 
            detail=f"Minimum transaction amount is R{MINIMUM_TRANSACTION_AMOUNT:.0f}"
        )
    
    # Validate maximum transaction amount
    if transaction_data.item_price > MAXIMUM_TRANSACTION_AMOUNT:
        raise HTTPException(
            status_code=400,
            detail=f"Maximum transaction amount is R{MAXIMUM_TRANSACTION_AMOUNT:,.0f}. Please contact support for larger transactions."
        )
    
    # Calculate fees (2% platform fee)
    item_price = transaction_data.item_price
    trusttrade_fee = round(item_price * (PLATFORM_FEE_PERCENT / 100), 2)
    total = round(item_price + trusttrade_fee, 2)
    
    transaction_id = f"txn_{uuid.uuid4().hex[:12]}"
    
    # Determine buyer and seller based on creator role
    if transaction_data.creator_role == "buyer":
        buyer_user_id = user.user_id
        buyer_name = user.name
        buyer_email = normalize_email(user.email)
        seller_user_id = None
        seller_name = transaction_data.seller_name
        seller_email = normalize_email(transaction_data.seller_email)
    else:
        seller_user_id = user.user_id
        seller_name = user.name
        seller_email = normalize_email(user.email)
        buyer_user_id = None
        buyer_name = transaction_data.buyer_name
        buyer_email = normalize_email(transaction_data.buyer_email)
    
    # Detect if recipient_info is phone or email
    recipient_info = seller_email if transaction_data.creator_role == "buyer" else buyer_email
    recipient_type = "email"
    recipient_phone = None
    
    if recipient_info and (recipient_info.startswith('+27') or (recipient_info.startswith('0') and len(recipient_info) <= 12 and recipient_info.replace('+', '').isdigit())):
        recipient_type = "phone"
        recipient_phone = normalize_phone_number(recipient_info)
        if transaction_data.creator_role == "buyer":
            seller_email = ""
        else:
            buyer_email = ""
    
    # Initialize timeline
    timeline = [{
        "status": "Transaction Created",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "by": user.name
    }]
    
    # Generate unique share code
    share_code = generate_share_code()
    while await db.transactions.find_one({"share_code": share_code}):
        share_code = generate_share_code()
    
    # Assess transaction risk
    risk_assessment = await assess_transaction_risk(db, user, item_price)
    
    if risk_assessment.risk_level in ["medium", "high"]:
        timeline.append({
            "status": f"Risk Assessment: {risk_assessment.risk_level.upper()}",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "by": "TrustTrade System",
            "details": risk_assessment.warnings
        })
    
    # Determine auto-release days based on delivery method
    delivery_method = transaction_data.delivery_method
    auto_release_days = {"courier": 3, "bank_deposit": 2, "digital": 0}.get(delivery_method, 3)
    
    transaction = {
        "transaction_id": transaction_id,
        "share_code": share_code,
        "creator_role": transaction_data.creator_role,
        "buyer_user_id": buyer_user_id,
        "seller_user_id": seller_user_id,
        "buyer_name": buyer_name,
        "buyer_email": buyer_email,
        "buyer_phone": recipient_phone if transaction_data.creator_role == "seller" else None,
        "seller_name": seller_name,
        "seller_email": seller_email,
        "seller_phone": recipient_phone if transaction_data.creator_role == "buyer" else None,
        "recipient_info": recipient_info,
        "recipient_type": recipient_type,
        "item_description": transaction_data.item_description,
        "item_category": transaction_data.item_category,
        "item_condition": transaction_data.item_condition,
        "known_issues": transaction_data.known_issues or "None",
        "item_photos": [],
        "item_price": item_price,
        "trusttrade_fee": trusttrade_fee,
        "total": total,
        "fee_paid_by": transaction_data.fee_paid_by,
        "delivery_method": delivery_method,
        "auto_release_days": auto_release_days,
        "payment_status": "Pending Seller Confirmation" if transaction_data.creator_role == "buyer" else "Pending Buyer Confirmation",
        "seller_confirmed": False,
        "delivery_confirmed": False,
        "release_status": "Not Released",
        "buyer_details_confirmed": transaction_data.buyer_details_confirmed,
        "seller_details_confirmed": transaction_data.seller_details_confirmed,
        "item_accuracy_confirmed": transaction_data.item_accuracy_confirmed,
        "risk_level": risk_assessment.risk_level,
        "risk_flags": risk_assessment.flags,
        "timeline": timeline,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.transactions.insert_one(transaction)
    
    # Send transaction created emails
    base_url = FRONTEND_URL
    await send_transaction_created_email(
        to_email=buyer_email,
        to_name=buyer_name,
        share_code=share_code,
        item_description=transaction_data.item_description,
        amount=item_price,
        other_party_name=seller_name,
        role="Buyer",
        base_url=base_url
    )
    await send_transaction_created_email(
        to_email=seller_email,
        to_name=seller_name,
        share_code=share_code,
        item_description=transaction_data.item_description,
        amount=item_price,
        other_party_name=buyer_name,
        role="Seller",
        base_url=base_url
    )
    
    # If recipient was invited via phone, also send SMS
    if recipient_type == "phone" and recipient_phone:
        share_link = f"{base_url}/share/{share_code}"
        await send_transaction_invite_sms(
            to_phone=recipient_phone,
            sender_name=user.name,
            share_link=share_link
        )
    
    return Transaction(**transaction)


@router.get("", response_model=List[Transaction])
async def list_transactions(request: Request):
    """List transactions for current user (or all for admin)"""
    db = get_database()
    user = await get_user_from_token(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    if user.is_admin:
        query = {}
    else:
        user_email_lower = normalize_email(user.email)
        user_phone = getattr(user, 'phone', None)
        
        or_conditions = [
            {"buyer_user_id": user.user_id},
            {"seller_user_id": user.user_id},
            {"buyer_email": {"$regex": f"^{user_email_lower}$", "$options": "i"}},
            {"seller_email": {"$regex": f"^{user_email_lower}$", "$options": "i"}}
        ]
        
        if user_phone:
            normalized_phone = normalize_phone_number(user_phone)
            or_conditions.extend([
                {"buyer_phone": normalized_phone},
                {"seller_phone": normalized_phone},
                {"recipient_info": normalized_phone}
            ])
        
        query = {"$or": or_conditions}
    
    projection = {
        "_id": 0,
        "transaction_id": 1, "share_code": 1, "item_description": 1, "item_price": 1,
        "payment_status": 1, "release_status": 1, "transaction_state": 1, "tradesafe_state": 1,
        "created_at": 1, "buyer_name": 1, "buyer_email": 1, "seller_name": 1, "seller_email": 1,
        "buyer_user_id": 1, "seller_user_id": 1, "delivery_method": 1, "has_dispute": 1,
        "buyer_confirmed": 1, "seller_confirmed": 1, "tradesafe_id": 1
    }
    transactions = await db.transactions.find(query, projection).sort("created_at", -1).to_list(1000)
    return [Transaction(**t) for t in transactions]


@router.get("/{transaction_id}", response_model=Transaction)
async def get_transaction(request: Request, transaction_id: str):
    """Get transaction details"""
    db = get_database()
    user = await get_user_from_token(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    transaction = await db.transactions.find_one(
        {"transaction_id": transaction_id},
        {"_id": 0}
    )
    
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    # Check privacy
    if not user.is_admin:
        if (transaction.get("buyer_user_id") != user.user_id and
            transaction.get("buyer_email") != user.email and
            transaction.get("seller_email") != user.email):
            raise HTTPException(status_code=403, detail="Access denied")
    
    # Generate share_code for old transactions
    if not transaction.get("share_code"):
        share_code = generate_share_code()
        while await db.transactions.find_one({"share_code": share_code}):
            share_code = generate_share_code()
        await db.transactions.update_one(
            {"transaction_id": transaction_id},
            {"$set": {"share_code": share_code}}
        )
        transaction["share_code"] = share_code
    
    return Transaction(**transaction)


@router.post("/{transaction_id}/seller-confirm")
async def seller_confirm_transaction(request: Request, transaction_id: str, confirmation: SellerConfirmation):
    """Seller confirms transaction details"""
    db = get_database()
    user = await get_user_from_token(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    transaction = await db.transactions.find_one(
        {"transaction_id": transaction_id},
        {"_id": 0}
    )
    
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    if transaction.get("seller_email") != user.email:
        raise HTTPException(status_code=403, detail="Only seller can confirm transaction")
    
    if confirmation.confirmed:
        timeline = transaction.get("timeline", [])
        timeline.append({
            "status": "Seller Confirmed",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "by": user.name
        })
        
        # Generate escrow agreement PDF
        pdf_filename = f"agreement_{transaction_id}.pdf"
        pdf_path = Path("/app/uploads/pdfs") / pdf_filename
        
        try:
            generate_escrow_agreement_pdf(transaction, str(pdf_path))
        except Exception as e:
            logger.error(f"PDF generation failed: {str(e)}")
        
        await db.transactions.update_one(
            {"transaction_id": transaction_id},
            {"$set": {
                "seller_confirmed": True,
                "seller_confirmed_at": datetime.now(timezone.utc).isoformat(),
                "payment_status": "Ready for Payment",
                "agreement_pdf_path": pdf_filename if pdf_path.exists() else None,
                "timeline": timeline
            }}
        )
        
        return {"message": "Transaction confirmed", "agreement_pdf": pdf_filename if pdf_path.exists() else None}
    
    return {"message": "Confirmation cancelled"}


@router.patch("/{transaction_id}/delivery")
async def confirm_delivery(request: Request, transaction_id: str, update_data: TransactionUpdate):
    """Confirm delivery and release funds"""
    db = get_database()
    user = await get_user_from_token(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    transaction = await db.transactions.find_one(
        {"transaction_id": transaction_id},
        {"_id": 0}
    )
    
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    if transaction["buyer_user_id"] != user.user_id and transaction["buyer_email"] != user.email:
        raise HTTPException(status_code=403, detail="Only buyer can confirm delivery")
    
    if transaction.get("payment_status") != "Paid":
        raise HTTPException(status_code=400, detail="Cannot confirm delivery before payment is received")
    
    if update_data.delivery_confirmed:
        timeline = transaction.get("timeline", [])
        timeline.append({
            "status": "Delivery Confirmed & Funds Released",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "by": user.name
        })
        
        await db.transactions.update_one(
            {"transaction_id": transaction_id},
            {"$set": {
                "delivery_confirmed": True,
                "release_status": "Released",
                "payment_status": "Released",
                "timeline": timeline
            }}
        )
        
        net_amount = transaction["item_price"] - (transaction["item_price"] * 0.02)
        
        await send_funds_released_email(
            to_email=transaction["seller_email"],
            to_name=transaction["seller_name"],
            share_code=transaction.get("share_code", transaction_id),
            item_description=transaction["item_description"],
            amount=transaction["item_price"],
            net_amount=net_amount
        )
        
        await send_delivery_confirmed_email(
            to_email=transaction["buyer_email"],
            to_name=transaction["buyer_name"],
            share_code=transaction.get("share_code", transaction_id),
            item_description=transaction["item_description"],
            role="buyer"
        )
    
    updated_transaction = await db.transactions.find_one(
        {"transaction_id": transaction_id},
        {"_id": 0}
    )
    
    return Transaction(**updated_transaction)


@router.post("/{transaction_id}/rate")
async def rate_transaction(request: Request, transaction_id: str, rating_data: RatingSubmit):
    """Submit rating for completed transaction"""
    db = get_database()
    user = await get_user_from_token(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    transaction = await db.transactions.find_one({"transaction_id": transaction_id}, {"_id": 0})
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    if not transaction.get("delivery_confirmed"):
        raise HTTPException(status_code=400, detail="Cannot rate incomplete transaction")
    
    is_buyer = transaction.get("buyer_user_id") == user.user_id or transaction.get("buyer_email") == user.email
    is_seller = transaction.get("seller_user_id") == user.user_id or transaction.get("seller_email") == user.email
    
    if not is_buyer and not is_seller:
        raise HTTPException(status_code=403, detail="Not part of this transaction")
    
    if is_buyer:
        if transaction.get("buyer_rating"):
            raise HTTPException(status_code=400, detail="Already rated")
        await db.transactions.update_one(
            {"transaction_id": transaction_id},
            {"$set": {"buyer_rating": rating_data.rating, "buyer_review": rating_data.review}}
        )
    else:
        if transaction.get("seller_rating"):
            raise HTTPException(status_code=400, detail="Already rated")
        await db.transactions.update_one(
            {"transaction_id": transaction_id},
            {"$set": {"seller_rating": rating_data.rating, "seller_review": rating_data.review}}
        )
    
    return {"message": "Rating submitted", "rating": rating_data.rating}


@router.patch("/{transaction_id}/photos")
async def update_transaction_photos(request: Request, transaction_id: str, photo_filenames: List[str]):
    """Update transaction with uploaded photo filenames"""
    db = get_database()
    user = await get_user_from_token(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    transaction = await db.transactions.find_one(
        {"transaction_id": transaction_id},
        {"_id": 0}
    )
    
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    creator_role = transaction.get("creator_role")
    if creator_role == "buyer" and transaction.get("buyer_user_id") != user.user_id:
        raise HTTPException(status_code=403, detail="Only transaction creator can add photos")
    if creator_role == "seller" and transaction.get("seller_user_id") != user.user_id:
        raise HTTPException(status_code=403, detail="Only transaction creator can add photos")
    
    await db.transactions.update_one(
        {"transaction_id": transaction_id},
        {"$set": {"item_photos": photo_filenames}}
    )
    
    return {"message": "Photos updated successfully"}
