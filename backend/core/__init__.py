"""
TrustTrade Core Module
Configuration, database, and security utilities
"""

from core.config import settings
from core.database import get_database, get_db, close_database, create_indexes
from core.security import (
    get_user_from_token,
    require_auth,
    require_admin,
    normalize_email,
    emails_match
)

__all__ = [
    'settings',
    'get_database',
    'get_db',
    'close_database',
    'create_indexes',
    'get_user_from_token',
    'require_auth',
    'require_admin',
    'normalize_email',
    'emails_match'
]
