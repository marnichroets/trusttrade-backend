"""
TrustTrade Routes Module
All API route handlers organized by feature
"""

from routes.auth import router as auth_router
from routes.transactions import router as transactions_router
from routes.tradesafe import router as tradesafe_router
from routes.share import router as share_router
from routes.disputes import router as disputes_router
from routes.users import router as users_router
from routes.admin import router as admin_router
from routes.monitoring import router as monitoring_router
from routes.webhooks import router as webhooks_router

__all__ = [
    'auth_router',
    'transactions_router',
    'tradesafe_router',
    'share_router',
    'disputes_router',
    'users_router',
    'admin_router',
    'monitoring_router',
    'webhooks_router'
]
