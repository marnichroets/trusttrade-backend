"""
TrustTrade API - Main Application Entry Point
Production-ready FastAPI application for escrow transactions in South Africa
"""

import os
import sys
import asyncio
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

# Background task reference
background_task = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler for startup and shutdown events"""
    global background_task
    
    logger.info("=== TrustTrade API Starting ===")
    
    # Get database connection and create indexes
    db = get_database()
    try:
        await create_indexes(db)
        logger.info("Database indexes created/verified")
    except Exception as e:
        logger.error(f"Failed to create indexes: {e}")
    
    # Start background jobs
    try:
        import tradesafe_service
        from background_jobs import start_background_jobs
        background_task = asyncio.create_task(start_background_jobs(db, tradesafe_service, interval_minutes=3))
        logger.info("=== Background jobs started (interval: 3 min) ===")
    except Exception as e:
        logger.error(f"Failed to start background jobs: {e}")
    
    # Create upload directories
    for path in [settings.UPLOAD_BASE_PATH, settings.PHOTOS_PATH, 
                 settings.VERIFICATION_PATH, settings.DISPUTES_PATH, settings.PDFS_PATH]:
        Path(path).mkdir(parents=True, exist_ok=True)
    
    logger.info("=== TrustTrade API Ready ===")
    
    yield
    
    # Shutdown
    logger.info("=== TrustTrade API Shutting Down ===")
    
    if background_task:
        background_task.cancel()
        try:
            await background_task
        except asyncio.CancelledError:
            pass
    
    await close_database()
    logger.info("=== TrustTrade API Shutdown Complete ===")


# Create FastAPI application
app = FastAPI(
    title="TrustTrade API",
    description="Secure escrow platform for peer-to-peer transactions in South Africa",
    version="2.0.0",
    lifespan=lifespan
)

# Add CORS middleware
# Note: When using credentials, we cannot use '*' - must specify actual origins
cors_origins = settings.CORS_ORIGINS
if cors_origins == ['*'] or '*' in cors_origins:
    # Replace wildcard with actual frontend URL for credentials support
    cors_origins = [
        "https://67282134-4e91-40b3-894e-4c730970c014.preview.emergentagent.com",
        "http://localhost:3000",
        "https://trusttradesa.co.za",
        "https://www.trusttradesa.co.za"
    ]

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include all routers
app.include_router(auth_router)
app.include_router(transactions_router)
app.include_router(tradesafe_router)
app.include_router(share_router)
app.include_router(disputes_router)
app.include_router(users_router)
app.include_router(admin_router)
app.include_router(monitoring_router)
app.include_router(webhooks_router)

# Mount static files for uploads
try:
    Path(settings.UPLOAD_BASE_PATH).mkdir(parents=True, exist_ok=True)
    app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_BASE_PATH), name="uploads")
except Exception as e:
    logger.warning(f"Could not mount uploads directory: {e}")


# Health check endpoint
@app.get("/api/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "TrustTrade API",
        "version": "2.0.0"
    }


# Root endpoint
@app.get("/api")
async def root():
    """API root endpoint"""
    return {
        "message": "TrustTrade API",
        "version": "2.0.0",
        "docs": "/docs"
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
