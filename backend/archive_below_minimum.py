#!/usr/bin/env python3
"""
One-time admin script: archive sub-minimum transactions.

Finds all transactions where item_price < MINIMUM_TRANSACTION_AMOUNT (default R500)
and the transaction is NOT already in a terminal state (completed, cancelled,
refunded, released, or already archived).

What it does per matching transaction:
  - Sets archived = True, archived_at = now
  - Sets payment_status = "Cancelled", transaction_state = "CANCELLED"
  - Appends a timeline entry with the reason

Records are NOT deleted. They remain visible in transaction history but will no
longer appear in the active dashboard (the frontend filters archived = True).

Usage (run from the backend/ directory):
  python archive_below_minimum.py            # live run
  python archive_below_minimum.py --dry-run  # preview only, no writes
  python archive_below_minimum.py --min 750  # custom threshold
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

DEFAULT_MINIMUM = settings.MINIMUM_TRANSACTION_AMOUNT  # driven by env, default 500.0

TERMINAL_PAYMENT_KEYWORDS = (
    "cancelled", "canceled", "refunded", "completed",
    "released", "funds released",
)
TERMINAL_TX_STATES = {
    "COMPLETED", "CANCELLED", "CANCELED", "REFUNDED", "EXPIRED",
}


def is_terminal(txn: dict) -> bool:
    if txn.get("archived"):
        return True
    payment = (txn.get("payment_status") or "").lower()
    if any(k in payment for k in TERMINAL_PAYMENT_KEYWORDS):
        return True
    state = (txn.get("transaction_state") or "").upper()
    if state in TERMINAL_TX_STATES:
        return True
    release = (txn.get("release_status") or "").lower()
    if "released" in release and "not released" not in release:
        return True
    return False


def main():
    parser = argparse.ArgumentParser(description="Archive sub-minimum TrustTrade transactions")
    parser.add_argument("--dry-run", action="store_true",
                        help="Preview changes without writing to the database")
    parser.add_argument("--min", type=float, default=DEFAULT_MINIMUM,
                        help=f"Amount threshold in ZAR (default: {DEFAULT_MINIMUM:.0f})")
    args = parser.parse_args()

    client = MongoClient(settings.MONGO_URL, serverSelectionTimeoutMS=5000)
    db = client[settings.DB_NAME]

    now = datetime.now(timezone.utc).isoformat()
    threshold = args.min

    print("\nTrustTrade — Archive sub-minimum transactions")
    print(f"  Threshold : R{threshold:.0f}")
    print(f"  Mode      : {'DRY RUN — no writes' if args.dry_run else 'LIVE — will write'}")
    print(f"  Timestamp : {now}\n")

    candidates = list(db.transactions.find(
        {"item_price": {"$lt": threshold}}, {"_id": 0}
    ))
    print(f"Found {len(candidates)} transaction(s) with item_price < R{threshold:.0f}")

    to_archive = [t for t in candidates if not is_terminal(t)]
    skipped = len(candidates) - len(to_archive)
    print(f"  Already terminal / archived (skip) : {skipped}")
    print(f"  Will archive                       : {len(to_archive)}\n")

    if not to_archive:
        print("Nothing to do.")
        client.close()
        return

    print(f"{'TX ID':14}  {'Amount':>8}  {'Old status':30}  Description")
    print("-" * 80)
    for txn in to_archive:
        txid = txn.get("transaction_id", "?")
        price = txn.get("item_price", 0)
        old_status = txn.get("payment_status", "")
        desc = (txn.get("item_description") or "")[:35]
        print(f"  {txid[:12]}  R{price:>7.2f}  {old_status:<30}  {desc}")

    if args.dry_run:
        print(f"\nDRY RUN complete — {len(to_archive)} would be archived.")
        print("Re-run without --dry-run to apply changes.")
        client.close()
        return

    print()
    archived_count = 0
    errors = 0
    for txn in to_archive:
        txid = txn.get("transaction_id", "?")
        price = txn.get("item_price", 0)
        try:
            timeline_entry = {
                "event": "archived_below_minimum",
                "by": "system",
                "note": (
                    f"Archived by admin script: amount R{price:.2f} is below "
                    f"the minimum transaction amount of R{threshold:.0f}."
                ),
                "at": now,
            }
            db.transactions.update_one(
                {"transaction_id": txid},
                {
                    "$set": {
                        "archived": True,
                        "archived_at": now,
                        "payment_status": "Cancelled",
                        "transaction_state": "CANCELLED",
                    },
                    "$push": {"timeline": timeline_entry},
                },
            )
            print(f"  Archived {txid[:12]}  R{price:.2f}")
            archived_count += 1
        except Exception as exc:
            print(f"  ERROR archiving {txid[:12]}: {exc}")
            errors += 1

    print(f"\nDone — {archived_count} archived, {errors} error(s).")
    client.close()


if __name__ == "__main__":
    main()
