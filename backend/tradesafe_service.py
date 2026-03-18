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

# Load environment variables
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

logger = logging.getLogger(__name__)

# TradeSafe Configuration from Environment
TRADESAFE_CLIENT_ID = os.environ.get('TRADESAFE_CLIENT_ID', '')
TRADESAFE_CLIENT_SECRET = os.environ.get('TRADESAFE_CLIENT_SECRET', '')
TRADESAFE_AUTH_URL = os.environ.get('TRADESAFE_AUTH_URL', 'https://auth.tradesafe.co.za/oauth/token')
TRADESAFE_API_URL = os.environ.get('TRADESAFE_API_URL', 'https://api-developer.tradesafe.dev/graphql')
TRADESAFE_PAYMENT_URL = os.environ.get('TRADESAFE_PAYMENT_URL', 'https://pay-sandbox.tradesafe.dev')
TRADESAFE_ENV = os.environ.get('TRADESAFE_ENV', 'sandbox')

# TrustTrade Platform Settings
MINIMUM_TRANSACTION_AMOUNT = 500.0  # R500 minimum per user requirement
PLATFORM_FEE_PERCENT = 2.0  # TrustTrade 2% agent fee

# Redirect URLs after payment
PAYMENT_SUCCESS_URL = "https://trusttradesa.co.za/transaction/success"
PAYMENT_FAILURE_URL = "https://trusttradesa.co.za/transaction/failed"
PAYMENT_CANCEL_URL = "https://trusttradesa.co.za/transaction/cancelled"

# Payment methods allowed
ALLOWED_PAYMENT_METHODS = ["EFT", "CARD", "OZOW"]

# Cache for access token
_token_cache = {
    'access_token': None,
    'expires_at': None
}


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
    id_number: str = "8501015009087",  # Valid SA ID format for sandbox
    reference: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """
    Create a TrustTrade user token for a buyer or seller.
    Tokens are required before creating transactions.
    
    Required fields per API introspection: givenName, familyName, email, mobile, idNumber inside user object
    """
    mutation = """
    mutation tokenCreate($input: TokenInput!) {
        tokenCreate(input: $input) {
            id
            name
            reference
        }
    }
    """
    
    # Ensure mobile is in +27 format
    if mobile and not mobile.startswith('+'):
        if mobile.startswith('0'):
            mobile = '+27' + mobile[1:]
        else:
            mobile = '+27' + mobile
    
    # Default mobile if not provided
    if not mobile or len(mobile) < 10:
        mobile = "+27000000000"
    
    # API requires user data nested under "user" field
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
            }
        }
    }
    
    if reference:
        variables["input"]["reference"] = reference
    
    logger.info(f"Creating user token for {email} with fields: givenName={given_name}, familyName={family_name}, mobile={mobile}")
    
    result = await execute_graphql(mutation, variables)
    
    if result and 'errors' in result:
        error_msg = result['errors'][0].get('message', 'Unknown error') if result['errors'] else 'Unknown error'
        logger.error(f"Token creation failed for {email}: {error_msg}")
        return None
    
    if result and 'tokenCreate' in result:
        logger.info(f"Created user token for {email}: {result['tokenCreate'].get('id')}")
        return result['tokenCreate']
    
    logger.error(f"Token creation returned unexpected result for {email}: {result}")
    return None


async def get_or_create_user_token(
    name: str,
    email: str,
    mobile: str = "+27000000000",
    reference: Optional[str] = None
) -> Optional[str]:
    """
    Get existing or create new user token.
    Returns the token ID.
    """
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
    
    # First try to find existing token by email
    query = """
    query tokens($email: String) {
        tokens(first: 1, email: $email) {
            data {
                id
                name
                email
            }
        }
    }
    """
    
    logger.info(f"Looking for existing token for {email}")
    result = await execute_graphql(query, {"email": email})
    
    if result and 'errors' in result:
        logger.warning(f"Error checking existing tokens for {email}: {result['errors']}")
    elif result and result.get('tokens', {}).get('data'):
        existing = result['tokens']['data'][0]
        logger.info(f"Found existing token for {email}: {existing['id']}")
        return existing['id']
    
    # Create new token
    logger.info(f"No existing token found, creating new token for {email}")
    token_data = await create_user_token(
        given_name=given_name,
        family_name=family_name,
        email=email,
        mobile=mobile,
        reference=reference
    )
    
    if token_data:
        return token_data['id']
    
    logger.error(f"Failed to create token for {email}")
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
    fee_allocation: str = "SELLER",
    agent_fee_allocation: str = "SELLER"
) -> Optional[Dict[str, Any]]:
    """
    Create a new escrow transaction in TradeSafe.
    
    Args:
        internal_reference: TrustTrade internal transaction ID
        title: Transaction title
        description: Item/service description
        amount: Transaction amount in ZAR (Rands, not cents)
        buyer_name: Buyer's name
        buyer_email: Buyer's email
        seller_name: Seller's name
        seller_email: Seller's email
        fee_allocation: Who pays TradeSafe fee - BUYER, SELLER, or 50_50
        agent_fee_allocation: Who pays TrustTrade 2% fee - BUYER, SELLER, or 50_50
    
    Returns:
        TradeSafe transaction details or None on failure
    """
    # Validate minimum amount
    is_valid, error_msg = validate_minimum_transaction(amount)
    if not is_valid:
        logger.error(f"Transaction validation failed: {error_msg}")
        return {"error": error_msg}
    
    # Get or create tokens for buyer and seller
    buyer_token = await get_or_create_user_token(buyer_name, buyer_email, reference=f"buyer_{internal_reference}")
    seller_token = await get_or_create_user_token(seller_name, seller_email, reference=f"seller_{internal_reference}")
    
    if not buyer_token or not seller_token:
        logger.error(f"Failed to create user tokens - buyer: {buyer_token}, seller: {seller_token}")
        return {"error": "Verification failed. Please try again."}
    
    # Convert amount to cents for TradeSafe API
    amount_cents = int(amount * 100)
    
    # Map fee allocation to TradeSafe enum
    fee_map = {
        "buyer": "BUYER",
        "seller": "SELLER", 
        "split": "50_50",
        "50_50": "50_50"
    }
    tradesafe_fee_allocation = fee_map.get(fee_allocation.lower(), "SELLER")
    
    # GraphQL mutation for creating a transaction with parties and allocations
    mutation = """
    mutation transactionCreate($input: TransactionCreateInput!) {
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
                token
            }
            createdAt
        }
    }
    """
    
    variables = {
        "input": {
            "title": title,
            "description": description,
            "industry": "GENERAL_GOODS_SERVICES",
            "currency": "ZAR",
            "feeAllocation": tradesafe_fee_allocation,
            "reference": internal_reference,
            "privacy": "PRIVATE",
            "parties": [
                {
                    "role": "BUYER",
                    "token": buyer_token
                },
                {
                    "role": "SELLER",
                    "token": seller_token
                }
            ],
            "allocations": [
                {
                    "title": "Payment for item/service",
                    "description": description,
                    "value": amount_cents,
                    "daysToDeliver": 7,
                    "daysToInspect": 2
                }
            ]
        }
    }
    
    result = await execute_graphql(mutation, variables)
    
    if result and 'errors' in result:
        error_msg = result['errors'][0].get('message', 'Unknown error') if result['errors'] else 'Unknown error'
        logger.error(f"TradeSafe transaction creation failed: {error_msg}")
        return {"error": error_msg}
    
    if result and 'transactionCreate' in result:
        tx = result['transactionCreate']
        logger.info(f"Created TradeSafe transaction: {tx['id']} for {internal_reference}")
        return tx
    
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
                token
            }
        }
    }
    """
    
    result = await execute_graphql(query, {"id": tradesafe_id})
    
    if result and 'transaction' in result:
        return result['transaction']
    
    return None


async def get_payment_link(tradesafe_id: str) -> Optional[Dict[str, Any]]:
    """
    Get payment link and deposit details for a TradeSafe transaction.
    Returns the link that redirects buyer to payment page.
    """
    query = """
    query transaction($id: ID!) {
        transaction(id: $id) {
            id
            state
            deposit {
                paymentMethods
                paymentLink
                bankAccount {
                    bank
                    accountNumber
                    branchCode
                    accountType
                    reference
                }
                manualPaymentProcessing
            }
        }
    }
    """
    
    result = await execute_graphql(query, {"id": tradesafe_id})
    
    if result and 'transaction' in result:
        tx = result['transaction']
        deposit = tx.get('deposit', {})
        
        return {
            "tradesafe_id": tx['id'],
            "state": tx['state'],
            "payment_link": deposit.get('paymentLink'),
            "payment_methods": deposit.get('paymentMethods', ALLOWED_PAYMENT_METHODS),
            "bank_details": deposit.get('bankAccount'),
            "manual_processing": deposit.get('manualPaymentProcessing', False)
        }
    
    return None


async def start_delivery(allocation_id: str) -> Optional[Dict[str, Any]]:
    """
    Mark allocation as delivery started (seller initiates shipping).
    Call this when seller marks item as dispatched/delivered.
    """
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
    
    if result and 'allocationStartDelivery' in result:
        logger.info(f"Started delivery for allocation: {allocation_id}")
        return result['allocationStartDelivery']
    
    return None


async def accept_delivery(allocation_id: str) -> Optional[Dict[str, Any]]:
    """
    Accept delivery for an allocation (buyer confirms receipt).
    This triggers fund release to seller.
    """
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
    
    result = await execute_graphql(mutation, {"id": allocation_id})
    
    if result and 'allocationAcceptDelivery' in result:
        logger.info(f"Accepted delivery for allocation: {allocation_id}")
        return result['allocationAcceptDelivery']
    
    return None


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
    Validate that transaction meets minimum amount requirement (R500).
    
    Returns:
        (is_valid, error_message)
    """
    if amount < MINIMUM_TRANSACTION_AMOUNT:
        return False, f"Minimum transaction amount is R{MINIMUM_TRANSACTION_AMOUNT:.0f}"
    return True, ""


def calculate_fees(amount: float, fee_allocation: str = "split") -> Dict[str, float]:
    """
    Calculate fee breakdown for transaction display.
    TrustTrade charges 2% agent fee.
    TradeSafe also charges their fee (varies).
    
    Args:
        amount: Transaction amount in ZAR
        fee_allocation: Who pays - "buyer", "seller", or "split"
    
    Returns:
        Fee breakdown dictionary
    """
    trusttrade_fee = round(amount * (PLATFORM_FEE_PERCENT / 100), 2)
    
    # Estimated TradeSafe fee (approximately 2.5-3% depending on payment method)
    estimated_tradesafe_fee = round(amount * 0.025, 2)
    
    total_fees = trusttrade_fee + estimated_tradesafe_fee
    
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
        "estimated_payment_fee": estimated_tradesafe_fee,
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
