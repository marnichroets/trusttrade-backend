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
    create_otp_record, is_otp_valid, can_resend_otp, phones_match
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
    
    # Generate email verification token
    verification_token = secrets.token_urlsafe(32)
    user_data["email_verified"] = False
    user_data["email_verification_token"] = verification_token
    user_data["verification_token_expires"] = (datetime.now(timezone.utc) + timedelta(hours=24)).isoformat()

    await db.users.insert_one(user_data)

    # Send verification email (fire-and-forget)
    import asyncio, email_service
    frontend_url = settings.FRONTEND_URL
    verify_url = f"{frontend_url}/verify-email?token={verification_token}"
    asyncio.create_task(email_service.send_verification_email(email, data.name, verify_url))

    logger.info(f"User registered (unverified): {email}")

    return {
        "needs_verification": True,
        "email": email,
        "message": "Registration successful. Please check your email to verify your account before logging in."
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

    # Block unverified email/password users
    if not user_doc.get("email_verified", True):
        raise HTTPException(
            status_code=403,
            detail="EMAIL_NOT_VERIFIED"
        )

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


# ============ EMAIL VERIFICATION ENDPOINTS ============

class VerifyEmailRequest(BaseModel):
    token: str

class ResendVerificationRequest(BaseModel):
    email: EmailStr


@router.post("/verify-email")
async def verify_email(data: VerifyEmailRequest, response: Response):
    """Verify email address using token from verification email."""
    db = get_database()
    now = datetime.now(timezone.utc)

    user_doc = await db.users.find_one({"email_verification_token": data.token})
    if not user_doc:
        raise HTTPException(status_code=400, detail="Invalid or expired verification link.")

    expires_str = user_doc.get("verification_token_expires", "")
    if expires_str:
        try:
            expires_dt = datetime.fromisoformat(expires_str.replace("Z", "+00:00"))
            if expires_dt.tzinfo is None:
                expires_dt = expires_dt.replace(tzinfo=timezone.utc)
            if now > expires_dt:
                raise HTTPException(status_code=400, detail="Verification link has expired. Please request a new one.")
        except ValueError:
            pass

    await db.users.update_one(
        {"_id": user_doc["_id"]},
        {"$set": {"email_verified": True}, "$unset": {"email_verification_token": "", "verification_token_expires": ""}}
    )

    # Create session
    session_token = generate_session_token()
    expires_at = now + timedelta(days=7)
    await db.user_sessions.insert_one({
        "user_id": user_doc["user_id"],
        "session_token": session_token,
        "expires_at": expires_at.isoformat(),
        "created_at": now.isoformat()
    })
    response.set_cookie(key="session_token", value=session_token, httponly=True, secure=True, samesite="none", path="/", max_age=7*24*60*60)

    logger.info(f"Email verified for: {user_doc['email']}")
    return {
        "user_id": user_doc["user_id"],
        "email": user_doc["email"],
        "name": user_doc.get("name", ""),
        "is_admin": user_doc.get("is_admin", False),
        "session_token": session_token
    }


@router.post("/resend-verification")
async def resend_verification(data: ResendVerificationRequest):
    """Resend email verification link."""
    db = get_database()
    email = normalize_email(data.email)

    user_doc = await db.users.find_one({"email": email})
    if not user_doc:
        return {"message": "If that email is registered, a verification link has been sent."}

    if user_doc.get("email_verified", True):
        return {"message": "This email is already verified. Please log in."}

    # Rate limit: 1 resend per 2 minutes
    last_expires = user_doc.get("verification_token_expires", "")
    if last_expires:
        try:
            expires_dt = datetime.fromisoformat(last_expires.replace("Z", "+00:00"))
            if expires_dt.tzinfo is None:
                expires_dt = expires_dt.replace(tzinfo=timezone.utc)
            issued_at = expires_dt - timedelta(hours=24)
            if (datetime.now(timezone.utc) - issued_at).total_seconds() < 120:
                raise HTTPException(status_code=429, detail="Please wait 2 minutes before requesting another email.")
        except (ValueError, TypeError):
            pass

    new_token = secrets.token_urlsafe(32)
    expires = (datetime.now(timezone.utc) + timedelta(hours=24)).isoformat()
    await db.users.update_one(
        {"email": email},
        {"$set": {"email_verification_token": new_token, "verification_token_expires": expires}}
    )

    import asyncio, email_service
    from core.config import settings
    verify_url = f"{settings.FRONTEND_URL}/verify-email?token={new_token}"
    asyncio.create_task(email_service.send_verification_email(email, user_doc.get("name", ""), verify_url))

    return {"message": "If that email is registered, a verification link has been sent."}


# ============ PHONE VERIFICATION ENDPOINTS ============

@router.post("/phone/submit")
async def submit_phone_number(request: Request, data: PhoneSubmitRequest):
    """Submit phone number for verification. Sends OTP via SMS."""
    db = get_database()
    
    user = await get_user_from_token(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    normalized_phone = normalize_phone_number(data.phone)
    
    if not normalized_phone or len(normalized_phone) < 10:
        raise HTTPException(status_code=400, detail="Please enter a valid mobile number")
    
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

    stored_phone = otp_record.get("phone", "")
    logger.info(f"[OTP_VERIFY] stored phone='{stored_phone}' | incoming raw='{data.phone}' | incoming normalized='{normalized_phone}'")

    if not phones_match(stored_phone, normalized_phone):
        logger.warning(f"[OTP_VERIFY] Phone mismatch: stored='{stored_phone}' vs normalized='{normalized_phone}'")
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


@router.get("/onboarding-status")
async def get_onboarding_status(request: Request):
    """Return whether the user still needs to complete onboarding (phone + banking)."""
    db = get_database()
    user = await get_user_from_token(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")

    # Admins always bypass onboarding
    if user_doc.get("is_admin"):
        return {"needs_onboarding": False, "has_phone": True, "has_banking": True}

    has_phone = bool(user_doc.get("phone") and user_doc.get("phone_verified"))

    # Banking may be stored under "banking_details", "banking", or top-level fields
    bd = user_doc.get("banking_details") or user_doc.get("banking") or {}
    has_banking = bool(
        bd.get("bank_name") or bd.get("account_number")
        or user_doc.get("bank_name")
    )

    return {
        "needs_onboarding": not (has_phone and has_banking),
        "has_phone": has_phone,
        "has_banking": has_banking,
    }


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



# ============ GOOGLE OAUTH (direct) ============

@router.get("/google")
async def google_login():
    """Redirect to Google OAuth consent screen."""
    from urllib.parse import urlencode
    from fastapi.responses import RedirectResponse

    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=503, detail="Google OAuth is not configured")

    state = secrets.token_urlsafe(16)
    params = urlencode({
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": settings.GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "access_type": "online",
        "prompt": "select_account",
    })
    auth_url = f"https://accounts.google.com/o/oauth2/v2/auth?{params}"

    resp = RedirectResponse(url=auth_url, status_code=302)
    resp.set_cookie(
        "oauth_state", state,
        httponly=True, secure=True, samesite="lax", max_age=300, path="/"
    )
    return resp


@router.get("/google/callback")
async def google_callback(
    request: Request,
    code: str = None,
    state: str = None,
    error: str = None,
):
    """Handle the Google OAuth callback, create session, redirect to frontend."""
    import httpx
    from fastapi.responses import RedirectResponse

    frontend_url = settings.FRONTEND_URL

    def fail(reason: str):
        return RedirectResponse(
            url=f"{frontend_url}/login?error={reason}", status_code=302
        )

    if error:
        logger.warning(f"[GOOGLE_AUTH] OAuth denied: {error}")
        return fail("google_auth_denied")

    if not code:
        logger.warning("[GOOGLE_AUTH] No code in callback")
        return fail("no_code")

    # CSRF check
    stored_state = request.cookies.get("oauth_state")
    if stored_state and state != stored_state:
        logger.warning("[GOOGLE_AUTH] State mismatch (CSRF)")
        return fail("invalid_state")

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            token_resp = await client.post(
                "https://oauth2.googleapis.com/token",
                data={
                    "code": code,
                    "client_id": settings.GOOGLE_CLIENT_ID,
                    "client_secret": settings.GOOGLE_CLIENT_SECRET,
                    "redirect_uri": settings.GOOGLE_REDIRECT_URI,
                    "grant_type": "authorization_code",
                },
            )

        if token_resp.status_code != 200:
            logger.error(f"[GOOGLE_AUTH] Token exchange failed: {token_resp.text}")
            return fail("token_exchange_failed")

        access_token = token_resp.json().get("access_token")
        if not access_token:
            return fail("no_access_token")

        async with httpx.AsyncClient(timeout=30.0) as client:
            profile_resp = await client.get(
                "https://www.googleapis.com/oauth2/v2/userinfo",
                headers={"Authorization": f"Bearer {access_token}"},
            )

        if profile_resp.status_code != 200:
            logger.error("[GOOGLE_AUTH] Failed to fetch profile")
            return fail("profile_fetch_failed")

        profile = profile_resp.json()
        email = profile.get("email", "").lower().strip()
        name = profile.get("name", "")
        picture = profile.get("picture", "")
        google_id = profile.get("id", "")

        if not email:
            return fail("no_email")

        db = get_database()
        existing_user = await db.users.find_one({"email": email}, {"_id": 0})

        if existing_user:
            user_id = existing_user["user_id"]
            is_admin = existing_user.get("is_admin", False)
            await db.users.update_one(
                {"email": email},
                {"$set": {
                    "name": name or existing_user.get("name"),
                    "picture": picture,
                    "google_id": google_id,
                    "last_login": datetime.now(timezone.utc).isoformat(),
                    "auth_method": "google",
                    "email_verified": True,
                }},
            )
        else:
            user_id = f"user_{uuid.uuid4().hex[:12]}"
            is_admin = bool(settings.ADMIN_EMAIL and email == settings.ADMIN_EMAIL.lower())
            await db.users.insert_one({
                "user_id": user_id,
                "email": email,
                "name": name,
                "picture": picture,
                "google_id": google_id,
                "auth_method": "google",
                "role": "admin" if is_admin else "buyer",
                "is_admin": is_admin,
                "verified": True,
                "email_verified": True,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "last_login": datetime.now(timezone.utc).isoformat(),
            })

        session_token = secrets.token_urlsafe(32)
        expires_at = datetime.now(timezone.utc) + timedelta(days=7)
        await db.user_sessions.update_one(
            {"user_id": user_id},
            {"$set": {
                "session_token": session_token,
                "expires_at": expires_at.isoformat(),
                "created_at": datetime.now(timezone.utc).isoformat(),
                "auth_method": "google",
            }},
            upsert=True,
        )

        logger.info(f"[GOOGLE_AUTH] Session created for {email} (user_id={user_id}), token={session_token[:20]}...")

        # Redirect to frontend with token in URL fragment.
        # Also set a session cookie so /auth/me works even if the browser sends a
        # stale cookie from a previous email/password login.
        redirect = RedirectResponse(
            url=f"{frontend_url}/auth/callback#session_token={session_token}",
            status_code=302,
        )
        redirect.delete_cookie("oauth_state", path="/")
        redirect.set_cookie(
            key="session_token",
            value=session_token,
            httponly=True,
            secure=True,
            samesite="none",
            path="/",
            max_age=7 * 24 * 60 * 60,
        )
        logger.info(f"[GOOGLE_AUTH] Redirecting to {frontend_url}/auth/callback with session cookie set")
        return redirect

    except Exception as exc:
        logger.error(f"[GOOGLE_AUTH] Unexpected error: {exc}", exc_info=True)
        return fail("auth_failed")

class ForgotPasswordRequest(BaseModel):
    email: EmailStr

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

@router.post("/forgot-password")
async def forgot_password(data: ForgotPasswordRequest):
    """Request a password reset link. Always returns success to avoid email enumeration."""
    import email_service
    from core.config import settings

    email = normalize_email(data.email)
    db = get_database()
    user_doc = await db.users.find_one({"email": email})

    if user_doc:
        token = secrets.token_urlsafe(32)
        expires_at = datetime.now(timezone.utc) + timedelta(hours=1)
        await db.password_resets.insert_one({
            "token": token,
            "user_id": user_doc["user_id"],
            "email": email,
            "expires_at": expires_at,
            "used": False,
        })
        reset_url = f"{settings.FRONTEND_URL}/reset-password?token={token}"
        html = f"""
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
          <h2 style="color:#0A0E14">Reset your TrustTrade password</h2>
          <p>Click the button below to reset your password. This link expires in 1 hour.</p>
          <a href="{reset_url}"
             style="display:inline-block;padding:12px 24px;background:#00D1FF;color:#000;
                    font-weight:700;border-radius:4px;text-decoration:none;margin:16px 0">
            Reset Password
          </a>
          <p style="color:#888;font-size:12px">
            If you did not request this, you can safely ignore this email.<br/>
            Link: <a href="{reset_url}">{reset_url}</a>
          </p>
        </div>
        """
        await email_service.send_email(
            to_email=email,
            to_name=user_doc.get("name", "User"),
            subject="Reset your TrustTrade password",
            html_content=html,
        )
        logger.info(f"[PASSWORD_RESET] Reset link sent to {email}")

    return {"message": "If an account exists with that email, you'll receive a reset link shortly."}

@router.post("/reset-password")
async def reset_password(data: ResetPasswordRequest):
    """Reset password using a valid token."""
    db = get_database()
    record = await db.password_resets.find_one({"token": data.token, "used": False})

    if not record:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")

    if record["expires_at"] < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Reset token has expired")

    if len(data.new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    new_hash = hash_password(data.new_password)
    await db.users.update_one(
        {"user_id": record["user_id"]},
        {"$set": {"password_hash": new_hash}}
    )
    await db.password_resets.update_one({"token": data.token}, {"$set": {"used": True}})
    logger.info(f"[PASSWORD_RESET] Password reset for user {record['user_id']}")
    return {"message": "Password updated successfully. You can now sign in."}

class AdminPasswordResetRequest(BaseModel):
    email: str
    new_password: str
    reset_secret: str

@router.post("/reset-password-admin")
async def reset_admin_password(data: AdminPasswordResetRequest):
    if not settings.ADMIN_RESET_SECRET:
        raise HTTPException(status_code=403, detail="Admin password reset is not enabled")
    if not secrets.compare_digest(data.reset_secret, settings.ADMIN_RESET_SECRET):
        raise HTTPException(status_code=403, detail="Invalid reset secret")
    email = normalize_email(data.email)
    if not settings.ADMIN_EMAIL or email != normalize_email(settings.ADMIN_EMAIL):
        raise HTTPException(status_code=403, detail="Email does not match admin account")
    if len(data.new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    db = get_database()
    user_doc = await db.users.find_one({"email": email, "is_admin": True})
    if not user_doc:
        raise HTTPException(status_code=404, detail="Admin user not found")
    new_hash = hash_password(data.new_password)
    await db.users.update_one({"email": email}, {"$set": {"password_hash": new_hash}})
    logger.warning(f"[ADMIN_RESET] Admin password reset via reset_secret for {email}")
    return {"success": True, "message": "Admin password updated. Please log in with your new password."}
