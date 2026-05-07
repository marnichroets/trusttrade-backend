"""
Manual test: start + accept delivery back-to-back for a specific allocation.
Run from Railway terminal (has env vars) or locally with a populated .env:

    python test_allocation_release.py [allocation_id]

Defaults to allocation 33COrcDD4xnOZ5jA0wBCC (TT-368070).
"""
import asyncio
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

ALLOCATION_ID = sys.argv[1] if len(sys.argv) > 1 else "33COrcDD4xnOZ5jA0wBCC"


async def main():
    from tradesafe_service import (
        get_tradesafe_token,
        start_delivery,
        execute_graphql,
    )

    print(f"=== Testing back-to-back release for allocation: {ALLOCATION_ID} ===\n")

    token = await get_tradesafe_token()
    if not token:
        print("FAIL: could not obtain TradeSafe token — check TRADESAFE_CLIENT_ID / SECRET env vars")
        return

    print("TradeSafe auth OK\n")

    # Step 1 — allocationStartDelivery
    print("Step 1: allocationStartDelivery ...")
    start_result = await start_delivery(ALLOCATION_ID)
    print(f"  result: {start_result}\n")

    # Step 2 — allocationAcceptDelivery
    print("Step 2: allocationAcceptDelivery ...")
    mutation = """
    mutation allocationAcceptDelivery($id: ID!) {
        allocationAcceptDelivery(id: $id) {
            id
            title
            state
            value
        }
    }
    """
    accept_result = await execute_graphql(mutation, {"id": ALLOCATION_ID})
    print(f"  raw response: {accept_result}\n")

    if accept_result and "errors" in accept_result:
        errs = accept_result["errors"]
        print(f"FAIL: TradeSafe returned errors:")
        for e in errs:
            print(f"  message: {e.get('message')}")
            print(f"  debug:   {(e.get('extensions') or {}).get('debugMessage', 'n/a')}")
    elif accept_result and "allocationAcceptDelivery" in accept_result:
        data = accept_result["allocationAcceptDelivery"]
        print(f"SUCCESS: allocation {data.get('id')} → state={data.get('state')} value={data.get('value')}")
    else:
        print(f"UNEXPECTED response: {accept_result}")


asyncio.run(main())
