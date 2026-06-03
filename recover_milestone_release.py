"""
Diagnose (and optionally re-attempt) a stuck Smart Deal milestone release.

Use this when a buyer's "Approve" on a milestone fails with
"Could not release this milestone. Please try again or contact support."

It reuses the live app's release path (tradesafe_service.accept_delivery +
routes.webhooks.attempt_transaction_withdrawal + the parent-advance helpers),
so a --release run does exactly what the Approve button does — just admin-driven.

WHAT IT SHOWS (read-only by default):
  - The milestone's escrow handles (child transaction id, allocation id, token id)
  - The EXACT TradeSafe error from the last failed attempt (child.payout_error)

USAGE — run with the PRODUCTION environment so it uses the real Mongo + TradeSafe
credentials. On Railway:

    railway run python recover_milestone_release.py SD-9113A7B0            # diagnose all stages
    railway run python recover_milestone_release.py SD-9113A7B0 --seq 2    # focus stage 2
    railway run python recover_milestone_release.py SD-9113A7B0 --seq 2 --release   # re-attempt

Or locally with env exported: MONGO_URL, DB_NAME, and the TradeSafe vars the app uses.
Run from the repo root.
"""
import argparse
import asyncio
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "backend"))


def _fmt(v):
    return "—" if v in (None, "") else v


async def main():
    ap = argparse.ArgumentParser(description="Diagnose/recover a Smart Deal milestone release")
    ap.add_argument("deal_id", help="Parent deal id, e.g. SD-9113A7B0")
    ap.add_argument("--seq", type=int, default=None, help="Milestone sequence number, e.g. 2")
    ap.add_argument("--milestone-id", default=None, help="Milestone id, e.g. M2 (overrides --seq)")
    ap.add_argument("--release", action="store_true", help="Actually re-attempt the release (writes + moves money)")
    args = ap.parse_args()

    from core.config import settings
    if not settings.MONGO_URL:
        print("ERROR: MONGO_URL is not set. Run with the production env (e.g. `railway run`).")
        sys.exit(1)

    from core.database import get_database
    db = get_database()

    deal = await db.transactions.find_one({"deal_id": args.deal_id}, {"_id": 0})
    if not deal:
        print(f"No deal found with deal_id={args.deal_id!r}")
        sys.exit(2)
    if deal.get("deal_type") != "DIGITAL_WORK_MILESTONE":
        print(f"WARNING: deal_type is {deal.get('deal_type')!r}, expected DIGITAL_WORK_MILESTONE")

    milestones = sorted(deal.get("milestones", []), key=lambda x: x.get("seq", 0))
    print(f"=== {args.deal_id} — {deal.get('title')!r} | status={deal.get('status')!r} ===")
    print(f"{'seq':>3}  {'id':<5} {'status':<16} {'alloc_id':<22} {'child_txn_id'}")
    for m in milestones:
        print(f"{m.get('seq'):>3}  {m.get('milestone_id',''):<5} {str(m.get('status')):<16} "
              f"{_fmt(m.get('tradesafe_allocation_id')):<22} {_fmt(m.get('child_transaction_id'))}")

    # Pick the target milestone.
    if args.milestone_id:
        target = next((m for m in milestones if m.get("milestone_id") == args.milestone_id), None)
    elif args.seq is not None:
        target = next((m for m in milestones if m.get("seq") == args.seq), None)
    else:
        delivered = [m for m in milestones if m.get("status") == "DELIVERED"]
        target = delivered[0] if len(delivered) == 1 else None
        if target is None:
            print("\nPick a milestone with --seq N (or --milestone-id MN). "
                  f"DELIVERED stages: {[m.get('seq') for m in delivered] or 'none'}")
            sys.exit(0)

    if not target:
        print(f"\nMilestone not found (seq={args.seq}, id={args.milestone_id}).")
        sys.exit(2)

    mid = target["milestone_id"]
    child_deal_id = target.get("child_transaction_id") or f"{args.deal_id}-{mid}"
    allocation_id = target.get("tradesafe_allocation_id")
    seller_token_id = target.get("tradesafe_seller_token_id")
    net_amount = target.get("net_amount") or target.get("amount")

    child = await db.transactions.find_one({"deal_id": child_deal_id}, {"_id": 0}) or {}

    print(f"\n--- target: stage {target.get('seq')} ({mid}) ---")
    print(f"milestone status          : {target.get('status')!r}")
    print(f"child_transaction_id      : {child_deal_id}")
    print(f"tradesafe_allocation_id   : {_fmt(allocation_id)}")
    print(f"tradesafe_seller_token_id : {_fmt(seller_token_id)}")
    print(f"net_amount                : {net_amount}")
    print(f"child tradesafe_id        : {_fmt(child.get('tradesafe_id'))}")
    print(f"child tradesafe_state     : {_fmt(child.get('tradesafe_state'))}")
    print(f"child payout_failed       : {child.get('payout_failed')}")
    print(f">>> child payout_error    : {_fmt(child.get('payout_error'))}")   # the exact TradeSafe error
    print(f"child withdrawal_status   : {_fmt(child.get('withdrawal_status'))}")

    if not args.release:
        print("\n(read-only) Re-run with --release to re-attempt the release.")
        return

    if not allocation_id:
        print("\nABORT: no tradesafe_allocation_id on this milestone — it isn't linked to escrow, "
              "so there's nothing to release. Investigate the funding webhook for this stage.")
        sys.exit(3)

    print(f"\n[RELEASE] Re-attempting via the app's shared release path "
          f"(self-heals onto the real allocation for reference {child_deal_id}) …")
    # Reuse the exact code the Approve button / admin force-release run, so the release,
    # the allocation-id correction, the bank withdrawal and the parent-advance all happen
    # identically and the stored allocation id is fixed in the DB.
    from routes.smart_deals import _release_milestone_escrow

    ok, error = await _release_milestone_escrow(db, deal, target, actor="cli_recovery")
    if not ok:
        print(f"[RELEASE] FAILED: {error}")
        sys.exit(4)

    print(f"\n[RELEASE] DONE — stage {target.get('seq')} ({mid}) released for {args.deal_id}.")


if __name__ == "__main__":
    asyncio.run(main())
