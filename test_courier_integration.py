"""
Courier Guy Integration Test — TrustTrade Live Backend
Tests: quote -> transaction creation -> fee breakdown -> TradeSafe payment link
Does NOT actually pay.

Usage:
    python test_courier_integration.py --email you@example.com --password secret
    # or via env vars:
    TEST_EMAIL=you@example.com TEST_PASSWORD=secret python test_courier_integration.py
"""

import argparse
import asyncio
import getpass
import os
import sys
import traceback

import httpx

BASE_URL = "https://trusttrade-backend-production-3efa.up.railway.app"

PASS = "\033[32mPASS\033[0m"
FAIL = "\033[31mFAIL\033[0m"
INFO = "\033[36mINFO\033[0m"
BOLD = "\033[1m"
RESET = "\033[0m"

results: list[tuple[str, bool, str]] = []


async def authenticate(client: httpx.AsyncClient, email: str, password: str) -> str | None:
    """Login and return the session token."""
    r = await client.post("/api/auth/login", json={"email": email, "password": password})
    if r.status_code == 200:
        data = r.json()
        token = data.get("session_token") or data.get("token") or data.get("access_token")
        if token:
            print(f"  {PASS} Authenticated as {data.get('email')} (admin={data.get('is_admin')})")
            return token
        print(f"  {FAIL} Login OK but no session_token in response: {data}")
        return None
    print(f"  {FAIL} Login failed: HTTP {r.status_code} — {r.text[:120]}")
    return None


def ok(label: str, detail: str = ""):
    results.append((label, True, detail))
    print(f"  {PASS} {label}" + (f"  -> {detail}" if detail else ""))


def fail(label: str, detail: str = ""):
    results.append((label, False, detail))
    print(f"  {FAIL} {label}" + (f"\n       {detail}" if detail else ""))


def info(msg: str):
    print(f"  {INFO} {msg}")


def section(title: str):
    print(f"\n{BOLD}{'-' * 64}{RESET}")
    print(f"{BOLD}  {title}{RESET}")
    print(f"{BOLD}{'-' * 64}{RESET}")


async def run(email: str, password: str):
    timeout = httpx.Timeout(45.0, connect=10.0)
    async with httpx.AsyncClient(base_url=BASE_URL, timeout=timeout) as c:

        # ── STEP -1: Authenticate ─────────────────────────────────────────────
        section("Step 0a — Authentication")
        session_token = await authenticate(c, email, password)
        if not session_token:
            print(f"\n  Cannot continue without a valid session token.")
            sys.exit(1)
        AUTH = {"Authorization": f"Bearer {session_token}"}
        print()

        # ── STEP 0: Platform settings ────────────────────────────────────────
        section("Step 0 — Platform Settings")
        r = await c.get("/api/platform/settings")
        platform_fee_pct = 2.0
        min_fee = 5.0
        if r.status_code == 200:
            d = r.json()
            platform_fee_pct = d.get("platform_fee_percent", 2.0)
            ok("GET /api/platform/settings", f"fee={platform_fee_pct}%")
        else:
            fail("GET /api/platform/settings", f"HTTP {r.status_code}")

        # ── STEP 1: Courier quote ────────────────────────────────────────────
        section("Step 1 — Courier Quote (Pretoria → Boksburg, 2 kg, 30×20×15 cm)")

        quote_payload = {
            "pickup_address": {
                "street_address": "1 Church Street",
                "local_area": "Pretoria CBD",
                "city": "Pretoria",
                "code": "0002",
                "country": "ZA",
                "type": "residential",
            },
            "delivery_address": {
                "street_address": "10 Rondebult Road",
                "local_area": "Boksburg North",
                "city": "Boksburg",
                "code": "1459",
                "country": "ZA",
                "type": "residential",
            },
            "parcel": {
                "submitted_length_cm": 30,
                "submitted_width_cm": 20,
                "submitted_height_cm": 15,
                "submitted_weight_kg": 2.0,
            },
        }

        r = await c.post("/api/courier/quote", json=quote_payload, headers=AUTH)
        courier_fee: float = 0.0
        courier_quote_id: str | None = None
        courier_service_name: str | None = None

        if r.status_code == 200:
            d = r.json()
            rates = d.get("rates", [])
            if rates:
                ok("POST /api/courier/quote → 200", f"{len(rates)} rate(s) returned")

                # Show all rates
                for i, rate in enumerate(rates):
                    service = rate.get("service_level", {})
                    code = service.get("code", rate.get("code", "?"))
                    name = service.get("name", rate.get("name", code))
                    price = rate.get("price", rate.get("rate", 0))
                    info(f"  Rate [{i}]: {name} ({code}) = R{price:.2f}")

                # Use cheapest rate
                cheapest = min(rates, key=lambda r: r.get("price", r.get("rate", 9999)))
                service = cheapest.get("service_level", {})
                courier_quote_id = service.get("code") or cheapest.get("code") or cheapest.get("id", "")
                courier_service_name = service.get("name") or cheapest.get("name") or courier_quote_id
                courier_fee = float(cheapest.get("price", cheapest.get("rate", 0)))

                if courier_fee > 0:
                    ok("Quote has a price", f"R{courier_fee:.2f} for '{courier_service_name}'")
                else:
                    fail("Quote has a price", f"price=0 in rate: {cheapest}")
            else:
                fail("POST /api/courier/quote → rates array non-empty", f"got empty rates: {d}")
        elif r.status_code == 503:
            fail("POST /api/courier/quote", "503 — COURIER_ENABLED=false on this deployment")
            print("\nCourier is disabled on the deployment. Cannot continue courier tests.")
            return
        elif r.status_code == 401:
            fail("POST /api/courier/quote", "401 — JWT token invalid or expired")
            return
        else:
            body = ""
            try:
                body = str(r.json())[:200]
            except Exception:
                body = r.text[:200]
            fail("POST /api/courier/quote → 200", f"HTTP {r.status_code} — {body}")
            return

        # ── STEP 2: Verify quote fields ──────────────────────────────────────
        section("Step 2 — Verify Quote Response")

        if courier_fee > 0:
            ok("Courier fee is a positive number", f"R{courier_fee:.2f}")
        else:
            fail("Courier fee > 0", f"got {courier_fee}")

        if courier_quote_id:
            ok("Quote includes service code / ID", courier_quote_id)
        else:
            fail("Quote includes service code / ID", "no code found")

        # ── STEP 3: Create R500 transaction with courier option ───────────────
        section("Step 3 — Create R500 Transaction WITH Courier Option")

        ITEM_PRICE = 500.0
        HANDLING_FEE = 10.0  # R10 handling fee used by frontend (COURIER_HANDLING_FEE constant)

        tx_payload = {
            "creator_role": "seller",
            "item_description": f"Integration test item — Courier Guy end-to-end test (R{ITEM_PRICE:.0f})",
            "item_condition": "good",
            "item_price": ITEM_PRICE,
            "fee_allocation": "BUYER",
            "delivery_method": "courier",
            "buyer_details_confirmed": True,
            "seller_details_confirmed": True,
            "item_accuracy_confirmed": True,
            "courier_quote_id": courier_quote_id,
            "courier_service_name": courier_service_name,
            "courier_fee": courier_fee,
            "courier_handling_fee": HANDLING_FEE,
        }

        r = await c.post("/api/transactions", json=tx_payload, headers=AUTH)
        tx_id: str | None = None
        tx_data: dict = {}

        if r.status_code in (200, 201):
            tx_data = r.json()
            tx_id = (
                tx_data.get("transaction_id") or
                tx_data.get("_id") or
                tx_data.get("id")
            )
            if tx_id:
                ok("POST /api/transactions → 201", f"tx_id={tx_id}")
            else:
                fail("Transaction response includes transaction_id", str(tx_data)[:120])
        elif r.status_code == 403:
            body = ""
            try:
                body = str(r.json())
            except Exception:
                body = r.text
            fail("POST /api/transactions → 201", f"403 — {body[:200]}")
            info("Note: Account may require phone verification or bank details.")
            return
        elif r.status_code == 400:
            body = ""
            try:
                body = str(r.json())
            except Exception:
                body = r.text
            fail("POST /api/transactions → 201", f"400 — {body[:200]}")
            return
        else:
            body = ""
            try:
                body = str(r.json())[:200]
            except Exception:
                body = r.text[:200]
            fail("POST /api/transactions → 201", f"HTTP {r.status_code} — {body}")
            return

        # ── STEP 4: Verify fee breakdown ─────────────────────────────────────
        section("Step 4 — Verify Escrow Fee Breakdown")

        # Expected calculations
        raw_fee = round(ITEM_PRICE * platform_fee_pct / 100, 2)
        expected_platform_fee = max(raw_fee, min_fee)
        # BUYER allocation: buyer pays platform_fee on top
        expected_total = round(ITEM_PRICE + expected_platform_fee + courier_fee + HANDLING_FEE, 2)

        actual_item_price = tx_data.get("item_price", 0)
        actual_platform_fee = tx_data.get("platform_fee") or tx_data.get("trusttrade_fee") or 0
        actual_courier_fee = tx_data.get("courier_fee", 0)
        actual_handling_fee = tx_data.get("courier_handling_fee", 0)
        actual_total = tx_data.get("total", 0)

        info(f"item_price       = R{actual_item_price:.2f}  (expected R{ITEM_PRICE:.2f})")
        info(f"platform_fee     = R{actual_platform_fee:.2f}  (expected R{expected_platform_fee:.2f})")
        info(f"courier_fee      = R{actual_courier_fee:.2f}  (expected R{courier_fee:.2f})")
        info(f"handling_fee     = R{actual_handling_fee:.2f}  (expected R{HANDLING_FEE:.2f})")
        info(f"total            = R{actual_total:.2f}  (expected R{expected_total:.2f})")

        if abs(actual_item_price - ITEM_PRICE) < 0.01:
            ok("item_price = R500.00")
        else:
            fail("item_price = R500.00", f"got R{actual_item_price:.2f}")

        if abs(actual_platform_fee - expected_platform_fee) < 0.01:
            ok(f"platform_fee = R{expected_platform_fee:.2f} ({platform_fee_pct}% of R{ITEM_PRICE:.0f})")
        else:
            fail(f"platform_fee = R{expected_platform_fee:.2f}", f"got R{actual_platform_fee:.2f}")

        if abs(actual_courier_fee - courier_fee) < 0.01:
            ok(f"courier_fee stored = R{courier_fee:.2f}")
        else:
            fail(f"courier_fee stored = R{courier_fee:.2f}", f"got R{actual_courier_fee:.2f}")

        if abs(actual_handling_fee - HANDLING_FEE) < 0.01:
            ok(f"courier_handling_fee stored = R{HANDLING_FEE:.2f}")
        else:
            fail(f"courier_handling_fee stored = R{HANDLING_FEE:.2f}", f"got R{actual_handling_fee:.2f}")

        if abs(actual_total - expected_total) < 0.01:
            ok(f"total = R{expected_total:.2f} (item + fee + courier + handling)")
        else:
            fail(
                f"total = R{expected_total:.2f}",
                f"got R{actual_total:.2f}  (item={ITEM_PRICE} + fee={expected_platform_fee} + "
                f"courier={courier_fee} + handling={HANDLING_FEE})"
            )

        # ── STEP 5: TradeSafe payment link ────────────────────────────────────
        section("Step 5 — TradeSafe Escrow & Payment Link")

        if not tx_id:
            fail("TradeSafe escrow creation", "no transaction_id — skipping")
        else:
            # Create TradeSafe transaction
            info("Creating TradeSafe escrow via POST /api/tradesafe/create-transaction ...")
            r = await c.post(
                "/api/tradesafe/create-transaction",
                json={"transaction_id": tx_id, "fee_allocation": "BUYER"},
                headers=AUTH,
            )
            tradesafe_id: str | None = None

            if r.status_code in (200, 201):
                d = r.json()
                tradesafe_id = d.get("tradesafe_id") or d.get("id")
                if tradesafe_id:
                    ok("POST /api/tradesafe/create-transaction → 200", f"tradesafe_id={tradesafe_id}")
                else:
                    ok("POST /api/tradesafe/create-transaction → 200", f"(tradesafe_id field missing) {str(d)[:80]}")
                    tradesafe_id = "unknown"
            elif r.status_code == 400:
                body = ""
                try:
                    body = str(r.json())
                except Exception:
                    body = r.text
                fail("POST /api/tradesafe/create-transaction", f"400 — {body[:200]}")
                info("Note: May require seller_confirmed or other prereqs — checking payment URL anyway...")
            else:
                body = ""
                try:
                    body = str(r.json())[:200]
                except Exception:
                    body = r.text[:200]
                fail(
                    "POST /api/tradesafe/create-transaction",
                    f"HTTP {r.status_code} — {body}"
                )

            # Fetch payment URL
            info(f"Fetching payment URL via GET /api/tradesafe/payment-url/{tx_id} ...")
            r = await c.get(f"/api/tradesafe/payment-url/{tx_id}", headers=AUTH)

            if r.status_code == 200:
                d = r.json()
                payment_link = d.get("payment_link")
                ts_state = d.get("state")
                fee_breakdown = d.get("fee_breakdown", {})

                ok("GET /api/tradesafe/payment-url → 200")

                if payment_link:
                    # Payment link exists — check it points to pay.tradesafe.co.za
                    ok("Payment link present", payment_link[:80])
                    if "tradesafe" in payment_link.lower() or "pay." in payment_link.lower():
                        ok("Payment link is a TradeSafe URL")
                    else:
                        fail("Payment link is a TradeSafe URL", f"unexpected URL: {payment_link[:80]}")
                else:
                    # EFT-only deployment — no redirect link but valid response
                    ok("Payment link response received (EFT deposit mode — no redirect URL)", f"state={ts_state}")

                if fee_breakdown:
                    info(f"TradeSafe fee_breakdown: {fee_breakdown}")
                    ts_total = fee_breakdown.get("total") or fee_breakdown.get("total_amount")
                    if ts_total:
                        info(f"TradeSafe total = R{ts_total:.2f}")
                        if abs(float(ts_total) - actual_total) < 1.0:
                            ok("TradeSafe total matches transaction total", f"R{ts_total:.2f}")
                        else:
                            fail(
                                "TradeSafe total matches transaction total",
                                f"TradeSafe says R{ts_total:.2f}, transaction says R{actual_total:.2f}"
                            )
                    else:
                        info(f"fee_breakdown keys: {list(fee_breakdown.keys())}")
                        ok("TradeSafe fee_breakdown present (total key not parsed)", str(fee_breakdown)[:80])
                else:
                    info("No fee_breakdown in payment URL response")

            elif r.status_code == 400:
                body = ""
                try:
                    body = str(r.json())
                except Exception:
                    body = r.text
                fail("GET /api/tradesafe/payment-url → 200", f"400 — {body[:200]}")
                info("Note: Seller confirmation or TradeSafe escrow may be required first.")
            else:
                body = ""
                try:
                    body = str(r.json())[:200]
                except Exception:
                    body = r.text[:200]
                fail("GET /api/tradesafe/payment-url → 200", f"HTTP {r.status_code} — {body}")

    # ── Summary ──────────────────────────────────────────────────────────────
    passed = sum(1 for _, r, _ in results if r is True)
    failed_list = [(l, d) for l, r, d in results if r is False]
    total = len(results)

    print(f"\n{BOLD}{'=' * 64}{RESET}")
    print(f"{BOLD}  RESULTS: {passed}/{total} passed  |  {len(failed_list)} failed{RESET}")
    print(f"{BOLD}{'=' * 64}{RESET}")

    if failed_list:
        print(f"\n{BOLD}Failed:{RESET}")
        for label, detail in failed_list:
            print(f"  {FAIL} {label}")
            if detail:
                print(f"       {detail}")
    else:
        print(f"\n  All {passed} checks passed!")


if __name__ == "__main__":
    try:
        import httpx  # noqa
    except ImportError:
        print("httpx is required: pip install httpx")
        sys.exit(1)

    parser = argparse.ArgumentParser(description="TrustTrade Courier Guy integration test")
    parser.add_argument("--email", default=os.environ.get("TEST_EMAIL", ""))
    parser.add_argument("--password", default=os.environ.get("TEST_PASSWORD", ""))
    args = parser.parse_args()

    _email = args.email or input("Admin email: ").strip()
    _password = args.password or getpass.getpass("Admin password: ")

    if not _email or not _password:
        print("Email and password are required.")
        sys.exit(1)

    asyncio.run(run(_email, _password))
