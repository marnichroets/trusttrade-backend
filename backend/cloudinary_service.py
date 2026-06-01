"""
Cloudinary image storage for TrustTrade.

Transaction photos and dispute evidence are the primary evidence in disputes, so
they must survive Railway redeploys (the container filesystem is ephemeral).
Uploads go to Cloudinary and we store the returned secure HTTPS URL on the
transaction — the frontend already renders any value that starts with "http"
directly, so no display changes are needed.

If Cloudinary isn't configured (e.g. local dev), callers fall back to local disk.
"""

import asyncio
import logging
from typing import Optional

from core.config import settings

logger = logging.getLogger(__name__)

_configured = False


def _ensure_configured() -> bool:
    """Configure the Cloudinary SDK once. Returns False if creds are missing."""
    global _configured
    if not settings.cloudinary_enabled:
        return False
    if not _configured:
        import cloudinary
        cloudinary.config(
            cloud_name=settings.CLOUDINARY_CLOUD_NAME,
            api_key=settings.CLOUDINARY_API_KEY,
            api_secret=settings.CLOUDINARY_API_SECRET,
            secure=True,
        )
        _configured = True
    return True


def _upload_sync(file_obj, folder: str) -> Optional[str]:
    if not _ensure_configured():
        return None
    import cloudinary.uploader
    try:
        result = cloudinary.uploader.upload(
            file_obj,
            folder=folder,
            resource_type="image",
        )
        url = result.get("secure_url")
        logger.info(f"[CLOUDINARY] uploaded to {folder}: {url}")
        return url
    except Exception as e:
        logger.error(f"[CLOUDINARY] upload to {folder} failed: {e}")
        return None


async def upload_image(file_obj, folder: str = "trusttrade") -> Optional[str]:
    """Upload an image (file-like object) to Cloudinary; return the secure URL.

    Returns None when Cloudinary is not configured or the upload fails, so the
    caller can fall back to local-disk storage. Runs the blocking SDK call in a
    worker thread so it doesn't block the event loop.
    """
    if not settings.cloudinary_enabled:
        return None
    return await asyncio.to_thread(_upload_sync, file_obj, folder)
