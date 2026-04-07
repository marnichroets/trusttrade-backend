"""
STEP 1: Imports only - No routers, middleware, lifespan, or background jobs
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

# Import all routers (but do NOT include them yet)
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


# STEP 3: Add lifespan (NO background jobs)
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler - startup and shutdown"""
    logger.info("=== TrustTrade API Starting ===")
    
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
    
    logger.info("=== TrustTrade API Ready ===")
    
    yield
    
    # Shutdown
    logger.info("=== TrustTrade API Shutting Down ===")
    await close_database()
    logger.info("=== TrustTrade API Shutdown Complete ===")


# FastAPI app with lifespan
app = FastAPI(
    title="TrustTrade API",
    version="2.0.0",
    lifespan=lifespan
)

# STEP 2: Add CORS middleware
cors_origins = settings.CORS_ORIGINS

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/ping")
def ping():
    return {"status": "ok", "step": "2_cors_added"}
