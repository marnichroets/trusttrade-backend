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

@app.get("/")
def root():
    return {"status": "ok", "service": "trusttrade-backend"}

@app.get("/ping")
def ping():
    return {"status": "ok"}

@app.get("/ping-clean")
def ping_clean():
    return {"status": "clean"}

@app.get("/ping-test")
def ping_test():
    return {"status": "working"}

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
