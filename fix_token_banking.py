"""
Fix Banking Details for TradeSafe Seller Token
================================================
Token: 32xbU6asjfrBnNHfeg57I  (marnichroets@gmail.com seller token)

Steps:
  1. Connect to MongoDB — find user's banking details
  2. Resolve full account number (check banking_change_requests if MongoDB only has 4 digits)
  3. If still not found, fetch user's personal TradeSafe token to read bank account
  4. Call tokenUpdate on 32xbU6asjfrBnNHfeg57I with correct banking details
  5. Verify token shows correct account number after update

Usage:
    # From project root with env vars set:
    python fix_token_banking.py

    # Dry-run (inspect only, no mutations):
    FIX_DRY_RUN=1 python fix_token_banking.py
"""

import asyncio
import json
import os
import sys
import traceback

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

print("=== fix_token_banking.py starting ===", flush=True)

try:
    import httpx
    print("  httpx OK", flush=True)
except ImportError:
    print("[FATAL] pip install httpx", flush=True)
    sys.exit(1)

try:
    from motor.motor_asyncio import AsyncIOMotorClient
    print("  motor OK", flush=True)
except ImportError:
    print("[FATAL] pip install motor", flush=True)
    sys.exit(1)

TARGET_TOKEN_ID = "32xbU6asjfrBnNHfeg57I"
USER_EMAIL = "marnichroets@gmail.com"

MONGO_URL = os.environ.get("MONGO_URL")
if not MONGO_URL:
    print("[FATAL] MONGO_URL env var is not set", flush=True)
    sys.exit(1)
DB_NAME = os.environ.get("DB_NAME", "trusttrade")

AUTH_URL = os.environ.get("TRADESAFE_AUTH_URL", "https://auth.tradesafe.co.za/oauth/token")
API_URL = os.environ.get("TRADESAFE_API_URL", "https://api.tradesafe.co.za/graphql")
CLIENT_ID = os.environ.get("TRADESAFE_CLIENT_ID", "")
CLIENT_SECRET = os.environ.get("TRADESAFE_CLIENT_SECRET", "")

DRY_RUN = os.environ.get("FIX_DRY_RUN", "").lower() in ("1", "true", "yes")


def sep(title=""):
    line = "-" * 60
    print(f"\n{line}", flush=True)
    if title:
        print(f"  {title}", flush=True)
        print(line, flush=True)


# ── TradeSafe helpers ─────────────────────────────────────────────

async def get_access_token(client: httpx.AsyncClient) -> str | None:
    sep("Step 0 — TradeSafe auth")
    resp = await client.post(
        AUTH_URL,
        data={"grant_type": "client_credentials",
              "client_id": CLIENT_ID,
              "client_secret": CLIENT_SECRET},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        timeout=30,
    )
    if resp.status_code != 200:
        print(f"  [FAIL] {resp.status_code}: {resp.text[:300]}", flush=True)
        return None
    token = resp.json().get("access_token")
    print(f"  Token obtained: {'YES' if token else 'NO'}", flush=True)
    return token


async def gql(client: httpx.AsyncClient, bearer: str, query: str, variables: dict = None) -> dict | None:
    payload = {"query": query}
    if variables:
        payload["variables"] = variables
    resp = await client.post(
        API_URL,
        json=payload,
        headers={"Authorization": f"Bearer {bearer}", "Content-Type": "application/json"},
        timeout=60,
    )
    if resp.status_code != 200:
        print(f"  [HTTP {resp.status_code}] {resp.text[:300]}", flush=True)
        return None
    body = resp.json()
    errors = body.get("errors")
    if errors:
        for e in errors:
            msg = e.get("message", "?")
            debug = e.get("extensions", {}).get("debugMessage", "")
            print(f"  [GQL ERROR] {msg}" + (f" — {debug}" if debug else ""), flush=True)
        return {"errors": errors}
    return body.get("data")


TOKEN_QUERY = """
query token($id: ID!) {
  token(id: $id) {
    id
    name
    balance
    valid
    user {
      givenName
      familyName
      email
      mobile
    }
    bankAccount {
      bank
      accountNumber
      branchCode
      accountType
    }
    settings {
      payout { interval }
    }
  }
}
"""

TOKEN_UPDATE_MUTATION = """
mutation tokenUpdate($id: ID!, $input: TokenInput!) {
  tokenUpdate(id: $id, input: $input) {
    id
    name
    balance
    valid
    bankAccount {
      bank
      accountNumber
      branchCode
      accountType
    }
  }
}
"""

BANK_NAME_MAP = {
    "absa": "ABSA",
    "fnb": "FNB",
    "first national bank": "FNB",
    "nedbank": "NEDBANK",
    "standard bank": "STANDARDBANK",
    "standardbank": "STANDARDBANK",
    "capitec": "CAPITEC",
    "capitec bank": "CAPITEC",
    "african bank": "AFRICANBANK",
    "discovery": "DISCOVERY",
    "investec": "INVESTEC",
    "tyme bank": "TYMEBANK",
    "tymebank": "TYMEBANK",
    "bidvest": "BIDVESTBANK",
    "grindrod": "GRINDROD",
    "sasfin": "SASFIN",
    "access bank": "ACCESSBANK",
    "ubank": "UBANK",
    "sa post bank": "SAPOSTBANK",
    "postbank": "SAPOSTBANK",
}

ACCOUNT_TYPE_MAP = {
    "savings": "SAVINGS",
    "cheque": "CHEQUE",
    "checking": "CHEQUE",
    "current": "CHEQUE",
    "transmission": "TRANSMISSION",
}


def map_bank(bank_name: str) -> str:
    if not bank_name:
        return bank_name
    key = bank_name.lower().strip()
    mapped = BANK_NAME_MAP.get(key, bank_name.upper().replace(" ", ""))
    return mapped


def map_account_type(account_type: str) -> str:
    if not account_type:
        return "SAVINGS"
    return ACCOUNT_TYPE_MAP.get(account_type.lower(), "SAVINGS")


async def inspect_token(client: httpx.AsyncClient, bearer: str, token_id: str, label: str) -> dict | None:
    sep(f"Token inspection: {label}")
    data = await gql(client, bearer, TOKEN_QUERY, {"id": token_id})
    if not data or "errors" in data:
        print(f"  [FAIL] Could not fetch token {token_id}", flush=True)
        return None

    t = data.get("token") or {}
    user = t.get("user") or {}
    bank = t.get("bankAccount") or {}

    print(f"  ID      : {t.get('id')}", flush=True)
    print(f"  Name    : {t.get('name')}", flush=True)
    print(f"  Valid   : {t.get('valid')}", flush=True)
    print(f"  Balance : R{float(t.get('balance') or 0):.2f}", flush=True)
    print(f"  User    : {user.get('givenName')} {user.get('familyName')} <{user.get('email')}> mobile={'SET' if user.get('mobile') else 'MISSING'}", flush=True)
    if bank.get("accountNumber"):
        acct = str(bank["accountNumber"])
        print(f"  Bank    : {bank.get('bank')} account=***{acct[-4:]} (full len={len(acct)}) type={bank.get('accountType')}", flush=True)
    else:
        print(f"  Bank    : NOT SET", flush=True)
    return t


# ── MongoDB helpers ───────────────────────────────────────────────

async def get_user_banking(email: str) -> tuple[dict | None, str | None]:
    """
    Returns (user_doc, full_account_number).
    Tries MongoDB banking_details first, then banking_change_requests.
    Returns None for account number if cannot resolve full number.
    """
    sep("Step 1 — MongoDB lookup")
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]

    user = await db.users.find_one({"email": email.lower()}, {"_id": 0})
    if not user:
        print(f"  [FAIL] User not found: {email}", flush=True)
        client.close()
        return None, None

    print(f"  Found user: {user.get('name')} ({user.get('user_id')})", flush=True)
    print(f"  tradesafe_token_id: {user.get('tradesafe_token_id', 'NOT SET')}", flush=True)
    print(f"  banking_details_completed: {user.get('banking_details_completed', False)}", flush=True)

    banking = user.get("banking_details") or {}
    stored_acct = banking.get("account_number", "")
    bank_name = banking.get("bank_name", "")
    branch_code = banking.get("branch_code", "")
    account_type = banking.get("account_type", "SAVINGS")

    print(f"  MongoDB banking_details:", flush=True)
    print(f"    bank_name   : {bank_name}", flush=True)
    print(f"    account_num : {stored_acct!r} (len={len(str(stored_acct))})", flush=True)
    print(f"    branch_code : {branch_code}", flush=True)
    print(f"    account_type: {account_type}", flush=True)

    full_acct = None
    if len(str(stored_acct)) >= 8:
        print(f"  MongoDB has full account number ({len(str(stored_acct))} digits)", flush=True)
        full_acct = str(stored_acct)
    else:
        print(f"  MongoDB only has {len(str(stored_acct))} digits — searching banking_change_requests...", flush=True)

        # Search banking_change_requests for full account number
        cursor = db.banking_change_requests.find(
            {"user_id": user["user_id"], "status": {"$in": ["activated", "verified"]}},
            sort=[("created_at", -1)],
        )
        async for req in cursor:
            nd = req.get("new_details") or {}
            candidate = str(nd.get("account_number", ""))
            if len(candidate) >= 8:
                print(f"  Found full account in banking_change_requests (request_id={req.get('request_id')}, status={req.get('status')})", flush=True)
                full_acct = candidate
                bank_name = nd.get("bank_name") or bank_name
                branch_code = nd.get("branch_code") or branch_code
                account_type = nd.get("account_type") or account_type
                break

    client.close()

    if full_acct:
        print(f"  Resolved full account: ***{full_acct[-4:]} (len={len(full_acct)})", flush=True)
    else:
        print(f"  Could not resolve full account number from MongoDB or change requests", flush=True)

    user["_resolved_bank_name"] = bank_name
    user["_resolved_branch_code"] = branch_code
    user["_resolved_account_type"] = account_type
    return user, full_acct


# ── Main ──────────────────────────────────────────────────────────

async def main():
    if not CLIENT_ID or not CLIENT_SECRET:
        print("[ERROR] Set TRADESAFE_CLIENT_ID and TRADESAFE_CLIENT_SECRET", flush=True)
        sys.exit(1)

    if DRY_RUN:
        print("*** DRY RUN MODE — no mutations will be sent ***", flush=True)

    # Step 1: MongoDB
    user_doc, full_account_number = await get_user_banking(USER_EMAIL)
    if not user_doc:
        sys.exit(1)

    bank_name = user_doc.get("_resolved_bank_name", "")
    branch_code = user_doc.get("_resolved_branch_code", "")
    account_type = user_doc.get("_resolved_account_type", "SAVINGS")
    mobile = user_doc.get("phone", "")
    user_name = user_doc.get("name", "")
    name_parts = user_name.strip().split(" ", 1)
    given_name = name_parts[0] if name_parts else "User"
    family_name = name_parts[1] if len(name_parts) > 1 else "User"

    async with httpx.AsyncClient() as client:
        bearer = await get_access_token(client)
        if not bearer:
            print("[ERROR] Auth failed", flush=True)
            sys.exit(1)

        # Step 2: Inspect the target seller token
        target_token = await inspect_token(client, bearer, TARGET_TOKEN_ID, f"TARGET SELLER TOKEN ({TARGET_TOKEN_ID})")
        if not target_token:
            print("[ERROR] Cannot fetch target token", flush=True)
            sys.exit(1)

        # Step 3: If no full account from MongoDB, try fetching from personal TradeSafe token
        personal_token_id = user_doc.get("tradesafe_token_id")
        if not full_account_number and personal_token_id:
            sep("Step 3 — Fetching personal TradeSafe token for bank details")
            personal_token = await inspect_token(client, bearer, personal_token_id, f"PERSONAL TOKEN ({personal_token_id})")
            if personal_token:
                pb = personal_token.get("bankAccount") or {}
                candidate = str(pb.get("accountNumber") or "")
                if len(candidate) >= 8:
                    print(f"  Found full account on personal TradeSafe token: ***{candidate[-4:]} (len={len(candidate)})", flush=True)
                    full_account_number = candidate
                    bank_name = bank_name or pb.get("bank", "")
                    branch_code = branch_code or pb.get("branchCode", "")
                    account_type = pb.get("accountType") or account_type

        if not full_account_number:
            print("\n[ERROR] Could not resolve full account number from any source.", flush=True)
            print("  Please provide the account number via SELLER_ACCOUNT_NUMBER env var:", flush=True)
            print("  SELLER_ACCOUNT_NUMBER=12345678901 python fix_token_banking.py", flush=True)
            # Allow override via env var
            env_acct = os.environ.get("SELLER_ACCOUNT_NUMBER", "").strip()
            if env_acct and len(env_acct) >= 8:
                print(f"  Using SELLER_ACCOUNT_NUMBER from env: ***{env_acct[-4:]}", flush=True)
                full_account_number = env_acct
            else:
                sys.exit(1)

        # Step 4: Build tokenUpdate payload
        sep("Step 4 — Build tokenUpdate payload")

        ts_bank = map_bank(bank_name)
        ts_account_type = map_account_type(account_type)

        # Pull existing user fields from the target token to avoid clearing them
        existing_user = (target_token.get("user") or {})
        resolved_given = given_name or existing_user.get("givenName", "User")
        resolved_family = family_name or existing_user.get("familyName", "User")
        resolved_email = USER_EMAIL or existing_user.get("email", "")

        # Normalize mobile
        resolved_mobile = mobile or existing_user.get("mobile", "")
        if resolved_mobile:
            m = str(resolved_mobile).replace("+", "").replace(" ", "")
            if m.startswith("27"):
                resolved_mobile = "+" + m
            elif m.startswith("0"):
                resolved_mobile = "+27" + m[1:]
            else:
                resolved_mobile = "+27" + m

        update_input = {
            "user": {
                "givenName": resolved_given,
                "familyName": resolved_family,
                "email": resolved_email,
            },
            "bankAccount": {
                "bank": ts_bank,
                "accountNumber": full_account_number,
                "branchCode": branch_code or "000000",
                "accountType": ts_account_type,
            },
            "settings": {
                "payout": {"interval": "IMMEDIATE"},
            },
        }
        if resolved_mobile:
            update_input["user"]["mobile"] = resolved_mobile

        print(f"  Token ID      : {TARGET_TOKEN_ID}", flush=True)
        print(f"  Given name    : {resolved_given}", flush=True)
        print(f"  Family name   : {resolved_family}", flush=True)
        print(f"  Email         : {resolved_email}", flush=True)
        print(f"  Mobile        : {resolved_mobile or 'NOT SET'}", flush=True)
        print(f"  Bank          : {ts_bank}", flush=True)
        print(f"  Account       : ***{full_account_number[-4:]} ({len(full_account_number)} digits)", flush=True)
        print(f"  Branch code   : {branch_code}", flush=True)
        print(f"  Account type  : {ts_account_type}", flush=True)

        if DRY_RUN:
            print("\n  [DRY RUN] Would call tokenUpdate — exiting without mutation", flush=True)
            return

        # Step 5: Call tokenUpdate
        sep("Step 5 — tokenUpdate")
        result = await gql(client, bearer, TOKEN_UPDATE_MUTATION, {
            "id": TARGET_TOKEN_ID,
            "input": update_input,
        })

        if not result or "errors" in result:
            print("  [FAIL] tokenUpdate failed", flush=True)
            sys.exit(1)

        updated = (result or {}).get("tokenUpdate") or {}
        new_bank = updated.get("bankAccount") or {}
        new_acct = str(new_bank.get("accountNumber") or "")

        print(f"  tokenUpdate returned:", flush=True)
        print(f"    id      : {updated.get('id')}", flush=True)
        print(f"    valid   : {updated.get('valid')}", flush=True)
        print(f"    balance : R{float(updated.get('balance') or 0):.2f}", flush=True)
        print(f"    account : ***{new_acct[-4:]} (len={len(new_acct)})", flush=True)
        print(f"    bank    : {new_bank.get('bank')}", flush=True)

        # Step 6: Verify
        sep("Step 6 — Verify token after update")
        verified_token = await inspect_token(client, bearer, TARGET_TOKEN_ID, "TARGET AFTER UPDATE")
        vb = (verified_token or {}).get("bankAccount") or {}
        verified_acct = str(vb.get("accountNumber") or "")

        if len(verified_acct) >= 8:
            print(f"\n  SUCCESS — Token {TARGET_TOKEN_ID} now has correct {len(verified_acct)}-digit account number ***{verified_acct[-4:]}", flush=True)
        else:
            print(f"\n  WARNING — Token still has short account number ({len(verified_acct)} digits): {verified_acct!r}", flush=True)
            print("  TradeSafe may have rejected the account number. Check the response above.", flush=True)


if __name__ == "__main__":
    print(f"  MONGO_URL   : {MONGO_URL[:30]}...", flush=True)
    print(f"  DB_NAME     : {DB_NAME}", flush=True)
    print(f"  AUTH_URL    : {AUTH_URL}", flush=True)
    print(f"  API_URL     : {API_URL}", flush=True)
    print(f"  CLIENT_ID   : {'SET' if CLIENT_ID else 'NOT SET'}", flush=True)
    print(f"  DRY_RUN     : {DRY_RUN}", flush=True)
    print(flush=True)

    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[INTERRUPTED]", flush=True)
        sys.exit(130)
    except Exception:
        print("\n[UNHANDLED EXCEPTION]", flush=True)
        traceback.print_exc()
        sys.exit(1)
