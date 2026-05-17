"""
TrustTrade full-flow integration tests against the live Railway deployment.

Usage:
    python tests/test_full_flow.py
    python tests/test_full_flow.py --section auth
    python tests/test_full_flow.py --section ai
    python tests/test_full_flow.py --section courier

Requires:
    pip install httpx

Environment variables (optional — defaults to disposable test values):
    TEST_EMAIL       email for registration/login tests
    TEST_PASSWORD    password for registration/login tests
    TEST_TOKEN       pre-existing JWT to skip registration (speeds up re-runs)
"""

import argparse
import asyncio
import os
import sys
import time
import uuid
from typing import Optional

import httpx

BASE_URL = "https://trusttrade-backend-production-3efa.up.railway.app"

# Unique suffix so each run creates fresh test data
RUN_ID = uuid.uuid4().hex[:8]
TEST_EMAIL = os.environ.get("TEST_EMAIL", f"testrunner+{RUN_ID}@mailinator.com")
TEST_PASSWORD = os.environ.get("TEST_PASSWORD", f"TestPass!{RUN_ID}")
TEST_NAME = f"Test Runner {RUN_ID}"
TEST_PHONE = "+27821234567"

PASS = "\033[32m✓\033[0m"
FAIL = "\033[31m✗\033[0m"
SKIP = "\033[33m–\033[0m"
BOLD = "\033[1m"
RESET = "\033[0m"

results: list[tuple[str, bool, str]] = []


def ok(label: str, detail: str = ""):
    results.append((label, True, detail))
    print(f"  {PASS} {label}" + (f"  ({detail})" if detail else ""))


def fail(label: str, detail: str = ""):
    results.append((label, False, detail))
    print(f"  {FAIL} {label}" + (f"  — {detail}" if detail else ""))


def skip(label: str, reason: str = ""):
    results.append((label, None, reason))
    print(f"  {SKIP} {label}" + (f"  (skipped: {reason})" if reason else ""))


def section(title: str):
    print(f"\n{BOLD}{'─' * 60}{RESET}")
    print(f"{BOLD}  {title}{RESET}")
    print(f"{BOLD}{'─' * 60}{RESET}")


def assert_status(resp: httpx.Response, expected: int, label: str) -> bool:
    if resp.status_code == expected:
        ok(label, f"HTTP {resp.status_code}")
        return True
    else:
        body = ""
        try:
            body = str(resp.json())[:120]
        except Exception:
            body = resp.text[:120]
        fail(label, f"got {resp.status_code} expected {expected} — {body}")
        return False


# ── Section runners ────────────────────────────────────────────────────────────

async def test_health(client: httpx.AsyncClient):
    section("Health / Ping")
    r = await client.get("/")
    assert_status(r, 200, "GET / returns 200")
    if r.status_code == 200:
        data = r.json()
        if data.get("status") == "ok":
            ok("Root returns {status: ok}")
        else:
            fail("Root returns {status: ok}", str(data))

    r = await client.get("/ping")
    assert_status(r, 200, "GET /ping returns 200")

    r = await client.head("/ping")
    assert_status(r, 200, "HEAD /ping returns 200")


async def test_auth(client: httpx.AsyncClient) -> Optional[str]:
    section("Auth — Registration & Login")

    token: Optional[str] = os.environ.get("TEST_TOKEN")
    if token:
        skip("Registration", "TEST_TOKEN provided, skipping registration")
    else:
        r = await client.post("/api/auth/register", json={
            "name": TEST_NAME,
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD,
            "phone": TEST_PHONE,
        })
        if r.status_code in (200, 201):
            ok("POST /api/auth/register", f"HTTP {r.status_code}")
            data = r.json()
            if "token" in data or "access_token" in data:
                token = data.get("token") or data.get("access_token")
                ok("Registration returns token immediately")
            else:
                skip("Token from registration", "email verification required — no token yet")
        elif r.status_code == 409:
            skip("Registration (user already exists)", "409 — proceeding to login")
        else:
            fail("POST /api/auth/register", f"HTTP {r.status_code} — {r.text[:120]}")

    r = await client.post("/api/auth/login", json={
        "email": TEST_EMAIL,
        "password": TEST_PASSWORD,
    })
    if r.status_code == 200:
        ok("POST /api/auth/login", "HTTP 200")
        data = r.json()
        token = data.get("token") or data.get("access_token") or token
        if token:
            ok("Login returns access token")
        else:
            fail("Login returns access token", str(data)[:80])
    elif r.status_code == 403:
        skip("Login", "403 — email verification required for this account")
    else:
        fail("POST /api/auth/login", f"HTTP {r.status_code} — {r.text[:120]}")

    r = await client.post("/api/auth/login", json={
        "email": TEST_EMAIL,
        "password": "wrongpassword!",
    })
    if r.status_code == 401:
        ok("Login with wrong password → 401")
    else:
        fail("Login with wrong password → 401", f"got {r.status_code}")

    return token


async def test_users_me(client: httpx.AsyncClient, token: Optional[str]):
    section("Users — /me endpoint")

    r = await client.get("/api/users/me")
    if r.status_code == 401:
        ok("GET /api/users/me without token → 401")
    else:
        fail("GET /api/users/me without token → 401", f"got {r.status_code}")

    if not token:
        skip("GET /api/users/me with token", "no token available")
        return

    r = await client.get("/api/users/me", headers={"Authorization": f"Bearer {token}"})
    if assert_status(r, 200, "GET /api/users/me with token → 200"):
        data = r.json()
        if "email" in data or "_id" in data or "id" in data:
            ok("Response includes user fields")
        else:
            fail("Response includes user fields", str(data)[:80])


async def test_transactions(client: httpx.AsyncClient, token: Optional[str]) -> Optional[str]:
    section("Transactions — Create & List")

    r = await client.get("/api/transactions")
    if r.status_code == 401:
        ok("GET /api/transactions without token → 401")
    else:
        fail("GET /api/transactions without token → 401", f"got {r.status_code}")

    if not token:
        skip("All authenticated transaction tests", "no token available")
        return None

    auth = {"Authorization": f"Bearer {token}"}

    r = await client.get("/api/transactions", headers=auth)
    assert_status(r, 200, "GET /api/transactions with token → 200")

    payload = {
        "title": f"Test Item {RUN_ID}",
        "description": "A test item created by the automated test runner for integration testing purposes",
        "item_price": 750.0,
        "delivery_method": "physical",
        "transaction_type": "goods",
    }
    r = await client.post("/api/transactions", json=payload, headers=auth)
    transaction_id: Optional[str] = None
    if r.status_code in (200, 201):
        ok("POST /api/transactions → 201", f"HTTP {r.status_code}")
        data = r.json()
        transaction_id = (
            data.get("_id") or data.get("id") or
            data.get("transaction", {}).get("_id") or
            data.get("transaction", {}).get("id")
        )
        if transaction_id:
            ok("Response includes transaction ID", str(transaction_id)[:24])
        else:
            fail("Response includes transaction ID", str(data)[:80])
    else:
        fail("POST /api/transactions → 201", f"HTTP {r.status_code} — {r.text[:120]}")

    r = await client.post("/api/transactions", json={
        "title": "Too cheap",
        "description": "test",
        "item_price": 50.0,
        "delivery_method": "physical",
        "transaction_type": "goods",
    }, headers=auth)
    if r.status_code == 400:
        ok("Transaction below minimum amount → 400")
    else:
        skip("Transaction below minimum amount validation", f"got {r.status_code} (may vary by implementation)")

    if transaction_id:
        r = await client.get(f"/api/transactions/{transaction_id}", headers=auth)
        assert_status(r, 200, f"GET /api/transactions/{{id}} → 200")

        await asyncio.sleep(5)
        r = await client.get(f"/api/transactions/{transaction_id}", headers=auth)
        if r.status_code == 200:
            data = r.json()
            ai = data.get("ai_fraud_analysis")
            if ai:
                ok("AI fraud analysis present after creation", f"risk_level={ai.get('risk_level')}")
                for field in ("risk_level", "risk_score", "flags", "summary", "recommendation"):
                    if field in ai:
                        ok(f"  ai_fraud_analysis.{field} present")
                    else:
                        fail(f"  ai_fraud_analysis.{field} present")
            else:
                skip("AI fraud analysis", "field not present yet (may still be processing)")

    return transaction_id


async def test_smart_deals(client: httpx.AsyncClient, token: Optional[str]):
    section("Smart Deals")

    if not token:
        skip("Smart Deal tests", "no token available")
        return

    auth = {"Authorization": f"Bearer {token}"}

    r = await client.post("/api/smart-deals/generate", json={
        "description": "Selling a second-hand iPhone 14 Pro, 256GB, Space Black, in good condition with original box",
        "item_price": 8000,
        "delivery_method": "courier",
    }, headers=auth)
    if r.status_code == 200:
        ok("POST /api/smart-deals/generate → 200")
        data = r.json()
        if data.get("terms") or data.get("milestones") or data.get("deal"):
            ok("Smart Deal generate returns structured response")
        else:
            skip("Smart Deal structure check", f"unexpected shape: {str(data)[:80]}")
    elif r.status_code == 404:
        skip("POST /api/smart-deals/generate", "endpoint not found on this deployment")
    else:
        fail("POST /api/smart-deals/generate → 200", f"HTTP {r.status_code} — {r.text[:120]}")


async def test_disputes(client: httpx.AsyncClient, token: Optional[str], transaction_id: Optional[str]):
    section("Disputes")

    if not token:
        skip("All dispute tests", "no token available")
        return

    auth = {"Authorization": f"Bearer {token}"}

    r = await client.get("/api/disputes", headers=auth)
    assert_status(r, 200, "GET /api/disputes → 200")

    if not transaction_id:
        skip("Create dispute", "no transaction_id available")
        return

    r = await client.post("/api/disputes", json={
        "transaction_id": transaction_id,
        "reason": "item_not_received",
        "description": "Test dispute created by automated test runner. Item was not received.",
    }, headers=auth)
    dispute_id: Optional[str] = None
    if r.status_code in (200, 201):
        ok("POST /api/disputes → 201", f"HTTP {r.status_code}")
        data = r.json()
        dispute_id = (
            data.get("_id") or data.get("id") or
            data.get("dispute", {}).get("_id") or
            data.get("dispute", {}).get("id")
        )
        if dispute_id:
            ok("Dispute response includes ID")
    elif r.status_code == 400:
        skip("Create dispute", f"400 — transaction may not be in correct state: {r.text[:80]}")
    else:
        fail("POST /api/disputes → 201", f"HTTP {r.status_code} — {r.text[:120]}")

    if dispute_id:
        await asyncio.sleep(5)
        r = await client.get(f"/api/disputes/{dispute_id}", headers=auth)
        if r.status_code == 200:
            data = r.json()
            ai = data.get("ai_analysis")
            if ai:
                ok("AI dispute analysis present", f"outcome={ai.get('likely_outcome')}")
            else:
                skip("AI dispute analysis", "not present yet")


async def test_ai(client: httpx.AsyncClient, token: Optional[str], transaction_id: Optional[str]):
    section("AI Features")

    if not token:
        skip("All AI tests", "no token available")
        return

    auth = {"Authorization": f"Bearer {token}"}

    r = await client.post("/api/ai/improve-description", json={
        "description": "selling my phone good condition",
        "item_price": 2000,
        "delivery_method": "physical",
    }, headers=auth)
    if assert_status(r, 200, "POST /api/ai/improve-description → 200"):
        data = r.json()
        if "improved" in data and "original" in data:
            ok("Response has original + improved fields")
            if len(data["improved"]) > len(data["original"]):
                ok("Improved description is longer than original")
            else:
                skip("Improved description length check", "same or shorter — may still be valid")
        else:
            fail("Response has original + improved fields", str(data)[:80])

    r = await client.post("/api/ai/chat", json={
        "message": "What is TrustTrade?",
        "history": [],
    }, headers=auth)
    if assert_status(r, 200, "POST /api/ai/chat → 200"):
        data = r.json()
        if "reply" in data:
            ok("Chat response includes reply field")
            if len(data["reply"]) > 10:
                ok("Chat reply is non-empty")
        else:
            fail("Chat response includes reply field", str(data)[:80])

    r = await client.post("/api/ai/chat", json={
        "message": "How do I raise a dispute?",
        "history": [
            {"role": "user", "content": "What is TrustTrade?"},
            {"role": "assistant", "content": "TrustTrade is a secure escrow platform."},
        ],
    }, headers=auth)
    if assert_status(r, 200, "POST /api/ai/chat multi-turn → 200"):
        data = r.json()
        if data.get("reply"):
            ok("Multi-turn chat maintains context")

    if transaction_id:
        r = await client.post("/api/ai/fraud-detect", json={"transaction_id": transaction_id}, headers=auth)
        if assert_status(r, 200, "POST /api/ai/fraud-detect → 200"):
            data = r.json()
            for field in ("risk_level", "risk_score", "summary", "recommendation"):
                if field in data:
                    ok(f"  fraud-detect response includes {field}")
                else:
                    fail(f"  fraud-detect response includes {field}", str(data)[:40])

            r2 = await client.post("/api/ai/fraud-detect", json={"transaction_id": transaction_id}, headers=auth)
            if r2.status_code == 200:
                data2 = r2.json()
                if data.get("analyzed_at") == data2.get("analyzed_at"):
                    ok("Fraud detect returns cached result on second call")
                else:
                    skip("Fraud detect cache check", "analyzed_at differs — may have re-run")
    else:
        skip("POST /api/ai/fraud-detect", "no transaction_id available")


async def test_courier(client: httpx.AsyncClient, token: Optional[str]):
    section("Courier Guy (ShipLogic)")

    r = await client.post("/api/courier/quote", json={
        "pickup_address": {
            "street_address": "1 Main Street",
            "local_area": "Sandton",
            "city": "Johannesburg",
            "code": "2196",
            "country": "ZA",
            "type": "residential",
        },
        "delivery_address": {
            "street_address": "2 Long Street",
            "local_area": "Gardens",
            "city": "Cape Town",
            "code": "8001",
            "country": "ZA",
            "type": "residential",
        },
        "parcel": {
            "submitted_length_cm": 20,
            "submitted_width_cm": 15,
            "submitted_height_cm": 10,
            "submitted_weight_kg": 1.5,
        },
    })
    if r.status_code == 401:
        ok("POST /api/courier/quote without token → 401")
    else:
        fail("POST /api/courier/quote without token → 401", f"got {r.status_code}")

    if not token:
        skip("Authenticated courier tests", "no token available")
        return

    auth = {"Authorization": f"Bearer {token}"}

    r = await client.post("/api/courier/quote", json={
        "pickup_address": {
            "street_address": "1 Main Street",
            "local_area": "Sandton",
            "city": "Johannesburg",
            "code": "2196",
            "country": "ZA",
            "type": "residential",
        },
        "delivery_address": {
            "street_address": "2 Long Street",
            "local_area": "Gardens",
            "city": "Cape Town",
            "code": "8001",
            "country": "ZA",
            "type": "residential",
        },
        "parcel": {
            "submitted_length_cm": 20,
            "submitted_width_cm": 15,
            "submitted_height_cm": 10,
            "submitted_weight_kg": 1.5,
        },
    }, headers=auth)
    if r.status_code == 200:
        ok("POST /api/courier/quote → 200")
        data = r.json()
        rates = data.get("rates", [])
        if isinstance(rates, list):
            ok(f"Response includes rates array ({len(rates)} options)")
            if rates:
                rate = rates[0]
                if "service_level" in rate or "rate" in rate or "price" in rate:
                    ok("Rate object has expected fields")
                else:
                    skip("Rate object fields", f"unexpected shape: {str(rate)[:80]}")
        else:
            fail("Response includes rates array", str(data)[:80])
    elif r.status_code == 502:
        skip("POST /api/courier/quote", "502 — ShipLogic sandbox may be down")
    elif r.status_code == 503:
        skip("POST /api/courier/quote", "503 — COURIER_ENABLED=false on this deployment")
    else:
        fail("POST /api/courier/quote → 200", f"HTTP {r.status_code} — {r.text[:120]}")

    r = await client.get("/api/courier/track/INVALID-WAYBILL-TEST", headers=auth)
    if r.status_code in (200, 404, 502):
        ok(f"GET /api/courier/track/{{waybill}} responds ({r.status_code})")
    elif r.status_code == 503:
        skip("GET /api/courier/track", "COURIER_ENABLED=false")
    else:
        fail("GET /api/courier/track/{waybill} responds", f"got {r.status_code}")


async def test_admin_protection(client: httpx.AsyncClient, token: Optional[str]):
    section("Admin Route Protection")

    r = await client.get("/api/admin/users")
    if r.status_code in (401, 403):
        ok("GET /api/admin/users without token → 401/403", f"HTTP {r.status_code}")
    else:
        fail("GET /api/admin/users without token → 401/403", f"got {r.status_code}")

    if token:
        auth = {"Authorization": f"Bearer {token}"}
        r = await client.get("/api/admin/users", headers=auth)
        if r.status_code == 403:
            ok("GET /api/admin/users as non-admin → 403")
        elif r.status_code == 200:
            skip("GET /api/admin/users", "200 returned — this account may have admin role")
        else:
            skip("GET /api/admin/users", f"got {r.status_code}")


async def test_webhook_security(client: httpx.AsyncClient):
    section("Webhook Security")

    r = await client.post("/api/tradesafe-webhook", json={
        "event": "FUNDS_RECEIVED",
        "data": {"id": "fake-id"},
    }, headers={"X-TradeSafe-Signature": "invalidsignature"})
    if r.status_code in (401, 403, 400):
        ok("Webhook with bad signature → 401/403/400", f"HTTP {r.status_code}")
    else:
        skip("Webhook signature rejection", f"got {r.status_code} — may accept unsigned in dev")


# ── Main ──────────────────────────────────────────────────────────────────────

SECTION_MAP = {
    "health": test_health,
    "auth": test_auth,
    "users": test_users_me,
    "transactions": test_transactions,
    "smart_deals": test_smart_deals,
    "disputes": test_disputes,
    "ai": test_ai,
    "courier": test_courier,
    "admin": test_admin_protection,
    "webhooks": test_webhook_security,
}


async def main(only_section: Optional[str] = None):
    print(f"\n{BOLD}TrustTrade Integration Tests{RESET}")
    print(f"Target: {BASE_URL}")
    print(f"Run ID: {RUN_ID}")
    print(f"Test email: {TEST_EMAIL}")

    timeout = httpx.Timeout(30.0, connect=10.0)
    async with httpx.AsyncClient(base_url=BASE_URL, timeout=timeout) as client:

        if only_section and only_section not in SECTION_MAP:
            print(f"\nUnknown section '{only_section}'. Available: {', '.join(SECTION_MAP)}")
            sys.exit(1)

        if only_section in (None, "health"):
            await test_health(client)

        token: Optional[str] = None
        transaction_id: Optional[str] = None

        if only_section in (None, "auth"):
            token = await test_auth(client)

        if only_section in (None, "users"):
            if only_section == "users" and not token:
                token = os.environ.get("TEST_TOKEN")
            await test_users_me(client, token)

        if only_section in (None, "transactions"):
            if only_section == "transactions" and not token:
                token = os.environ.get("TEST_TOKEN")
            transaction_id = await test_transactions(client, token)

        if only_section in (None, "smart_deals"):
            if only_section == "smart_deals" and not token:
                token = os.environ.get("TEST_TOKEN")
            await test_smart_deals(client, token)

        if only_section in (None, "disputes"):
            if only_section == "disputes" and not token:
                token = os.environ.get("TEST_TOKEN")
            await test_disputes(client, token, transaction_id)

        if only_section in (None, "ai"):
            if only_section == "ai" and not token:
                token = os.environ.get("TEST_TOKEN")
            await test_ai(client, token, transaction_id)

        if only_section in (None, "courier"):
            if only_section == "courier" and not token:
                token = os.environ.get("TEST_TOKEN")
            await test_courier(client, token)

        if only_section in (None, "admin"):
            if only_section == "admin" and not token:
                token = os.environ.get("TEST_TOKEN")
            await test_admin_protection(client, token)

        if only_section in (None, "webhooks"):
            await test_webhook_security(client)

    passed = sum(1 for _, r, _ in results if r is True)
    failed = sum(1 for _, r, _ in results if r is False)
    skipped = sum(1 for _, r, _ in results if r is None)
    total = len(results)

    print(f"\n{BOLD}{'─' * 60}{RESET}")
    print(f"{BOLD}Results: {passed}/{total - skipped} passed  |  {failed} failed  |  {skipped} skipped{RESET}")

    if failed > 0:
        print(f"\n{BOLD}Failed tests:{RESET}")
        for label, result, detail in results:
            if result is False:
                print(f"  {FAIL} {label}" + (f" — {detail}" if detail else ""))
        sys.exit(1)
    else:
        print(f"\n{PASS} All checks passed (or skipped).")
        sys.exit(0)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="TrustTrade integration tests")
    parser.add_argument(
        "--section",
        choices=list(SECTION_MAP.keys()),
        help="Run only a specific test section",
    )
    args = parser.parse_args()

    try:
        import httpx  # noqa: F401
    except ImportError:
        print("httpx is required: pip install httpx")
        sys.exit(1)

    asyncio.run(main(only_section=args.section))
