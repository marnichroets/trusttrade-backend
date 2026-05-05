"""
TrustTrade Security Module
Authentication, session management, and security utilities
"""

import logging
from datetime import datetime, timezone
from typing import Optional
from fastapi import Request, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase

from models.user import User

logger = logging.getLogger(__name__)


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
        logger.debug(f"[{source}] Looking up session token: {session_token[:20]}...")

        session_doc = await db.user_sessions.find_one(
            {"session_token": session_token},
            {"_id": 0}
        )

        if not session_doc:
            logger.info(f"[{source}] Session not found for token: {session_token[:30]}...")
            continue

        logger.info(f"[{source}] Session found for user_id: {session_doc.get('user_id')}")

        # Check expiry
        expires_at = session_doc["expires_at"]
        if isinstance(expires_at, str):
            expires_str = expires_at.replace('Z', '+00:00')
            try:
                expires_at = datetime.fromisoformat(expires_str)
            except ValueError:
                expires_at = datetime.strptime(expires_at[:19], '%Y-%m-%dT%H:%M:%S')
                expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)

        if expires_at < datetime.now(timezone.utc):
            logger.info(f"[{source}] Session expired: {expires_at}")
            continue

        logger.info(f"[{source}] Session valid, fetching user: {session_doc['user_id']}")

        user_doc = await db.users.find_one(
            {"user_id": session_doc["user_id"]},
            {"_id": 0}
        )

        if not user_doc:
            logger.info(f"[{source}] User not found for user_id: {session_doc['user_id']}")
            continue

        logger.info(f"[{source}] User found: {user_doc.get('email')}")
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
