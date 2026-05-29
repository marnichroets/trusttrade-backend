"""
backfill_smart_deal_fields.py

Smart Deals created before the field-mapping fix were stored with only the
deal-specific fields (client_email / freelancer_email / title / description /
amount). The admin transactions list and the payout/webhook code read the
normal-transaction fields (buyer_email / seller_email / item_description /
item_price / payment_status / net_amount …), so those deals show as
"Unknown buyer / Unknown seller / R0".

This script derives the missing normal-transaction fields from the existing
deal fields, using the EXACT same mapping as routes/smart_deals.create_deal.

Usage (PowerShell):
    $env:MONGO_URL="<your production mongo url>"; $env:DB_NAME="trusttrade"

    # Inspect a single deal (READ-ONLY, default):
    python backfill_smart_deal_fields.py SD-3D6514E4

    # Apply the backfill to that deal:
    python backfill_smart_deal_fields.py SD-3D6514E4 --apply

    # Inspect every DIGITAL_WORK deal missing the fields:
    python backfill_smart_deal_fields.py --all

    # Backfill every DIGITAL_WORK deal missing the fields:
    python backfill_smart_deal_fields.py --all --apply

Without --apply the script only READS and prints; it never writes.
The platform fee percentage defaults to 2% (override with PLATFORM_FEE_PERCENT).
"""
import os
import sys

from pymongo import MongoClient

PLATFORM_FEE_PERCENT = float(os.environ.get("PLATFORM_FEE_PERCENT", "2"))

# Fields the admin list / webhook / payout code depend on.
REVIEW_FIELDS = [
    "deal_id", "deal_type", "status", "payment_status",
    "client_email", "freelancer_email", "buyer_email", "seller_email",
    "buyer_name", "seller_name", "title", "item_description",
    "amount", "item_price", "fee_allocation", "platform_fee",
    "net_amount", "total", "share_code", "delivery_method",
    "tradesafe_id", "tradesafe_seller_token_id",
]


def derive_fields(deal: dict) -> dict:
    """Mirror routes/smart_deals.create_deal so backfilled deals match new ones."""
    amount = float(deal.get("amount") or 0)
    fee_paid_by = (deal.get("fee_paid_by") or "CLIENT").upper()
    fee_allocation = "SELLER" if fee_paid_by == "FREELANCER" else "BUYER"
    platform_fee = max(round(amount * PLATFORM_FEE_PERCENT / 100, 2), 5.0)
    if fee_allocation == "SELLER":
        net_amount = round(amount - platform_fee, 2)
        total = round(amount, 2)
    else:
        net_amount = round(amount, 2)
        total = round(amount + platform_fee, 2)

    title = deal.get("title", "Digital work")
    description = deal.get("description", "")
    item_description = f"{title} — {description}".strip(" —")

    return {
        "buyer_user_id": deal.get("client_id"),
        "buyer_email": deal.get("client_email"),
        "buyer_name": deal.get("client_name") or deal.get("client_email"),
        "seller_user_id": deal.get("freelancer_id"),
        "seller_email": deal.get("freelancer_email"),
        "seller_name": deal.get("freelancer_name") or deal.get("freelancer_email"),
        "item_description": item_description,
        "item_price": amount,
        "delivery_method": deal.get("delivery_method") or "digital",
        "fee_allocation": fee_allocation,
        "platform_fee": platform_fee,
        "trusttrade_fee": platform_fee,
        "net_amount": net_amount,
        "seller_receives": net_amount,
        "total": total,
        "share_code": deal.get("share_code") or deal.get("deal_id"),
        "payment_status": deal.get("payment_status") or "Awaiting Acceptance",
    }


def needs_backfill(deal: dict) -> bool:
    return not (deal.get("buyer_email") and deal.get("seller_email") and deal.get("item_price"))


def print_deal(deal: dict):
    print("-" * 64)
    for f in REVIEW_FIELDS:
        print(f"  {f:24s} = {deal.get(f)!r}")
    print("-" * 64)


def main():
    args = [a for a in sys.argv[1:]]
    apply = "--apply" in args
    do_all = "--all" in args
    deal_ids = [a for a in args if not a.startswith("--")]

    if not do_all and not deal_ids:
        print("Usage: python backfill_smart_deal_fields.py <deal_id> [--apply] | --all [--apply]")
        sys.exit(1)

    mongo_url = os.environ.get("MONGO_URL")
    if not mongo_url:
        print("ERROR: set MONGO_URL (and optionally DB_NAME, default 'trusttrade').")
        sys.exit(1)
    db = MongoClient(mongo_url)[os.environ.get("DB_NAME", "trusttrade")]

    if do_all:
        query = {"deal_type": "DIGITAL_WORK"}
    else:
        query = {"deal_id": {"$in": deal_ids}}

    deals = list(db.transactions.find(query))
    if not deals:
        print(f"No matching Smart Deals found for query={query}")
        return

    fixed = 0
    for deal in deals:
        print(f"\n=== {deal.get('deal_id')} (status={deal.get('status')}) ===")
        print("BEFORE:")
        print_deal(deal)

        if not needs_backfill(deal):
            print("  → already has buyer_email/seller_email/item_price — nothing to backfill.")
            continue

        derived = derive_fields(deal)
        print("WOULD SET:")
        for k, v in derived.items():
            print(f"  {k:24s} = {v!r}")

        if apply:
            db.transactions.update_one({"_id": deal["_id"]}, {"$set": derived})
            fixed += 1
            print(f"  → APPLIED to {deal.get('deal_id')}")
        else:
            print("  → DRY RUN (pass --apply to write)")

    print(f"\nDone. {fixed} deal(s) updated." if apply else "\nDone (dry run — no writes).")


if __name__ == "__main__":
    main()
