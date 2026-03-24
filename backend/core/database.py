"""
TrustTrade Database Connection
MongoDB async connection using Motor
"""

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from core.config import MONGO_URL, DB_NAME
import logging

logger = logging.getLogger(__name__)

# Global database client and database instances
client: AsyncIOMotorClient = None
db: AsyncIOMotorDatabase = None


def get_database() -> AsyncIOMotorDatabase:
    """Get the database instance"""
    global db
    if db is None:
        raise RuntimeError("Database not initialized. Call init_database() first.")
    return db


def init_database() -> AsyncIOMotorDatabase:
    """Initialize database connection"""
    global client, db
    
    if not MONGO_URL:
        raise ValueError("MONGO_URL environment variable is required")
    if not DB_NAME:
        raise ValueError("DB_NAME environment variable is required")
    
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    
    logger.info(f"Database initialized: {DB_NAME}")
    return db


async def close_database():
    """Close database connection"""
    global client
    if client:
        client.close()
        logger.info("Database connection closed")


async def create_indexes():
    """Create database indexes for optimal performance"""
    database = get_database()
    
    try:
        # User indexes
        await database.users.create_index("user_id", unique=True)
        await database.users.create_index("email")
        await database.users.create_index("phone")
        
        # Transaction indexes
        await database.transactions.create_index("transaction_id", unique=True)
        await database.transactions.create_index("share_code", unique=True, sparse=True)
        await database.transactions.create_index("buyer_user_id")
        await database.transactions.create_index("seller_user_id")
        await database.transactions.create_index("buyer_email")
        await database.transactions.create_index("seller_email")
        await database.transactions.create_index("tradesafe_id", sparse=True)
        await database.transactions.create_index("transaction_state")
        await database.transactions.create_index("last_webhook_at")
        await database.transactions.create_index("created_at")
        
        # Session indexes
        await database.user_sessions.create_index("session_token", unique=True)
        await database.user_sessions.create_index("user_id")
        await database.user_sessions.create_index("expires_at")
        
        # Webhook events indexes
        await database.webhook_events.create_index("event_id", unique=True)
        await database.webhook_events.create_index("transaction_id")
        await database.webhook_events.create_index("timestamp")
        await database.webhook_events.create_index([("status", 1), ("timestamp", -1)])
        
        # Email logs indexes
        await database.email_logs.create_index("transaction_id")
        await database.email_logs.create_index("timestamp")
        await database.email_logs.create_index([("success", 1), ("timestamp", -1)])
        
        # Disputes indexes
        await database.disputes.create_index("dispute_id", unique=True)
        await database.disputes.create_index("transaction_id")
        await database.disputes.create_index("status")
        
        # Alerts indexes
        await database.alerts.create_index("alert_type")
        await database.alerts.create_index("timestamp")
        await database.alerts.create_index([("resolved", 1), ("timestamp", -1)])
        
        # OTP indexes
        await database.phone_otps.create_index("user_id")
        await database.phone_otps.create_index("expires_at")
        
        logger.info("Database indexes created successfully")
        
    except Exception as e:
        logger.error(f"Failed to create indexes: {e}")
