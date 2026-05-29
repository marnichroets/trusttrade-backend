"""
reset_smart_deal_to_payment.py

A Smart Deal that was wrongly advanced to FUNDED without payment actually being
collected (the old fund flow skipped the TradeSafe payment page for EFT) must be
reset back to the "Payment" step so the client can pay properly.

This sets status → ACCEPTED (the step labelled "Payment" in the UI) and clears the
escrow / payment / funded fields so a fresh, paid escrow can be created.

SAFETY: it refuses to reset a deal whose payment looks real — i.e. one that has a
recorded withdrawal (withdrawal_status in in_progress/succeeded/auto_settled) — so
you can't accidentally unwind a genuinely paid deal. Use --force to override.

Usage (PowerShell):
    $env:MONGO_URL="<your production mongo url>"; $env:DB_NAME="trusttrade"

    # Inspect first (READ-ONLY, default):
    python reset_smart_deal_to_payment.py SD-FF015212

    # Apply the reset:
    python reset_smart_deal_to_payment.py SD-FF015212 --apply
"""
import os
import sys
from datetime import datetime, timezone

from pymongo import MongoClient

REVIEW_FIELDS = [
    "deal_id", "status", "payment_status", "tradesafe_id", "tradesafe_token_id",
    "tradesafe_transaction_id", "tradesafe_allocation_id", "tradesafe_seller_token_id",
    "payment_link", "payment_method", "funded_at", "withdrawal_status",
    "item_price", "amount", "net_amount",
]

# A deal with any of these withdrawal states has had real money move — do not reset.
PAID_WITHDRAWAL_STATES = {"in_progress", "succeeded", "auto_settled"}


def print_deal(deal: dict):
    print("-" * 60)
    for f in REVIEW_FIELDS:
        print(f"  {f:26s} = {deal.get(f)!r}")
    print("-" * 60)


def main():
    args = sys.argv[1:]
    apply = "--apply" in args
    force = "--force" in args
    deal_ids = [a for a in args if not a.startswith("--")]

    if not deal_ids:
        print("Usage: python reset_smart_deal_to_payment.py <deal_id> [--apply] [--force]")
        sys.exit(1)

    mongo_url = os.environ.get("MONGO_URL")
    if not mongo_url:
        print("ERROR: set MONGO_URL (and optionally DB_NAME, default 'trusttrade').")
        sys.exit(1)
    db = MongoClient(mongo_url)[os.environ.get("DB_NAME", "trusttrade")]

    for deal_id in deal_ids:
        deal = db.transactions.find_one({"deal_id": deal_id, "deal_type": "DIGITAL_WORK"})
        if not deal:
            print(f"\n{deal_id}: NOT FOUND (no DIGITAL_WORK deal with that deal_id)")
            continue

        print(f"\n=== {deal_id} ===\nBEFORE:")
        print_deal(deal)

        wstatus = deal.get("withdrawal_status")
        if wstatus in PAID_WITHDRAWAL_STATES and not force:
            print(f"  REFUSING: withdrawal_status={wstatus!r} suggests money moved. "
                  f"Re-run with --force only if you are certain no payment was collected.")
            continue

        reset = {
            "status": "ACCEPTED",                 # the "Payment" step in the UI
            "payment_status": "Awaiting Acceptance",
            "tradesafe_id": None,
            "tradesafe_token_id": None,
            "tradesafe_transaction_id": None,
            "tradesafe_allocation_id": None,
            "tradesafe_seller_token_id": None,
            "tradesafe_buyer_token_id": None,
            "tradesafe_state": None,
            "payment_link": None,
            "payment_method": None,
            "payment_initiated_at": None,
            "funded_at": None,
            "funds_received_at": None,
            "auto_release_at": None,
            "release_status": None,
            "withdrawal_status": None,
            "updated_at": datetime.now(timezone.utc),
            "reset_reason": "Wrongly funded without payment — reset to Payment step",
            "reset_at": datetime.now(timezone.utc).isoformat(),
        }

        print("WOULD SET:")
        for k, v in reset.items():
            print(f"  {k:26s} = {v!r}")

        if apply:
            db.transactions.update_one({"_id": deal["_id"]}, {"$set": reset})
            print(f"  → APPLIED. {deal_id} reset to ACCEPTED (Payment step).")
        else:
            print("  → DRY RUN (pass --apply to write).")


if __name__ == "__main__":
    main()
