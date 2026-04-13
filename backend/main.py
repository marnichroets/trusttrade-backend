"""
TrustTrade API - Main Application Entry Point
Production-ready FastAPI application for escrow transactions in South Africa

NOTE: Background jobs are DISABLED for launch stability.
To re-enable, uncomment the background_jobs section in lifespan().
"""

import os
import sys
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path

# Add backend directory to Python path for imports
sys.path.insert(0, str(Path(__file__).parent))

from core.config import settings
from core.database import get_database, close_database, create_indexes

# Import all routers
from routes.auth import router as auth_router
from routes.transactions import router as transactions_router
from routes.tradesafe import router as tradesafe_router
from routes.share import router as share_router
from routes.disputes import router as disputes_router
from routes.users import router as users_router
from routes.admin import router as admin_router
from routes.monitoring import router as monitoring_router
from routes.webhooks import router as webhooks_router

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler - startup and shutdown"""
    logger.info("=== TrustTrade API Starting ===")
    
    # Log critical configuration values
    logger.info(f"[CONFIG] ADMIN_EMAIL: '{settings.ADMIN_EMAIL}'")
    logger.info(f"[CONFIG] DB_NAME: '{settings.DB_NAME}'")
    logger.info(f"[CONFIG] MONGO_URL configured: {'Yes' if settings.MONGO_URL else 'No'}")
    
    # Get database connection and create indexes
    db = get_database()
    try:
        await create_indexes(db)
        logger.info("Database indexes created/verified")
    except Exception as e:
        logger.error(f"Failed to create indexes: {e}")
    
    # Create upload directories
    for path in [settings.UPLOAD_BASE_PATH, settings.PHOTOS_PATH, 
                 settings.VERIFICATION_PATH, settings.DISPUTES_PATH, settings.PDFS_PATH]:
        Path(path).mkdir(parents=True, exist_ok=True)
    
    # BACKGROUND JOBS DISABLED FOR LAUNCH
    # To re-enable, uncomment the following:
    # import asyncio
    # import tradesafe_service
    # from background_jobs import start_background_jobs
    # background_task = asyncio.create_task(start_background_jobs(db, tradesafe_service, interval_minutes=3))
    # logger.info("Background jobs started")
    
    logger.info("=== TrustTrade API Ready ===")
    
    yield
    
    # Shutdown
    logger.info("=== TrustTrade API Shutting Down ===")
    await close_database()
    logger.info("=== TrustTrade API Shutdown Complete ===")


# FastAPI app
app = FastAPI(
    title="TrustTrade API",
    description="Secure escrow platform for peer-to-peer transactions in South Africa",
    version="2.0.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=settings.CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/ping")
def ping():
    return {"status": "ok"}


# Include all routers
app.include_router(auth_router)
app.include_router(users_router)
app.include_router(transactions_router)
app.include_router(tradesafe_router)
app.include_router(share_router)
app.include_router(disputes_router)
app.include_router(admin_router)
app.include_router(monitoring_router)
app.include_router(webhooks_router)

# Mount static files for uploads
try:
    Path(settings.UPLOAD_BASE_PATH).mkdir(parents=True, exist_ok=True)
    app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_BASE_PATH), name="uploads")
except Exception as e:
    logger.warning(f"Could not mount uploads directory: {e}")



# Simple test email endpoint (no auth required for testing)
@app.get("/api/test-email")
async def public_test_email(to: str = "marnichr@gmail.com"):
    """
    Public endpoint to test email sending.
    GET /api/test-email?to=email@example.com
    """
    from email_service import send_email
    from datetime import datetime, timezone
    
    logger.info(f"[EMAIL TEST] Public test to {to}")
    print(f"[EMAIL TEST] Public test starting for {to}")
    
    try:
        result = await send_email(
            to_email=to,
            to_name="Test Recipient",
            subject="TrustTrade Email Test",
            html_content=f"""
            <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto;">
                <h1 style="color: #1a2942;">TrustTrade Email Test</h1>
                <p>This is a test email from TrustTrade.</p>
                <p style="background: #e8f5e9; padding: 15px; border-radius: 8px; color: #2e7d32;">
                    ✅ If you received this, the email system is working correctly!
                </p>
                <p style="color: #666; font-size: 12px;">Sent at: {datetime.now(timezone.utc).isoformat()}</p>
            </div>
            """
        )
        
        print(f"[EMAIL TEST] Result: {result}")
        
        if result:
            return {"success": True, "message": f"Test email sent to {to}"}
        else:
            return {"success": False, "message": "Email service returned False - check logs"}
            
    except Exception as e:
        print(f"[EMAIL TEST] Exception: {str(e)}")
        return {"success": False, "error": str(e)}
