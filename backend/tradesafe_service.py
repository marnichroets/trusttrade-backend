"""
TrustTrade Payment Gateway Integration Service
Handles OAuth authentication and API calls for secure escrow transactions
South Africa-based escrow for peer-to-peer transactions
"""

import os
import httpx
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, List
from pathlib import Path
from dotenv import load_dotenv
from uritemplate import variables

from models import transaction
from models import user
from core.config import settings

# Load environment variables
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

logger = logging.getLogger(__name__)

# TradeSafe Configuration from Environment
TRADESAFE_CLIENT_ID = os.environ.get('TRADESAFE_CLIENT_ID', '')
TRADESAFE_CLIENT_SECRET = os.environ.get('TRADESAFE_CLIENT_SECRET', '')
TRADESAFE_AUTH_URL = os.environ.get('TRADESAFE_AUTH_URL', 'https://auth.tradesafe.co.za/oauth/token')
TRADESAFE_API_URL = os.environ.get('TRADESAFE_API_URL', 'https://api.tradesafe.co.za/graphql')
logger.info(f"[TRADESAFE] Configured API URL: {TRADESAFE_API_URL}")
TRADESAFE_PAYMENT_URL = os.environ.get('TRADESAFE_PAYMENT_URL', 'https://pay.tradesafe.co.za')
TRADESAFE_ENV = os.environ.get('TRADESAFE_ENV', 'production')

# ================== BANK ENUM + HELPERS ==================

_BANK_ENUM_MAP = {
    "FNB": "FNB",
    "FIRST NATIONAL BANK": "FNB",
    "FIRST_NATIONAL_BANK": "FNB",
    "FIRST_NATIONAL_BANK_(FNB)": "FNB",
    "FIRST NATIONAL BANK (FNB)": "FNB",

    "ABSA": "ABSA",
    "ABSA BANK": "ABSA",
    "ABSA_BANK": "ABSA",

    "STANDARD BANK": "STANDARD_BANK",
    "STANDARD_BANK": "STANDARD_BANK",
    "STANDARDBANK": "STANDARD_BANK",

    "NEDBANK": "NEDBANK",
    "NED BANK": "NEDBANK",

    "CAPITEC": "CAPITEC",
    "CAPITEC BANK": "CAPITEC",
    "CAPITEC_BANK": "CAPITEC",

    "INVESTEC": "INVESTEC",
    "INVESTEC BANK": "INVESTEC",

    "AFRICAN BANK": "AFRICAN_BANK",
    "AFRICAN_BANK": "AFRICAN_BANK",

    "TYMEBANK": "TYMEBANK",
    "TYME BANK": "TYMEBANK",
    "TYME_BANK": "TYMEBANK",

    "DISCOVERY": "DISCOVERY_BANK",
    "DISCOVERY BANK": "DISCOVERY_BANK",
    "DISCOVERY_BANK": "DISCOVERY_BANK",

    "BIDVEST": "BIDVEST_BANK",
    "BIDVEST BANK": "BIDVEST_BANK",
    "BIDVEST_BANK": "BIDVEST_BANK",
}


def map_bank_to_tradesafe_enum(bank_name: str) -> str:
    if not bank_name:
        raise ValueError("bank_name is empty")

    key = " ".join(str(bank_name).strip().upper().split())

    if key in _BANK_ENUM_MAP:
        return _BANK_ENUM_MAP[key]

    alt = key.replace("_", " ")
    if alt in _BANK_ENUM_MAP:
        return _BANK_ENUM_MAP[alt]

    alt2 = key.replace(" ", "_")
    if alt2 in _BANK_ENUM_MAP:
        return _BANK_ENUM_MAP[alt2]

    if "(" in key and ")" in key:
        inside = key[key.index("(")+1:key.index(")")].strip()
        if inside in _BANK_ENUM_MAP:
            return _BANK_ENUM_MAP[inside]
        outside = key.split("(")[0].strip()
        if outside in _BANK_ENUM_MAP:
            return _BANK_ENUM_MAP[outside]

    raise ValueError(f"Unknown bank '{bank_name}'")


def _get(obj, key, default=None):
    if obj is None:
        return default
    if isinstance(obj, dict):
        return obj.get(key, default)
    return getattr(obj, key, default)


def _first_non_empty(*values):
    for v in values:
        if v:
            return v
    return None


def _parse_created_at(value) -> datetime:
    """Parse a TradeSafe createdAt value into a comparable, tz-aware datetime.

    Returns a UTC datetime.min for missing/unparseable values so those tokens
    always sort as the oldest when selecting the most recently created token.
    """
    epoch_min = datetime.min.replace(tzinfo=timezone.utc)
    if not value:
        return epoch_min
    s = str(value).strip()
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    dt = None
    try:
        dt = datetime.fromisoformat(s)
    except ValueError:
        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S"):
            try:
                dt = datetime.strptime(s, fmt)
                break
            except ValueError:
                continue
    if dt is None:
        return epoch_min
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt

# =========================================================


# TrustTrade Platform Settings
MINIMUM_TRANSACTION_AMOUNT = settings.MINIMUM_TRANSACTION_AMOUNT
PLATFORM_FEE_PERCENT = settings.PLATFORM_FEE_PERCENT
MINIMUM_FEE_RANDS = 5.0  # Minimum fee R5

# Redirect URLs after payment (from environment variables)
PAYMENT_SUCCESS_URL = os.environ.get('PAYMENT_SUCCESS_URL', 'https://www.trusttradesa.co.za/transaction/success')
PAYMENT_FAILURE_URL = os.environ.get('PAYMENT_FAILURE_URL', 'https://www.trusttradesa.co.za/transaction/failed')
PAYMENT_CANCEL_URL = os.environ.get('PAYMENT_CANCEL_URL', 'https://www.trusttradesa.co.za/transaction/cancelled')

# Payment methods allowed
ALLOWED_PAYMENT_METHODS = ["EFT", "CARD", "OZOW"]

# Cache for access token
_token_cache = {
    'access_token': None,
    'expires_at': None
}


def _normalize_mobile(mobile: str) -> str:
    """Normalize a South African mobile number to E.164 (+27XXXXXXXXX)."""
    m = str(mobile).strip()
    if m.startswith('+27'):
        return m
    if m.startswith('27'):
        return '+' + m
    if m.startswith('0'):
        return '+27' + m[1:]
    return '+27' + m


# Minimum bank-account-number length accepted for TradeSafe sync.
# SA bank accounts are 9–11 digits depending on the bank (FNB 11, Capitec 10,
# Standard Bank 10/11, Nedbank 10, ABSA 9/11). TradeSafe silently rejects
# payouts ("RJCT") when the stored account number is truncated, so we enforce
# the strictest realistic floor (11 digits) and reject anything shorter at the
# moment of sync.
BANK_ACCOUNT_MIN_DIGITS = 11


def _clean_account_number(account_number) -> str:
    """Strip whitespace and any embedded spaces from an account number."""
    if account_number is None:
        return ""
    return str(account_number).strip().replace(" ", "")


def validate_account_number_for_sync(account_number) -> Dict[str, Any]:
    """Single source of truth for "is this account number safe to send to TradeSafe?".

    Returns a dict with keys:
      - valid:  bool
      - cleaned: str   (digits-only, whitespace stripped)
      - error:  str | None   (human-readable; safe to surface to the user)
      - code:   str | None   (machine-readable; one of MISSING / NON_DIGIT / TOO_SHORT)

    Callers MUST refuse to call tokenUpdate / tokenCreate banking sync when
    valid=False. This guard lives in the service layer (not the route layer)
    so it fires regardless of which entry point triggered the sync (admin fix,
    pre-escrow pre_sync, banking change activation, etc.).
    """
    cleaned = _clean_account_number(account_number)
    if not cleaned:
        return {
            "valid": False,
            "cleaned": "",
            "error": "Banking account number is missing. Update your banking details before continuing.",
            "code": "MISSING",
        }
    if not cleaned.isdigit():
        return {
            "valid": False,
            "cleaned": cleaned,
            "error": "Banking account number must contain digits only. Update your banking details to fix this.",
            "code": "NON_DIGIT",
        }
    if len(cleaned) < BANK_ACCOUNT_MIN_DIGITS:
        return {
            "valid": False,
            "cleaned": cleaned,
            "error": (
                f"Banking account number is too short ({len(cleaned)} digits). "
                f"SA bank accounts must be at least {BANK_ACCOUNT_MIN_DIGITS} digits — "
                "please update your banking details with the full account number."
            ),
            "code": "TOO_SHORT",
        }
    return {"valid": True, "cleaned": cleaned, "error": None, "code": None}


def has_valid_banking_for_payout(user_doc: Optional[Dict[str, Any]]) -> bool:
    """True only when the user's stored banking_details would pass the sync guard.

    Use this anywhere the app needs to decide "can this user actually receive
    a payout?" — login responses, transaction-create gates, payout-readiness
    checks. Returns False if banking_details is missing, the completion flag is
    off, OR the account number would be rejected by validate_account_number_for_sync.
    """
    if not user_doc:
        return False
    banking = user_doc.get("banking_details") or {}
    if not user_doc.get("banking_details_completed"):
        return False
    if not banking.get("bank_name"):
        return False
    return validate_account_number_for_sync(banking.get("account_number")).get("valid", False)


def banking_needs_update(user_doc: Optional[Dict[str, Any]]) -> bool:
    """True when banking_details exists but the account number is invalid.

    Distinct from "banking missing entirely" — this surfaces the case where
    the user *thinks* they're set up but their stored account number is too
    short (e.g. the 4-digit-truncation bug). UI uses this to render an
    explicit "fix your banking details" prompt instead of "add banking".
    """
    if not user_doc:
        return False
    banking = user_doc.get("banking_details") or {}
    if not banking.get("account_number"):
        return False
    return not validate_account_number_for_sync(banking.get("account_number")).get("valid", False)


async def get_tradesafe_token() -> Optional[str]:
    """
    Get OAuth access token from TradeSafe using client credentials grant.
    Caches the token and reuses until expiry (with 60s buffer).
    """
    global _token_cache
    
    # Check if we have a valid cached token
    if _token_cache['access_token'] and _token_cache['expires_at']:
        if datetime.now(timezone.utc) < _token_cache['expires_at']:
            logger.debug("Using cached TradeSafe token")
            return _token_cache['access_token']
    
    if not TRADESAFE_CLIENT_ID or not TRADESAFE_CLIENT_SECRET:
        logger.error("TradeSafe credentials not configured in environment")
        return None
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                TRADESAFE_AUTH_URL,
                data={
                    'grant_type': 'client_credentials',
                    'client_id': TRADESAFE_CLIENT_ID,
                    'client_secret': TRADESAFE_CLIENT_SECRET
                },
                headers={'Content-Type': 'application/x-www-form-urlencoded'}
            )
            
            if response.status_code != 200:
                logger.error(f"TradeSafe token request failed: {response.status_code} - {response.text}")
                return None
            
            data = response.json()
            access_token = data.get('access_token')
            expires_in = data.get('expires_in', 3600)  # Default 1 hour
            
            # Cache the token with 60s buffer before expiry
            _token_cache['access_token'] = access_token
            _token_cache['expires_at'] = datetime.now(timezone.utc) + timedelta(seconds=expires_in - 60)
            
            logger.info("TradeSafe access token obtained successfully")
            return access_token
            
    except Exception as e:
        logger.error(f"Error fetching TradeSafe token: {e}")
        return None


async def execute_graphql(query: str, variables: Dict[str, Any] = None) -> Optional[Dict[str, Any]]:
    """
    Execute a GraphQL query/mutation against TradeSafe API.
    Handles authentication and error parsing.
    """
    token = await get_tradesafe_token()
    if not token:
        logger.error("Cannot execute GraphQL: No access token")
        return None
    
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            payload = {"query": query}
            if variables:
                payload["variables"] = variables
            
            response = await client.post(
                TRADESAFE_API_URL,
                json=payload,
                headers={
                    'Authorization': f'Bearer {token}',
                    'Content-Type': 'application/json'
                }
            )
            
            if response.status_code != 200:
                logger.error(f"TradeSafe API error: {response.status_code} - {response.text}")
                return None
            
            data = response.json()
            
            if 'errors' in data and data['errors']:
                logger.error(f"TradeSafe GraphQL errors: {data['errors']}")
                return {"errors": data['errors']}
            
            return data.get('data')
            
    except Exception as e:
        logger.error(f"Error executing TradeSafe GraphQL: {e}")
        return None


async def create_user_token(
    given_name: str,
    family_name: str,
    email: str,
    mobile: str,
    id_number: str = "",
) -> Optional[Dict[str, Any]]:
    """
    Create a TrustTrade user token for a buyer or seller.
    Tokens are required before creating transactions.
    
    Required fields per API introspection: givenName, familyName, email, mobile, idNumber inside user object
    Note: 'reference' field is NOT supported in TokenInput
    """
    # Pre-flight validation with detailed logging
    logger.info("=== TOKEN CREATION REQUEST ===")
    logger.info(f"Given Name: {given_name}")
    logger.info(f"Family Name: {family_name}")
    logger.info(f"Email: {email}")
    logger.info(f"Mobile (raw): {mobile}")
    logger.info(f"ID Number: {id_number}")
    
    # Validate and format mobile number
    original_mobile = mobile
    if mobile and len(str(mobile).strip()) >= 9:
        mobile = _normalize_mobile(mobile)
    else:
        mobile = "+27000000000"
        logger.warning(f"Mobile number missing or invalid, using default: {mobile}")

    logger.info(f"Mobile (formatted): {mobile} (original: {original_mobile})")
    
    # Validate ID number format (13 digits for SA)
    if id_number and len(id_number) != 13:
        logger.warning(f"ID number is not 13 digits: {id_number} (length: {len(id_number)})")
    
    mutation = """
    mutation tokenCreate($input: TokenInput!) {
        tokenCreate(input: $input) {
            id
            name
        }
    }
    """
    
    # Build the request payload - NO reference field (not supported)
    variables = {
        "input": {
            "user": {
                "givenName": given_name,
                "familyName": family_name,
                "email": email,
                "mobile": mobile,
                "idNumber": id_number,
                "idType": "NATIONAL",
                "idCountry": "ZAF"
            },
            "settings": {
                "payout": {
                    "interval": "IMMEDIATE",
                    "refund": "WALLET"
                }
            }
        }
    }
    
    logger.info("=== EXACT REQUEST PAYLOAD ===")
    logger.info(f"Variables: {variables}")
    
    # Execute the GraphQL mutation
    result = await execute_graphql(mutation, variables)
    
    logger.info("=== EXACT API RESPONSE ===")
    logger.info(f"Result: {result}")
    
    if result and 'errors' in result:
        error_msg = result['errors'][0].get('message', 'Unknown error') if result['errors'] else 'Unknown error'
        debug_msg = result['errors'][0].get('extensions', {}).get('debugMessage', '') if result['errors'] else ''
        logger.error("=== TOKEN CREATION FAILED ===")
        logger.error(f"Error message: {error_msg}")
        logger.error(f"Debug message: {debug_msg}")
        logger.error(f"Full errors: {result['errors']}")
        return None
    
    if result and 'tokenCreate' in result:
        logger.info("=== TOKEN CREATION SUCCESS ===")
        logger.info(f"Token ID: {result['tokenCreate'].get('id')}")
        logger.info(f"Token Name: {result['tokenCreate'].get('name')}")
        return result['tokenCreate']
    
    logger.error("=== UNEXPECTED RESPONSE ===")
    logger.error(f"Token creation returned unexpected result for {email}: {result}")
    return None


async def _find_best_token_for_email(email: str) -> Optional[str]:
    """
    Search all TradeSafe tokens for the given email and return the ID of the
    most recently created token that is valid=True AND has payout
    interval=IMMEDIATE.

    WALLET or invalid tokens are NEVER returned — seller payouts must always go
    to an IMMEDIATE+valid token. Returns None if no such token exists for the
    email (the caller then creates a fresh IMMEDIATE token).
    """
    logger.info(f"[TOKEN_SELECT] Searching TradeSafe for best token for email={email!r}")
    all_tokens = await get_all_tokens()

    candidates = [
        t for t in all_tokens
        if (t.get("user") or {}).get("email", "").lower() == email.lower()
    ]

    if not candidates:
        logger.info(f"[TOKEN_SELECT] No tokens found on TradeSafe for {email!r}")
        return None

    logger.info(f"[TOKEN_SELECT] Found {len(candidates)} token(s) for {email!r}")

    def _is_immediate_valid(t: dict) -> bool:
        is_valid = bool(t.get("valid", True))
        interval = ((t.get("settings") or {}).get("payout") or {}).get("interval", "")
        return is_valid and interval == "IMMEDIATE"

    immediate_valid = [t for t in candidates if _is_immediate_valid(t)]

    if not immediate_valid:
        logger.warning(
            f"[TOKEN_SELECT] No valid+IMMEDIATE token exists for {email!r} "
            f"(only WALLET/invalid tokens found) — refusing to select a WALLET token"
        )
        return None

    # Among all valid+IMMEDIATE tokens, pick the most recently created one.
    best = max(immediate_valid, key=lambda t: _parse_created_at(t.get("createdAt")))
    logger.info(
        f"[TOKEN_SELECT] Best token for {email!r}: id={best['id']!r} "
        f"createdAt={best.get('createdAt')!r} "
        f"(most recent of {len(immediate_valid)} valid+IMMEDIATE token(s))"
    )
    return best["id"]


def _token_is_usable(token_details: Optional[Dict[str, Any]]) -> bool:
    """Return True if a token has valid=True and payout interval=IMMEDIATE."""
    if not token_details:
        return False
    is_valid = bool(token_details.get("valid", True))
    interval = ((token_details.get("settings") or {}).get("payout") or {}).get("interval", "")
    return is_valid and interval == "IMMEDIATE"


async def get_or_create_user_token(
    name: str,
    email: str,
    mobile: str = "+27000000000",
    reference: Optional[str] = None,
    db = None,
    user_id: str = None
) -> Optional[str]:
    """
    Get existing or create new user token.
    Returns the token ID.

    If user_id and db are provided, will check for and reuse existing token.
    Always prefers a token with payout=IMMEDIATE and valid=True.  If the stored
    token is a WALLET or invalid token, the function searches TradeSafe for the
    correct token and updates the DB record before returning it.
    """
    logger.info("=== GET OR CREATE TOKEN ===")
    logger.info(f"Name: {name}, Email: {email}, Mobile: {mobile}, User ID: {user_id}")

    async def _resolve_stored_token(stored_token_id: str, update_filter: dict) -> Optional[str]:
        """
        Verify a stored token and return the best IMMEDIATE+valid token for this
        email, or None if no usable token exists (caller then creates one).

        A WALLET / invalid token is NEVER returned — seller payouts must always
        resolve to an IMMEDIATE+valid token.

        Decision tree:
          1. Fetch live details for the stored token.
          2. If details unavailable (API error): return stored token as-is —
             we can't tell if it's WALLET, and dropping a possibly-good token to
             create a duplicate is worse than reusing it during an outage.
          3. If valid + IMMEDIATE: return stored token (fast path).
          4. Otherwise: search all tokens for the most recent IMMEDIATE+valid
             one, update DB, and return it. If none exists, return None so the
             caller creates a fresh IMMEDIATE token instead of using WALLET.
        """
        logger.info(
            f"[TOKEN_SELECT] Verifying stored token {stored_token_id!r} for {email!r}"
        )
        token_details = await get_token_details(stored_token_id)

        if token_details is None:
            # API call failed — play it safe and keep the stored token.
            logger.warning(
                f"[TOKEN_SELECT] Could not fetch details for token {stored_token_id!r} "
                f"(TradeSafe API error or token not found) — using stored token as-is for {email!r}"
            )
            return stored_token_id

        is_valid = bool(token_details.get("valid", True))
        interval = ((token_details.get("settings") or {}).get("payout") or {}).get("interval", "")
        logger.info(
            f"[TOKEN_SELECT] Token {stored_token_id!r} for {email!r}: "
            f"valid={is_valid} payout_interval={interval!r}"
        )

        if is_valid and interval == "IMMEDIATE":
            logger.info(f"[TOKEN_SELECT] Token is valid+IMMEDIATE — reusing as-is")
            return stored_token_id

        # Token exists but is WALLET/invalid — find the proper IMMEDIATE+valid one.
        logger.warning(
            f"[TOKEN_SELECT] Token {stored_token_id!r} not usable for payout "
            f"(valid={is_valid}, payout={interval!r}) — searching TradeSafe for IMMEDIATE+valid token"
        )
        best_token_id = await _find_best_token_for_email(email)

        if not best_token_id:
            logger.warning(
                f"[TOKEN_SELECT] No IMMEDIATE+valid token exists for {email!r} — "
                f"will NOT reuse WALLET/invalid token {stored_token_id!r}; a new token will be created"
            )
            return None

        if best_token_id == stored_token_id:
            # Listing says it's IMMEDIATE+valid but the detail fetch disagreed —
            # trust the (more authoritative) detail fetch and create a new one.
            logger.warning(
                f"[TOKEN_SELECT] Best token resolved back to stored {stored_token_id!r} "
                f"which failed detail verification — creating a new token instead"
            )
            return None

        logger.info(
            f"[TOKEN_SELECT] Upgrading token for {email!r}: "
            f"{stored_token_id!r} → {best_token_id!r} (most recent valid+IMMEDIATE)"
        )
        if db is not None:
            await db.users.update_one(update_filter, {"$set": {"tradesafe_token_id": best_token_id}})
        return best_token_id

    resolved_token_id: Optional[str] = None

    # If we have db and user_id, try to reuse existing token
    if db is not None and user_id:
        user_doc = await db.users.find_one({"user_id": user_id})
        if user_doc and user_doc.get("tradesafe_token_id"):
            resolved_token_id = await _resolve_stored_token(
                user_doc["tradesafe_token_id"], {"user_id": user_id}
            )

    # Also check by email if we have db access and haven't resolved a token yet
    if resolved_token_id is None and db is not None:
        user_by_email = await db.users.find_one({"email": email.lower()})
        if user_by_email and user_by_email.get("tradesafe_token_id"):
            resolved_token_id = await _resolve_stored_token(
                user_by_email["tradesafe_token_id"], {"email": email.lower()}
            )

    if resolved_token_id:
        return resolved_token_id
    
    # Split name into given/family name
    name_parts = name.strip().split(' ', 1)
    given_name = name_parts[0] if name_parts else "User"
    family_name = name_parts[1] if len(name_parts) > 1 else "User"

    logger.info(f"Split name: given={given_name}, family={family_name}")

    # Ensure mobile is in +27 format
    if mobile and len(str(mobile).strip()) >= 9:
        mobile = _normalize_mobile(mobile)

    # Fetch SA ID number from user record — never use a fake fallback
    id_number = ""
    if db is not None:
        user_doc_for_id = await db.users.find_one(
            {"email": email.lower()},
            {"id_number": 1, "sa_id_number": 1}
        )
        if user_doc_for_id:
            id_number = (
                user_doc_for_id.get("id_number")
                or user_doc_for_id.get("sa_id_number")
                or ""
            )
    if id_number:
        logger.info(f"[TOKEN] Using stored ID number for {email}")
    else:
        logger.info(f"[TOKEN] No ID number stored for {email} — creating token without idNumber")

    # Create a new token
    logger.info(f"CREATING NEW token for {email}")
    token_data = await create_user_token(
        given_name=given_name,
        family_name=family_name,
        email=email,
        mobile=mobile,
        id_number=id_number,
    )
    
    if token_data:
        token_id = token_data['id']
        
        # Save to user record if we have db access
        if db is not None:
            await db.users.update_one(
                {"email": email.lower()},
                {"$set": {
                    "tradesafe_token_id": token_id,
                    "tradesafe_token_reference": token_data.get('name', '')
                }},
                upsert=False  # Don't create user if doesn't exist
            )
            logger.info(f"Token {token_id} saved to user record for {email}")
        
        return token_id
    
    logger.error(f"=== FAILED TO CREATE TOKEN FOR {email} ===")
    return None


async def create_tradesafe_transaction(
    internal_reference: str,
    title: str,
    description: str,
    amount: float,
    buyer_name: str,
    buyer_email: str,
    seller_name: str,
    seller_email: str,
    buyer_mobile: str = None,
    seller_mobile: str = None,
    fee_allocation: str = "BUYER",
    days_to_deliver: int = 1,
    days_to_inspect: int = 1,
) -> Optional[Dict[str, Any]]:
    """
    Create a new escrow transaction with TrustTrade as AGENT to collect 2% platform fee.
    fee_allocation: BUYER, SELLER, or BUYER_SELLER — passed to TradeSafe at both
    transaction level and AGENT party level.
    """
    logger.info("=== CREATE TRANSACTION REQUEST ===")
    logger.info(f"Reference: {internal_reference}")
    logger.info(f"Amount: R{amount}")
    logger.info(f"Buyer: {buyer_name} ({buyer_email}) Mobile: {buyer_mobile}")
    logger.info(f"Seller: {seller_name} ({seller_email}) Mobile: {seller_mobile}")
    logger.info(f"TrustTrade Platform Fee: {PLATFORM_FEE_PERCENT}%")
    
    # Validate minimum amount
    is_valid, error_msg = validate_minimum_transaction(amount)
    if not is_valid:
        logger.error(f"Transaction validation failed: {error_msg}")
        return {"error": error_msg}
    
    # Pre-flight checks
    validation_errors = []
    
    if not buyer_name or buyer_name.strip() == "":
        validation_errors.append("Buyer name is missing")
    if not buyer_email or "@" not in buyer_email:
        validation_errors.append("Buyer email is invalid")
    if not seller_name or seller_name.strip() == "":
        validation_errors.append("Seller name is missing")
    if not seller_email or "@" not in seller_email:
        validation_errors.append("Seller email is invalid")
    
    if validation_errors:
        error_msg = "Missing information: " + ", ".join(validation_errors)
        logger.error(f"Pre-flight validation failed: {error_msg}")
        return {"error": error_msg}
    
    # Import here to avoid circular dependency
    from core.database import get_database
    db = get_database()

    # Resolve user_ids so get_or_create_user_token can reuse existing tokens
    buyer_doc = await db.users.find_one({"email": buyer_email.lower()})
    buyer_user_id = buyer_doc.get("user_id") if buyer_doc else None

    seller_doc = await db.users.find_one({"email": seller_email.lower()})
    seller_user_id = seller_doc.get("user_id") if seller_doc else None

    logger.info(f"Resolved buyer_user_id: {buyer_user_id}, seller_user_id: {seller_user_id}")

    # Get or create tokens for buyer and seller (reuse from user records if available)
    logger.info("Getting/creating buyer token...")
    buyer_token = await get_or_create_user_token(
        buyer_name,
        buyer_email,
        mobile=buyer_mobile or "+27000000000",
        reference=f"buyer_{internal_reference}",
        db=db,
        user_id=buyer_user_id,
    )

    logger.info("Getting/creating seller token...")
    seller_token = await get_or_create_user_token(
        seller_name,
        seller_email,
        mobile=seller_mobile or "+27000000000",
        reference=f"seller_{internal_reference}",
        db=db,
        user_id=seller_user_id,
    )
    
    if not buyer_token:
        logger.error("=== BUYER TOKEN CREATION FAILED ===")
        return {"error": "Could not verify buyer details. Please check buyer information and try again."}

    if not seller_token:
        logger.error("=== SELLER TOKEN CREATION FAILED ===")
        return {"error": "Could not verify seller details. Please check seller information and try again."}

    logger.info(
        f"[TOKEN_RESOLVED] ref={internal_reference!r} "
        f"buyer_email={buyer_email!r} buyer_token={buyer_token!r} "
        f"seller_email={seller_email!r} seller_token={seller_token!r}"
    )

    if buyer_token == seller_token:
        logger.error(
            f"[TOKEN_CONFLICT] buyer_token == seller_token ({buyer_token!r}) "
            f"for ref={internal_reference!r} — aborting to prevent TradeSafe rejection"
        )
        return {"error": "Internal token conflict: buyer and seller resolved to the same TradeSafe token. Please contact support."}

    # Pre-sync seller banking details to their TradeSafe token before escrow creation
    if seller_doc:
        seller_banking = seller_doc.get("banking_details") or {}
        seller_bank_name = seller_banking.get("bank_name")
        seller_account_number = seller_banking.get("account_number")
        seller_branch_code = seller_banking.get("branch_code", "")
        seller_account_type = seller_banking.get("account_type", "savings")
        if seller_bank_name and seller_account_number:
            # Block escrow creation outright when the stored account number is
            # invalid — we'd rather fail loudly here than create a transaction
            # that produces a stuck RJCT payout later. Other sync failures (rate
            # limit, transient TradeSafe error) stay non-blocking so the pre_sync
            # call doesn't break valid flows.
            pre_check = validate_account_number_for_sync(seller_account_number)
            if not pre_check["valid"]:
                logger.error(
                    f"[PRE_SYNC] REJECTED — seller {seller_email!r} has invalid stored "
                    f"account number: {pre_check['error']} (code={pre_check['code']})"
                )
                return {
                    "error": pre_check["error"],
                    "code": "INVALID_SELLER_BANKING",
                    "field": "seller_account_number",
                }

            logger.info(f"[PRE_SYNC] Syncing seller banking to token {seller_token} before escrow creation")
            sync_result = await sync_banking_to_token(
                token_id=seller_token,
                bank_name=seller_bank_name,
                account_number=seller_account_number,
                branch_code=seller_branch_code,
                account_type=seller_account_type,
                mobile=seller_mobile,
                email=seller_email,
            )
            if sync_result.get("success"):
                logger.info("[PRE_SYNC] Seller banking synced successfully")
            elif sync_result.get("code") in ("MISSING", "NON_DIGIT", "TOO_SHORT"):
                # Defence-in-depth: should be caught above, but if the guard ever
                # diverges from sync_banking_to_token, still abort here.
                logger.error(f"[PRE_SYNC] Banking guard failed at sync layer: {sync_result.get('error')}")
                return {
                    "error": sync_result.get("error"),
                    "code": "INVALID_SELLER_BANKING",
                    "field": "seller_account_number",
                }
            else:
                logger.warning(f"[PRE_SYNC] Seller banking sync failed (non-blocking): {sync_result.get('error')}")
        else:
            logger.info("[PRE_SYNC] Seller has no banking details in profile, skipping pre-sync")

    # TradeSafe API expects amount in RANDS (NOT cents)
    amount_rands = float(amount)
    
    # Calculate TrustTrade fee: 2% with R5 minimum
    calculated_fee = round(amount_rands * (PLATFORM_FEE_PERCENT / 100), 2)
    trusttrade_fee = max(calculated_fee, MINIMUM_FEE_RANDS)
    
    logger.info("=== FEE CALCULATION ===")
    logger.info(f"Item Amount: R{amount_rands}")
    logger.info(f"Calculated Fee ({PLATFORM_FEE_PERCENT}%): R{calculated_fee}")
    logger.info(f"TrustTrade Fee (min R{MINIMUM_FEE_RANDS}): R{trusttrade_fee}")
    
    # GraphQL mutation for creating a transaction with AGENT
    mutation = """
    mutation transactionCreate($input: CreateTransactionInput!) {
        transactionCreate(input: $input) {
            id
            uuid
            reference
            state
            title
            description
            industry
            feeAllocation
            allocations {
                id
                title
                value
                state
            }
            parties {
                id
                role
                fee
                feeType
                feeAllocation
            }
            createdAt
        }
    }
    """
    
    # Build transaction with TrustTrade as AGENT
    # The AGENT party receives the platform fee automatically when funds are released
    #
    # Fee structure:
    # - feeAllocation on transaction level: determines who pays fees (including agent fee)
    # - AGENT party with fee/feeType: TrustTrade's 2% platform margin
    # - The AGENT is linked via token ID (TrustTrade organisation token on TradeSafe)
    #
    TRUSTTRADE_AGENT_TOKEN = os.environ.get("TRUSTTRADE_ORG_TOKEN_ID", "")
    if not TRUSTTRADE_AGENT_TOKEN:
        logger.error("[TRADESAFE] TRUSTTRADE_ORG_TOKEN_ID not configured — cannot create escrow")
        return {"error": "Payment service misconfigured. Please contact support."}

    # Normalise fee_allocation → TradeSafe enum value
    _fa_norm = (fee_allocation or "BUYER").upper()
    if _fa_norm not in ("BUYER", "SELLER", "BUYER_SELLER"):
        _fa_norm = "BUYER"

    variables = {
        "input": {
            "title": title,
            "description": description,
            "industry": "GENERAL_GOODS_SERVICES",
            "currency": "ZAR",
            "feeAllocation": _fa_norm,
            "reference": internal_reference,
            "parties": {
                "create": [
                    {
                        "role": "BUYER",
                        "token": buyer_token
                    },
                    {
                        "role": "SELLER",
                        "token": seller_token
                    },
                    {
                        "role": "AGENT",
                        "token": TRUSTTRADE_AGENT_TOKEN,
                        "fee": PLATFORM_FEE_PERCENT,
                        "feeType": "PERCENT",
                        "feeAllocation": _fa_norm,
                    }
                ]
            },
            "allocations": {
                "create": [
                    {
                        "title": "Payment for item/service",
                        "description": description,
                        "value": amount_rands,
                        "daysToDeliver": days_to_deliver,
                        "daysToInspect": days_to_inspect
                    }
                ]
            }
        }
    }

    logger.info("=== TRANSACTION CREATE REQUEST ===")
    logger.info("=== FIELDS SENT TO TRADESAFE ===")
    logger.info(f"AGENT token: {TRUSTTRADE_AGENT_TOKEN!r}")
    logger.info(f"BUYER token: {buyer_token!r} ({buyer_email})")
    logger.info(f"SELLER token: {seller_token!r} ({seller_email})")
    logger.info(f"AGENT fee: {PLATFORM_FEE_PERCENT}")
    logger.info("AGENT feeType: PERCENT")
    logger.info(f"AGENT feeAllocation: {_fa_norm}")
    logger.info(f"Allocation value: R{amount_rands}")
    logger.info(f"Variables: {variables}")

    result = await execute_graphql(mutation, variables)

    # Defensive fallback: the schema permits daysToDeliver=0 (nullable Float, no
    # minimum), but if a given TradeSafe environment rejects it at runtime we must
    # never let transaction creation break. Retry exactly once with daysToDeliver=1.
    if days_to_deliver == 0 and result and result.get('errors'):
        rejection = (result['errors'][0] or {}).get('message', 'unknown error')
        logger.warning(
            f"[DAYS_TO_DELIVER_FALLBACK] TradeSafe rejected daysToDeliver=0 for "
            f"ref={internal_reference!r} ({rejection!r}); retrying with daysToDeliver=1"
        )
        variables['input']['allocations']['create'][0]['daysToDeliver'] = 1
        result = await execute_graphql(mutation, variables)

    logger.info("=== TRANSACTION CREATE RESPONSE ===")
    logger.info(f"Result: {result}")

    if result and 'errors' in result:
        first_err = result['errors'][0] if result['errors'] else {}
        error_msg = first_err.get('message', 'Unknown error')
        debug_msg = first_err.get('extensions', {}).get('debugMessage', '')
        validation_errs = first_err.get('extensions', {}).get('validation', {})
        logger.error("=== TRANSACTION CREATION FAILED ===")
        logger.error(f"Error: {error_msg}")
        logger.error(f"Debug: {debug_msg}")
        logger.error(f"Validation: {validation_errs}")
        logger.error(f"Full error object: {first_err}")
        logger.error(
            f"[TOKEN_DIAG] buyer_token={buyer_token!r} seller_token={seller_token!r} "
            f"agent_token={TRUSTTRADE_AGENT_TOKEN!r} ref={internal_reference!r}"
        )
        return {"error": f"Payment processing error: {error_msg}"}
    
    if result and 'transactionCreate' in result:
        tx = result['transactionCreate']
        logger.info("=== TRANSACTION CREATED SUCCESSFULLY ===")
        logger.info(f"Transaction ID: {tx['id']}")
        logger.info(f"State: {tx['state']}")
        logger.info(f"Fee Allocation: {tx.get('feeAllocation')}")
        
        # Log party details including AGENT
        for party in tx.get('parties', []):
            logger.info(f"Party: {party.get('role')} - Fee: {party.get('fee')} ({party.get('feeType')}) - Allocation: {party.get('feeAllocation')}")
        
        # Add fee breakdown and allocation to response
        tx['trusttrade_fee'] = trusttrade_fee
        tx['fee_allocation'] = _fa_norm
        tx['fee_breakdown'] = {
            'item_amount': amount_rands,
            'trusttrade_fee_percent': PLATFORM_FEE_PERCENT,
            'trusttrade_fee_amount': trusttrade_fee,
            'fee_allocation': _fa_norm
        }
        
        # Store token IDs for payout tracking
        tx['seller_token_id'] = seller_token
        tx['buyer_token_id'] = buyer_token
        
        logger.info(f"[PAYOUT_TRACKING] Transaction {tx['id']} - Seller Token: {seller_token}, Buyer Token: {buyer_token}")
        
        return tx
    
    logger.error("=== UNEXPECTED TRANSACTION RESPONSE ===")
    return {"error": "Failed to create transaction. Please try again."}


async def get_tradesafe_transaction(tradesafe_id: str) -> Optional[Dict[str, Any]]:
    """
    Get transaction details from TradeSafe by ID.
    """
    query = """
    query transaction($id: ID!) {
        transaction(id: $id) {
            id
            uuid
            reference
            state
            title
            description
            createdAt
            allocations {
                id
                title
                value
                state
            }
            parties {
                id
                role
            }
        }
    }
    """
    
    result = await execute_graphql(query, {"id": tradesafe_id})
    
    if result and 'transaction' in result:
        return result['transaction']
    
    return None


async def get_payment_link(tradesafe_id: str, redirect_urls: Dict[str, str] = None, method: str = None) -> Optional[Dict[str, Any]]:
    """
    Generate payment link for a TradeSafe transaction using transactionDeposit mutation.
    This creates a deposit request and returns the payment link.

    Args:
        tradesafe_id: The TradeSafe transaction ID
        redirect_urls: Optional dict with success, failure, cancel URLs
        method: If given (EFT/OZOW/CARD), only that deposit method is created. EFT has no
            hosted link, so the caller builds bank-transfer details instead. If None, the
            old behaviour is kept (try EFT→OZOW→CARD and return the first hosted link).
    """
    logger.info(f"[PAYMENT] get_payment_link called: tradesafe_id={tradesafe_id}, env={TRADESAFE_ENV}")
    
    # Default redirect URLs (use environment variables)
    if not redirect_urls:
        redirect_urls = {
            "success": PAYMENT_SUCCESS_URL,
            "failure": PAYMENT_FAILURE_URL,
            "cancel": PAYMENT_CANCEL_URL
        }
    
    # First, get the transaction to check state and existing deposits
    query = """
    query transaction($id: ID!) {
        transaction(id: $id) {
            id
            state
            deposits {
                id
                paymentLink
                method
            }
        }
    }
    """
    
    try:
        result = await execute_graphql(query, {"id": tradesafe_id})
        logger.info(f"[PAYMENT] transaction fetch result: {result}")
    except Exception as e:
        logger.error(f"[PAYMENT] error fetching transaction {tradesafe_id}: {str(e)}", exc_info=True)
        return None
    
    if not result or 'transaction' not in result:
        if result and 'errors' in result:
            logger.error(f"[PAYMENT] transaction query error: {result['errors']}")
        logger.error(f"[PAYMENT] could not fetch transaction {tradesafe_id}")
        return None

    tx = result['transaction']
    tx_state = tx.get('state')
    logger.info(f"[PAYMENT] transaction {tradesafe_id} state: {tx_state}")
    
    # Check if transaction is already fully paid
    PAID_STATES = ['FUNDS_DEPOSITED', 'FUNDS_RELEASED', 'COMPLETED', 'DELIVERED']
    if tx_state in PAID_STATES:
        logger.info(f"[PAYMENT] transaction {tradesafe_id} already in {tx_state} state — no payment needed")
        return {
            "tradesafe_id": tx['id'],
            "state": tx_state,
            "payment_link": None,
            "payment_methods": ALLOWED_PAYMENT_METHODS,
            "message": f"Transaction already paid. Current state: {tx_state}",
            "already_paid": True
        }
    
    # Check if there's already a deposit with payment link (for unpaid transactions)
    deposits = tx.get('deposits', [])
    logger.info(f"[PAYMENT] existing deposits count: {len(deposits)}")
    for deposit in deposits:
        if deposit.get('paymentLink'):
            logger.info(f"[PAYMENT] reusing existing payment link for {tradesafe_id}")
            return {
                "tradesafe_id": tx['id'],
                "state": tx_state,
                "payment_link": deposit['paymentLink'],
                "payment_methods": ALLOWED_PAYMENT_METHODS
            }
    
    # Generate new payment link using transactionDeposit mutation
    # Note: transactionDeposit returns a Deposit object directly
    # For sandbox, EFT (manual) will work. For production, OZOW/CARD provide payment links.
    mutation = """
    mutation transactionDeposit($id: ID!, $method: DepositMethod!, $redirects: TransactionDepositRedirects) {
        transactionDeposit(id: $id, method: $method, redirects: $redirects) {
            id
            paymentLink
            method
            value
            processingFee
        }
    }
    """
    
    # When the buyer picked a specific method, honour ONLY that one (so choosing EFT
    # doesn't silently fall through to an Ozow hosted page). Otherwise keep the old
    # try-in-order behaviour.
    if method and method.upper() in ALLOWED_PAYMENT_METHODS:
        methods_to_try = [method.upper()]
    else:
        methods_to_try = ["EFT", "OZOW", "CARD"]
    last_deposit = None
    # Track the real reason a deposit could not be created, so the caller can
    # surface "{METHOD} was rejected by TradeSafe: ..." instead of the misleading
    # "this transaction no longer exists" (the transaction clearly DOES exist —
    # we just queried it successfully above).
    last_error = None
    last_failed_method = None

    for method in methods_to_try:
        variables = {
            "id": tradesafe_id,
            "method": method,
            "redirects": redirect_urls
        }

        logger.info(f"[PAYMENT] trying method: {method} for {tradesafe_id}")

        try:
            result = await execute_graphql(mutation, variables)
            logger.info(f"[PAYMENT] {method} raw result: {result}")
        except Exception as e:
            logger.error(f"[PAYMENT] exception with {method}: {str(e)}", exc_info=True)
            last_error = str(e)
            last_failed_method = method
            continue

        if result and 'errors' in result:
            error_msg = result['errors'][0].get('message', 'Unknown error') if result['errors'] else 'Unknown error'
            logger.warning(f"[PAYMENT] method {method} failed: {error_msg}")
            last_error = error_msg
            last_failed_method = method
            continue

        if result and 'transactionDeposit' in result:
            deposit = result['transactionDeposit']
            last_deposit = deposit
            payment_link = deposit.get('paymentLink')
            logger.info(f"[PAYMENT] deposit created with {method}: link={payment_link}, value={deposit.get('value')}")
            
            if payment_link:
                # Got a payment link - return it
                return {
                    "tradesafe_id": tradesafe_id,
                    "state": "PENDING_PAYMENT",
                    "payment_link": payment_link,
                    "payment_methods": ALLOWED_PAYMENT_METHODS,
                    "deposit_id": deposit.get('id'),
                    "processing_fee": deposit.get('processingFee'),
                    "total_value": deposit.get('value'),
                    "method": method
                }
    
    # If we got a deposit but no payment link (EFT case), return deposit info
    # The frontend will show bank details or instruct user
    if last_deposit:
        logger.info(f"[PAYMENT] returning EFT deposit info (no payment link) for {tradesafe_id}")
        return {
            "tradesafe_id": tradesafe_id,
            "state": "PENDING_PAYMENT",
            "payment_link": None,
            "payment_methods": ALLOWED_PAYMENT_METHODS,
            "deposit_id": last_deposit.get('id'),
            "processing_fee": last_deposit.get('processingFee'),
            "total_value": last_deposit.get('value'),
            "method": "EFT",
            "message": "Please use bank details for EFT payment. See transaction for bank account details."
        }

    # The transaction exists (we fetched it above) but no deposit could be created.
    # Surface the ACTUAL TradeSafe error + which method failed, so the buyer sees a
    # truthful message and we can diagnose (e.g. Ozow not enabled on the account).
    if last_error:
        logger.error(
            f"[PAYMENT] deposit creation failed for {tradesafe_id} "
            f"method={last_failed_method}: {last_error}"
        )
        return {
            "error": "deposit_failed",
            "method": last_failed_method,
            "message": last_error,
            "tradesafe_id": tradesafe_id,
            "state": tx_state,
        }

    logger.error(f"[PAYMENT] get_payment_link returning None — no deposit created for {tradesafe_id}")
    return None


# Fields a TradeSafe Deposit might expose for manual EFT (bank account + reference).
# We discover which exist via introspection before querying them, so an unknown field
# never breaks the call.
_EFT_BANK_FIELD_CANDIDATES = [
    "reference", "paymentReference",
    "bankName", "bank",
    "accountName", "accountHolder",
    "accountNumber", "bankAccountNumber",
    "branchCode", "accountType",
]


async def get_tradesafe_eft_details(tradesafe_id: str) -> Optional[Dict[str, Any]]:
    """Best-effort fetch of EFT bank-transfer details from TradeSafe for a transaction.

    Returns a normalised dict (source="tradesafe") only if TradeSafe actually exposes a
    usable account number + reference; otherwise returns None so the caller falls back
    to TrustTrade's own configured account. Fully isolated — never raises.
    """
    try:
        introspect = await execute_graphql('query { __type(name: "Deposit") { fields { name } } }')
        if not introspect or "errors" in introspect:
            return None
        available = {f["name"] for f in ((introspect.get("__type") or {}).get("fields") or [])}
        wanted = [f for f in _EFT_BANK_FIELD_CANDIDATES if f in available]
        if not wanted:
            logger.info(f"[PAYMENT_EFT] TradeSafe Deposit exposes no bank/reference fields for {tradesafe_id}")
            return None

        selection = " ".join(["id", "method"] + wanted)
        query = f"query t($id: ID!) {{ transaction(id: $id) {{ deposits {{ {selection} }} }} }}"
        result = await execute_graphql(query, {"id": tradesafe_id})
        if not result or "errors" in result or "transaction" not in result:
            return None

        deposits = (result["transaction"] or {}).get("deposits") or []
        eft = next((d for d in deposits if (d.get("method") or "").upper() == "EFT"), None)
        if not eft and deposits:
            eft = deposits[-1]
        if not eft:
            return None

        account_number = eft.get("accountNumber") or eft.get("bankAccountNumber")
        reference = eft.get("reference") or eft.get("paymentReference")
        if not account_number or not reference:
            # Incomplete — not safe to present as the pay-to account; fall back.
            return None

        return {
            "source": "tradesafe",
            "bank": eft.get("bankName") or eft.get("bank"),
            "account_name": eft.get("accountName") or eft.get("accountHolder"),
            "account_number": account_number,
            "branch_code": eft.get("branchCode"),
            "account_type": eft.get("accountType"),
            "reference": reference,
            "auto_confirms": True,  # money reaches TradeSafe → FUNDS_DEPOSITED webhook fires
        }
    except Exception as exc:
        logger.error(f"[PAYMENT_EFT] get_tradesafe_eft_details failed for {tradesafe_id}: {exc}")
        return None


async def build_eft_payment_details(*, reference: str, amount: float, tradesafe_id: str = None) -> Dict[str, Any]:
    """Return EFT bank-transfer instructions to show the buyer.

    Prefers TradeSafe's own deposit account (keeps funds in escrow; the
    FUNDS_DEPOSITED webhook will auto-confirm). Falls back to TrustTrade's configured
    account with the share code as the reference (manual reconciliation — no webhook).
    """
    details = None
    if tradesafe_id:
        details = await get_tradesafe_eft_details(tradesafe_id)

    if not details:
        details = {
            "source": "trusttrade_fallback",
            "bank": settings.TRUSTTRADE_EFT_BANK,
            "account_name": settings.TRUSTTRADE_EFT_ACCOUNT_NAME,
            "account_number": settings.TRUSTTRADE_EFT_ACCOUNT_NUMBER,
            "branch_code": settings.TRUSTTRADE_EFT_BRANCH_CODE,
            "account_type": settings.TRUSTTRADE_EFT_ACCOUNT_TYPE,
            "reference": reference,
            "auto_confirms": False,  # paid to TrustTrade directly → reconcile manually
        }

    details["amount"] = round(float(amount or 0), 2)
    details["instructions"] = (
        "Use this reference number when making your EFT payment. "
        "Funds will be confirmed within 1-2 business days."
    )
    return details


async def start_delivery(allocation_id: str) -> Optional[Dict[str, Any]]:
    """
    Mark allocation as delivery started (seller initiates shipping).
    Call this when seller marks item as dispatched/delivered.
    """
    logger.info(f"[START_DELIVERY] Calling allocationStartDelivery — allocation_id={allocation_id!r}")

    mutation = """
    mutation allocationStartDelivery($id: ID!) {
        allocationStartDelivery(id: $id) {
            id
            title
            state
            initiatedDate
            deliverBy
        }
    }
    """

    result = await execute_graphql(mutation, {"id": allocation_id})
    logger.info(f"[START_DELIVERY] Raw TradeSafe response: {result}")

    if result and 'errors' in result:
        err = result['errors'][0].get('message', 'unknown') if result['errors'] else 'unknown'
        debug = (result['errors'][0].get('extensions') or {}).get('debugMessage', '') if result['errors'] else ''
        logger.error(f"[START_DELIVERY] TradeSafe error for allocation {allocation_id!r}: {err} | debug: {debug}")
        return None

    if result and 'allocationStartDelivery' in result:
        logger.info(f"[START_DELIVERY] Success for allocation {allocation_id!r}: {result['allocationStartDelivery']}")
        return result['allocationStartDelivery']

    logger.error(f"[START_DELIVERY] Unexpected response — no allocationStartDelivery key. allocation={allocation_id!r} result={result}")
    return None


async def complete_delivery(allocation_id: str) -> Optional[Dict[str, Any]]:
    """
    Call allocationCompleteDelivery to mark buyer receipt confirmed.

    Per TradeSafe docs, the correct post-payment flow is:
      1. allocationStartDelivery  → state: INITIATED
      2. allocationCompleteDelivery → state: DELIVERY_ACCEPTED
      3. TradeSafe auto-releases funds (24 hrs) and fires a FUNDS_RELEASED webhook
         — we trigger bank withdrawal from the webhook, NOT inline here.

    Do NOT call allocationAcceptDelivery after allocationCompleteDelivery —
    TradeSafe rejects it ("You cannot accept this allocation").
    """
    logger.info(f"[COMPLETE_DELIVERY] Calling allocationCompleteDelivery — allocation_id={allocation_id!r}")

    mutation = """
    mutation allocationCompleteDelivery($id: ID!) {
        allocationCompleteDelivery(id: $id) {
            id
            state
        }
    }
    """

    result = await execute_graphql(mutation, {"id": allocation_id})
    logger.info(f"[COMPLETE_DELIVERY] Raw TradeSafe response: {result}")

    if result and "errors" in result:
        err = result["errors"][0].get("message", "unknown") if result["errors"] else "unknown"
        debug = (result["errors"][0].get("extensions") or {}).get("debugMessage", "") if result["errors"] else ""
        logger.error(f"[COMPLETE_DELIVERY] TradeSafe error for allocation {allocation_id!r}: {err} | debug: {debug}")
        return None

    if result and "allocationCompleteDelivery" in result:
        delivery_result = result["allocationCompleteDelivery"]
        logger.info(f"[COMPLETE_DELIVERY] Success allocation={allocation_id!r} state={delivery_result.get('state')}")
        return delivery_result

    logger.error(f"[COMPLETE_DELIVERY] Unexpected response allocation={allocation_id!r}: {result}")
    return None


# Allocation states that mean "funds already released / on their way to the seller".
# If an allocation is in one of these, a release attempt is a no-op success, not a failure.
ALLOCATION_RELEASED_STATES = {
    "DELIVERY_ACCEPTED", "FUNDS_RELEASED", "RELEASED", "COMPLETE", "COMPLETED",
    "FUNDS_DISBURSED", "DISBURSED",
}

# Set by accept_delivery on a hard failure so callers can log/surface the exact
# TradeSafe rejection instead of a generic "no result".
LAST_ACCEPT_DELIVERY_ERROR: Optional[str] = None


async def _attempt_release(allocation_id: str) -> Optional[Dict[str, Any]]:
    """Run the FULL delivery sequence on one allocation:
        allocationStartDelivery -> allocationAcceptDelivery -> allocationCompleteDelivery.

    Each step is best-effort because the allocation may already be partway through
    (e.g. the seller's "mark delivered" already ran allocationStartDelivery, leaving
    it in DELIVERED). Returns the allocation dict from the first step that yields a
    real released result, else None. Precise per-step reasons -> LAST_ACCEPT_DELIVERY_ERROR.
    """
    global LAST_ACCEPT_DELIVERY_ERROR
    reasons = []

    # 1 — allocationStartDelivery (no-op / error if already started; never fatal).
    start_result = await start_delivery(allocation_id)
    if start_result:
        logger.info(f"[ACCEPT_DELIVERY] startDelivery OK allocation={allocation_id!r} state={start_result.get('state')!r}")
    else:
        logger.info(f"[ACCEPT_DELIVERY] startDelivery no result for {allocation_id!r} (likely already started) — continuing")

    # 2 — allocationAcceptDelivery. CRITICAL: only treat as success when it returns a
    #     REAL allocation. A null payload with no 'errors' must fall through to
    #     completeDelivery — returning it as success was the silent-failure bug that
    #     left DELIVERED milestone allocations stuck.
    mutation = """
    mutation allocationAcceptDelivery($id: ID!) {
        allocationAcceptDelivery(id: $id) { id title state value }
    }
    """
    result = await execute_graphql(mutation, {"id": allocation_id})
    logger.info(f"[ACCEPT_DELIVERY] acceptDelivery raw response: {result}")
    accept_payload = (result or {}).get("allocationAcceptDelivery") if (result and "errors" not in result) else None
    if accept_payload:
        logger.info(f"[ACCEPT_DELIVERY] acceptDelivery OK allocation={allocation_id!r} state={accept_payload.get('state')!r}")
        return accept_payload
    if result and result.get("errors"):
        e = result["errors"][0] or {}
        debug = (e.get("extensions") or {}).get("debugMessage", "")
        reasons.append(f"acceptDelivery: {e.get('message', 'unknown')}{(' — ' + debug) if debug else ''}")
    else:
        reasons.append(f"acceptDelivery: no allocation returned (response={result})")

    # 3 — allocationCompleteDelivery: the documented post-startDelivery release path,
    #     and the correct one for an allocation already in DELIVERED.
    complete_result = await complete_delivery(allocation_id)
    if complete_result:
        logger.info(f"[ACCEPT_DELIVERY] completeDelivery OK allocation={allocation_id!r} state={complete_result.get('state')!r}")
        return complete_result
    reasons.append("completeDelivery: no result (see [COMPLETE_DELIVERY] log for the exact reason)")

    LAST_ACCEPT_DELIVERY_ERROR = " | ".join(reasons)
    logger.error(f"[ACCEPT_DELIVERY] full delivery sequence failed allocation={allocation_id!r}: {LAST_ACCEPT_DELIVERY_ERROR}")
    return None


async def _verify_allocation_released(
    reference: str, allocation_id: str, attempts: int = 4, delay: float = 2.0
) -> Optional[Dict[str, Any]]:
    """Poll TradeSafe for the allocation's REAL state and return a success dict if it
    reached a released/accepted state.

    This is the safety net that stops us reporting a failure when the money actually
    moved: TradeSafe can return a null mutation payload yet still release the funds, or
    flip to the released state a moment later. We check BOTH the allocation state and the
    transaction state, retrying a few times for async propagation. Works for any
    milestone in any deal (2, 5, 10 stages — all release the same way).
    """
    import asyncio
    for i in range(attempts):
        try:
            txn = await get_transaction_by_reference(reference)
            allocs = (txn or {}).get("allocations") or []
            real = next((a for a in allocs if str(a.get("id")) == str(allocation_id)), None) or (allocs[0] if allocs else None)
            alloc_state = str((real or {}).get("state") or "").upper()
            txn_state = str((txn or {}).get("state") or "").upper()
            if alloc_state in ALLOCATION_RELEASED_STATES or txn_state in ALLOCATION_RELEASED_STATES:
                released_id = (real or {}).get("id") or allocation_id
                logger.info(
                    f"[ACCEPT_DELIVERY] VERIFIED RELEASED — reference={reference!r} allocation={released_id!r} "
                    f"alloc_state={alloc_state!r} txn_state={txn_state!r}"
                )
                return {"id": released_id, "state": alloc_state or txn_state, "already_released": True}
            logger.info(
                f"[ACCEPT_DELIVERY] not released yet (attempt {i + 1}/{attempts}) reference={reference!r} "
                f"alloc_state={alloc_state!r} txn_state={txn_state!r}"
            )
        except Exception as exc:
            logger.error(f"[ACCEPT_DELIVERY] verify poll failed for reference={reference!r}: {exc}")
        if i < attempts - 1:
            await asyncio.sleep(delay)
    return None


async def accept_delivery(
    allocation_id: str,
    seller_token_id: Optional[str] = None,
    amount: Optional[float] = None,
    reference: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """
    Release escrow funds for an allocation (buyer confirm / approve / admin force).

    Runs allocationStartDelivery -> allocationAcceptDelivery, falling back to
    allocationCompleteDelivery. If `reference` (the transaction's internal reference,
    e.g. a milestone child deal_id) is given, the call also SELF-HEALS on failure:

      * if the allocation is already in a released state, it's treated as success
        (idempotent — fixes a retry after a partial release); and
      * if the stored allocation_id is wrong/stale, the real allocation is looked up
        from the reference and the release retried on it.

    On a genuine failure, LAST_ACCEPT_DELIVERY_ERROR holds the exact TradeSafe reason.
    """
    global LAST_ACCEPT_DELIVERY_ERROR
    LAST_ACCEPT_DELIVERY_ERROR = None
    logger.info(f"[ACCEPT_DELIVERY] start — allocation={allocation_id!r} reference={reference!r}")

    result = await _attempt_release(allocation_id)
    if result:
        return result

    # The mutations can return a null/empty payload even when TradeSafe DID release the
    # funds (or releases them a moment later). NEVER trust a bare failure — verify the
    # allocation's real state and treat a released/accepted allocation as success.
    if reference:
        verified = await _verify_allocation_released(reference, allocation_id)
        if verified:
            return verified

        # Stored allocation id wrong/stale: find the real allocation for this reference,
        # retry the full sequence on it, then verify again. Covers any stage of any deal.
        try:
            txn = await get_transaction_by_reference(reference)
            allocs = (txn or {}).get("allocations") or []
            real = next((a for a in allocs if str(a.get("id")) == str(allocation_id)), None) or (allocs[0] if allocs else None)
            real_id = (real or {}).get("id")
            if real_id and str(real_id) != str(allocation_id):
                logger.warning(f"[ACCEPT_DELIVERY] stored allocation {allocation_id!r} failed; retrying real allocation {real_id!r}")
                result = await _attempt_release(real_id)
                if result:
                    return result
                verified = await _verify_allocation_released(reference, real_id)
                if verified:
                    return verified
        except Exception as exc:
            logger.error(f"[ACCEPT_DELIVERY] self-heal lookup failed for reference={reference!r}: {exc}")

    logger.error(
        f"[ACCEPT_DELIVERY] release failed for allocation {allocation_id!r} "
        f"(reference={reference!r}): {LAST_ACCEPT_DELIVERY_ERROR or 'unknown'}"
    )
    return None


async def refund_allocation(allocation_id: str) -> Dict[str, Any]:
    """
    Refund an allocation back to the buyer (dispute resolved in the buyer's favour,
    or admin refund). This is the escrow-correct way to return funds: TradeSafe moves
    the held value back to the buyer's token (per the token's refund interval, WALLET),
    from where it can be withdrawn to the buyer's bank.

    Returns {"success": bool, "state"|"error": ...}. NEVER raises — callers decide
    how to surface failures. Single mutation only (no blind cascade) so a refund can
    never be double-executed.

    NOTE: the mutation name `allocationRefund` comes from the codebase's existing
    refund TODO; verify it against TradeSafe's schema in the sandbox. If it's wrong,
    the surfaced error ("Cannot query field …") names the correct one to swap in.
    """
    logger.info(f"[REFUND] Calling allocationRefund — allocation_id={allocation_id!r}")

    mutation = """
    mutation allocationRefund($id: ID!) {
        allocationRefund(id: $id) {
            id
            state
        }
    }
    """

    result = await execute_graphql(mutation, {"id": allocation_id})
    logger.info(f"[REFUND] Raw TradeSafe response: {result}")

    if result and "errors" in result:
        err = result["errors"][0].get("message", "unknown") if result["errors"] else "unknown"
        debug = (result["errors"][0].get("extensions") or {}).get("debugMessage", "") if result["errors"] else ""
        logger.error(f"[REFUND] TradeSafe error for allocation {allocation_id!r}: {err} | debug: {debug}")
        return {"success": False, "error": f"{err}{(' — ' + debug) if debug else ''}"}

    if result and "allocationRefund" in result:
        refund_result = result["allocationRefund"] or {}
        logger.info(f"[REFUND] Success allocation={allocation_id!r} state={refund_result.get('state')!r}")
        return {"success": True, "state": refund_result.get("state"), "allocation_id": allocation_id}

    logger.error(f"[REFUND] Unexpected response allocation={allocation_id!r}: {result}")
    return {"success": False, "error": "Unexpected response from TradeSafe allocationRefund"}


async def get_transaction_by_reference(reference: str) -> Optional[Dict[str, Any]]:
    """
    Find a TradeSafe transaction by internal reference.
    """
    query = """
    query transactions($reference: String) {
        transactions(first: 1, reference: $reference) {
            data {
                id
                uuid
                reference
                state
                title
                allocations {
                    id
                    title
                    value
                    state
                }
            }
        }
    }
    """
    
    result = await execute_graphql(query, {"reference": reference})
    
    if result and result.get('transactions', {}).get('data'):
        return result['transactions']['data'][0]
    
    return None


def validate_minimum_transaction(amount: float) -> tuple:
    """
    Validate that transaction meets minimum amount requirement.
    
    Returns:
        (is_valid, error_message)
    """
    if amount < MINIMUM_TRANSACTION_AMOUNT:
        return False, settings.MINIMUM_TRANSACTION_MESSAGE
    return True, ""


def calculate_fees(amount: float, fee_allocation: str = "split") -> Dict[str, float]:
    """
    Calculate fee breakdown for transaction display.
    TrustTrade charges 2% agent fee (minimum R5).
    TradeSafe also charges their payment processing fee.
    
    Args:
        amount: Transaction amount in ZAR
        fee_allocation: Who pays - "buyer", "seller", or "split"
    
    Returns:
        Fee breakdown dictionary
    """
    # TrustTrade fee: 2% with R5 minimum
    calculated_trusttrade = round(amount * (PLATFORM_FEE_PERCENT / 100), 2)
    trusttrade_fee = max(calculated_trusttrade, MINIMUM_FEE_RANDS)
    
    # Estimated payment processing fee (approximately 2.5% for card payments)
    processing_fee = round(amount * 0.025, 2)
    
    total_fees = trusttrade_fee + processing_fee
    
    if fee_allocation.lower() == "buyer":
        buyer_pays = total_fees
        seller_pays = 0
        buyer_total = amount + total_fees
        seller_receives = amount
    elif fee_allocation.lower() == "seller":
        buyer_pays = 0
        seller_pays = total_fees
        buyer_total = amount
        seller_receives = amount - total_fees
    else:  # split 50/50
        buyer_pays = total_fees / 2
        seller_pays = total_fees / 2
        buyer_total = amount + buyer_pays
        seller_receives = amount - seller_pays
    
    return {
        "item_amount": amount,
        "trusttrade_fee": trusttrade_fee,
        "estimated_payment_fee": processing_fee,
        "total_fees": total_fees,
        "fee_allocation": fee_allocation,
        "buyer_pays_fees": round(buyer_pays, 2),
        "seller_pays_fees": round(seller_pays, 2),
        "buyer_total": round(buyer_total, 2),
        "seller_receives": round(seller_receives, 2)
    }


def map_tradesafe_state_to_status(state: str) -> str:
    """
    Map TradeSafe transaction state to TrustTrade payment status.
    """
    state_map = {
        "CREATED": "Awaiting Payment",
        "PENDING": "Awaiting Payment",
        "FUNDS_RECEIVED": "Funds Secured",
        "INITIATED": "Delivery in Progress",
        "SENT": "Item Dispatched",
        "DELIVERED": "Awaiting Buyer Confirmation",
        "FUNDS_RELEASED": "Released",
        "CANCELLED": "Cancelled",
        "DISPUTED": "Disputed",
        "REFUNDED": "Refunded"
    }
    return state_map.get(state, state)


# Transaction state constants for webhook handling
class TransactionState:
    CREATED = "CREATED"
    PENDING = "PENDING"
    FUNDS_RECEIVED = "FUNDS_RECEIVED"
    INITIATED = "INITIATED"
    SENT = "SENT"
    DELIVERED = "DELIVERED"
    FUNDS_RELEASED = "FUNDS_RELEASED"
    CANCELLED = "CANCELLED"
    DISPUTED = "DISPUTED"
    REFUNDED = "REFUNDED"



async def update_user_banking_details(
    user_id: str,
    email: str,
    bank_name: str,
    account_holder: str,
    account_number: str,
    branch_code: str,
    account_type: str = "savings"
) -> Dict[str, Any]:
    """
    Send user banking details to TradeSafe for payouts.
    Note: In production, this would use TradeSafe's tokenUpdate mutation.
    For MVP, we return success and let the local flag be set.
    """
    logger.info(f"Updating banking details for user {user_id} via TradeSafe")
    
    # In production, this would call TradeSafe API to update banking details
    # For now, return success to allow the flow to continue
    # The actual banking integration would use TradeSafe's tokenUpdate mutation
    
    return {
        "success": True,
        "message": "Banking details submitted successfully"
    }


async def update_token_banking_details(
    token_id: str,
    bank_name: str,
    account_holder: str,
    account_number: str,
    branch_code: str,
    account_type: str = "SAVINGS",
    id_number: str = None,
    payout_interval: str = "IMMEDIATE",
    refund_interval: str = "WALLET"
) -> Dict[str, Any]:
    """
    Update a TradeSafe token with banking details and payout settings.
    Uses tokenUpdate mutation to attach banking and set payout/refund intervals.
    """
    logger.info("=== TOKEN UPDATE (BANKING) ===")
    logger.info(f"Token ID: {token_id}")
    logger.info(f"Bank: {bank_name}, Account: ***{account_number[-4:] if account_number else 'N/A'}")
    logger.info(f"Payout: {payout_interval}, Refund: {refund_interval}")

    # ROOT GUARD: refuse to attach a truncated/invalid account number to a TradeSafe
    # token. Letting a short number through silently is what causes RJCT payouts.
    acct_check = validate_account_number_for_sync(account_number)
    if not acct_check["valid"]:
        logger.error(
            f"[TOKEN_UPDATE] REJECTED — invalid account number for token {token_id}: "
            f"{acct_check['error']} (code={acct_check['code']})"
        )
        return {
            "success": False,
            "error": acct_check["error"],
            "code": acct_check["code"],
            "field": "account_number",
        }
    account_number = acct_check["cleaned"]

    # Map account type
    account_type_map = {
        "savings": "SAVINGS",
        "checking": "CHEQUE",
        "cheque": "CHEQUE",
        "current": "CHEQUE",
        "SAVINGS": "SAVINGS",
        "CHEQUE": "CHEQUE",
    }
    ts_account_type = account_type_map.get(account_type.lower() if account_type else "savings", "SAVINGS")
    
    mutation = """
    mutation tokenUpdate($id: ID!, $input: TokenInput!) {
        tokenUpdate(id: $id, input: $input) {
            id
            name
            balance
            settings {
                payout {
                    interval
                }
            }
        }
    }
    """
    
    # Build the update payload
    variables = {
        "id": token_id,
        "input": {
            "settings": {
                "payout": {
                    "interval": payout_interval,
                    "refund": refund_interval or "WALLET"
                }
            },
            "bankAccount": {
                "bank": bank_name.upper().replace(" ", "_"),
                "accountNumber": account_number,
                "branchCode": branch_code,
                "accountType": ts_account_type
            }
        }
    }
    
    # Add ID number if provided
    if id_number:
        variables["input"]["user"] = {
            "idNumber": id_number,
            "idType": "NATIONAL",
            "idCountry": "ZAF"
        }
    
    logger.info(f"Calling tokenUpdate with variables: {variables}")
    logger.info(f"[PAYOUT_SYNC] FINAL VARIABLES: {variables}")
    result = await execute_graphql(mutation, variables)
    logger.info(f"[PAYOUT_SYNC] TradeSafe Response: {result}")
    
    if result and 'errors' in result:
        error_msg = result['errors'][0].get('message', 'Unknown error') if result['errors'] else 'Unknown error'
        logger.error(f"Token update failed: {error_msg}")
        logger.error(f"Full errors: {result['errors']}")
        return {"success": False, "error": error_msg}
    
    if result and 'tokenUpdate' in result:
        logger.info(f"Token updated successfully: {result['tokenUpdate']}")
        return {
            "success": True,
            "token_id": result['tokenUpdate'].get('id'),
            "balance": result['tokenUpdate'].get('balance'),
            "settings": result['tokenUpdate'].get('settings')
        }
    
    logger.error(f"Unexpected response from tokenUpdate: {result}")
    return {"success": False, "error": "Unexpected response"}


async def update_token_payout(token_id: str, interval: str = "WALLET") -> Dict[str, Any]:
    """Update only the payout interval on a TradeSafe token (no banking changes).
    Fetches existing user fields first — TradeSafe requires user in every tokenUpdate."""
    org_token_id = os.environ.get("TRUSTTRADE_ORG_TOKEN_ID", "")
    if token_id == org_token_id:
        interval = "WALLET"
    logger.info(f"[UPDATE_TOKEN_PAYOUT] token={token_id} interval={interval} refund=WALLET")

    existing = await get_token_details(token_id)
    if not existing:
        return {"success": False, "error": f"Could not fetch token {token_id} before update"}
    existing_user = existing.get("user") or {}

    user_input = {}
    for field in ("givenName", "familyName", "email", "mobile"):
        if existing_user.get(field):
            user_input[field] = existing_user[field]

    if not user_input:
        return {"success": False, "error": "Token has no user fields — cannot satisfy TradeSafe tokenUpdate requirement"}

    mutation = """
    mutation tokenUpdate($id: ID!, $input: TokenInput!) {
        tokenUpdate(id: $id, input: $input) {
            id
            name
            balance
            settings {
                payout {
                    interval
                }
            }
        }
    }
    """
    variables = {
        "id": token_id,
        "input": {
            "user": user_input,
            "settings": {
                "payout": {
                    "interval": interval,
                    "refund": "WALLET",
                }
            }
        }
    }
    result = await execute_graphql(mutation, variables)
    logger.info(f"[UPDATE_TOKEN_PAYOUT] response: {result}")
    if result and "errors" in result:
        error_msg = result["errors"][0].get("message", "Unknown error") if result["errors"] else "Unknown error"
        logger.error(f"[UPDATE_TOKEN_PAYOUT] failed: {error_msg}")
        return {"success": False, "error": error_msg}
    if result and "tokenUpdate" in result:
        updated = result["tokenUpdate"]
        return {
            "success": True,
            "token_id": updated.get("id"),
            "balance": updated.get("balance"),
            "payout_interval": (updated.get("settings") or {}).get("payout", {}).get("interval"),
        }
    return {"success": False, "error": "Unexpected response"}


async def get_token_details(token_id: str) -> Optional[Dict[str, Any]]:
    """
    Get details of a TradeSafe token including balance, banking info, and settings.
    Returns comprehensive token information for admin review.
    """
    logger.info("=== GET TOKEN DETAILS ===")
    logger.info(f"Token ID: {token_id}")
    
    query = """
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
                idNumber
            }
            bankAccount {
                bank
                accountNumber
                branchCode
                accountType
            }
            settings {
                payout {
                    interval
                }
            }
        }
    }
    """
    
    variables = {"id": token_id}
    result = await execute_graphql(query, variables)
    
    if result and 'errors' in result:
        logger.error(f"GraphQL errors: {result['errors']}")
        return None
    
    if result and 'token' in result:
        token = result['token']
        logger.info(f"Token details: {token}")
        
        # Add derived fields for admin convenience. TradeSafe returns token
        # balances as ZAR decimal values, not cents.
        has_banking = bool(token.get('bankAccount') and token['bankAccount'].get('accountNumber'))
        raw_balance = token.get('balance') or 0
        try:
            balance_rands = round(float(raw_balance), 2)
        except (TypeError, ValueError):
            balance_rands = None
        
        return {
            **token,
            'has_banking_details': has_banking,
            'balance_raw': raw_balance,
            'balance_unit': 'ZAR',
            'balance_rands': balance_rands,
            'is_active': token.get('valid', True),  # 'valid' indicates if token is usable
            'is_reusable': True  # Tokens are designed to be reusable per user
        }
    
    logger.error(f"Failed to get token details: {result}")
    return None


async def get_token_statement(token_id: str, first: int = 50, page: int = 1) -> Dict[str, Any]:
    """
    Fetch the TradeSafe ledger for a token. This is read-only and is used for
    payout reconciliation: debits, credits, PDNG/ACSP status, references, dates.
    """
    first = max(1, min(int(first or 50), 100))
    page = max(1, int(page or 1))

    query = """
    query statement($id: ID!, $first: Int!, $page: Int) {
        tokenStatement(id: $id, first: $first, page: $page) {
            data {
                type
                amount
                status
                reference
                createdAt
                updatedAt
            }
            paginatorInfo {
                currentPage
                lastPage
                hasMorePages
                total
                count
            }
        }
    }
    """

    result = await execute_graphql(query, {"id": token_id, "first": first, "page": page})
    logger.info(f"[TOKEN_STATEMENT] token={token_id} page={page} first={first} response={result}")

    if result and "errors" in result:
        return {
            "success": False,
            "token_id": token_id,
            "entries": [],
            "paginator": None,
            "error": result["errors"],
        }

    statement = (result or {}).get("tokenStatement") or {}
    return {
        "success": bool(statement),
        "token_id": token_id,
        "entries": statement.get("data") or [],
        "paginator": statement.get("paginatorInfo"),
    }


async def get_all_tokens() -> List[Dict[str, Any]]:
    """
    Fetch ALL tokens from TradeSafe using page-based pagination (Laravel style).
    TradeSafe uses page/first variables, not cursor-based pagination.
    """
    # TradeSafe uses Laravel GraphQL pagination: page + first, paginatorInfo has currentPage/lastPage.
    # createdAt is requested so token selection can prefer the most recently created token, but it is
    # injected via a flag so we can transparently fall back if the API rejects the field (see below).
    def _build_query(include_created_at: bool) -> str:
        created_at_line = "createdAt" if include_created_at else ""
        return """
    query tokens($first: Int!, $page: Int) {
        tokens(first: $first, page: $page) {
            data {
                id
                name
                balance
                valid
                %s
                user {
                    givenName
                    familyName
                    email
                    mobile
                }
                bankAccount {
                    bank
                    accountNumber
                    accountType
                }
                settings {
                    payout {
                        interval
                    }
                }
            }
            paginatorInfo {
                currentPage
                lastPage
                hasMorePages
                total
            }
        }
    }
    """ % created_at_line

    include_created_at = True
    query = _build_query(include_created_at)

    all_tokens = []
    current_page = 1

    while True:
        variables = {"first": 50, "page": current_page}
        logger.info(f"get_all_tokens: fetching page {current_page} (first=50)")

        result = await execute_graphql(query, variables)
        logger.info(f"get_all_tokens: raw TradeSafe response page {current_page}: {result}")

        # If TradeSafe rejects the createdAt field, retry the same page without it so token
        # selection still works (we just lose the recency tie-break in that rare case).
        if include_created_at and result and "errors" in result:
            logger.warning(
                "get_all_tokens: tokens query failed with createdAt — retrying without it. "
                f"errors={result.get('errors')}"
            )
            include_created_at = False
            query = _build_query(include_created_at)
            result = await execute_graphql(query, variables)
            logger.info(f"get_all_tokens: retry (no createdAt) response page {current_page}: {result}")

        if not result or "tokens" not in result:
            logger.error(f"get_all_tokens: unexpected/empty response on page {current_page}: {result}")
            break

        page_data = result["tokens"]
        batch = page_data.get("data") or []
        all_tokens.extend(batch)

        paginator = page_data.get("paginatorInfo") or {}
        logger.info(f"get_all_tokens: page {current_page} — got {len(batch)} tokens, paginatorInfo={paginator}")

        if not paginator.get("hasMorePages"):
            break
        current_page += 1

    logger.info(f"get_all_tokens: fetched {len(all_tokens)} tokens total across {current_page} page(s)")
    return all_tokens


async def check_payout_readiness(seller_token_id: str) -> Dict[str, Any]:
    """
    Check if a seller token is ready for payout after funds release.
    This queries TradeSafe LIVE to verify actual token state.
    
    Returns:
        {
            "ready": bool,
            "payout_ready": bool,  # Alias for ready
            "token_id": str,
            "has_banking": bool,
            "has_mobile": bool,
            "balance_cents": int,
            "balance_rands": float,
            "bank_account": dict or None,
            "user": dict or None,
            "issues": list[str]
        }
    """
    logger.info(f"[PAYOUT_CHECK] === Checking payout readiness for token: {seller_token_id} ===")
    
    if not seller_token_id:
        logger.error("[PAYOUT_CHECK] FAILED: No seller token ID provided")
        return {
            "ready": False,
            "payout_ready": False,
            "token_id": None,
            "has_banking": False,
            "has_mobile": False,
            "balance_cents": 0,
            "balance_rands": 0,
            "bank_account": None,
            "user": None,
            "issues": ["No seller token ID stored for this transaction"]
        }
    
    token_details = await get_token_details(seller_token_id)
    
    if not token_details:
        logger.error(f"[PAYOUT_CHECK] FAILED: Could not fetch token {seller_token_id} from TradeSafe")
        return {
            "ready": False,
            "payout_ready": False,
            "token_id": seller_token_id,
            "has_banking": False,
            "has_mobile": False,
            "balance_cents": 0,
            "balance_rands": 0,
            "bank_account": None,
            "user": None,
            "issues": ["Could not fetch token details from TradeSafe"]
        }
    
    issues = []
    
    # Check banking details on the LIVE token
    bank_account = token_details.get('bankAccount')
    has_banking = bool(bank_account and bank_account.get('accountNumber'))
    
    # Check mobile on the LIVE token
    user_info = token_details.get('user', {})
    has_mobile = bool(user_info.get('mobile'))
    payout_settings = ((token_details.get('settings') or {}).get('payout') or {})
    payout_interval = payout_settings.get('interval')
    
    # TradeSafe returns token.balance as ZAR decimal, not cents.
    balance_raw = token_details.get('balance', 0)
    try:
        balance_rands = round(float(balance_raw), 2)
    except (TypeError, ValueError):
        balance_rands = 0
    
    # Build issues list
    if not has_banking:
        issues.append("Banking details not attached to TradeSafe token")
    if not has_mobile:
        issues.append("Mobile number not set on TradeSafe token")
    if payout_interval != "IMMEDIATE":
        issues.append("Payout interval is not IMMEDIATE")
    
    is_ready = has_banking and has_mobile and payout_interval == "IMMEDIATE"
    
    # Detailed logging
    logger.info(f"[PAYOUT_CHECK] Token ID: {seller_token_id}")
    logger.info(f"[PAYOUT_CHECK] Has Banking: {has_banking}")
    if has_banking and bank_account:
        logger.info(f"[PAYOUT_CHECK] Bank: {bank_account.get('bank')}, Account: ***{str(bank_account.get('accountNumber', ''))[-4:]}")
    logger.info(f"[PAYOUT_CHECK] Has Mobile: {has_mobile}")
    if has_mobile:
        mobile = user_info.get('mobile', '')
        logger.info(f"[PAYOUT_CHECK] Mobile: {mobile[:6]}***{mobile[-2:] if len(mobile) > 6 else ''}")
    logger.info(f"[PAYOUT_CHECK] Balance: R{balance_rands:.2f}")
    logger.info(f"[PAYOUT_CHECK] Payout interval: {payout_interval}")
    logger.info(f"[PAYOUT_CHECK] READY: {is_ready}")
    
    if issues:
        logger.warning(f"[PAYOUT_CHECK] Issues: {issues}")
    else:
        logger.info(f"[PAYOUT_READY] Token {seller_token_id} is ready for payout")
    
    return {
        "ready": is_ready,
        "payout_ready": is_ready,  # Alias for frontend consistency
        "token_id": seller_token_id,
        "has_banking": has_banking,
        "has_mobile": has_mobile,
        "payout_interval": payout_interval,
        "ready_for_fast_payout": is_ready,
        "balance": balance_rands,
        "balance_raw": balance_raw,
        "balance_unit": "ZAR",
        "balance_rands": balance_rands,
        "bank_account": bank_account,
        "user": user_info,
        "issues": issues
    }


async def sync_banking_to_token(
    token_id: str,
    bank_name: str,
    account_number: str,
    branch_code: str,
    account_type: str,
    mobile: str = None,
    user=None,
    transaction=None,
    given_name: str = None,
    family_name: str = None,
    email: str = None,
) -> Dict[str, Any]:
    """
    Sync banking details to a TradeSafe token for payout.
    Used at escrow creation and by admin to fix tokens missing banking info.

    This function is intentionally crash-proof: any internal failure is logged
    and returned as {"success": False, "error": ...} so callers (release flow)
    can decide how to proceed instead of propagating exceptions.
    """
    try:
        return await _sync_banking_to_token_impl(
            token_id=token_id,
            bank_name=bank_name,
            account_number=account_number,
            branch_code=branch_code,
            account_type=account_type,
            mobile=mobile,
            user=user,
            transaction=transaction,
            given_name=given_name,
            family_name=family_name,
            email=email,
        )
    except Exception as e:
        logger.exception(f"[PAYOUT_SYNC] UNEXPECTED EXCEPTION for token {token_id}: {e}")
        return {"success": False, "error": f"Unexpected exception: {e}"}


async def _sync_banking_to_token_impl(
    token_id: str,
    bank_name: str,
    account_number: str,
    branch_code: str,
    account_type: str,
    mobile: str = None,
    user=None,
    transaction=None,
    given_name: str = None,
    family_name: str = None,
    email: str = None,
) -> Dict[str, Any]:
    logger.info("=" * 60)
    logger.info("[PAYOUT_SYNC] === Syncing Banking to Token ===")
    logger.info(f"[PAYOUT_SYNC] Token ID: {token_id}")

    if not token_id:
        logger.error("[PAYOUT_SYNC] FAILED: No token ID provided")
        return {"success": False, "error": "No token ID provided"}

    if not bank_name or not account_number:
        logger.error("[PAYOUT_SYNC] FAILED: Missing bank_name or account_number")
        return {"success": False, "error": "Missing required banking fields", "code": "MISSING"}

    # ROOT GUARD: every path that attaches banking to a TradeSafe token funnels
    # through this function (pre-escrow pre_sync, admin force-sync, banking change
    # activation, smart-deals seller sync, withdrawal retry). A short / non-digit
    # account_number here is what produced silent RJCT payouts and the
    # 4-digit-truncation incident, so we hard-fail before the API call rather
    # than letting TradeSafe quietly accept a bad value.
    acct_check = validate_account_number_for_sync(account_number)
    if not acct_check["valid"]:
        logger.error(
            f"[PAYOUT_SYNC] REJECTED — invalid account number for token {token_id}: "
            f"{acct_check['error']} (code={acct_check['code']})"
        )
        return {
            "success": False,
            "error": acct_check["error"],
            "code": acct_check["code"],
            "field": "account_number",
        }
    account_number = acct_check["cleaned"]

    # Map bank name to exact TradeSafe enum
    try:
        bank_enum = map_bank_to_tradesafe_enum(bank_name)
    except ValueError as e:
        logger.error(f"[PAYOUT_SYNC] FAILED: {str(e)}")
        return {"success": False, "error": str(e)}

    # Normalize account type
    account_type_map = {
        "savings": "SAVINGS",
        "cheque": "CHEQUE",
        "checking": "CHEQUE",
        "current": "CHEQUE",
    }
    account_type_normalized = account_type_map.get(
        account_type.lower() if account_type else "savings",
        "SAVINGS"
    )

    # Resolve user fields
    resolved_given_name = _first_non_empty(
        given_name,
        _get(user, "first_name"),
        _get(user, "given_name"),
        _get(user, "givenName"),
    )
    resolved_family_name = _first_non_empty(
        family_name,
        _get(user, "last_name"),
        _get(user, "family_name"),
        _get(user, "familyName"),
    )
    resolved_email = _first_non_empty(
        email,
        _get(user, "email"),
        _get(transaction, "seller_email"),
    )

    # Normalize mobile
    resolved_mobile = _first_non_empty(
        mobile,
        _get(user, "mobile"),
        _get(user, "phone"),
        _get(transaction, "seller_phone"),
    )

    # Visibility for debugging — these are the exact sources the sync saw.
    logger.info(f"[PAYOUT_SYNC] user.mobile={_get(user, 'mobile')}")
    logger.info(f"[PAYOUT_SYNC] user.phone={_get(user, 'phone')}")
    logger.info(f"[PAYOUT_SYNC] transaction.seller_phone={_get(transaction, 'seller_phone')}")

    mobile_normalized = None
    if resolved_mobile:
        mobile_normalized = _normalize_mobile(str(resolved_mobile))

    # If any user field is missing, fetch the existing token so we can fill
    # in the gaps. This ensures tokenUpdate always receives a complete user
    # object and never clears fields that are already set on TradeSafe.
    needs_token_fetch = (
        not mobile_normalized
        or not resolved_given_name
        or not resolved_family_name
        or not resolved_email
    )
    existing_token_user: Dict[str, Any] = {}
    if needs_token_fetch:
        logger.info(f"[PAYOUT_SYNC] Fetching existing token to fill missing user fields for {token_id}")
        try:
            existing_token = await get_token_details(token_id)
            existing_token_user = _get(existing_token, "user") or {}
        except Exception as e:
            logger.error(f"[PAYOUT_SYNC] Failed to fetch existing token {token_id}: {e}")

    if not mobile_normalized:
        existing_mobile = existing_token_user.get("mobile")
        if existing_mobile:
            mobile_normalized = _normalize_mobile(str(existing_mobile))
            logger.info(f"[PAYOUT_SYNC] Recovered mobile from TradeSafe token {token_id}")
        else:
            logger.warning(
                f"[PAYOUT_SYNC] No mobile found anywhere for token {token_id} - "
                "will send tokenUpdate without mobile field"
            )

    # Fill in name/email from the existing token when not available locally
    if not resolved_given_name:
        resolved_given_name = existing_token_user.get("givenName")
    if not resolved_family_name:
        resolved_family_name = existing_token_user.get("familyName")
    if not resolved_email:
        resolved_email = existing_token_user.get("email")

    # Log masked payload
    masked_account = f"***{account_number[-4:]}" if account_number and len(account_number) >= 4 else "****"
    if mobile_normalized and len(mobile_normalized) > 6:
        masked_mobile = f"{mobile_normalized[:6]}***{mobile_normalized[-2:]}"
    else:
        masked_mobile = mobile_normalized or "N/A"

    logger.info(f"[PAYOUT_SYNC] Bank Enum: {bank_enum}")
    logger.info(f"[PAYOUT_SYNC] Account: {masked_account}")
    logger.info(f"[PAYOUT_SYNC] Branch Code: {branch_code or 'N/A'}")
    logger.info(f"[PAYOUT_SYNC] Account Type: {account_type_normalized}")
    logger.info(f"[PAYOUT_SYNC] Mobile: {masked_mobile}")
    logger.info(f"[PAYOUT_SYNC] Sending mobile: {mobile_normalized}")
    logger.info(f"[PAYOUT_SYNC] Email: {resolved_email or 'N/A'}")
    logger.info(f"[PAYOUT_SYNC] Name: {(resolved_given_name or '').strip()} {(resolved_family_name or '').strip()}".strip())

    mutation = """
    mutation TokenUpdate($id: ID!, $input: TokenInput!) {
        tokenUpdate(id: $id, input: $input) {
            id
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
    }
}
"""

    # Build user sub-object from whatever we have; omit keys with empty values
    # so TradeSafe won't receive `null` and reject the mutation outright.
    user_input: Dict[str, Any] = {}
    if resolved_given_name:
        user_input["givenName"] = resolved_given_name
    if resolved_family_name:
        user_input["familyName"] = resolved_family_name
    if resolved_email:
        user_input["email"] = resolved_email
    if mobile_normalized:
        user_input["mobile"] = mobile_normalized

    
    input_payload: Dict[str, Any] = {
        "bankAccount": {
            "bank": bank_enum,
            "accountNumber": account_number,
            "branchCode": branch_code,
            "accountType": account_type_normalized,
        },
        "settings": {
            "payout": {
                "interval": "IMMEDIATE",
                "refund": "WALLET"
            }
        },
    }
    
    if user_input:
        input_payload["user"] = user_input
    else:
        logger.warning(
            f"[PAYOUT_SYNC] No user fields available - sending bankAccount only for token {token_id}"
        )

    variables = {
        "id": token_id,
        "input": input_payload,
    }

    logger.info("[PAYOUT_SYNC] Calling TradeSafe tokenUpdate...")

    try:
        logger.info(f"[PAYOUT_SYNC] FINAL VARIABLES: {variables}")
        result = await execute_graphql(mutation, variables)
    except Exception as e:
        logger.error(f"[PAYOUT_SYNC] FAILED: exception during tokenUpdate - {e}")
        logger.info("=" * 60)
        return {"success": False, "error": f"tokenUpdate call raised: {e}"}

    logger.info(f"[PAYOUT_SYNC] TradeSafe Response: {result}")

    if result and "errors" in result:
        error_msg = result["errors"][0].get("message", "Unknown error")
        debug_msg = result["errors"][0].get("extensions", {}).get("debugMessage", "")
        logger.error(f"[PAYOUT_SYNC] FAILED: {error_msg}")
        if debug_msg:
            logger.error(f"[PAYOUT_SYNC] Debug: {debug_msg}")
        logger.info("=" * 60)
        return {"success": False, "error": error_msg, "debug": debug_msg}

    if result and "tokenUpdate" in result:
        token_result = result["tokenUpdate"]
        new_bank = token_result.get("bankAccount", {}) or {}
        new_account = new_bank.get("accountNumber", "")

        if new_account and new_account == account_number:
            logger.info(f"[PAYOUT_SYNC] SUCCESS - Banking attached to token {token_id}")
            logger.info(f"[PAYOUT_SYNC] Verified Bank: {new_bank.get('bank')}")
            logger.info(f"[PAYOUT_SYNC] Verified Account: ***{new_account[-4:]}")
            logger.info("=" * 60)
            return {"success": True, "token": token_result}

        logger.warning("[PAYOUT_SYNC] Response received but banking not confirmed")
        logger.info("=" * 60)
        return {"success": True, "token": token_result, "warning": "Banking may not have been fully applied"}

    logger.error("[PAYOUT_SYNC] FAILED: Unexpected response")
    logger.info("=" * 60)
    return {"success": False, "error": "Unexpected response from TradeSafe"}


async def request_token_withdrawal(token_id: str, amount_cents: int) -> Dict[str, Any]:
    """
    Request withdrawal from a token wallet.
    Amount is in cents (e.g., R100 = 10000 cents).
    NOTE: tokenAccountWithdraw returns Boolean, not an object.
    NOTE: TradeSafe expects value in RANDS (Float), not cents.
    """
    logger.info("=== TOKEN WITHDRAWAL REQUEST ===")
    logger.info(f"Token ID: {token_id}, Amount: {amount_cents} cents")
    
    # Convert cents to rands (TradeSafe expects Float in rands)
    amount_rands = amount_cents / 100.0
    logger.info(f"Value sent: R{amount_rands:.2f}")
    
    mutation = """
    mutation tokenAccountWithdraw($id: ID!, $value: Float!) {
        tokenAccountWithdraw(id: $id, value: $value)
    }
    """
    
    variables = {
        "id": token_id,
        "value": amount_rands
    }
    
    result = await execute_graphql(mutation, variables)
    
    if result and 'errors' in result:
        error_msg = result['errors'][0].get('message', 'Unknown error') if result['errors'] else 'Unknown error'
        logger.error(f"Withdrawal failed: {error_msg}")
        return {"success": False, "error": error_msg}
    
    # tokenAccountWithdraw returns Boolean (true/false)
    if result and 'tokenAccountWithdraw' in result:
        withdrawal_success = result['tokenAccountWithdraw']
        logger.info(f"Withdrawal response: {withdrawal_success}")
        
        if withdrawal_success is True:
            return {
                "success": True,
                "token_id": token_id,
                "amount_withdrawn": amount_cents
            }
        else:
            return {"success": False, "error": "Withdrawal rejected by TradeSafe"}
    
    logger.error(f"Unexpected response from withdrawal: {result}")
    return {"success": False, "error": "Unexpected response"}


async def get_or_reuse_user_token(
    db,
    user_id: str,
    name: str,
    email: str,
    mobile: str = "+27000000000"
) -> Optional[str]:
    """
    Get existing token from user record or create new one.
    This ensures ONE persistent token per user.
    """
    logger.info("=== GET OR REUSE USER TOKEN ===")
    logger.info(f"User ID: {user_id}, Email: {email}")
    
    # Check if user already has a token
    user_doc = await db.users.find_one({"user_id": user_id})
    
    if user_doc and user_doc.get("tradesafe_token_id"):
        token_id = user_doc["tradesafe_token_id"]
        logger.info(f"REUSING existing token: {token_id}")
        return token_id
    
    # Create new token
    logger.info(f"CREATING new token for user {user_id}")
    
    # Split name into given/family name
    name_parts = name.strip().split(' ', 1)
    given_name = name_parts[0] if name_parts else "User"
    family_name = name_parts[1] if len(name_parts) > 1 else "User"
    
    # Ensure mobile is in +27 format
    if mobile and not mobile.startswith('+'):
        if mobile.startswith('0'):
            mobile = '+27' + mobile[1:]
        else:
            mobile = '+27' + mobile
    
    token_data = await create_user_token(
        given_name=given_name,
        family_name=family_name,
        email=email,
        mobile=mobile
    )
    
    if token_data and token_data.get('id'):
        token_id = token_data['id']
        logger.info(f"NEW token created: {token_id}")
        
        # Save to user record
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {
                "tradesafe_token_id": token_id,
                "tradesafe_token_reference": token_data.get('name', '')
            }}
        )
        logger.info("Token saved to user record")
        return token_id
    
    logger.error(f"Failed to create token for user {user_id}")
    return None



async def withdraw_token_full_balance(token_id: str) -> Dict[str, Any]:
    """
    Withdraw full balance from a TradeSafe token.
    Uses tokenWithdraw mutation for complete withdrawal.
    
    Prerequisites:
    - Token must be complete (has mobile + banking details)
    - Token must have balance > 0
    """
    logger.info("=== FULL TOKEN WITHDRAWAL ===")
    logger.info(f"Token ID: {token_id}")
    
    # First, get token details to validate
    query = """
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
        }
    }
    """
    
    token_result = await execute_graphql(query, {"id": token_id})
    
    logger.info(f"[WITHDRAW] Token query response: {token_result}")
    
    if token_result and 'errors' in token_result:
        error_msg = token_result['errors'][0].get('message', 'Unknown error')
        debug_msg = token_result['errors'][0].get('extensions', {}).get('debugMessage', '')
        logger.error(f"[WITHDRAW] Failed to fetch token: {error_msg}")
        logger.error(f"[WITHDRAW] Debug: {debug_msg}")
        return {
            "success": False, 
            "error": f"Failed to fetch token: {error_msg}",
            "debug_message": debug_msg,
            "raw_response": token_result
        }
    
    if not token_result or 'token' not in token_result:
        logger.error(f"[WITHDRAW] Token not found: {token_id}")
        return {"success": False, "error": "Token not found", "raw_response": token_result}
    
    token_data = token_result['token']
    balance = token_data.get('balance') or 0
    
    logger.info(f"[WITHDRAW] Balance RAW from TradeSafe: {balance}")
    
    has_mobile = bool(token_data.get('user') and token_data['user'].get('mobile'))
    has_banking = bool(token_data.get('bankAccount') and token_data['bankAccount'].get('accountNumber'))
    is_complete = has_mobile and has_banking
    
    logger.info(f"[WITHDRAW] Token status - Balance: {balance} cents, Complete: {is_complete}, Has Mobile: {has_mobile}, Has Banking: {has_banking}")
    
    # Validation
    if not is_complete:
        logger.error(f"[WITHDRAW] Token not complete - mobile: {has_mobile}, banking: {has_banking}")
        return {
            "success": False, 
            "error": "Token is not complete. Must have mobile number and banking details.",
            "has_mobile": has_mobile,
            "has_banking": has_banking,
            "debug_message": f"mobile={has_mobile}, banking={has_banking}"
        }
    
    if balance <= 0:
        logger.error(f"[WITHDRAW] Token has no balance: {balance}")
        return {
            "success": False, 
            "error": "Token has no balance to withdraw",
            "debug_message": f"balance={balance}"
        }
    
    # TradeSafe returns balance in ZAR (rands), not cents.
    # Convert to float for comparison and mutation value.
    try:
        balance_rands = round(float(balance), 2)
    except (TypeError, ValueError):
        balance_rands = 0.0

    MINIMUM_WITHDRAWAL_RANDS = 10.0  # R10 minimum due to payout fees
    if balance_rands < MINIMUM_WITHDRAWAL_RANDS:
        logger.error(f"[WITHDRAW] Balance R{balance_rands:.2f} below minimum R{MINIMUM_WITHDRAWAL_RANDS:.2f}")
        return {
            "success": False,
            "error": f"Minimum withdrawal is R{MINIMUM_WITHDRAWAL_RANDS:.2f} due to payout fees",
            "debug_message": f"Balance R{balance_rands:.2f} is below minimum R{MINIMUM_WITHDRAWAL_RANDS:.2f}",
            "balance_rands": balance_rands,
            "minimum_rands": MINIMUM_WITHDRAWAL_RANDS,
        }

    # Execute withdrawal mutation - TradeSafe requires BOTH token_id AND value
    # NOTE: tokenAccountWithdraw returns Boolean, NOT an object
    # NOTE: value is in RANDS (Float)
    mutation = """
    mutation tokenAccountWithdraw($id: ID!, $value: Float!) {
        tokenAccountWithdraw(id: $id, value: $value)
    }
    """

    withdrawal_value_rands = balance_rands
    
    logger.info(f"[WITHDRAW] Executing tokenAccountWithdraw for {token_id}")
    logger.info(f"[WITHDRAW] Value sent: R{withdrawal_value_rands:.2f}")
    
    result = await execute_graphql(mutation, {"id": token_id, "value": withdrawal_value_rands})
    
    logger.info(f"[WITHDRAW] Full TradeSafe response: {result}")
    
    if result and 'errors' in result:
        error_msg = result['errors'][0].get('message', 'Unknown error')
        debug_msg = result['errors'][0].get('extensions', {}).get('debugMessage', '')
        validation_errors = result['errors'][0].get('extensions', {}).get('validation', {})
        logger.error(f"[WITHDRAW] Withdrawal failed: {error_msg}")
        logger.error(f"[WITHDRAW] Debug message: {debug_msg}")
        logger.error(f"[WITHDRAW] Validation errors: {validation_errors}")
        logger.error(f"[WITHDRAW] Full error: {result['errors'][0]}")
        return {
            "success": False, 
            "error": error_msg,
            "debug_message": debug_msg or str(validation_errors) if validation_errors else None,
            "validation_errors": validation_errors,
            "raw_response": result
        }
    
    # tokenAccountWithdraw returns Boolean (true/false), not an object
    if result and 'tokenAccountWithdraw' in result:
        withdrawal_success = result['tokenAccountWithdraw']
        
        if withdrawal_success is True:
            logger.info(f"[WITHDRAW] SUCCESS - Token: {token_id}, Withdrawn: R{withdrawal_value_rands:.2f}")
            return {
                "success": True,
                "token_id": token_id,
                "amount_rands": withdrawal_value_rands,
                "new_balance_rands": 0.0,
                "message": "Withdrawal initiated successfully. Bank settlement may take up to 2 business days."
            }
        else:
            logger.error("[WITHDRAW] TradeSafe returned false for withdrawal")
            logger.error(f"[WITHDRAW] Full response: {result}")
            return {
                "success": False, 
                "error": "Withdrawal rejected by TradeSafe",
                "debug_message": "tokenAccountWithdraw returned false",
                "raw_response": result
            }
    
    logger.error(f"[WITHDRAW] Unexpected response: {result}")
    return {
        "success": False,
        "error": "Unexpected response from TradeSafe",
        "raw_response": result
    }


async def withdraw_token_funds_result(
    token_id: str,
    amount: float,
    rtc: bool = False,
    transaction_id: str = "",
    source: str = "",
) -> Dict[str, Any]:
    """Withdraw funds from a TradeSafe token wallet using standard EFT."""
    if rtc:
        logger.warning(
            f"[WITHDRAW_FUNDS] rtc=True requested but standard EFT is forced "
            f"txn={transaction_id or '-'} token={token_id}"
        )
    effective_rtc = False
    mutation = """
    mutation tokenWithdrawFunds($id: ID!, $value: Float!, $rtc: Boolean) {
        tokenAccountWithdraw(id: $id, value: $value, rtc: $rtc)
    }
    """
    variables = {"id": token_id, "value": round(float(amount), 2), "rtc": effective_rtc}
    result = await execute_graphql(mutation, variables)
    logger.info(
        f"[WITHDRAW_FUNDS] txn={transaction_id or '-'} token={token_id} "
        f"amount=R{amount:.2f} rtc={effective_rtc} source={source or '-'} response={result}"
    )

    if result and "errors" in result:
        logger.error(f"[WITHDRAW_FUNDS] txn={transaction_id or '-'} token={token_id} error={result['errors']}")
        first_error = result["errors"][0] if result["errors"] else {}
        return {
            "success": False,
            "error": first_error.get("message", "TradeSafe tokenAccountWithdraw failed"),
            "raw_response": result,
        }

    if result and "tokenAccountWithdraw" in result:
        success = bool(result["tokenAccountWithdraw"])
        return {
            "success": success,
            "error": None if success else "TradeSafe tokenAccountWithdraw returned false",
            "raw_response": result,
        }

    return {
        "success": False,
        "error": "Unexpected response from TradeSafe",
        "raw_response": result,
    }


async def withdraw_token_funds(
    token_id: str,
    amount: float,
    rtc: bool = False,
    transaction_id: str = "",
    source: str = "",
) -> bool:
    """Withdraw funds from a TradeSafe token wallet to the linked bank account using standard EFT."""
    result = await withdraw_token_funds_result(
        token_id,
        amount,
        rtc=rtc,
        transaction_id=transaction_id,
        source=source,
    )
    return bool(result.get("success"))


async def trigger_seller_bank_settlement(
    seller_token_id: str,
    net_amount: float,
    transaction_id: str = "",
    source: str = "release",
) -> Dict[str, Any]:
    """
    Call TOKEN_WITHDRAWAL for the seller's token immediately after FUNDS_RELEASED.
    Returns {"success": bool, "error": str | None}.
    """
    logger.info(
        f"[SETTLEMENT] Triggering bank settlement — "
        f"txn={transaction_id!r} token={seller_token_id!r} amount=R{net_amount:.2f} source={source!r}"
    )

    if not seller_token_id:
        logger.error(f"[SETTLEMENT] No seller token ID — txn={transaction_id!r}")
        return {"success": False, "error": "No seller token ID"}

    if net_amount <= 0:
        logger.error(f"[SETTLEMENT] Invalid net_amount={net_amount} — txn={transaction_id!r}")
        return {"success": False, "error": f"Invalid net_amount: {net_amount}"}

    try:
        ok = await withdraw_token_funds(seller_token_id, net_amount, rtc=False)
    except Exception as exc:
        logger.error(f"[SETTLEMENT] Exception during withdrawal — txn={transaction_id!r} token={seller_token_id!r}: {exc}")
        return {"success": False, "error": str(exc)}

    if ok:
        logger.info(
            f"[SETTLEMENT] SUCCESS — txn={transaction_id!r} token={seller_token_id!r} R{net_amount:.2f}"
        )
        return {"success": True, "error": None}

    logger.error(
        f"[SETTLEMENT] FAILED — TradeSafe returned false — "
        f"txn={transaction_id!r} token={seller_token_id!r} R{net_amount:.2f}"
    )
    return {"success": False, "error": "TradeSafe tokenAccountWithdraw returned false"}
