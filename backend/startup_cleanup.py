"""
Startup disk cleanup for Railway's ephemeral container disk.

Railway was failing to boot with "only 230MB free, needs 524MB". This frees
space on every startup by removing regenerable artifacts and legacy local photo
uploads. It is deliberately conservative:

  * SAFE scope — only __pycache__/*.pyc/*.pyo, the pip download cache, and
    legacy files under uploads/photos older than the keep window. New photos go
    straight to Cloudinary (item_photos stores Cloudinary URLs), so old local
    photos are legacy/fallback copies only.
  * NEVER touches uploads/verification, uploads/disputes, or uploads/pdfs —
    those can hold un-migrated, sensitive originals (ID docs, dispute evidence,
    generated PDFs). Deleting them would be data loss.
  * non-fatal — every step is guarded so cleanup can never block startup.

Tunables (env):
  STARTUP_CLEANUP_ENABLED      default "true"
  STARTUP_CLEANUP_PHOTO_DAYS   default "7"  (delete uploads/photos older than this)
"""

from __future__ import annotations

import logging
import os
import shutil
import time
from pathlib import Path

logger = logging.getLogger(__name__)

SECONDS_PER_DAY = 24 * 60 * 60


def _fmt_bytes(size: float) -> str:
    value = float(size)
    for unit in ("B", "KB", "MB", "GB"):
        if value < 1024 or unit == "GB":
            return f"{value:.1f} {unit}"
        value /= 1024
    return f"{value:.1f} GB"


def _dir_size(path: Path) -> int:
    total = 0
    for f in path.rglob("*"):
        try:
            if f.is_file() and not f.is_symlink():
                total += f.stat().st_size
        except OSError:
            pass
    return total


def _purge_pycache(root: Path) -> int:
    """Remove __pycache__ dirs and stray .pyc/.pyo under the app root. These are
    regenerated on demand by Python, so removing them is always safe."""
    freed = 0
    try:
        for cache_dir in root.rglob("__pycache__"):
            if cache_dir.is_dir() and not cache_dir.is_symlink():
                try:
                    freed += _dir_size(cache_dir)
                    shutil.rmtree(cache_dir, ignore_errors=True)
                except OSError as exc:
                    logger.warning(f"[STARTUP_CLEANUP] could not remove {cache_dir}: {exc}")
        for pattern in ("*.pyc", "*.pyo"):
            for f in root.rglob(pattern):
                try:
                    if f.is_file() and not f.is_symlink():
                        size = f.stat().st_size
                        f.unlink()
                        freed += size
                except OSError:
                    pass
    except Exception as exc:  # never let cleanup raise
        logger.warning(f"[STARTUP_CLEANUP] pycache purge error: {exc}")
    return freed


def _purge_pip_cache() -> int:
    """Remove the pip download cache — pure build artifact, never needed at runtime."""
    freed = 0
    candidates = []
    if os.environ.get("PIP_CACHE_DIR"):
        candidates.append(Path(os.environ["PIP_CACHE_DIR"]))
    candidates.append(Path.home() / ".cache" / "pip")
    candidates.append(Path("/root/.cache/pip"))
    seen = set()
    for cache in candidates:
        try:
            resolved = cache.resolve()
            if resolved in seen or not cache.is_dir():
                continue
            seen.add(resolved)
            freed += _dir_size(cache)
            shutil.rmtree(cache, ignore_errors=True)
        except Exception as exc:
            logger.warning(f"[STARTUP_CLEANUP] pip cache purge error for {cache}: {exc}")
    return freed


def _purge_old_photos(photos_path: Path, keep_days: float) -> int:
    """Delete legacy local photo files older than keep_days. Only operates on a
    path that ends with uploads/photos, as a guard against a misconfigured path."""
    freed = 0
    try:
        parts = [p.lower() for p in photos_path.parts]
        if not (len(parts) >= 2 and parts[-2:] == ["uploads", "photos"]):
            logger.warning(
                f"[STARTUP_CLEANUP] refusing to clean photos at {photos_path} — "
                "path does not end with uploads/photos"
            )
            return 0
        if not photos_path.is_dir():
            return 0
        cutoff = time.time() - (keep_days * SECONDS_PER_DAY)
        for f in photos_path.rglob("*"):
            try:
                if f.is_symlink() or not f.is_file():
                    continue
                stat = f.stat()
                if stat.st_mtime > cutoff:
                    continue
                size = stat.st_size
                f.unlink()
                freed += size
            except OSError:
                pass
    except Exception as exc:
        logger.warning(f"[STARTUP_CLEANUP] photo purge error: {exc}")
    return freed


def run_startup_cleanup() -> dict:
    """Free ephemeral disk on startup. Returns a summary dict; never raises."""
    if os.environ.get("STARTUP_CLEANUP_ENABLED", "true").lower() in ("0", "false", "no"):
        logger.info("[STARTUP_CLEANUP] disabled via STARTUP_CLEANUP_ENABLED")
        return {"enabled": False}

    app_root = Path(__file__).resolve().parent
    try:
        keep_days = float(os.environ.get("STARTUP_CLEANUP_PHOTO_DAYS", "7"))
    except ValueError:
        keep_days = 7.0

    # Resolve the photos dir from settings, falling back to the known default.
    try:
        from core.config import settings
        photos_path = Path(getattr(settings, "PHOTOS_PATH", "/app/uploads/photos"))
    except Exception:
        photos_path = Path("/app/uploads/photos")

    pycache_freed = _purge_pycache(app_root)
    pip_freed = _purge_pip_cache()
    photos_freed = _purge_old_photos(photos_path, keep_days)
    total = pycache_freed + pip_freed + photos_freed

    logger.info(
        f"[STARTUP_CLEANUP] freed total={_fmt_bytes(total)} "
        f"pycache={_fmt_bytes(pycache_freed)} pip_cache={_fmt_bytes(pip_freed)} "
        f"photos={_fmt_bytes(photos_freed)} (photos_keep_days={keep_days:g}, "
        f"root={app_root})"
    )
    return {
        "enabled": True,
        "total_bytes": total,
        "pycache_bytes": pycache_freed,
        "pip_cache_bytes": pip_freed,
        "photos_bytes": photos_freed,
    }


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
    run_startup_cleanup()
