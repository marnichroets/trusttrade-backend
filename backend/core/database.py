"""
TrustTrade Database Configuration
MongoDB connection management using Motor (async driver)
"""

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from pymongo import MongoClient
from typing import Optional
import logging

from core.config import settings

logger = logging.getLogger(__name__)

# Global database client and instance
_client: Optional[AsyncIOMotorClient] = None
_db: Optional[AsyncIOMotorDatabase] = None

# Synchronous PyMongo client and database for direct/synchronous access
_sync_client: Optional[MongoClient] = None
_sync_db = None


def _get_sync_db():
    """Get a synchronous PyMongo database instance."""
    global _sync_client, _sync_db
    if _sync_db is None:
        _sync_client = MongoClient(settings.MONGO_URL, serverSelectionTimeoutMS=5000)
        _sync_db = _sync_client[settings.DB_NAME]
    return _sync_db


# Module-level synchronous db instance for direct import
db = None  # Lazy-loaded on first use


def get_database() -> AsyncIOMotorDatabase:
    """Get the database instance, creating connection if needed"""
    global _client, _db
    
    if _db is None:
        _client = AsyncIOMotorClient(settings.MONGO_URL)
        _db = _client[settings.DB_NAME]
        logger.info(f"Connected to MongoDB: {settings.DB_NAME}")
    
    return _db


def get_client() -> AsyncIOMotorClient:
    """Get the MongoDB client instance"""
    global _client
    
    if _client is None:
        _client = AsyncIOMotorClient(settings.MONGO_URL)
    
    return _client


async def close_database():
    """Close database connection"""
    global _client, _db
    
    if _client:
        _client.close()
        _client = None
        _db = None
        logger.info("MongoDB connection closed")


async def create_indexes(db: AsyncIOMotorDatabase):
    """Create necessary database indexes for performance"""
    try:
        # Users collection indexes
        await db.users.create_index("user_id", unique=True)
        await db.users.create_index("email", unique=True)
        await db.users.create_index("phone")
        
        # Transactions collection indexes
        await db.transactions.create_index("transaction_id", unique=True)
        await db.transactions.create_index("share_code", unique=True, sparse=True)
        await db.transactions.create_index("tradesafe_id", sparse=True)
        await db.transactions.create_index("buyer_email")
        await db.transactions.create_index("seller_email")
        await db.transactions.create_index("buyer_user_id")
        await db.transactions.create_index("seller_user_id")
        await db.transactions.create_index("transaction_state")
        await db.transactions.create_index("created_at")
        await db.transactions.create_index("last_webhook_at")
        
        # User sessions
        await db.user_sessions.create_index("session_token", unique=True)
        await db.user_sessions.create_index("user_id")
        await db.user_sessions.create_index("expires_at")
        
        # Disputes collection
        await db.disputes.create_index("dispute_id", unique=True)
        await db.disputes.create_index("transaction_id")
        await db.disputes.create_index("raised_by_user_id")
        await db.disputes.create_index("status")
        
        # Webhook events collection
        await db.webhook_events.create_index("event_id", unique=True)
        await db.webhook_events.create_index("transaction_id")
        await db.webhook_events.create_index("timestamp")
        await db.webhook_events.create_index([("status", 1), ("timestamp", -1)])
        
        # Email logs collection
        await db.email_logs.create_index("transaction_id")
        await db.email_logs.create_index("timestamp")
        await db.email_logs.create_index([("success", 1), ("timestamp", -1)])
        
        # Reports collection
        await db.reports.create_index("report_id", unique=True)
        await db.reports.create_index("reporter_user_id")
        await db.reports.create_index("reported_user_id")
        
        # Phone OTPs
        await db.phone_otps.create_index("user_id", unique=True)
        
        # Alerts
        await db.alerts.create_index("alert_id", unique=True)
        await db.alerts.create_index("resolved")
        await db.alerts.create_index("timestamp")
        
        # Admin actions audit trail
        await db.admin_actions.create_index("timestamp")
        await db.admin_actions.create_index("admin_email")
        
        logger.info("Database indexes created successfully")
        
    except Exception as e:
        logger.error(f"Failed to create database indexes: {e}")
        raise


# Dependency for FastAPI
async def get_db() -> AsyncIOMotorDatabase:
    """FastAPI dependency for database access"""
    return get_database()
