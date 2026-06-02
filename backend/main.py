import sys
import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
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
from routes.smart_deals import router as smart_deals_router
from routes.ai import router as ai_router
from routes.courier import router as courier_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


async def _payment_polling_loop():
    """Poll TradeSafe every 5 minutes as fallback for missed FUNDS_RECEIVED webhooks."""
    import background_jobs
    import tradesafe_service
    from core.database import get_database

    await asyncio.sleep(60)  # short initial delay so DB is ready
    while True:
        try:
            db = get_database()
            await background_jobs.verify_pending_payments(db, tradesafe_service)
            await background_jobs.expire_stale_payment_transactions(db)
        except Exception as exc:
            logger.error(f"[BG_POLL] Payment polling error: {exc}")
        await asyncio.sleep(300)  # 5 minutes


async def _finance_reconciliation_loop():
    """Run finance reconciliation every 15 minutes and a nightly full sweep."""
    from core.database import get_database
    from services.reconciliation_service import cleanup_finance_records, run_reconciliation

    await asyncio.sleep(120)
    last_nightly_date = None
    while True:
        try:
            db = get_database()
            await run_reconciliation(db, mode="recent", limit=150)

            from datetime import datetime, timezone
            current = datetime.now(timezone.utc)
            if current.hour == 1 and last_nightly_date != current.date().isoformat():
                await run_reconciliation(db, mode="nightly", limit=1000)
                await cleanup_finance_records(db)
                last_nightly_date = current.date().isoformat()
        except Exception as exc:
            logger.error(f"[FINANCE_RECON] Reconciliation loop error: {exc}")
        await asyncio.sleep(900)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Free ephemeral container disk first thing on every boot (Railway was failing
    # to start with "only 230MB free, needs 524MB"). Runs off the event loop and
    # can never raise, so it cannot block startup.
    try:
        from startup_cleanup import run_startup_cleanup
        await asyncio.to_thread(run_startup_cleanup)
    except Exception as e:
        logger.warning(f"[STARTUP] Disk cleanup failed (non-fatal): {e}")

    from core.database import get_database, create_indexes
    try:
        db_instance = get_database()
        await create_indexes(db_instance)
    except Exception as e:
        logger.warning(f"[STARTUP] Index creation failed (non-fatal): {e}")

    task = asyncio.create_task(_payment_polling_loop())
    finance_task = asyncio.create_task(_finance_reconciliation_loop())
    logger.info("[STARTUP] Background payment polling loop started (5-min interval)")
    logger.info("[STARTUP] Finance reconciliation loop started (15-min interval)")
    yield
    task.cancel()
    finance_task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass
    try:
        await finance_task
    except asyncio.CancelledError:
        pass
    logger.info("[SHUTDOWN] Background polling loop stopped")


app = FastAPI(
    title="TrustTrade API",
    description="Secure escrow platform for peer-to-peer transactions in South Africa",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {"status": "ok", "service": "trusttrade-backend"}

@app.api_route("/ping", methods=["GET", "HEAD"])
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
app.include_router(smart_deals_router, prefix="/api/smart-deals", tags=["smart-deals"])
app.include_router(ai_router)
app.include_router(courier_router)

logger.info(f"[STARTUP] TradeSafe webhook URL: {settings.BACKEND_URL}/api/tradesafe-webhook")
logger.info(f"[STARTUP] Courier (ShipLogic) enabled={settings.COURIER_ENABLED} key_set={bool(settings.SHIPLOGIC_API_KEY)}")

Path(settings.UPLOAD_BASE_PATH).mkdir(parents=True, exist_ok=True)


@app.get("/api/files/{file_path:path}")
async def serve_upload(file_path: str, request: Request):
    from core.database import get_database
    from core.security import get_user_from_token

    db = get_database()
    user = await get_user_from_token(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    # Prevent path traversal
    if ".." in file_path or file_path.startswith("/") or file_path.startswith("\\"):
        raise HTTPException(status_code=400, detail="Invalid path")

    full_path = Path(settings.UPLOAD_BASE_PATH) / file_path
    base = Path(settings.UPLOAD_BASE_PATH).resolve()
    try:
        full_path.resolve().relative_to(base)
    except ValueError:
        raise HTTPException(status_code=403, detail="Access denied")

    if not full_path.exists() or not full_path.is_file():
        raise HTTPException(status_code=404, detail="File not found")

    if user.is_admin:
        return FileResponse(str(full_path))

    filename = Path(file_path).name

    # Verification files embed user_id in the filename
    if file_path.startswith("verification/"):
        if user.user_id and user.user_id in filename:
            return FileResponse(str(full_path))
        raise HTTPException(status_code=403, detail="Access denied")

    # Photos: user must be buyer or seller of the transaction referencing this file
    txn = await db.transactions.find_one(
        {"$or": [{"buyer_email": user.email}, {"seller_email": user.email}],
         "item_photos": filename}
    )
    if txn:
        return FileResponse(str(full_path))

    # Dispute evidence: user must have raised the dispute
    dispute = await db.disputes.find_one(
        {"raised_by_email": user.email, "evidence_photos": filename}
    )
    if dispute:
        return FileResponse(str(full_path))

    # Also allow access if user is a party to the transaction linked to the dispute
    dispute_via_txn = await db.disputes.find_one({"evidence_photos": filename})
    if dispute_via_txn:
        txn2 = await db.transactions.find_one(
            {"transaction_id": dispute_via_txn.get("transaction_id"),
             "$or": [{"buyer_email": user.email}, {"seller_email": user.email}]}
        )
        if txn2:
            return FileResponse(str(full_path))

    raise HTTPException(status_code=403, detail="Access denied")

try:
    static_dir = Path(__file__).parent / "static"
    static_dir.mkdir(parents=True, exist_ok=True)
    app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")
except Exception as e:
    logger.warning(f"Could not mount static directory: {e}")

# Serve locally-stored uploads at /uploads. New photos go to Cloudinary (durable),
# but this keeps any pre-existing local files (and the non-Cloudinary fallback)
# viewable. Note: the container filesystem is ephemeral on Railway.
try:
    uploads_dir = Path(settings.UPLOAD_BASE_PATH)
    uploads_dir.mkdir(parents=True, exist_ok=True)
    app.mount("/uploads", StaticFiles(directory=str(uploads_dir)), name="uploads")
except Exception as e:
    logger.warning(f"Could not mount uploads directory: {e}")

