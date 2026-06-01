"""
Delete old local transaction photo uploads.

Cloudinary-backed photo uploads return before writing to local disk, so this is
for legacy files and Cloudinary fallback files under /app/uploads/photos.

Dry-run is the default. Pass --delete to remove matching files.
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path


SECONDS_PER_DAY = 24 * 60 * 60


def _format_bytes(size: int) -> str:
    value = float(size)
    for unit in ("B", "KB", "MB", "GB"):
        if value < 1024 or unit == "GB":
            return f"{value:.1f} {unit}"
        value /= 1024
    return f"{value:.1f} GB"


def _looks_like_photos_upload_dir(path: Path) -> bool:
    parts = [part.lower() for part in path.parts]
    return len(parts) >= 2 and parts[-2:] == ["uploads", "photos"]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Clean old files from /app/uploads/photos.",
    )
    parser.add_argument(
        "--path",
        default=os.environ.get("PHOTOS_PATH", "/app/uploads/photos"),
        help="Upload photo directory to clean. Defaults to PHOTOS_PATH or /app/uploads/photos.",
    )
    parser.add_argument(
        "--days",
        type=float,
        default=7.0,
        help="Delete files older than this many days. Default: 7.",
    )
    parser.add_argument(
        "--delete",
        action="store_true",
        help="Actually delete files. Without this flag the script only prints what it would delete.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Allow cleaning a path that does not end with uploads/photos.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.days < 0:
        print("--days must be zero or greater", file=sys.stderr)
        return 2

    target = Path(args.path).expanduser().resolve()
    if not args.force and not _looks_like_photos_upload_dir(target):
        print(
            f"Refusing to clean {target}: path must end with uploads/photos. "
            "Pass --force only if this is intentional.",
            file=sys.stderr,
        )
        return 2

    if not target.exists():
        print(f"Nothing to clean: {target} does not exist.")
        return 0
    if not target.is_dir():
        print(f"Refusing to clean {target}: not a directory.", file=sys.stderr)
        return 2

    now = time.time()
    cutoff = now - (args.days * SECONDS_PER_DAY)
    matched = 0
    deleted = 0
    failed = 0
    bytes_matched = 0
    bytes_deleted = 0

    mode = "delete" if args.delete else "dry-run"
    print(f"Cleaning mode={mode} path={target} older_than_days={args.days:g}")

    for file_path in target.rglob("*"):
        try:
            if file_path.is_symlink() or not file_path.is_file():
                continue
            stat = file_path.stat()
            if stat.st_mtime > cutoff:
                continue

            matched += 1
            bytes_matched += stat.st_size
            age_days = (now - stat.st_mtime) / SECONDS_PER_DAY

            if args.delete:
                file_path.unlink()
                deleted += 1
                bytes_deleted += stat.st_size
                print(f"deleted age_days={age_days:.1f} size={_format_bytes(stat.st_size)} path={file_path}")
            else:
                print(f"would_delete age_days={age_days:.1f} size={_format_bytes(stat.st_size)} path={file_path}")
        except OSError as exc:
            failed += 1
            print(f"failed path={file_path} error={exc}", file=sys.stderr)

    print(
        "Summary: "
        f"matched={matched} matched_size={_format_bytes(bytes_matched)} "
        f"deleted={deleted} deleted_size={_format_bytes(bytes_deleted)} failed={failed}"
    )
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
