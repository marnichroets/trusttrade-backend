"""
TrustTrade Authentication Routes
Handles user authentication, sessions, and phone verification
"""

import uuid
import httpx
import logging
import random
import string
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, Request, Response

from core.config import settings
from core.database import get_database
from core.security import get_user_from_token, normalize_email
from models.user import (
    User, SessionExchangeRequest, TermsAcceptance,
    PhoneSubmitRequest, OTPVerifyRequest
)
from sms_service import (
    normalize_phone_number, generate_otp, send_otp_sms,
    create_otp_record, is_otp_valid, can_resend_otp
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["Authentication"])

# In-memory OTP store (use Redis in production)
otp_store = {}


@router.post("/session")
async def exchange_session(request: SessionExchangeRequest, response: Response):
    """Exchange session_id for user data and set session cookie"""
    db = get_database()
    
    try:
        # Call Emergent Auth API
        async with httpx.AsyncClient() as client:
            auth_response = await client.get(
                "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
                headers={"X-Session-ID": request.session_id},
                timeout=10.0
            )
            
            if auth_response.status_code != 200:
                raise HTTPException(status_code=401, detail="Invalid session")
            
            auth_data = auth_response.json()
        
        # Check if user exists
        email = auth_data["email"]
        user_doc = await db.users.find_one({"email": email}, {"_id": 0})
        
        # Determine if admin
        is_admin = email == settings.ADMIN_EMAIL
        
        if not user_doc:
            # Create new user
            user_id = f"user_{uuid.uuid4().hex[:12]}"
            user_data = {
                "user_id": user_id,
                "email": email,
                "name": auth_data.get("name", ""),
                "picture": auth_data.get("picture", ""),
                "role": "admin" if is_admin else "buyer",
                "is_admin": is_admin,
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            await db.users.insert_one(user_data)
        else:
            user_id = user_doc["user_id"]
            # Update user if needed
            update_data = {
                "name": auth_data.get("name", user_doc.get("name", "")),
                "picture": auth_data.get("picture", user_doc.get("picture", "")),
                "is_admin": is_admin,
                "role": "admin" if is_admin else user_doc.get("role", "buyer")
            }
            await db.users.update_one(
                {"user_id": user_id},
                {"$set": update_data}
            )
        
        # Create session
        session_token = auth_data["session_token"]
        expires_at = datetime.now(timezone.utc) + timedelta(days=7)
        
        session_data = {
            "user_id": user_id,
            "session_token": session_token,
            "expires_at": expires_at.isoformat(),
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        
        await db.user_sessions.insert_one(session_data)
        
        # Set cookie
        response.set_cookie(
            key="session_token",
            value=session_token,
            httponly=True,
            secure=True,
            samesite="none",
            path="/",
            max_age=7*24*60*60
        )
        
        # Return user data with session token for localStorage fallback
        user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
        user_data = User(**user).model_dump()
        user_data["session_token"] = session_token  # Include token for localStorage fallback
        logger.info(f"Session exchange complete for {email}, returning session_token: {session_token[:20]}...")
        return user_data
    
    except Exception as e:
        logger.error(f"Session exchange error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/me", response_model=User)
async def get_current_user(request: Request):
    """Get current authenticated user"""
    db = get_database()
    
    # Debug: log the cookies
    cookies = request.cookies
    logger.info(f"Auth me called - cookies: {list(cookies.keys())}")
    
    try:
        user = await get_user_from_token(request, db)
        if not user:
            logger.info("Auth me - no user from token")
            raise HTTPException(status_code=401, detail="Not authenticated")
        logger.info(f"Auth me - user found: {user.email}")
        return user
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Auth me error: {str(e)}")
        raise HTTPException(status_code=401, detail="Not authenticated")


@router.post("/logout")
async def logout(request: Request, response: Response):
    """Logout user and clear session"""
    db = get_database()
    
    session_token = request.cookies.get("session_token")
    if session_token:
        await db.user_sessions.delete_one({"session_token": session_token})
    
    response.delete_cookie(key="session_token", path="/")
    return {"message": "Logged out successfully"}


# ============ PHONE VERIFICATION ENDPOINTS ============

@router.post("/phone/submit")
async def submit_phone_number(request: Request, data: PhoneSubmitRequest):
    """Submit phone number for verification. Sends OTP via SMS."""
    db = get_database()
    
    user = await get_user_from_token(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Normalize phone number to +27 format
    normalized_phone = normalize_phone_number(data.phone)
    
    if not normalized_phone or len(normalized_phone) < 12:
        raise HTTPException(status_code=400, detail="Please enter a valid South African mobile number")
    
    logger.info(f"Phone submit: {data.phone} -> {normalized_phone} for user {user.email}")
    
    # Check if phone is already used by another account
    existing_user = await db.users.find_one({
        "phone": normalized_phone,
        "phone_verified": True,
        "user_id": {"$ne": user.user_id}
    })
    
    if existing_user:
        raise HTTPException(status_code=400, detail="This number is already linked to another account")
    
    # Check if can resend (60 second cooldown)
    existing_otp = await db.phone_otps.find_one({"user_id": user.user_id})
    can_send, seconds_remaining = can_resend_otp(existing_otp)
    
    if not can_send:
        raise HTTPException(
            status_code=429, 
            detail=f"Please wait {seconds_remaining} seconds before requesting a new code"
        )
    
    # Create OTP record
    otp_record = create_otp_record(normalized_phone)
    otp_record["user_id"] = user.user_id
    
    # Save to database (upsert)
    await db.phone_otps.update_one(
        {"user_id": user.user_id},
        {"$set": otp_record},
        upsert=True
    )
    
    # Send OTP via SMS
    sms_result = await send_otp_sms(normalized_phone, otp_record["otp_code"])
    
    if not sms_result.get("success"):
        logger.error(f"Failed to send OTP SMS: {sms_result}")
        logger.warning(f"OTP for testing: {otp_record['otp_code']}")
    
    # Update user with pending phone (not verified yet)
    await db.users.update_one(
        {"user_id": user.user_id},
        {"$set": {"phone": normalized_phone, "phone_verified": False}}
    )
    
    return {
        "message": "Verification code sent",
        "phone": normalized_phone,
        "expires_in_minutes": 10,
        "resend_cooldown_seconds": 60
    }


@router.post("/phone/verify")
async def verify_phone_otp(request: Request, data: OTPVerifyRequest):
    """Verify OTP code submitted by user."""
    db = get_database()
    
    user = await get_user_from_token(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    normalized_phone = normalize_phone_number(data.phone)
    
    # Get OTP record
    otp_record = await db.phone_otps.find_one({"user_id": user.user_id})
    
    if not otp_record:
        raise HTTPException(status_code=400, detail="No verification code found. Please request a new one.")
    
    # Check if phone matches
    if otp_record.get("phone") != normalized_phone:
        raise HTTPException(status_code=400, detail="Phone number does not match. Please request a new code.")
    
    # Increment attempts
    await db.phone_otps.update_one(
        {"user_id": user.user_id},
        {"$inc": {"attempts": 1}}
    )
    
    # Validate OTP
    is_valid, error_msg = is_otp_valid(otp_record, data.otp_code)
    
    if not is_valid:
        raise HTTPException(status_code=400, detail=error_msg)
    
    # OTP is valid - mark as verified
    now = datetime.now(timezone.utc).isoformat()
    
    await db.phone_otps.update_one(
        {"user_id": user.user_id},
        {"$set": {"verified": True}}
    )
    
    await db.users.update_one(
        {"user_id": user.user_id},
        {"$set": {
            "phone": normalized_phone,
            "phone_verified": True,
            "phone_verified_at": now
        }}
    )
    
    logger.info(f"Phone verified for user {user.email}: {normalized_phone}")
    
    return {
        "message": "Phone number verified successfully",
        "phone": normalized_phone,
        "verified": True
    }


@router.post("/phone/resend")
async def resend_phone_otp(request: Request, data: PhoneSubmitRequest):
    """Resend OTP to the phone number. Subject to 60 second cooldown."""
    return await submit_phone_number(request, data)


@router.get("/phone/status")
async def get_phone_verification_status(request: Request):
    """Get current phone verification status for user."""
    db = get_database()
    
    user = await get_user_from_token(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
    
    phone = user_doc.get("phone")
    phone_verified = user_doc.get("phone_verified", False)
    
    # Check if there's a pending OTP
    otp_record = await db.phone_otps.find_one({"user_id": user.user_id})
    can_send, seconds_remaining = can_resend_otp(otp_record)
    
    return {
        "phone": phone,
        "phone_verified": phone_verified,
        "phone_verified_at": user_doc.get("phone_verified_at"),
        "can_resend": can_send,
        "resend_cooldown_remaining": seconds_remaining,
        "requires_verification": not phone_verified
    }
