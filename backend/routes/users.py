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
from collections import defaultdict

from core.config import settings
from core.database import get_database
from core.security import get_user_from_token
from models.user import (
    User, UserProfile, UserReport, UserReportCreate,
    BankingDetailsUpdate, BankingChangeVerify, TermsAcceptance, VerificationStatus,
    PhoneOtpRequest, PhoneOtpVerify
)
from models.common import RiskAssessment
from sms_service import send_otp_sms, send_sms

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["Users"])

# In-memory OTP store (use Redis in production)
otp_store = {}

# Rate limiting stores (use Redis in production)
otp_rate_limit_store = defaultdict(list)  # user_id -> list of timestamps
otp_attempt_store = defaultdict(int)  # otp_key -> failed attempt count
otp_lockout_store = {}  # user_id -> lockout_until timestamp

# Rate limit constants
OTP_MAX_REQUESTS_PER_WINDOW = 3  # Max 3 OTP requests
OTP_RATE_LIMIT_WINDOW_MINUTES = 10  # per 10 minutes
OTP_COOLDOWN_SECONDS = 60  # 60 seconds between requests
OTP_MAX_VERIFY_ATTEMPTS = 5  # Max 5 incorrect attempts
OTP_LOCKOUT_MINUTES = 30  # 30 minute lockout after max attempts


def get_client_ip(request: Request) -> str:
    """Extract client IP from request headers"""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def normalize_phone(phone: str) -> str:
    """Normalize phone number to 9-digit format without country code"""
    phone = phone.replace(" ", "").replace("-", "").replace("+", "")
    if phone.startswith("0"):
        phone = phone[1:]
    if phone.startswith("27"):
        phone = phone[2:]
    return phone


def phone_matches_masked(entered_phone: str, masked_phone: str) -> bool:
    """
    Check if entered phone could match the masked format.
    masked_phone format: +27•••2758 or +27****2758
    """
    if not masked_phone:
        return True  # No mask to validate against
    
    # Normalize entered phone
    normalized = normalize_phone(entered_phone)
    if len(normalized) < 9:
        return False
    
    # Extract last 4 digits from masked phone (after the dots/asterisks)
    import re
    # Match patterns like +27•••2758 or +27****2758
    match = re.search(r'(\d{4})$', masked_phone)
    if match:
        expected_last4 = match.group(1)
        return normalized.endswith(expected_last4)
    
    return True  # Can't validate, allow


async def log_otp_request(db, user_id: str, phone: str, ip: str, action: str, success: bool, reason: str = None):
    """Log OTP request for audit trail"""
    log_entry = {
        "user_id": user_id,
        "phone": f"+27{phone[:2]}****{phone[-2:]}" if len(phone) >= 4 else "invalid",
        "ip": ip,
        "action": action,  # "send" or "verify"
        "success": success,
        "reason": reason,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    
    try:
        await db.otp_logs.insert_one(log_entry)
    except Exception as e:
        logger.error(f"[OTP_LOG] Failed to log: {e}")
    
    # Also log to application logger
    status = "SUCCESS" if success else "FAILED"
    logger.info(f"[OTP_{action.upper()}] {status} | user={user_id} | phone={log_entry['phone']} | ip={ip} | reason={reason}")


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
    """
    Send OTP to phone number with rate limiting and validation.
    
    Security features:
    - Rate limiting: Max 3 requests per 10 minutes
    - Cooldown: 60 seconds between requests
    - Phone validation against masked format (if provided)
    - Lockout after max failed verification attempts
    - Full audit logging
    """
    db = get_database()
    client_ip = get_client_ip(request)
    
    user = await get_user_from_token(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Check if user is locked out
    lockout_until = otp_lockout_store.get(user.user_id)
    if lockout_until and datetime.now(timezone.utc) < lockout_until:
        remaining_minutes = int((lockout_until - datetime.now(timezone.utc)).total_seconds() / 60)
        await log_otp_request(db, user.user_id, "", client_ip, "send", False, f"locked_out_{remaining_minutes}min")
        raise HTTPException(
            status_code=429, 
            detail=f"Too many failed attempts. Please try again in {remaining_minutes} minutes."
        )
    
    # Normalize phone
    phone = normalize_phone(data.phone_number)
    
    if len(phone) < 9:
        await log_otp_request(db, user.user_id, phone, client_ip, "send", False, "invalid_phone_format")
        raise HTTPException(status_code=400, detail="Invalid phone number format")

    # Phone uniqueness — a number already verified on another account can't be
    # attached to a second one. Match common stored formats to be robust.
    phone_variants = [f"+27{phone}", f"27{phone}", f"0{phone}", phone]
    existing_phone_user = await db.users.find_one({
        "phone": {"$in": phone_variants},
        "phone_verified": True,
        "user_id": {"$ne": user.user_id},
    })
    if existing_phone_user:
        await log_otp_request(db, user.user_id, phone, client_ip, "send", False, "phone_already_registered")
        raise HTTPException(status_code=400, detail="This phone number is already registered. Please log in instead.")

    # Validate phone against expected masked format (if provided in request)
    expected_masked = getattr(data, 'expected_phone_masked', None)
    if expected_masked and not phone_matches_masked(phone, expected_masked):
        await log_otp_request(db, user.user_id, phone, client_ip, "send", False, "phone_mismatch")
        raise HTTPException(
            status_code=400, 
            detail="Phone number doesn't match the expected format. Please enter the number this transaction was sent to."
        )
    
    # Rate limiting check
    now = datetime.now(timezone.utc)
    window_start = now - timedelta(minutes=OTP_RATE_LIMIT_WINDOW_MINUTES)
    
    # Clean old entries and count recent requests
    user_requests = otp_rate_limit_store[user.user_id]
    user_requests = [ts for ts in user_requests if ts > window_start]
    otp_rate_limit_store[user.user_id] = user_requests
    
    if len(user_requests) >= OTP_MAX_REQUESTS_PER_WINDOW:
        await log_otp_request(db, user.user_id, phone, client_ip, "send", False, "rate_limit_exceeded")
        raise HTTPException(
            status_code=429, 
            detail=f"Too many requests. Maximum {OTP_MAX_REQUESTS_PER_WINDOW} codes per {OTP_RATE_LIMIT_WINDOW_MINUTES} minutes. Please wait and try again."
        )
    
    # Cooldown check (must wait 60 seconds between requests)
    if user_requests:
        last_request = max(user_requests)
        cooldown_remaining = OTP_COOLDOWN_SECONDS - (now - last_request).total_seconds()
        if cooldown_remaining > 0:
            await log_otp_request(db, user.user_id, phone, client_ip, "send", False, f"cooldown_{int(cooldown_remaining)}s")
            raise HTTPException(
                status_code=429, 
                detail=f"Please wait {int(cooldown_remaining)} seconds before requesting another code."
            )
    
    # Generate OTP
    otp = ''.join(random.choices(string.digits, k=6))
    otp_key = f"{user.user_id}_{phone}"
    
    # Store OTP with metadata
    otp_store[otp_key] = {
        "otp": otp,
        "expires": now + timedelta(minutes=10),
        "created_at": now,
        "ip": client_ip
    }
    
    # Reset attempt counter for this OTP
    otp_attempt_store[otp_key] = 0
    
    # Record this request for rate limiting
    otp_rate_limit_store[user.user_id].append(now)
    
    # Send OTP via SMS
    sms_result = await send_otp_sms(f"+27{phone}", otp)
    
    if not sms_result.get("success"):
        logger.error(f"[OTP_SEND] SMS failed: {sms_result.get('error')}")
        await log_otp_request(db, user.user_id, phone, client_ip, "send", False, f"sms_failed: {sms_result.get('error')}")
        raise HTTPException(status_code=500, detail="Failed to send verification code. Please try again.")
    
    await log_otp_request(db, user.user_id, phone, client_ip, "send", True, "otp_sent")
    
    # Calculate remaining requests in window
    remaining_requests = OTP_MAX_REQUESTS_PER_WINDOW - len(otp_rate_limit_store[user.user_id])
    
    return {
        "message": "Verification code sent successfully",
        "phone": f"+27{phone[:2]}****{phone[-2:]}",
        "expires_in_minutes": 10,
        "cooldown_seconds": OTP_COOLDOWN_SECONDS,
        "remaining_requests": remaining_requests
    }


@router.post("/verification/phone/verify-otp")
async def verify_phone_otp_legacy(request: Request, data: PhoneOtpVerify):
    """
    Verify phone OTP with attempt limiting.
    
    Security features:
    - Max 5 incorrect attempts before temporary lockout
    - Full audit logging
    - Clear error messages
    """
    db = get_database()
    client_ip = get_client_ip(request)
    
    user = await get_user_from_token(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Check if user is locked out
    lockout_until = otp_lockout_store.get(user.user_id)
    if lockout_until and datetime.now(timezone.utc) < lockout_until:
        remaining_minutes = int((lockout_until - datetime.now(timezone.utc)).total_seconds() / 60)
        await log_otp_request(db, user.user_id, "", client_ip, "verify", False, f"locked_out_{remaining_minutes}min")
        raise HTTPException(
            status_code=429, 
            detail=f"Too many failed attempts. Please try again in {remaining_minutes} minutes."
        )
    
    # Normalize phone
    phone = normalize_phone(data.phone_number)
    otp_key = f"{user.user_id}_{phone}"
    
    stored = otp_store.get(otp_key)
    if not stored:
        await log_otp_request(db, user.user_id, phone, client_ip, "verify", False, "no_otp_found")
        raise HTTPException(
            status_code=400, 
            detail="No verification code found. Please request a new code."
        )
    
    # Check expiration
    if datetime.now(timezone.utc) > stored["expires"]:
        del otp_store[otp_key]
        otp_attempt_store.pop(otp_key, None)
        await log_otp_request(db, user.user_id, phone, client_ip, "verify", False, "otp_expired")
        raise HTTPException(
            status_code=400, 
            detail="Verification code expired. Please request a new code."
        )
    
    # Check attempt limit
    current_attempts = otp_attempt_store.get(otp_key, 0)
    remaining_attempts = OTP_MAX_VERIFY_ATTEMPTS - current_attempts
    
    # Verify OTP
    if stored["otp"] != data.otp:
        # Increment attempt counter
        otp_attempt_store[otp_key] = current_attempts + 1
        remaining_attempts -= 1
        
        await log_otp_request(db, user.user_id, phone, client_ip, "verify", False, f"invalid_otp_attempt_{current_attempts + 1}")
        
        # Check if max attempts reached
        if remaining_attempts <= 0:
            # Lock out user
            otp_lockout_store[user.user_id] = datetime.now(timezone.utc) + timedelta(minutes=OTP_LOCKOUT_MINUTES)
            # Clear the OTP
            del otp_store[otp_key]
            otp_attempt_store.pop(otp_key, None)
            
            await log_otp_request(db, user.user_id, phone, client_ip, "verify", False, "max_attempts_lockout")
            
            raise HTTPException(
                status_code=429, 
                detail=f"Too many incorrect attempts. Your account is temporarily locked. Please try again in {OTP_LOCKOUT_MINUTES} minutes."
            )
        
        raise HTTPException(
            status_code=400, 
            detail=f"Incorrect verification code. {remaining_attempts} attempts remaining."
        )
    
    # OTP verified successfully
    del otp_store[otp_key]
    otp_attempt_store.pop(otp_key, None)
    
    # Clear any lockout
    otp_lockout_store.pop(user.user_id, None)
    
    await log_otp_request(db, user.user_id, phone, client_ip, "verify", True, "verified")
    
    # Phone uniqueness (defense, in case the number was claimed between send & verify):
    # never attach a number already verified on another account.
    phone_variants = [f"+27{phone}", f"27{phone}", f"0{phone}", phone]
    existing_phone_user = await db.users.find_one({
        "phone": {"$in": phone_variants},
        "phone_verified": True,
        "user_id": {"$ne": user.user_id},
    })
    if existing_phone_user:
        raise HTTPException(status_code=400, detail="This phone number is already registered. Please log in instead.")

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
    
    logger.info("=== BANKING DETAILS UPDATE ===")
    logger.info(f"User: {user.email} ({user.user_id})")

    if not details.bank_name or not details.account_number or not details.branch_code:
        raise HTTPException(status_code=400, detail="Please fill in all required fields.")
    account_number_clean = details.account_number.strip()
    if not account_number_clean.isdigit():
        raise HTTPException(status_code=400, detail="Account number must contain digits only.")
    if len(account_number_clean) < 11:
        raise HTTPException(
            status_code=400,
            detail=f"Account number is too short ({len(account_number_clean)} digits). Enter the full bank account number (minimum 11 digits).",
        )
    details.account_number = account_number_clean

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
                "account_number": details.account_number,
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



@router.post("/banking-details/request-reset")
async def request_banking_reset(request: Request):
    """
    Request a banking details reset.
    User must request this, admin must approve.
    """
    db = get_database()
    
    user = await get_user_from_token(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Check if user has banking details
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
    
    if not user_doc.get("banking_details_completed"):
        raise HTTPException(status_code=400, detail="No banking details to reset")
    
    # Check for existing pending request
    existing = await db.banking_reset_requests.find_one({
        "user_id": user.user_id,
        "status": "pending"
    })
    
    if existing:
        raise HTTPException(status_code=400, detail="You already have a pending reset request")
    
    # Create reset request
    request_id = f"brr_{uuid.uuid4().hex[:12]}"
    
    await db.banking_reset_requests.insert_one({
        "request_id": request_id,
        "user_id": user.user_id,
        "user_email": user.email,
        "user_name": user_doc.get("name"),
        "reason": "User requested banking details reset",
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    logger.info(f"[BANKING_RESET] User {user.email} requested banking details reset: {request_id}")
    
    return {
        "success": True,
        "request_id": request_id,
        "message": "Your request has been submitted. An admin will review it within 24 hours."
    }


@router.get("/banking-details/reset-status")
async def get_banking_reset_status(request: Request):
    """Get status of user's banking reset request"""
    db = get_database()
    
    user = await get_user_from_token(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Find most recent request
    reset_request = await db.banking_reset_requests.find_one(
        {"user_id": user.user_id},
        sort=[("created_at", -1)]
    )
    
    if not reset_request:
        return {"has_request": False}

    return {
        "has_request": True,
        "request_id": reset_request.get("request_id"),
        "status": reset_request.get("status"),
        "created_at": reset_request.get("created_at"),
        "approved_at": reset_request.get("approved_at")
    }


# ============ BANKING DETAILS CHANGE FLOW ============

# In-memory OTP store for banking change requests (request_id -> otp string)
banking_change_otp_store = {}

BANKING_CHANGE_MAX_PER_DAY = 3
BANKING_CHANGE_OTP_EXPIRY_MINUTES = 10
BANKING_CHANGE_MAX_ATTEMPTS = 5
BANKING_CHANGE_COOLOFF_HOURS = 24


@router.post("/users/banking-details/change-request")
async def initiate_banking_change(request: Request, details: BankingDetailsUpdate):
    """
    Start a banking details change. Sends a 6-digit OTP to the user's
    email and (if verified) SMS. New details sit in pending state until
    OTP is confirmed and the 24-hour cooling-off period elapses.
    """
    from email_service import send_banking_change_otp_email

    db = get_database()
    user = await get_user_from_token(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})

    if not user_doc.get("banking_details_completed"):
        raise HTTPException(
            status_code=400,
            detail="No existing banking details found. Please use the standard setup flow."
        )

    # Block if another request is already in flight
    existing = await db.banking_change_requests.find_one({
        "user_id": user.user_id,
        "status": {"$in": ["pending_verification", "verified"]},
    })
    if existing:
        raise HTTPException(
            status_code=400,
            detail="You already have a pending change request. Please verify or cancel it first."
        )

    # Rate limit: max 3 requests per rolling 24 hours
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    recent_count = await db.banking_change_requests.count_documents({
        "user_id": user.user_id,
        "created_at": {"$gt": cutoff},
    })
    if recent_count >= BANKING_CHANGE_MAX_PER_DAY:
        raise HTTPException(
            status_code=429,
            detail="Too many change requests today. Please try again after 24 hours."
        )

    if not details.bank_name or not details.account_number or not details.branch_code:
        raise HTTPException(status_code=400, detail="Please fill in all required fields.")
    account_number_clean = details.account_number.strip()
    if not account_number_clean.isdigit():
        raise HTTPException(status_code=400, detail="Account number must contain digits only.")
    if len(account_number_clean) < 11:
        raise HTTPException(
            status_code=400,
            detail=f"Account number is too short ({len(account_number_clean)} digits). Enter the full bank account number (minimum 11 digits).",
        )
    details.account_number = account_number_clean

    otp = ''.join(random.choices(string.digits, k=6))
    request_id = f"bcr_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc)

    await db.banking_change_requests.insert_one({
        "request_id": request_id,
        "user_id": user.user_id,
        "new_details": {
            "bank_name": details.bank_name,
            "account_holder": details.account_holder,
            "account_number": details.account_number,
            "branch_code": details.branch_code,
            "account_type": details.account_type,
            "id_number": details.id_number or "",
        },
        "otp_expires": (now + timedelta(minutes=BANKING_CHANGE_OTP_EXPIRY_MINUTES)).isoformat(),
        "otp_attempts": 0,
        "status": "pending_verification",
        "created_at": now.isoformat(),
    })

    banking_change_otp_store[request_id] = otp

    # Send OTP via email (primary channel — always)
    try:
        await send_banking_change_otp_email(user.email, user.name, otp)
    except Exception as e:
        logger.error(f"[BANKING_CHANGE] OTP email failed for {user.email}: {e}")

    # Send OTP via SMS if user has a verified phone
    phone = getattr(user, "phone", None) or user_doc.get("phone")
    sms_sent_to = None
    if phone and user_doc.get("phone_verified"):
        try:
            sms_msg = (
                f"TrustTrade security code: {otp}. "
                f"Banking details change verification. "
                f"Expires in {BANKING_CHANGE_OTP_EXPIRY_MINUTES} minutes. "
                f"Do NOT share this code."
            )
            await send_sms(phone, sms_msg)
            p = phone.replace("+27", "").replace(" ", "")
            sms_sent_to = f"+27{p[:2]}****{p[-2:]}" if len(p) >= 4 else None
        except Exception as e:
            logger.error(f"[BANKING_CHANGE] OTP SMS failed for {user.email}: {e}")

    logger.info(f"[BANKING_CHANGE] Initiated for {user.email}, request_id={request_id}")

    email_masked = f"{user.email[:3]}***@{user.email.split('@')[1]}"
    return {
        "request_id": request_id,
        "otp_expires_in_minutes": BANKING_CHANGE_OTP_EXPIRY_MINUTES,
        "email_sent_to": email_masked,
        "sms_sent_to": sms_sent_to,
    }


@router.post("/users/banking-details/change-request/verify")
async def verify_banking_change(request: Request, data: BankingChangeVerify):
    """
    Verify the OTP for a banking change request and start the 24-hour cooling-off.
    """
    from email_service import send_banking_change_confirmed_email

    db = get_database()
    user = await get_user_from_token(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    change_req = await db.banking_change_requests.find_one({
        "request_id": data.request_id,
        "user_id": user.user_id,
        "status": "pending_verification",
    })
    if not change_req:
        raise HTTPException(
            status_code=404,
            detail="Change request not found or already processed."
        )

    now = datetime.now(timezone.utc)

    # Check OTP expiry
    otp_expires = datetime.fromisoformat(change_req["otp_expires"].replace("Z", "+00:00"))
    if now > otp_expires:
        await db.banking_change_requests.update_one(
            {"request_id": data.request_id},
            {"$set": {"status": "expired"}}
        )
        banking_change_otp_store.pop(data.request_id, None)
        raise HTTPException(
            status_code=400,
            detail="Verification code expired. Please start a new change request."
        )

    # Check attempt cap
    attempts = change_req.get("otp_attempts", 0)
    if attempts >= BANKING_CHANGE_MAX_ATTEMPTS:
        await db.banking_change_requests.update_one(
            {"request_id": data.request_id},
            {"$set": {"status": "locked"}}
        )
        banking_change_otp_store.pop(data.request_id, None)
        raise HTTPException(
            status_code=429,
            detail="Too many incorrect attempts. Please start a new change request."
        )

    stored_otp = banking_change_otp_store.get(data.request_id)
    if not stored_otp or stored_otp != data.otp.strip():
        await db.banking_change_requests.update_one(
            {"request_id": data.request_id},
            {"$inc": {"otp_attempts": 1}}
        )
        remaining = BANKING_CHANGE_MAX_ATTEMPTS - attempts - 1
        raise HTTPException(
            status_code=400,
            detail=f"Incorrect code. {max(remaining, 0)} attempt(s) remaining."
        )

    # OTP correct — start cooling-off period
    activates_at = now + timedelta(hours=BANKING_CHANGE_COOLOFF_HOURS)

    await db.banking_change_requests.update_one(
        {"request_id": data.request_id},
        {"$set": {
            "status": "verified",
            "verified_at": now.isoformat(),
            "activates_at": activates_at.isoformat(),
        }}
    )
    banking_change_otp_store.pop(data.request_id, None)

    new_details = change_req["new_details"]
    try:
        await send_banking_change_confirmed_email(
            user.email, user.name, new_details["bank_name"], activates_at.isoformat()
        )
    except Exception as e:
        logger.error(f"[BANKING_CHANGE] Confirmation email failed for {user.email}: {e}")

    logger.info(f"[BANKING_CHANGE] Verified for {user.email}, activates {activates_at.isoformat()}")

    return {
        "message": "Verification successful. New banking details will activate after the 24-hour security hold.",
        "activates_at": activates_at.isoformat(),
    }


@router.get("/users/banking-details/change-request/status")
async def get_banking_change_status(request: Request):
    """
    Return any in-flight banking change request for the current user.
    Auto-activates the new details once the cooling-off period has elapsed.
    """
    db = get_database()
    user = await get_user_from_token(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    change_req = await db.banking_change_requests.find_one(
        {"user_id": user.user_id, "status": {"$in": ["pending_verification", "verified"]}},
        sort=[("created_at", -1)],
    )

    if not change_req:
        return {"has_pending": False}

    now = datetime.now(timezone.utc)

    # Auto-activate once cooling-off has passed
    if change_req["status"] == "verified":
        activates_at = datetime.fromisoformat(change_req["activates_at"].replace("Z", "+00:00"))
        if now >= activates_at:
            await _activate_banking_change(db, user, change_req)
            return {"has_pending": False, "just_activated": True}

    new_details = change_req["new_details"]
    return {
        "has_pending": True,
        "request_id": change_req["request_id"],
        "status": change_req["status"],
        "created_at": change_req["created_at"],
        "activates_at": change_req.get("activates_at"),
        "new_bank_name": new_details["bank_name"],
        "new_account_last4": new_details["account_number"][-4:],
    }


@router.delete("/users/banking-details/change-request")
async def cancel_banking_change(request: Request):
    """Cancel a pending or verified (still in cooling-off) banking change request."""
    from email_service import send_banking_change_cancelled_email

    db = get_database()
    user = await get_user_from_token(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    change_req = await db.banking_change_requests.find_one({
        "user_id": user.user_id,
        "status": {"$in": ["pending_verification", "verified"]},
    })
    if not change_req:
        raise HTTPException(status_code=404, detail="No pending change request found.")

    banking_change_otp_store.pop(change_req["request_id"], None)

    await db.banking_change_requests.update_one(
        {"request_id": change_req["request_id"]},
        {"$set": {
            "status": "cancelled",
            "cancelled_at": datetime.now(timezone.utc).isoformat(),
        }}
    )

    try:
        await send_banking_change_cancelled_email(user.email, user.name)
    except Exception as e:
        logger.error(f"[BANKING_CHANGE] Cancellation email failed for {user.email}: {e}")

    logger.info(f"[BANKING_CHANGE] Cancelled for {user.email}, request_id={change_req['request_id']}")
    return {"success": True, "message": "Change request cancelled."}


async def _activate_banking_change(db, user, change_req: dict):
    """Apply verified banking details after the cooling-off period."""
    from tradesafe_service import get_or_reuse_user_token, update_token_banking_details
    from email_service import send_banking_details_activated_email

    new_details = change_req["new_details"]
    now = datetime.now(timezone.utc)

    token_id = await get_or_reuse_user_token(
        db=db,
        user_id=user.user_id,
        name=user.name,
        email=user.email,
        mobile=getattr(user, "phone", None) or "+27000000000",
    )

    if token_id:
        try:
            await update_token_banking_details(
                token_id=token_id,
                bank_name=new_details["bank_name"],
                account_holder=new_details["account_holder"],
                account_number=new_details["account_number"],
                branch_code=new_details["branch_code"],
                account_type=new_details["account_type"],
                id_number=new_details.get("id_number", ""),
                payout_interval="IMMEDIATE",
                refund_interval="IMMEDIATE",
            )
        except Exception as e:
            logger.error(f"[BANKING_CHANGE] TradeSafe token update failed: {e}")

    await db.users.update_one(
        {"user_id": user.user_id},
        {"$set": {
            "banking_details": {
                "bank_name": new_details["bank_name"],
                "account_holder": new_details["account_holder"],
                "account_number": new_details["account_number"],
                "branch_code": new_details["branch_code"],
                "account_type": new_details["account_type"],
                "updated_at": now.isoformat(),
            },
            "banking_details_completed": True,
            "tradesafe_token_id": token_id,
        }}
    )

    await db.banking_change_requests.update_one(
        {"request_id": change_req["request_id"]},
        {"$set": {"status": "activated", "activated_at": now.isoformat()}}
    )

    try:
        await send_banking_details_activated_email(user.email, user.name, new_details["bank_name"])
    except Exception as e:
        logger.error(f"[BANKING_CHANGE] Activation email failed for {user.email}: {e}")

    logger.info(f"[BANKING_CHANGE] Activated for {user.email}, request_id={change_req['request_id']}")
