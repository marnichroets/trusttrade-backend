#!/usr/bin/env python3
"""
One-time migration: convert datetime created_at to ISO string for two malformed Smart Deals.

Smart Deals SD-6BF4099A and SD-574D9B52 were created before the ISO-string fix and have
native Python datetime objects stored in their created_at field. This causes Pydantic
validation warnings every time list_transactions is called for the affected users.

Usage (run from the backend/ directory):
  python fix_smart_deal_dates.py            # live run
  python fix_smart_deal_dates.py --dry-run  # preview only, no writes
"""

import sys
import argparse
from pathlib import Path
from datetime import datetime, timezone

sys.path.insert(0, str(Path(__file__).parent))

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / '.env')

from pymongo import MongoClient
from core.config import settings

DEAL_IDS = ["SD-6BF4099A", "SD-574D9B52"]


def main():
    parser = argparse.ArgumentParser(description="Fix datetime created_at in malformed Smart Deal records")
    parser.add_argument("--dry-run", action="store_true", help="Preview only, no writes")
    parser.add_argument("--mongo-url", default=settings.MONGO_URL)
    parser.add_argument("--db-name", default=settings.DB_NAME)
    args = parser.parse_args()

    client = MongoClient(args.mongo_url, serverSelectionTimeoutMS=10000)
    db = client[args.db_name]

    mode = "DRY RUN" if args.dry_run else "LIVE"
    print(f"\nfix_smart_deal_dates — mode: {mode}\n")

    fixed = 0
    for deal_id in DEAL_IDS:
        doc = db.transactions.find_one({"transaction_id": deal_id}, {"_id": 0, "transaction_id": 1, "created_at": 1})
        if not doc:
            print(f"  {deal_id}: NOT FOUND — skipping")
            continue

        ca = doc.get("created_at")
        if isinstance(ca, datetime):
            iso = ca.isoformat()
            print(f"  {deal_id}: datetime({ca})  →  '{iso}'")
            if not args.dry_run:
                db.transactions.update_one(
                    {"transaction_id": deal_id},
                    {"$set": {"created_at": iso}},
                )
            fixed += 1
        elif isinstance(ca, str):
            print(f"  {deal_id}: already a string ('{ca}') — no change needed")
        else:
            print(f"  {deal_id}: unexpected type {type(ca)} — skipping")

    print(f"\n{'Would fix' if args.dry_run else 'Fixed'} {fixed} record(s).")


if __name__ == "__main__":
    main()
