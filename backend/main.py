import sys
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from core.config import settings
from routes.auth import router as auth_router
from routes.transactions import router as transactions_router
from routes.tradesafe import router as tradesafe_router
from routes.share import router as share_router
from routes.disputes import router as disputes_router
from routes.users import router as users_router
from routes.admin import router as admin_router
from routes.monitoring import router as monitoring_router
from routes.webhooks import router as webhooks_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="TrustTrade API",
    description="Secure escrow platform for peer-to-peer transactions in South Africa",
    version="2.0.0"
)

origins = [
    "https://trusttrade-frontend-v2-6odm5x7r0-marnichroets-9889s-projects.vercel.app",
    "https://trusttrade-frontend-v2.vercel.app",
    "https://trusttradesa.co.za",
    "https://www.trusttradesa.co.za",
    "http://localhost:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
)

@app.get("/")
def root():
    return {"status": "ok", "service": "trusttrade-backend"}

@app.get("/ping")
def ping():
    return {"status": "ok"}

app.include_router(auth_router)
app.include_router(users_router)
app.include_router(transactions_router)
app.include_router(tradesafe_router)
app.include_router(share_router)
app.include_router(disputes_router)
app.include_router(admin_router)
app.include_router(monitoring_router)
app.include_router(webhooks_router)

try:
    Path(settings.UPLOAD_BASE_PATH).mkdir(parents=True, exist_ok=True)
    app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_BASE_PATH), name="uploads")
except Exception as e:
    logger.warning(f"Could not mount uploads directory: {e}")
