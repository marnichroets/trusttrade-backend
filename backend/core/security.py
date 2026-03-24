"""
TrustTrade Security & Authentication
Session management and user authentication helpers
"""

import logging
from typing import Optional
from datetime import datetime, timezone
from fastapi import Request, HTTPException

from core.database import get_database
from models.user import User

logger = logging.getLogger(__name__)


def normalize_email(email: str) -> str:
    """Normalize email for comparison - lowercase and strip whitespace."""
    if not email:
        return ""
    return email.strip().lower()


def emails_match(email1: str, email2: str) -> bool:
    """Compare two emails in a case-insensitive, whitespace-tolerant way."""
    if not email1 or not email2:
        return False
    return normalize_email(email1) == normalize_email(email2)


async def get_user_from_token(request: Request) -> Optional[User]:
    """
    Extract and validate user from session token.
    Checks cookie first, then Authorization header.
    """
    db = get_database()
    
    # Check cookie first, then Authorization header
    session_token = request.cookies.get("session_token")
    if not session_token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            session_token = auth_header.split(" ")[1]
    
    if not session_token:
        return None
    
    # Find session
    session_doc = await db.user_sessions.find_one(
        {"session_token": session_token},
        {"_id": 0}
    )
    
    if not session_doc:
        return None
    
    # Check expiry
    expires_at = session_doc["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    
    if expires_at < datetime.now(timezone.utc):
        return None
    
    # Get user
    user_doc = await db.users.find_one(
        {"user_id": session_doc["user_id"]},
        {"_id": 0}
    )
    
    if not user_doc:
        return None
    
    return User(**user_doc)


async def require_auth(request: Request) -> User:
    """Require authentication - raises HTTPException if not authenticated"""
    user = await get_user_from_token(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


async def require_admin(request: Request) -> User:
    """Require admin authentication - raises HTTPException if not admin"""
    user = await require_auth(request)
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user
