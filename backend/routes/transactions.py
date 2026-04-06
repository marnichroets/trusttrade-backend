"""
TrustTrade Transaction Routes
Handles transaction creation, management, payments, and TradeSafe integration
"""

import os
import uuid
import shutil
import random
import string
import logging
from decimal import Decimal, ROUND_HALF_UP
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import List
from fastapi import APIRouter, HTTPException, Request, UploadFile, File
from fastapi.responses import FileResponse

from core.config import settings
from core.database import get_database
from core.security import get_user_from_token, normalize_email, emails_match
from models.user import User
from models.transaction import (
    Transaction, TransactionCreate, TransactionUpdate,
    SellerConfirmation, RatingSubmit, PaymentConfirmation,
    TradeSafeTransactionCreate
)
from models.common import RiskAssessment
from pdf_generator import generate_escrow_agreement_pdf
from email_service import (
    send_transaction_created_email, send_payment_received_email,
    send_funds_released_email, send_delivery_confirmed_email,
    send_delivery_started_email, send_immediate_payment_secured_email
)
from sms_service import (
    normalize_phone_number, send_transaction_invite_sms,
    send_delivery_sms, send_funds_released_sms
)
from tradesafe_service import (
    create_tradesafe_transaction, get_tradesafe_transaction,
    get_payment_link, start_delivery, accept_delivery,
    validate_minimum_transaction, calculate_fees,
    map_tradesafe_state_to_status, ALLOWED_PAYMENT_METHODS
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["Transactions"])


def calculate_money(item_price: float, fee_percent: float = 2.0) -> dict:
    """
    Calculate all money values using Decimal for precision.
    Returns values as floats with exactly 2 decimal places.
    """
    price = Decimal(str(item_price))
    fee_rate = Decimal(str(fee_percent)) / Decimal("100")
    
    trusttrade_fee = (price * fee_rate).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    total = (price + trusttrade_fee).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    seller_receives = (price - trusttrade_fee).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    
    return {
        "item_price": float(price),
        "trusttrade_fee": float(trusttrade_fee),
        "total": float(total),
        "seller_receives": float(seller_receives)
    }


def generate_share_code() -> str:
    """Generate a short, user-friendly share code like TT-483920"""
    numbers = ''.join(random.choices(string.digits, k=6))
    return f"TT-{numbers}"


def mock_send_email(to_email: str, subject: str, body: str):
    """Mock email function for fallback"""
    logger.info(f"MOCK EMAIL TO: {to_email}")
    logger.info(f"SUBJECT: {subject}")
    logger.info(f"BODY: {body}")


async def assess_transaction_risk(user: User, item_price: float, db) -> RiskAssessment:
    """Assess risk level for a transaction"""
    risk_score = 0
    flags = []
    warnings = []
    
    # Get user's account age
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
    created_at = user_doc.get("created_at")
    if created_at:
        account_age_days = (datetime.now(timezone.utc) - datetime.fromisoformat(created_at.replace('Z', '+00:00'))).days
    else:
        account_age_days = 0
    
    # Flag 1: New account with high-value transaction
    if account_age_days < 7 and item_price > 5000:
        risk_score += 30
        flags.append("new_account_high_value")
        warnings.append("New account attempting high-value transaction (R5,000+)")
    
    # Flag 2: Account with multiple valid disputes
    valid_disputes = user_doc.get("valid_disputes_count", 0)
    if valid_disputes >= 2:
        risk_score += 25
        flags.append("multiple_disputes")
        warnings.append(f"User has {valid_disputes} valid disputes against them")
    
    # Flag 3: Unverified account with high-value transaction
    if not user_doc.get("verified", False) and item_price > 10000:
        risk_score += 20
        flags.append("unverified_high_value")
        warnings.append("Unverified account with very high-value transaction (R10,000+)")
    
    # Flag 4: Very low trust score
    trust_score = user_doc.get("trust_score", 50)
    if trust_score < 30:
        risk_score += 25
        flags.append("low_trust_score")
        warnings.append(f"User has a low trust score ({trust_score}/100)")
    
    # Flag 5: Account is suspended or flagged
    if user_doc.get("suspension_flag", False):
        risk_score += 50
        flags.append("suspended_account")
        warnings.append("User account has been flagged for suspension")
    
    # Flag 6: Unusually low price (potential scam)
    if item_price < 50:
        risk_score += 10
        flags.append("very_low_price")
        warnings.append("Transaction amount is unusually low")
    
    # Determine risk level
    if risk_score >= 60:
        risk_level = "high"
    elif risk_score >= 30:
        risk_level = "medium"
    else:
        risk_level = "low"
    
    return RiskAssessment(
        risk_level=risk_level,
        risk_score=risk_score,
        flags=flags,
        warnings=warnings
    )


async def update_user_rating(email: str, new_rating: int, db):
    """Recalculate user's average rating"""
    user_doc = await db.users.find_one({"email": email}, {"_id": 0})
    if not user_doc:
        return
    
    # Count ratings
    buyer_ratings_pipeline = db.transactions.find({"buyer_email": email, "seller_rating": {"$exists": True}}, {"_id": 0, "seller_rating": 1})
    seller_ratings_pipeline = db.transactions.find({"seller_email": email, "buyer_rating": {"$exists": True}}, {"_id": 0, "buyer_rating": 1})
    
    total_rating = 0
    count = 0
    async for txn in buyer_ratings_pipeline:
        total_rating += txn.get("seller_rating", 0)
        count += 1
    async for txn in seller_ratings_pipeline:
        total_rating += txn.get("buyer_rating", 0)
        count += 1
    
    avg_rating = round(total_rating / count, 1) if count > 0 else 0.0
    
    # Update user with new stats
    await db.users.update_one(
        {"email": email},
        {"$set": {
            "average_rating": avg_rating,
            "total_trades": count,
            "successful_trades": count
        }}
    )
    
    # Award badges
    badges = []
    if count >= 3:
        badges.append("Silver")
    if count >= 10:
        badges.append("Gold")
    if user_doc.get("verified"):
        badges.append("Verified")
    
    await db.users.update_one({"email": email}, {"$set": {"badges": badges}})


# ============ FILE UPLOAD ENDPOINTS ============

@router.post("/upload/photo")
async def upload_photo(request: Request, file: UploadFile = File(...)):
    """Upload a photo for transaction or dispute"""
    db = get_database()
    
    user = await get_user_from_token(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Validate file type
    allowed_extensions = {".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"}
    allowed_mime_types = {"image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif"}
    
    file_ext = Path(file.filename).suffix.lower() if file.filename else ""
    content_type = (file.content_type or "").lower()
    
    ext_valid = file_ext in allowed_extensions
    mime_valid = content_type in allowed_mime_types
    
    if not ext_valid and not mime_valid:
        raise HTTPException(status_code=400, detail="Only image files allowed (jpg, jpeg, png, webp)")
    
    # Use extension from filename, or derive from MIME type
    if not file_ext or file_ext not in allowed_extensions:
        mime_to_ext = {
            "image/jpeg": ".jpg", "image/jpg": ".jpg", "image/png": ".png",
            "image/webp": ".webp", "image/heic": ".heic", "image/heif": ".heif"
        }
        file_ext = mime_to_ext.get(content_type, ".jpg")
    
    # Validate file size (5MB max)
    file.file.seek(0, 2)
    file_size = file.file.tell()
    file.file.seek(0)
    if file_size > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File size must be less than 5MB")
    
    # Generate unique filename
    unique_filename = f"{uuid.uuid4().hex}{file_ext}"
    file_path = Path(settings.PHOTOS_PATH) / unique_filename
    
    # Save file
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    return {"filename": unique_filename, "path": str(file_path)}


@router.post("/upload/dispute-evidence")
async def upload_dispute_evidence(request: Request, file: UploadFile = File(...)):
    """Upload evidence photo for dispute"""
    db = get_database()
    
    user = await get_user_from_token(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Validate file type
    allowed_extensions = {".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"}
    allowed_mime_types = {"image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif"}
    
    file_ext = Path(file.filename).suffix.lower() if file.filename else ""
    content_type = (file.content_type or "").lower()
    
    ext_valid = file_ext in allowed_extensions
    mime_valid = content_type in allowed_mime_types
    
    if not ext_valid and not mime_valid:
        raise HTTPException(status_code=400, detail="Only image files allowed (jpg, jpeg, png, webp)")
    
    if not file_ext or file_ext not in allowed_extensions:
        mime_to_ext = {
            "image/jpeg": ".jpg", "image/jpg": ".jpg", "image/png": ".png",
            "image/webp": ".webp", "image/heic": ".heic", "image/heif": ".heif"
        }
        file_ext = mime_to_ext.get(content_type, ".jpg")
    
    # Validate file size
    file.file.seek(0, 2)
    file_size = file.file.tell()
    file.file.seek(0)
    if file_size > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File size must be less than 5MB")
    
    # Generate unique filename
    unique_filename = f"{uuid.uuid4().hex}{file_ext}"
    file_path = Path(settings.DISPUTES_PATH) / unique_filename
    
    # Save file
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    return {"filename": unique_filename, "path": str(file_path)}


# ============ TRANSACTION CRUD ============

@router.post("/transactions", response_model=Transaction, status_code=201)
async def create_transaction(request: Request, transaction_data: TransactionCreate):
    """Create a new transaction"""
    db = get_database()
    
    user = await get_user_from_token(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Check if user is suspended
    if user.suspension_flag:
        raise HTTPException(status_code=403, detail="Account suspended. Contact admin.")
    
    # Check if seller has banking details
    if transaction_data.creator_role == "seller":
        user_doc = await db.users.find_one({"user_id": user.user_id})
        if not user_doc or not user_doc.get("banking_details_added"):
            raise HTTPException(
                status_code=400,
                detail="Please add your banking details before creating a transaction as a seller. Go to Settings > Banking Details."
            )
    
    # Validate minimum transaction amount (R500)
    if transaction_data.item_price < settings.MINIMUM_TRANSACTION_AMOUNT:
        raise HTTPException(
            status_code=400,
            detail=f"Minimum transaction amount is R{settings.MINIMUM_TRANSACTION_AMOUNT:.0f}"
        )
    
    # Validate maximum transaction amount (R500,000)
    if transaction_data.item_price > settings.MAXIMUM_TRANSACTION_AMOUNT:
        raise HTTPException(
            status_code=400,
            detail=f"Maximum transaction amount is R{settings.MAXIMUM_TRANSACTION_AMOUNT:,.0f}. Please contact support for larger transactions."
        )
    
    # Calculate fees using precise Decimal math (2% platform fee)
    money = calculate_money(transaction_data.item_price, settings.PLATFORM_FEE_PERCENT)
    item_price = money["item_price"]
    trusttrade_fee = money["trusttrade_fee"]
    total = money["total"]
    
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
    
    logger.info(f"Transaction created by {user.email}: recipient={recipient_info}, type={recipient_type}")
    
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
    risk_assessment = await assess_transaction_risk(user, item_price, db)
    
    if risk_assessment.risk_level in ["medium", "high"]:
        timeline.append({
            "status": f"Risk Assessment: {risk_assessment.risk_level.upper()}",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "by": "TrustTrade System",
            "details": risk_assessment.warnings
        })
    
    # Determine auto-release days based on delivery method
    delivery_method = transaction_data.delivery_method
    if delivery_method == "courier":
        auto_release_days = 3
    elif delivery_method == "bank_deposit":
        auto_release_days = 2
    elif delivery_method == "digital":
        auto_release_days = 0
    else:
        auto_release_days = 3
    
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
        "seller_receives": money["seller_receives"],  # Pre-calculated for frontend
        "fee_allocation": transaction_data.fee_allocation,  # TrustTrade fee allocation
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
    
    # Get base URL for email links
    base_url = settings.FRONTEND_URL
    
    # Send transaction created emails
    # Only send if email addresses are valid (not empty/phone-only invites)
    if buyer_email and '@' in buyer_email:
        email_result = await send_transaction_created_email(
            to_email=buyer_email,
            to_name=buyer_name,
            share_code=share_code,
            item_description=transaction_data.item_description,
            amount=item_price,
            other_party_name=seller_name,
            role="Buyer",
            base_url=base_url
        )
        logger.info(f"Buyer email send result: {email_result} to {buyer_email}")
    else:
        logger.info(f"Skipping buyer email - no valid email address (phone invite): {buyer_email}")
    
    if seller_email and '@' in seller_email:
        email_result = await send_transaction_created_email(
            to_email=seller_email,
            to_name=seller_name,
            share_code=share_code,
            item_description=transaction_data.item_description,
            amount=item_price,
            other_party_name=buyer_name,
            role="Seller",
            base_url=base_url
        )
        logger.info(f"Seller email send result: {email_result} to {seller_email}")
    else:
        logger.info(f"Skipping seller email - no valid email address (phone invite): {seller_email}")
    
    # If recipient was invited via phone, also send SMS
    if recipient_type == "phone" and recipient_phone:
        share_link = f"{base_url}/share/{share_code}"
        await send_transaction_invite_sms(
            to_phone=recipient_phone,
            sender_name=user.name,
            share_link=share_link
        )
        logger.info(f"SMS invite sent to {recipient_phone}")
    
    return Transaction(**transaction)


@router.get("/transactions", response_model=List[Transaction])
async def list_transactions(request: Request):
    """List transactions for current user (or all for admin)"""
    db = get_database()
    
    user = await get_user_from_token(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Admin sees all
    if user.is_admin:
        query = {}
    else:
        # Users see only their transactions
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
    
    # Optimize query with projection for list view
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


@router.get("/transactions/{transaction_id}", response_model=Transaction)
async def get_transaction(request: Request, transaction_id: str):
    """Get transaction details"""
    db = get_database()
    
    user = await get_user_from_token(request, db)
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
    
    # Generate share_code for old transactions that don't have one
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


@router.patch("/transactions/{transaction_id}/photos")
async def update_transaction_photos(request: Request, transaction_id: str, photo_filenames: List[str]):
    """Update transaction with uploaded photo filenames"""
    db = get_database()
    
    user = await get_user_from_token(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    transaction = await db.transactions.find_one({"transaction_id": transaction_id}, {"_id": 0})
    
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    # Only creator can update photos
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


@router.post("/transactions/{transaction_id}/seller-confirm")
async def seller_confirm_transaction(request: Request, transaction_id: str, confirmation: SellerConfirmation):
    """Seller confirms transaction details and fee agreement"""
    db = get_database()
    
    user = await get_user_from_token(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    transaction = await db.transactions.find_one({"transaction_id": transaction_id}, {"_id": 0})
    
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    # Only seller can confirm
    seller_email = transaction.get("seller_email", "").lower()
    user_email = user.email.lower() if user.email else ""
    
    if seller_email != user_email:
        logger.warning(f"Non-seller tried to confirm: user={user_email}, seller={seller_email}")
        raise HTTPException(status_code=403, detail="Only seller can confirm transaction")
    
    if transaction.get("seller_confirmed"):
        logger.info(f"Transaction {transaction_id} already confirmed by seller")
        return {"message": "Transaction already confirmed", "already_confirmed": True}
    
    if confirmation.confirmed:
        logger.info(f"Seller {user_email} confirming fee agreement for transaction {transaction_id}")
        
        # Update timeline
        timeline = transaction.get("timeline", [])
        timeline.append({
            "status": "Seller Confirmed Fee Agreement",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "by": user.name,
            "details": f"Fee allocation: {transaction.get('fee_allocation', 'SELLER_AGENT')}"
        })
        
        # Generate escrow agreement PDF
        pdf_filename = f"agreement_{transaction_id}.pdf"
        pdf_path = Path(settings.PDFS_PATH) / pdf_filename
        
        try:
            generate_escrow_agreement_pdf(transaction, str(pdf_path))
            logger.info(f"Generated escrow agreement PDF: {pdf_filename}")
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
        
        logger.info(f"Transaction {transaction_id} status changed: PENDING -> CONFIRMED (Ready for Payment)")
        
        return {
            "message": "Fee agreement confirmed", 
            "agreement_pdf": pdf_filename if pdf_path.exists() else None,
            "status": "Ready for Payment"
        }
    
    return {"message": "Confirmation cancelled"}


@router.get("/transactions/{transaction_id}/agreement-pdf")
async def download_agreement_pdf(request: Request, transaction_id: str):
    """Download escrow agreement PDF"""
    db = get_database()
    
    user = await get_user_from_token(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    transaction = await db.transactions.find_one({"transaction_id": transaction_id}, {"_id": 0})
    
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    # Check privacy
    if not user.is_admin:
        if transaction.get("buyer_email") != user.email and transaction.get("seller_email") != user.email:
            raise HTTPException(status_code=403, detail="Access denied")
    
    pdf_filename = transaction.get("agreement_pdf_path")
    if not pdf_filename:
        raise HTTPException(status_code=404, detail="Agreement PDF not generated yet")
    
    pdf_path = Path(settings.PDFS_PATH) / pdf_filename
    if not pdf_path.exists():
        raise HTTPException(status_code=404, detail="PDF file not found")
    
    return FileResponse(
        path=str(pdf_path),
        media_type="application/pdf",
        filename=f"TrustTrade_Agreement_{transaction_id}.pdf"
    )


@router.patch("/transactions/{transaction_id}/delivery")
async def confirm_delivery(request: Request, transaction_id: str, update_data: TransactionUpdate):
    """Confirm delivery and release funds"""
    db = get_database()
    
    user = await get_user_from_token(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    transaction = await db.transactions.find_one({"transaction_id": transaction_id}, {"_id": 0})
    
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    # Only buyer can confirm
    if transaction["buyer_user_id"] != user.user_id and transaction["buyer_email"] != user.email:
        raise HTTPException(status_code=403, detail="Only buyer can confirm delivery")
    
    # Check that payment has been made
    if transaction.get("payment_status") != "Paid":
        raise HTTPException(status_code=400, detail="Cannot confirm delivery before payment is received")
    
    if update_data.delivery_confirmed:
        # Update timeline
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
        
        # Calculate net amount after fee using Decimal precision
        money = calculate_money(transaction["item_price"], settings.PLATFORM_FEE_PERCENT)
        net_amount = money["seller_receives"]
        
        # Send funds released email
        await send_funds_released_email(
            to_email=transaction["seller_email"],
            to_name=transaction["seller_name"],
            share_code=transaction.get("share_code", transaction_id),
            item_description=transaction["item_description"],
            amount=transaction["item_price"],
            net_amount=net_amount
        )
        
        # Send delivery confirmed email to buyer
        await send_delivery_confirmed_email(
            to_email=transaction["buyer_email"],
            to_name=transaction["buyer_name"],
            share_code=transaction.get("share_code", transaction_id),
            item_description=transaction["item_description"],
            role="buyer"
        )
    
    updated_transaction = await db.transactions.find_one({"transaction_id": transaction_id}, {"_id": 0})
    
    return Transaction(**updated_transaction)


@router.post("/transactions/{transaction_id}/confirm-payment")
async def confirm_payment(request: Request, transaction_id: str, payment: PaymentConfirmation):
    """Mark transaction as paid (admin only)"""
    db = get_database()
    
    user = await get_user_from_token(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Only admin can confirm payment")
    
    transaction = await db.transactions.find_one({"transaction_id": transaction_id}, {"_id": 0})
    
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    if not transaction.get("seller_confirmed"):
        raise HTTPException(status_code=400, detail="Seller must confirm transaction first")
    
    if payment.confirmed:
        # Calculate auto-release time (48 hours)
        auto_release_at = (datetime.now(timezone.utc) + timedelta(hours=48)).isoformat()
        
        # Update timeline
        timeline = transaction.get("timeline", [])
        timeline.append({
            "status": "Payment Received in Escrow",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "by": "TrustTrade System"
        })
        timeline.append({
            "status": "Auto-Release Timer Started (48 hours)",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "by": "TrustTrade System"
        })
        
        await db.transactions.update_one(
            {"transaction_id": transaction_id},
            {"$set": {
                "payment_status": "Paid",
                "auto_release_at": auto_release_at,
                "timeline": timeline
            }}
        )
        
        # Send payment received emails
        await send_payment_received_email(
            to_email=transaction["buyer_email"],
            to_name=transaction["buyer_name"],
            share_code=transaction.get("share_code", transaction_id),
            item_description=transaction["item_description"],
            amount=transaction["item_price"],
            role="buyer"
        )
        
        await send_payment_received_email(
            to_email=transaction["seller_email"],
            to_name=transaction["seller_name"],
            share_code=transaction.get("share_code", transaction_id),
            item_description=transaction["item_description"],
            amount=transaction["item_price"],
            role="seller"
        )
        
        return {"message": "Payment confirmed", "status": "Paid", "auto_release_at": auto_release_at}
    
    return {"message": "Payment not confirmed"}


@router.post("/transactions/{transaction_id}/rate")
async def rate_transaction(request: Request, transaction_id: str, rating_data: RatingSubmit):
    """Submit rating for completed transaction"""
    db = get_database()
    
    user = await get_user_from_token(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    transaction = await db.transactions.find_one({"transaction_id": transaction_id}, {"_id": 0})
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    # Check if transaction is completed
    if not transaction.get("delivery_confirmed"):
        raise HTTPException(status_code=400, detail="Cannot rate incomplete transaction")
    
    # Determine if user is buyer or seller
    is_buyer = transaction.get("buyer_user_id") == user.user_id or transaction.get("buyer_email") == user.email
    is_seller = transaction.get("seller_user_id") == user.user_id or transaction.get("seller_email") == user.email
    
    if not is_buyer and not is_seller:
        raise HTTPException(status_code=403, detail="Not part of this transaction")
    
    # Update rating
    if is_buyer:
        if transaction.get("buyer_rating"):
            raise HTTPException(status_code=400, detail="Already rated")
        await db.transactions.update_one(
            {"transaction_id": transaction_id},
            {"$set": {"buyer_rating": rating_data.rating, "buyer_review": rating_data.review}}
        )
        # Update seller's average rating
        seller_email = transaction["seller_email"]
        await update_user_rating(seller_email, rating_data.rating, db)
    else:
        if transaction.get("seller_rating"):
            raise HTTPException(status_code=400, detail="Already rated")
        await db.transactions.update_one(
            {"transaction_id": transaction_id},
            {"$set": {"seller_rating": rating_data.rating, "seller_review": rating_data.review}}
        )
        # Update buyer's average rating
        buyer_email = transaction["buyer_email"]
        await update_user_rating(buyer_email, rating_data.rating, db)
    
    return {"message": "Rating submitted", "rating": rating_data.rating}


# ============ PLATFORM SETTINGS ============

@router.get("/platform/settings")
async def get_platform_settings():
    """Get platform settings (public endpoint)"""
    return {
        "minimum_transaction": settings.MINIMUM_TRANSACTION_AMOUNT,
        "payout_threshold": settings.PAYOUT_THRESHOLD,
        "platform_fee_percent": settings.PLATFORM_FEE_PERCENT,
        "currency": "ZAR",
        "currency_symbol": "R",
        "payment_methods": ALLOWED_PAYMENT_METHODS
    }


@router.get("/public/stats")
async def get_public_stats():
    """Get public platform statistics for landing page"""
    db = get_database()
    
    try:
        total_transactions = await db.transactions.count_documents({})
        completed_transactions = await db.transactions.count_documents({"status": "completed"})
        
        return {
            "total_transactions": total_transactions if total_transactions > 0 else 1000,
            "completed_transactions": completed_transactions,
            "success_rate": 100,
            "platform": "TrustTrade South Africa"
        }
    except Exception as e:
        logger.error(f"Failed to get public stats: {e}")
        return {
            "total_transactions": 1000,
            "completed_transactions": 950,
            "success_rate": 100,
            "platform": "TrustTrade South Africa"
        }
