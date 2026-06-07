"""
TrustTrade Security Module
Authentication, session management, and security utilities
"""

import hashlib
import logging
from datetime import datetime, timezone
from typing import Optional
from fastapi import Request, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase

from models.user import User

logger = logging.getLogger(__name__)


def hash_token(token: str) -> str:
    """Hash bearer-style tokens before database storage or lookup."""
    return hashlib.sha256((token or "").encode("utf-8")).hexdigest()


def parse_datetime(value) -> datetime:
    """Parse stored datetimes from Mongo or legacy ISO strings as aware UTC."""
    if isinstance(value, datetime):
        parsed = value
    elif isinstance(value, str):
        value = value.replace("Z", "+00:00")
        try:
            parsed = datetime.fromisoformat(value)
        except ValueError:
            parsed = datetime.strptime(value[:19], "%Y-%m-%dT%H:%M:%S")
    else:
        raise ValueError("Unsupported datetime value")

    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def session_token_filter(session_token: str) -> dict:
    """Lookup filter for new hashed sessions and legacy plaintext sessions."""
    token_hash = hash_token(session_token)
    clauses = [{"session_token_hash": token_hash}]
    if not (session_token or "").startswith("sha256:"):
        clauses.append({"session_token": session_token})
    return {"$or": clauses}


async def get_user_from_token(request: Request, db: AsyncIOMotorDatabase) -> Optional[User]:
    """
    Extract and validate user from session token.
    Tries the cookie token first, then falls through to the Authorization: Bearer
    header. This fallback matters for the Google OAuth callback flow where the
    browser may still carry a stale cookie from a previous email/password login
    while the new token arrives only in the Authorization header.
    """
    candidates = []
    cookie_token = request.cookies.get("session_token")
    if cookie_token:
        candidates.append(("cookie", cookie_token))
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        bearer_token = auth_header.split(" ")[1]
        if bearer_token and bearer_token != cookie_token:
            candidates.append(("bearer", bearer_token))

    if not candidates:
        logger.debug("No session token found in cookies or Authorization header")
        return None

    for source, session_token in candidates:
        logger.debug("[%s] Looking up session token", source)

        session_doc = await db.user_sessions.find_one(
            session_token_filter(session_token)
        )

        if not session_doc:
            logger.info("[%s] Session not found", source)
            continue

        logger.debug("[%s] Session found for user_id=%s", source, session_doc.get("user_id"))

        # Check expiry
        expires_at = parse_datetime(session_doc["expires_at"])
        if expires_at < datetime.now(timezone.utc):
            logger.info("[%s] Session expired for user_id=%s", source, session_doc.get("user_id"))
            await db.user_sessions.delete_one({"_id": session_doc["_id"]})
            continue

        if not session_doc.get("session_token_hash"):
            token_hash = hash_token(session_token)
            await db.user_sessions.update_one(
                {"_id": session_doc["_id"]},
                {
                    "$set": {
                        "session_token_hash": token_hash,
                        "session_token": f"sha256:{token_hash}",
                    }
                },
            )

        logger.debug("[%s] Session valid, fetching user_id=%s", source, session_doc["user_id"])

        user_doc = await db.users.find_one(
            {"user_id": session_doc["user_id"]},
            {"_id": 0}
        )

        if not user_doc:
            logger.info("[%s] User not found for user_id=%s", source, session_doc["user_id"])
            continue

        if user_doc.get("email_verified", True) is False:
            logger.warning("[%s] Blocked unverified account session for user_id=%s", source, session_doc["user_id"])
            return None

        logger.debug("[%s] User found for user_id=%s", source, session_doc["user_id"])
        return User(**user_doc)

    return None


async def require_auth(request: Request, db: AsyncIOMotorDatabase) -> User:
    """
    Require authenticated user or raise 401.
    Use as a dependency in routes that require authentication.
    """
    user = await get_user_from_token(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


async def require_admin(request: Request, db: AsyncIOMotorDatabase) -> User:
    """
    Require admin user or raise 403.
    Use as a dependency in admin-only routes.
    """
    user = await require_auth(request, db)
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


def normalize_email(email: str) -> str:
    """Normalize email for comparison - lowercase and strip whitespace."""
    if not email:
        return ""
    return email.strip().lower()


def emails_match(email1: str, email2: str) -> bool:
    """
    Compare two emails in a case-insensitive, whitespace-tolerant way.
    john@gmail.com should match John@Gmail.com and " john@gmail.com "
    """
    if not email1 or not email2:
        return False
    
    norm1 = normalize_email(email1)
    norm2 = normalize_email(email2)
    
    logger.debug(f"Email comparison: '{email1}' -> '{norm1}' vs '{email2}' -> '{norm2}' = {norm1 == norm2}")
    
    return norm1 == norm2
