"""
TrustTrade Authentication Routes
Email/password JWT authentication system
"""

import uuid
import hashlib
import secrets
import logging
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr

from core.config import settings
from core.database import get_database
from core.security import get_user_from_token, normalize_email
from models.user import User
from sms_service import (
    normalize_phone_number, generate_otp, send_otp_sms,
    create_otp_record, is_otp_valid, can_resend_otp
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["Authentication"])


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    name: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class PhoneSubmitRequest(BaseModel):
    phone: str


class OTPVerifyRequest(BaseModel):
    phone: str
    otp_code: str


def hash_password(password: str) -> str:
    """Hash password using SHA-256 with salt"""
    salt = secrets.token_hex(16)
    hashed = hashlib.sha256((password + salt).encode()).hexdigest()
    return f"{salt}:{hashed}"


def verify_password(password: str, stored_hash: str) -> bool:
    """Verify password against stored hash"""
    try:
        salt, hashed = stored_hash.split(':')
        return hashlib.sha256((password + salt).encode()).hexdigest() == hashed
    except Exception:
        return False


def generate_session_token() -> str:
    """Generate a secure session token"""
    return secrets.token_urlsafe(32)


@router.post("/register")
async def register(data: RegisterRequest, response: Response):
    """Register a new user with email/password"""
    db = get_database()
    
    email = normalize_email(data.email)
    
    # Check if user exists
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Validate password
    if len(data.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    
    # Create user
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    is_admin = email == settings.ADMIN_EMAIL
    
    user_data = {
        "user_id": user_id,
        "email": email,
        "name": data.name,
        "password_hash": hash_password(data.password),
        "role": "admin" if is_admin else "buyer",
        "is_admin": is_admin,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.users.insert_one(user_data)
    
    # Create session
    session_token = generate_session_token()
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    
    await db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": session_token,
        "expires_at": expires_at.isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
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
    
    logger.info(f"User registered: {email}")
    
    return {
        "user_id": user_id,
        "email": email,
        "name": data.name,
        "role": user_data["role"],
        "is_admin": is_admin,
        "session_token": session_token
    }


@router.post("/login")
async def login(data: LoginRequest, response: Response):
    """Login with email/password"""
    db = get_database()
    
    email = normalize_email(data.email)
    
    # Log ADMIN_EMAIL for debugging
    logger.info(f"[LOGIN] Attempting login for: {email}")
    logger.info(f"[LOGIN] ADMIN_EMAIL from settings: '{settings.ADMIN_EMAIL}'")
    
    # Find user
    user_doc = await db.users.find_one({"email": email})
    
    if not user_doc:
        logger.warning(f"[LOGIN] User not found: {email}")
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    # Verify password
    if not user_doc.get("password_hash"):
        raise HTTPException(status_code=401, detail="Please use the registration form to create an account")
    
    if not verify_password(data.password, user_doc["password_hash"]):
        logger.warning(f"[LOGIN] Invalid password for: {email}")
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    # CRITICAL: Check and update admin status dynamically
    # This ensures existing users get admin status if ADMIN_EMAIL is set later
    should_be_admin = (email.lower() == settings.ADMIN_EMAIL.lower()) if settings.ADMIN_EMAIL else False
    current_is_admin = user_doc.get("is_admin", False)
    
    logger.info(f"[LOGIN] Admin check - email: {email}, ADMIN_EMAIL: {settings.ADMIN_EMAIL}, should_be_admin: {should_be_admin}, current_is_admin: {current_is_admin}")
    
    if should_be_admin != current_is_admin:
        # Update user's admin status in database
        new_role = "admin" if should_be_admin else "buyer"
        await db.users.update_one(
            {"user_id": user_doc["user_id"]},
            {"$set": {"is_admin": should_be_admin, "role": new_role}}
        )
        logger.info(f"[LOGIN] Updated admin status for {email}: is_admin={should_be_admin}, role={new_role}")
        user_doc["is_admin"] = should_be_admin
        user_doc["role"] = new_role
    
    # Create session
    session_token = generate_session_token()
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    
    await db.user_sessions.insert_one({
        "user_id": user_doc["user_id"],
        "session_token": session_token,
        "expires_at": expires_at.isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
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
    
    logger.info(f"[LOGIN] User logged in successfully: {email}, is_admin: {user_doc.get('is_admin', False)}")
    
    # Return user data
    return {
        "user_id": user_doc["user_id"],
        "email": user_doc["email"],
        "name": user_doc.get("name", ""),
        "role": user_doc.get("role", "buyer"),
        "is_admin": user_doc.get("is_admin", False),
        "phone": user_doc.get("phone"),
        "phone_verified": user_doc.get("phone_verified", False),
        "id_verified": user_doc.get("id_verified", False),
        "session_token": session_token
    }


@router.get("/me")
async def get_current_user(request: Request):
    """Get current authenticated user"""
    db = get_database()
    
    try:
        user = await get_user_from_token(request, db)
        if not user:
            raise HTTPException(status_code=401, detail="Not authenticated")
        
        # CRITICAL: Dynamically check and update admin status
        # This ensures admin status is always current based on ADMIN_EMAIL
        email = user.email.lower() if user.email else ""
        admin_email = settings.ADMIN_EMAIL.lower() if settings.ADMIN_EMAIL else ""
        should_be_admin = (email == admin_email) if admin_email else False
        
        logger.info(f"[AUTH_ME] User: {email}, ADMIN_EMAIL: {settings.ADMIN_EMAIL}, should_be_admin: {should_be_admin}, current_is_admin: {user.is_admin}")
        
        if should_be_admin != user.is_admin:
            # Update user's admin status in database
            new_role = "admin" if should_be_admin else user.role
            await db.users.update_one(
                {"user_id": user.user_id},
                {"$set": {"is_admin": should_be_admin, "role": new_role}}
            )
            logger.info(f"[AUTH_ME] Updated admin status for {email}: is_admin={should_be_admin}, role={new_role}")
            user.is_admin = should_be_admin
            user.role = new_role
        
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
    
    # Get token from header or cookie
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        session_token = auth_header[7:]
    else:
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
    
    normalized_phone = normalize_phone_number(data.phone)
    
    if not normalized_phone or len(normalized_phone) < 12:
        raise HTTPException(status_code=400, detail="Please enter a valid South African mobile number")
    
    # Check if phone is already used
    existing_user = await db.users.find_one({
        "phone": normalized_phone,
        "phone_verified": True,
        "user_id": {"$ne": user.user_id}
    })
    
    if existing_user:
        raise HTTPException(status_code=400, detail="This number is already linked to another account")
    
    # Check cooldown
    existing_otp = await db.phone_otps.find_one({"user_id": user.user_id})
    can_send, seconds_remaining = can_resend_otp(existing_otp)
    
    if not can_send:
        raise HTTPException(status_code=429, detail=f"Please wait {seconds_remaining} seconds")
    
    # Create OTP
    otp_record = create_otp_record(normalized_phone)
    otp_record["user_id"] = user.user_id
    
    await db.phone_otps.update_one(
        {"user_id": user.user_id},
        {"$set": otp_record},
        upsert=True
    )
    
    # Send SMS
    await send_otp_sms(normalized_phone, otp_record["otp_code"])
    
    await db.users.update_one(
        {"user_id": user.user_id},
        {"$set": {"phone": normalized_phone, "phone_verified": False}}
    )
    
    return {"message": "Verification code sent", "phone": normalized_phone}


@router.post("/phone/verify")
async def verify_phone_otp(request: Request, data: OTPVerifyRequest):
    """Verify OTP code"""
    db = get_database()
    
    user = await get_user_from_token(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    normalized_phone = normalize_phone_number(data.phone)
    otp_record = await db.phone_otps.find_one({"user_id": user.user_id})
    
    if not otp_record:
        raise HTTPException(status_code=400, detail="No verification code found")
    
    if otp_record.get("phone") != normalized_phone:
        raise HTTPException(status_code=400, detail="Phone number does not match")
    
    await db.phone_otps.update_one({"user_id": user.user_id}, {"$inc": {"attempts": 1}})
    
    is_valid, error_msg = is_otp_valid(otp_record, data.otp_code)
    if not is_valid:
        raise HTTPException(status_code=400, detail=error_msg)
    
    now = datetime.now(timezone.utc).isoformat()
    
    await db.phone_otps.update_one({"user_id": user.user_id}, {"$set": {"verified": True}})
    await db.users.update_one(
        {"user_id": user.user_id},
        {"$set": {"phone": normalized_phone, "phone_verified": True, "phone_verified_at": now}}
    )
    
    return {"message": "Phone verified successfully", "phone": normalized_phone, "verified": True}


@router.post("/phone/resend")
async def resend_phone_otp(request: Request, data: PhoneSubmitRequest):
    """Resend OTP"""
    return await submit_phone_number(request, data)


@router.get("/phone/status")
async def get_phone_verification_status(request: Request):
    """Get phone verification status"""
    db = get_database()
    
    user = await get_user_from_token(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
    otp_record = await db.phone_otps.find_one({"user_id": user.user_id})
    can_send, seconds_remaining = can_resend_otp(otp_record)
    
    return {
        "phone": user_doc.get("phone"),
        "phone_verified": user_doc.get("phone_verified", False),
        "can_resend": can_send,
        "resend_cooldown_remaining": seconds_remaining
    }



# ============ GOOGLE OAUTH ============

class GoogleCallbackRequest(BaseModel):
    session_id: str


@router.post("/google/callback")
async def google_auth_callback(request: Request, data: GoogleCallbackRequest):
    """
    Exchange Emergent Auth session_id for user data and session token.
    Creates new user if not exists, or logs in existing user.
    """
    import httpx
    
    db = get_database()
    session_id = data.session_id
    
    print(f"[GOOGLE_AUTH] Callback started, session_id: {session_id[:12]}...")
    logger.info("[GOOGLE_AUTH] Callback started")
    
    try:
        # Exchange session_id with Emergent Auth
        print("[GOOGLE_AUTH] Calling Emergent Auth API...")
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
                headers={"X-Session-ID": session_id}
            )
        
        if response.status_code != 200:
            print(f"[GOOGLE_AUTH] Emergent Auth failed: {response.status_code} {response.text}")
            logger.error(f"[GOOGLE_AUTH] Emergent Auth error: {response.status_code}")
            raise HTTPException(status_code=401, detail="Invalid session. Please try again.")
        
        auth_data = response.json()
        print(f"[GOOGLE_AUTH] Success! Email: {auth_data.get('email')}")
        logger.info(f"[GOOGLE_AUTH] Got user data: {auth_data.get('email')}")
        
        email = auth_data.get("email", "").lower()
        name = auth_data.get("name", "")
        picture = auth_data.get("picture", "")
        google_id = auth_data.get("id", "")
        emergent_session_token = auth_data.get("session_token", "")
        
        if not email:
            print("[GOOGLE_AUTH] No email in response")
            raise HTTPException(status_code=400, detail="No email provided by Google")
        
        # Check if user exists
        existing_user = await db.users.find_one({"email": email}, {"_id": 0})
        
        if existing_user:
            # Update existing user
            print(f"[GOOGLE_AUTH] Existing user found: {existing_user.get('user_id')}")
            user_id = existing_user["user_id"]
            
            await db.users.update_one(
                {"email": email},
                {"$set": {
                    "name": name or existing_user.get("name"),
                    "picture": picture,
                    "google_id": google_id,
                    "last_login": datetime.now(timezone.utc).isoformat(),
                    "auth_method": "google"
                }}
            )
            is_admin = existing_user.get("is_admin", False)
        else:
            # Create new user
            user_id = f"user_{uuid.uuid4().hex[:12]}"
            print(f"[GOOGLE_AUTH] Creating new user: {user_id}")
            
            await db.users.insert_one({
                "user_id": user_id,
                "email": email,
                "name": name,
                "picture": picture,
                "google_id": google_id,
                "auth_method": "google",
                "is_admin": False,
                "verified": True,  # Google emails are verified
                "created_at": datetime.now(timezone.utc).isoformat(),
                "last_login": datetime.now(timezone.utc).isoformat()
            })
            is_admin = False
        
        # Generate session token (use Emergent's or generate our own)
        session_token = emergent_session_token or secrets.token_urlsafe(32)
        
        # Store session
        expires_at = datetime.now(timezone.utc) + timedelta(days=7)
        await db.user_sessions.update_one(
            {"user_id": user_id},
            {"$set": {
                "session_token": session_token,
                "expires_at": expires_at,
                "created_at": datetime.now(timezone.utc),
                "auth_method": "google"
            }},
            upsert=True
        )
        
        print(f"[GOOGLE_AUTH] Login complete for {email}")
        logger.info(f"[GOOGLE_AUTH] Login complete: {email}")
        
        return {
            "user_id": user_id,
            "email": email,
            "name": name,
            "picture": picture,
            "is_admin": is_admin,
            "session_token": session_token
        }
        
    except httpx.RequestError as e:
        print(f"[GOOGLE_AUTH] Network error: {str(e)}")
        logger.error(f"[GOOGLE_AUTH] Network error: {str(e)}")
        raise HTTPException(status_code=503, detail="Authentication service unavailable")
    except Exception as e:
        print(f"[GOOGLE_AUTH] Error: {str(e)}")
        logger.error(f"[GOOGLE_AUTH] Error: {str(e)}")
        raise HTTPException(status_code=500, detail="Authentication failed")
