"""
TrustTrade User Routes
Handles user profiles, verification, reports, wallet, and banking
"""

import uuid
import shutil
import random
import string
import logging
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Request, UploadFile, File

from core.config import settings
from core.database import get_database
from core.security import get_user_from_token
from models.user import (
    User, UserProfile, UserReport, UserReportCreate,
    BankingDetailsUpdate, TermsAcceptance, VerificationStatus,
    PhoneOtpRequest, PhoneOtpVerify
)
from models.common import RiskAssessment
from sms_service import send_otp_sms

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["Users"])

# In-memory OTP store (use Redis in production)
otp_store = {}


# ============ TERMS ============

@router.get("/terms")
async def get_terms():
    """Get terms and conditions content"""
    terms_content = """
# TrustTrade Terms & Conditions

## 1. Service Description
TrustTrade is a neutral escrow payment facilitator. TrustTrade does not take possession, ownership, or control of goods sold between users.

## 2. Item Responsibility
TrustTrade does not guarantee the condition, authenticity, legality, or performance of any item listed. Users are fully responsible for ensuring item descriptions are accurate and truthful.

## 3. Dispute Resolution
In the event of a dispute, TrustTrade may review evidence submitted by both parties and make a decision at its sole discretion.

## 4. Liability Limitation
TrustTrade's total liability is limited to the transaction fee charged (2% of item price).

## 5. Account Suspension
TrustTrade reserves the right to suspend accounts engaged in fraudulent or abusive behavior. Users who receive 3 valid disputes may have their accounts flagged for review.

## 6. Legal Compliance
All users agree to comply with South African law and regulations.

## 7. Acceptance
By using TrustTrade services, you agree to these terms and conditions.
"""
    return {"content": terms_content}


@router.post("/users/accept-terms")
async def accept_terms(request: Request, acceptance: TermsAcceptance):
    """User accepts terms and conditions"""
    db = get_database()
    
    user = await get_user_from_token(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    if acceptance.accepted:
        await db.users.update_one(
            {"user_id": user.user_id},
            {"$set": {
                "terms_accepted": True,
                "terms_accepted_at": datetime.now(timezone.utc).isoformat()
            }}
        )
        return {"message": "Terms accepted"}
    else:
        raise HTTPException(status_code=400, detail="Terms must be accepted")


# ============ USER PROFILE ============

@router.get("/users/{user_id}/profile", response_model=UserProfile)
async def get_user_profile(request: Request, user_id: str):
    """Get public user profile"""
    db = get_database()
    
    current_user = await get_user_from_token(request, db)
    if not current_user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Calculate trust score dynamically
    successful_trades = user_doc.get("successful_trades", 0)
    average_rating = user_doc.get("average_rating", 0.0)
    valid_disputes = user_doc.get("valid_disputes_count", 0)
    is_verified = user_doc.get("verified", False)
    
    # Trust score formula: max 100
    trade_score = min(40, successful_trades * 4)
    rating_score = int(average_rating * 6)
    dispute_score = max(0, 20 - valid_disputes * 5)
    verification_score = 10 if is_verified else 0
    
    calculated_trust_score = trade_score + rating_score + dispute_score + verification_score
    trust_score = user_doc.get("trust_score", 50)
    
    # Update trust score in database if changed
    if calculated_trust_score != trust_score:
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"trust_score": calculated_trust_score}}
        )
        trust_score = calculated_trust_score
    
    return UserProfile(
        user_id=user_doc["user_id"],
        name=user_doc.get("name", ""),
        email=user_doc.get("email", ""),
        picture=user_doc.get("picture"),
        trust_score=trust_score,
        total_trades=user_doc.get("total_trades", 0),
        successful_trades=user_doc.get("successful_trades", 0),
        average_rating=user_doc.get("average_rating", 0.0),
        valid_disputes_count=user_doc.get("valid_disputes_count", 0),
        badges=user_doc.get("badges", []),
        verified=user_doc.get("verified", False),
        suspended=user_doc.get("suspension_flag", False),
        created_at=user_doc.get("created_at", datetime.now(timezone.utc).isoformat())
    )


# ============ REPORTS ============

@router.post("/reports", response_model=UserReport)
async def create_report(request: Request, report_data: UserReportCreate):
    """Create a user report"""
    db = get_database()
    
    user = await get_user_from_token(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Cannot report yourself
    if report_data.reported_user_id == user.user_id:
        raise HTTPException(status_code=400, detail="Cannot report yourself")
    
    # Check if reported user exists
    reported_user = await db.users.find_one({"user_id": report_data.reported_user_id})
    if not reported_user:
        raise HTTPException(status_code=404, detail="Reported user not found")
    
    # Create report
    report_id = f"report_{uuid.uuid4().hex[:12]}"
    report = {
        "report_id": report_id,
        "reporter_user_id": user.user_id,
        "reported_user_id": report_data.reported_user_id,
        "reason": report_data.reason,
        "description": report_data.description,
        "transaction_id": report_data.transaction_id,
        "status": "Pending",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.reports.insert_one(report)
    
    return UserReport(**report)


@router.get("/reports", response_model=List[UserReport])
async def list_reports(request: Request):
    """List reports (admin only)"""
    db = get_database()
    
    user = await get_user_from_token(request, db)
    if not user or not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")
    
    reports = await db.reports.find({}, {"_id": 0}).sort("created_at", -1).limit(500).to_list(500)
    return [UserReport(**r) for r in reports]


@router.patch("/reports/{report_id}")
async def update_report(request: Request, report_id: str, status: str, admin_notes: Optional[str] = None):
    """Update report status (admin only)"""
    db = get_database()
    
    user = await get_user_from_token(request, db)
    if not user or not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")
    
    update_data = {"status": status}
    if admin_notes:
        update_data["admin_notes"] = admin_notes
    
    result = await db.reports.update_one(
        {"report_id": report_id},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Report not found")
    
    return {"message": "Report updated"}


# ============ RISK ASSESSMENT ============

async def assess_user_risk(user_id: str, db) -> RiskAssessment:
    """Assess risk level for a user account"""
    risk_score = 0
    flags = []
    warnings = []
    
    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not user_doc:
        return RiskAssessment(risk_level="low", risk_score=0, flags=[], warnings=[])
    
    # Check account age
    created_at = user_doc.get("created_at")
    if created_at:
        account_age_days = (datetime.now(timezone.utc) - datetime.fromisoformat(created_at.replace('Z', '+00:00'))).days
    else:
        account_age_days = 0
    
    if account_age_days < 3:
        risk_score += 15
        flags.append("very_new_account")
        warnings.append("Account is less than 3 days old")
    
    # Check disputes
    valid_disputes = user_doc.get("valid_disputes_count", 0)
    if valid_disputes >= 3:
        risk_score += 40
        flags.append("many_disputes")
        warnings.append(f"User has {valid_disputes} valid disputes - account may need review")
    elif valid_disputes >= 1:
        risk_score += 15
        flags.append("has_disputes")
    
    # Check reports against user
    reports_count = await db.reports.count_documents({"reported_user_id": user_id, "status": {"$ne": "Dismissed"}})
    if reports_count >= 3:
        risk_score += 35
        flags.append("multiple_reports")
        warnings.append(f"User has {reports_count} reports against them")
    elif reports_count >= 1:
        risk_score += 10
        flags.append("has_reports")
    
    # Check verification status
    if not user_doc.get("verified", False):
        risk_score += 10
        flags.append("unverified")
    
    # Check trust score
    trust_score = user_doc.get("trust_score", 50)
    if trust_score < 20:
        risk_score += 30
        flags.append("very_low_trust")
        warnings.append(f"Very low trust score: {trust_score}/100")
    
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


@router.get("/risk/user/{user_id}")
async def get_user_risk_assessment(request: Request, user_id: str):
    """Get risk assessment for a user (admin or self only)"""
    db = get_database()
    
    current_user = await get_user_from_token(request, db)
    if not current_user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Only admin or the user themselves can see risk assessment
    if not current_user.is_admin and current_user.user_id != user_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    assessment = await assess_user_risk(user_id, db)
    return assessment


# ============ VERIFICATION ============

@router.get("/verification/status", response_model=VerificationStatus)
async def get_verification_status(request: Request):
    """Get user's verification status"""
    db = get_database()
    
    user = await get_user_from_token(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
    
    verification = user_doc.get("verification", {})
    
    return VerificationStatus(
        id_verified=verification.get("id_verified", False),
        id_document_path=verification.get("id_document_path"),
        selfie_verified=verification.get("selfie_verified", False),
        selfie_path=verification.get("selfie_path"),
        phone_verified=verification.get("phone_verified", False),
        phone_number=verification.get("phone_number"),
        fully_verified=user_doc.get("verified", False)
    )


@router.post("/verification/id")
async def upload_id_document(request: Request, file: UploadFile = File(...)):
    """Upload ID document for verification"""
    db = get_database()
    
    user = await get_user_from_token(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Validate file type
    allowed_types = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp', 'image/gif', 'application/pdf']
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Please upload a valid photo (JPG, PNG) or PDF file")
    
    # Validate file size (max 5MB)
    max_size = 5 * 1024 * 1024
    contents = await file.read()
    if len(contents) > max_size:
        raise HTTPException(status_code=400, detail="File size must be less than 5MB")
    
    # Save file
    upload_dir = Path(settings.VERIFICATION_PATH)
    upload_dir.mkdir(parents=True, exist_ok=True)
    
    file_ext = file.filename.split('.')[-1] if '.' in file.filename else 'jpg'
    file_path = upload_dir / f"id_{user.user_id}_{uuid.uuid4().hex[:8]}.{file_ext}"
    
    with open(file_path, "wb") as buffer:
        buffer.write(contents)
    
    # Update user verification status
    await db.users.update_one(
        {"user_id": user.user_id},
        {"$set": {
            "verification.id_verified": True,
            "verification.id_document_path": str(file_path),
            "verification.id_uploaded_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {"message": "ID document uploaded successfully", "status": "pending_review"}


@router.post("/verification/selfie")
async def upload_selfie(request: Request, file: UploadFile = File(...)):
    """Upload selfie for verification"""
    db = get_database()
    
    user = await get_user_from_token(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Validate file type
    allowed_types = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp', 'image/gif']
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Please upload a photo for your selfie")
    
    # Validate file size (max 5MB)
    max_size = 5 * 1024 * 1024
    contents = await file.read()
    if len(contents) > max_size:
        raise HTTPException(status_code=400, detail="File size must be less than 5MB")
    
    # Save file
    upload_dir = Path(settings.VERIFICATION_PATH)
    upload_dir.mkdir(parents=True, exist_ok=True)
    
    file_ext = file.filename.split('.')[-1] if '.' in file.filename else 'jpg'
    file_path = upload_dir / f"selfie_{user.user_id}_{uuid.uuid4().hex[:8]}.{file_ext}"
    
    with open(file_path, "wb") as buffer:
        buffer.write(contents)
    
    # Update user verification status
    await db.users.update_one(
        {"user_id": user.user_id},
        {"$set": {
            "verification.selfie_verified": True,
            "verification.selfie_path": str(file_path),
            "verification.selfie_uploaded_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {"message": "Selfie uploaded successfully", "status": "pending_review"}


@router.post("/verification/phone/send-otp")
async def send_phone_otp(request: Request, data: PhoneOtpRequest):
    """Send OTP to phone number"""
    db = get_database()
    
    user = await get_user_from_token(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Normalize phone
    phone = data.phone_number.replace(" ", "").replace("-", "").replace("+", "")
    if phone.startswith("0"):
        phone = phone[1:]
    if phone.startswith("27"):
        phone = phone[2:]
    
    if len(phone) < 9:
        raise HTTPException(status_code=400, detail="Invalid phone number")
    
    # Generate OTP
    otp = ''.join(random.choices(string.digits, k=6))
    
    # Store OTP (expires in 10 minutes)
    otp_store[f"{user.user_id}_{phone}"] = {
        "otp": otp,
        "expires": datetime.now(timezone.utc) + timedelta(minutes=10)
    }
    
    # Send OTP via SMS
    sms_result = await send_otp_sms(f"+27{phone}", otp)
    
    if not sms_result.get("success"):
        logger.error(f"Failed to send OTP SMS: {sms_result.get('error')}")
    
    logger.info(f"OTP sent to +27{phone}")
    
    return {"message": "OTP sent successfully", "phone": f"+27{phone[:2]}****{phone[-2:]}"}


@router.post("/verification/phone/verify-otp")
async def verify_phone_otp_legacy(request: Request, data: PhoneOtpVerify):
    """Verify phone OTP"""
    db = get_database()
    
    user = await get_user_from_token(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Normalize phone
    phone = data.phone_number.replace(" ", "").replace("-", "").replace("+", "")
    if phone.startswith("0"):
        phone = phone[1:]
    if phone.startswith("27"):
        phone = phone[2:]
    
    key = f"{user.user_id}_{phone}"
    
    stored = otp_store.get(key)
    if not stored:
        raise HTTPException(status_code=400, detail="No OTP found. Please request a new code.")
    
    if datetime.now(timezone.utc) > stored["expires"]:
        del otp_store[key]
        raise HTTPException(status_code=400, detail="OTP expired. Please request a new code.")
    
    if stored["otp"] != data.otp:
        raise HTTPException(status_code=400, detail="Invalid OTP")
    
    # OTP verified
    del otp_store[key]
    
    # Check if all verification steps are complete
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
    verification = user_doc.get("verification", {})
    
    all_verified = (
        verification.get("id_verified", False) and 
        verification.get("selfie_verified", False)
    )
    
    # Update user with phone verification
    update_data = {
        "verification.phone_verified": True,
        "verification.phone_number": f"+27{phone}",
        "phone": f"+27{phone}",
        "phone_verified": True,
        "verification.phone_verified_at": datetime.now(timezone.utc).isoformat()
    }
    
    if all_verified:
        update_data["verified"] = True
        badges = user_doc.get("badges", [])
        if "Verified" not in badges:
            badges.append("Verified")
            update_data["badges"] = badges
    
    await db.users.update_one(
        {"user_id": user.user_id},
        {"$set": update_data}
    )
    
    return {"message": "Phone verified successfully", "fully_verified": all_verified}


# ============ WALLET & BANKING ============

@router.get("/wallet")
async def get_wallet(request: Request):
    """Get user's wallet information"""
    db = get_database()
    
    user = await get_user_from_token(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")
    
    wallet_balance = user_doc.get("wallet_balance", 0.0)
    pending_balance = user_doc.get("pending_balance", 0.0)
    total_earned = user_doc.get("total_earned", 0.0)
    banking_details = user_doc.get("banking_details")
    
    # Calculate payout progress
    progress_percent = min((wallet_balance / settings.PAYOUT_THRESHOLD) * 100, 100)
    remaining = max(settings.PAYOUT_THRESHOLD - wallet_balance, 0)
    
    return {
        "balance": wallet_balance,
        "pending_balance": pending_balance,
        "total_earned": total_earned,
        "payout_threshold": settings.PAYOUT_THRESHOLD,
        "progress_percent": round(progress_percent, 1),
        "remaining_to_payout": remaining,
        "can_payout": wallet_balance >= settings.PAYOUT_THRESHOLD,
        "banking_details_set": banking_details is not None and bool(banking_details.get("account_number"))
    }


@router.get("/banking-details")
async def get_banking_details(request: Request):
    """Get user's banking details"""
    db = get_database()
    
    user = await get_user_from_token(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")
    
    banking = user_doc.get("banking_details", {})
    
    # Mask account number for security
    if banking and banking.get("account_number"):
        account_num = banking["account_number"]
        banking["account_number_masked"] = f"****{account_num[-4:]}" if len(account_num) >= 4 else "****"
    
    return banking or {}


@router.post("/users/banking-details")
async def update_user_banking_details(request: Request, details: BankingDetailsUpdate):
    """
    Update user's banking details and sync to TradeSafe token.
    Creates token if user doesn't have one, then updates with banking info.
    """
    from tradesafe_service import (
        get_or_reuse_user_token, update_token_banking_details
    )
    
    db = get_database()
    
    user = await get_user_from_token(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    logger.info(f"=== BANKING DETAILS UPDATE ===")
    logger.info(f"User: {user.email} ({user.user_id})")
    
    # Get or create TradeSafe token
    token_id = await get_or_reuse_user_token(
        db=db,
        user_id=user.user_id,
        name=user.name,
        email=user.email,
        mobile=user.phone or "+27000000000"
    )
    
    if not token_id:
        logger.error(f"Failed to get/create token for user {user.user_id}")
        raise HTTPException(status_code=500, detail="Failed to create payment token")
    
    # Update token with banking details
    result = await update_token_banking_details(
        token_id=token_id,
        bank_name=details.bank_name,
        account_holder=details.account_holder,
        account_number=details.account_number,
        branch_code=details.branch_code,
        account_type=details.account_type,
        id_number=details.id_number,
        payout_interval="IMMEDIATE",
        refund_interval="IMMEDIATE"
    )
    
    if not result.get("success"):
        logger.error(f"Token update failed: {result.get('error')}")
        # Still save locally even if TradeSafe update fails
        logger.info("Saving banking details locally despite TradeSafe error")
    
    # Save to user record
    await db.users.update_one(
        {"user_id": user.user_id},
        {"$set": {
            "banking_details": {
                "bank_name": details.bank_name,
                "account_holder": details.account_holder,
                "account_number": details.account_number[-4:],  # Only store last 4
                "branch_code": details.branch_code,
                "account_type": details.account_type,
                "updated_at": datetime.now(timezone.utc).isoformat()
            },
            "banking_details_completed": True,
            "tradesafe_token_id": token_id,
            "payout_interval": "IMMEDIATE",
            "refund_interval": "IMMEDIATE"
        }}
    )
    
    logger.info(f"Banking details saved for user {user.user_id}")
    
    return {
        "success": True,
        "token_id": token_id,
        "banking_details_completed": True,
        "payout_interval": "IMMEDIATE",
        "refund_interval": "IMMEDIATE"
    }


@router.get("/users/banking-details/status")
async def get_banking_details_status(request: Request):
    """
    Get user's banking details status.
    """
    db = get_database()
    
    user = await get_user_from_token(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
    
    return {
        "success": True,
        "banking_details_completed": user_doc.get("banking_details_completed", False),
        "has_tradesafe_token": bool(user_doc.get("tradesafe_token_id")),
        "token_id": user_doc.get("tradesafe_token_id"),
        "payout_interval": user_doc.get("payout_interval", "IMMEDIATE"),
        "refund_interval": user_doc.get("refund_interval", "IMMEDIATE")
    }


@router.post("/banking-details")
async def update_banking_details_deprecated(request: Request, details: BankingDetailsUpdate):
    """Update user's banking details - DEPRECATED"""
    raise HTTPException(status_code=400, detail="Please use /users/banking-details for secure banking updates")
