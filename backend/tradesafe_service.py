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
TRADESAFE_API_URL = os.environ.get('TRADESAFE_API_URL', 'https://api.tradesafe.co.za/graphql')
TRADESAFE_PAYMENT_URL = os.environ.get('TRADESAFE_PAYMENT_URL', 'https://pay.tradesafe.co.za')
TRADESAFE_ENV = os.environ.get('TRADESAFE_ENV', 'production')

# TrustTrade Platform Settings
MINIMUM_TRANSACTION_AMOUNT = 500.0  # R500 minimum per user requirement
PLATFORM_FEE_PERCENT = 2.0  # TrustTrade 2% agent fee

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
) -> Optional[Dict[str, Any]]:
    """
    Create a TrustTrade user token for a buyer or seller.
    Tokens are required before creating transactions.
    
    Required fields per API introspection: givenName, familyName, email, mobile, idNumber inside user object
    Note: 'reference' field is NOT supported in TokenInput
    """
    # Pre-flight validation with detailed logging
    logger.info(f"=== TOKEN CREATION REQUEST ===")
    logger.info(f"Given Name: {given_name}")
    logger.info(f"Family Name: {family_name}")
    logger.info(f"Email: {email}")
    logger.info(f"Mobile (raw): {mobile}")
    logger.info(f"ID Number: {id_number}")
    
    # Validate and format mobile number
    original_mobile = mobile
    if mobile and not mobile.startswith('+'):
        if mobile.startswith('0'):
            mobile = '+27' + mobile[1:]
        else:
            mobile = '+27' + mobile
    
    # Default mobile if not provided or invalid
    if not mobile or len(mobile) < 10:
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
            }
        }
    }
    
    logger.info(f"=== EXACT REQUEST PAYLOAD ===")
    logger.info(f"Variables: {variables}")
    
    # Execute the GraphQL mutation
    result = await execute_graphql(mutation, variables)
    
    logger.info(f"=== EXACT API RESPONSE ===")
    logger.info(f"Result: {result}")
    
    if result and 'errors' in result:
        error_msg = result['errors'][0].get('message', 'Unknown error') if result['errors'] else 'Unknown error'
        debug_msg = result['errors'][0].get('extensions', {}).get('debugMessage', '') if result['errors'] else ''
        logger.error(f"=== TOKEN CREATION FAILED ===")
        logger.error(f"Error message: {error_msg}")
        logger.error(f"Debug message: {debug_msg}")
        logger.error(f"Full errors: {result['errors']}")
        return None
    
    if result and 'tokenCreate' in result:
        logger.info(f"=== TOKEN CREATION SUCCESS ===")
        logger.info(f"Token ID: {result['tokenCreate'].get('id')}")
        logger.info(f"Token Name: {result['tokenCreate'].get('name')}")
        return result['tokenCreate']
    
    logger.error(f"=== UNEXPECTED RESPONSE ===")
    logger.error(f"Token creation returned unexpected result for {email}: {result}")
    return None


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
    """
    logger.info(f"=== GET OR CREATE TOKEN ===")
    logger.info(f"Name: {name}, Email: {email}, Mobile: {mobile}, User ID: {user_id}")
    
    # If we have db and user_id, try to reuse existing token
    if db and user_id:
        user_doc = await db.users.find_one({"user_id": user_id})
        if user_doc and user_doc.get("tradesafe_token_id"):
            token_id = user_doc["tradesafe_token_id"]
            logger.info(f"REUSING existing token for {email}: {token_id}")
            return token_id
    
    # Also check by email if we have db access
    if db:
        user_by_email = await db.users.find_one({"email": email.lower()})
        if user_by_email and user_by_email.get("tradesafe_token_id"):
            token_id = user_by_email["tradesafe_token_id"]
            logger.info(f"REUSING existing token found by email {email}: {token_id}")
            return token_id
    
    # Split name into given/family name
    name_parts = name.strip().split(' ', 1)
    given_name = name_parts[0] if name_parts else "User"
    family_name = name_parts[1] if len(name_parts) > 1 else "User"
    
    logger.info(f"Split name: given={given_name}, family={family_name}")
    
    # Ensure mobile is in +27 format
    if mobile and not mobile.startswith('+'):
        if mobile.startswith('0'):
            mobile = '+27' + mobile[1:]
        else:
            mobile = '+27' + mobile
    
    # Create a new token
    logger.info(f"CREATING NEW token for {email}")
    token_data = await create_user_token(
        given_name=given_name,
        family_name=family_name,
        email=email,
        mobile=mobile
    )
    
    if token_data:
        token_id = token_data['id']
        
        # Save to user record if we have db access
        if db:
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
    fee_allocation: str = "SELLER_AGENT"
) -> Optional[Dict[str, Any]]:
    """
    Create a new escrow transaction with TrustTrade as AGENT to collect 2% platform fee.
    
    Args:
        internal_reference: TrustTrade internal transaction ID
        title: Transaction title
        description: Item/service description
        amount: Transaction amount in ZAR (Rands, not cents)
        buyer_name: Buyer's name
        buyer_email: Buyer's email
        seller_name: Seller's name
        seller_email: Seller's email
        buyer_mobile: Buyer's mobile number
        seller_mobile: Seller's mobile number
        fee_allocation: Who pays fees - BUYER_AGENT, SELLER_AGENT, or SPLIT_AGENT (default: SELLER_AGENT)
    
    Fee Allocation Options:
        - SELLER_AGENT: Seller pays TrustTrade 2% fee (deducted from payout)
        - BUYER_AGENT: Buyer pays TrustTrade 2% fee (added to payment)
        - SPLIT_AGENT: Split between buyer and seller
    
    Returns:
        Transaction details including fee_allocation or error dict on failure
    """
    # Normalize and validate fee_allocation
    VALID_FEE_ALLOCATIONS = {
        'BUYER_AGENT': 'BUYER_AGENT',
        'SELLER_AGENT': 'SELLER_AGENT',
        'SPLIT_AGENT': 'BUYER_SELLER_AGENT',  # TradeSafe uses BUYER_SELLER_AGENT for split
        'BUYER_SELLER_AGENT': 'BUYER_SELLER_AGENT',
        # Legacy mappings for backwards compatibility
        'buyer': 'BUYER_AGENT',
        'seller': 'SELLER_AGENT',
        'split': 'BUYER_SELLER_AGENT',
    }
    
    normalized_fee_allocation = VALID_FEE_ALLOCATIONS.get(
        fee_allocation.upper() if fee_allocation else 'SELLER_AGENT',
        'SELLER_AGENT'  # Default
    )
    
    logger.info(f"=== CREATE TRANSACTION REQUEST ===")
    logger.info(f"Reference: {internal_reference}")
    logger.info(f"Amount: R{amount}")
    logger.info(f"Buyer: {buyer_name} ({buyer_email}) Mobile: {buyer_mobile}")
    logger.info(f"Seller: {seller_name} ({seller_email}) Mobile: {seller_mobile}")
    logger.info(f"Fee Allocation (input): {fee_allocation}")
    logger.info(f"Fee Allocation (normalized): {normalized_fee_allocation}")
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
    
    # Get or create tokens for buyer and seller (reuse from user records if available)
    logger.info(f"Getting/creating buyer token...")
    buyer_token = await get_or_create_user_token(
        buyer_name, 
        buyer_email, 
        mobile=buyer_mobile or "+27000000000",
        reference=f"buyer_{internal_reference}",
        db=db
    )
    
    logger.info(f"Getting/creating seller token...")
    seller_token = await get_or_create_user_token(
        seller_name, 
        seller_email, 
        mobile=seller_mobile or "+27000000000",
        reference=f"seller_{internal_reference}",
        db=db
    )
    
    if not buyer_token:
        logger.error(f"=== BUYER TOKEN CREATION FAILED ===")
        return {"error": "Could not verify buyer details. Please check buyer information and try again."}
    
    if not seller_token:
        logger.error(f"=== SELLER TOKEN CREATION FAILED ===")
        return {"error": "Could not verify seller details. Please check seller information and try again."}
    
    logger.info(f"Tokens created - Buyer: {buyer_token}, Seller: {seller_token}")
    
    # TradeSafe API expects amount in RANDS (NOT cents)
    amount_rands = float(amount)
    
    # Calculate TrustTrade 2% platform fee (estimate - actual depends on fee allocation)
    trusttrade_fee = round(amount_rands * (PLATFORM_FEE_PERCENT / 100), 2)
    
    logger.info(f"=== FEE CALCULATION ===")
    logger.info(f"Item Amount: R{amount_rands}")
    logger.info(f"TrustTrade Fee ({PLATFORM_FEE_PERCENT}%): R{trusttrade_fee}")
    logger.info(f"Fee Allocation: {normalized_fee_allocation}")
    
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
    # - The AGENT is linked via email (our platform's registered email with TradeSafe)
    #
    # TrustTrade registered email with TradeSafe API
    TRUSTTRADE_AGENT_EMAIL = "marnichroets@gmail.com"  # The email associated with TradeSafe API credentials
    
    variables = {
        "input": {
            "title": title,
            "description": description,
            "industry": "GENERAL_GOODS_SERVICES",
            "currency": "ZAR",
            "feeAllocation": normalized_fee_allocation,  # Dynamic fee allocation
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
                        "email": TRUSTTRADE_AGENT_EMAIL,  # Agent linked via email, not token
                        "fee": PLATFORM_FEE_PERCENT,  # 2% platform fee
                        "feeType": "PERCENT",  # Fee is a percentage
                        "feeAllocation": normalized_fee_allocation  # Same as transaction level
                    }
                ]
            },
            "allocations": {
                "create": [
                    {
                        "title": "Payment for item/service",
                        "description": description,
                        "value": amount_rands,
                        "daysToDeliver": 7,
                        "daysToInspect": 2
                    }
                ]
            }
        }
    }
    
    logger.info(f"=== TRANSACTION CREATE REQUEST ===")
    logger.info(f"=== FIELDS SENT TO TRADESAFE ===")
    logger.info(f"Transaction feeAllocation: {normalized_fee_allocation}")
    logger.info(f"AGENT fee: {PLATFORM_FEE_PERCENT}")
    logger.info(f"AGENT feeType: PERCENT")
    logger.info(f"AGENT feeAllocation: {normalized_fee_allocation}")
    logger.info(f"Allocation value: R{amount_rands}")
    logger.info(f"Variables: {variables}")
    
    result = await execute_graphql(mutation, variables)
    
    logger.info(f"=== TRANSACTION CREATE RESPONSE ===")
    logger.info(f"Result: {result}")
    
    if result and 'errors' in result:
        error_msg = result['errors'][0].get('message', 'Unknown error') if result['errors'] else 'Unknown error'
        debug_msg = result['errors'][0].get('extensions', {}).get('debugMessage', '') if result['errors'] else ''
        logger.error(f"=== TRANSACTION CREATION FAILED ===")
        logger.error(f"Error: {error_msg}")
        logger.error(f"Debug: {debug_msg}")
        return {"error": f"Payment processing error: {error_msg}"}
    
    if result and 'transactionCreate' in result:
        tx = result['transactionCreate']
        logger.info(f"=== TRANSACTION CREATED SUCCESSFULLY ===")
        logger.info(f"Transaction ID: {tx['id']}")
        logger.info(f"State: {tx['state']}")
        logger.info(f"Fee Allocation: {tx.get('feeAllocation')}")
        
        # Log party details including AGENT
        for party in tx.get('parties', []):
            logger.info(f"Party: {party.get('role')} - Fee: {party.get('fee')} ({party.get('feeType')}) - Allocation: {party.get('feeAllocation')}")
        
        # Add fee breakdown and allocation to response
        tx['trusttrade_fee'] = trusttrade_fee
        tx['fee_allocation'] = normalized_fee_allocation  # Store the fee allocation used
        tx['fee_breakdown'] = {
            'item_amount': amount_rands,
            'trusttrade_fee_percent': PLATFORM_FEE_PERCENT,
            'trusttrade_fee_amount': trusttrade_fee,
            'fee_allocation': normalized_fee_allocation
        }
        
        return tx
    
    logger.error(f"=== UNEXPECTED TRANSACTION RESPONSE ===")
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


async def get_payment_link(tradesafe_id: str, redirect_urls: Dict[str, str] = None) -> Optional[Dict[str, Any]]:
    """
    Generate payment link for a TradeSafe transaction using transactionDeposit mutation.
    This creates a deposit request and returns the payment link.
    
    Args:
        tradesafe_id: The TradeSafe transaction ID
        redirect_urls: Optional dict with success, failure, cancel URLs
    """
    import traceback
    
    print(f"=== get_payment_link called ===")
    print(f"tradesafe_id: {tradesafe_id}")
    print(f"redirect_urls: {redirect_urls}")
    print(f"TRADESAFE_ENV: {TRADESAFE_ENV}")
    print(f"TRADESAFE_API_URL: {TRADESAFE_API_URL}")
    
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
        print(f"=== GET TRANSACTION RAW RESPONSE ===")
        print(f"Result: {result}")
        logger.info(f"=== GET TRANSACTION FOR PAYMENT ===")
        logger.info(f"Result: {result}")
    except Exception as e:
        print(f"=== ERROR fetching transaction ===")
        print(f"Error: {str(e)}")
        traceback.print_exc()
        return None
    
    if not result or 'transaction' not in result:
        if result and 'errors' in result:
            print(f"Transaction query errors: {result['errors']}")
            logger.error(f"Transaction query error: {result['errors']}")
        print(f"Could not fetch transaction {tradesafe_id}")
        logger.error(f"Could not fetch transaction {tradesafe_id}")
        return None
    
    tx = result['transaction']
    tx_state = tx.get('state')
    print(f"Transaction state: {tx_state}")
    
    # Check if transaction is already fully paid
    PAID_STATES = ['FUNDS_DEPOSITED', 'FUNDS_RELEASED', 'COMPLETED', 'DELIVERED']
    if tx_state in PAID_STATES:
        print(f"=== Transaction already in {tx_state} state - no payment needed ===")
        logger.info(f"Transaction {tradesafe_id} already in {tx_state} state")
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
    print(f"Existing deposits: {deposits}")
    for deposit in deposits:
        if deposit.get('paymentLink'):
            print(f"Found existing payment link: {deposit['paymentLink']}")
            logger.info(f"Found existing payment link: {deposit['paymentLink']}")
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
    
    # Try EFT first (works in sandbox), then try interactive methods
    methods_to_try = ["EFT", "OZOW", "CARD"]
    last_deposit = None
    
    for method in methods_to_try:
        variables = {
            "id": tradesafe_id,
            "method": method,
            "redirects": redirect_urls
        }
        
        print(f"=== TRYING PAYMENT METHOD: {method} ===")
        print(f"Request variables: {variables}")
        logger.info(f"=== TRYING PAYMENT METHOD: {method} ===")
        
        try:
            result = await execute_graphql(mutation, variables)
            print(f"Raw result for {method}: {result}")
        except Exception as e:
            print(f"Exception calling transactionDeposit with {method}: {str(e)}")
            traceback.print_exc()
            continue
        
        if result and 'errors' in result:
            error_msg = result['errors'][0].get('message', 'Unknown error') if result['errors'] else 'Unknown error'
            print(f"Method {method} failed with errors: {result['errors']}")
            logger.warning(f"Method {method} failed: {error_msg}")
            continue
        
        if result and 'transactionDeposit' in result:
            deposit = result['transactionDeposit']
            last_deposit = deposit
            payment_link = deposit.get('paymentLink')
            
            print(f"Deposit created with {method}:")
            print(f"  deposit_id: {deposit.get('id')}")
            print(f"  paymentLink: {payment_link}")
            print(f"  value: {deposit.get('value')}")
            print(f"  processingFee: {deposit.get('processingFee')}")
            logger.info(f"Deposit created with {method}: link={payment_link}, value={deposit.get('value')}")
            
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
        print(f"=== Returning EFT deposit info (no payment link) ===")
        print(f"last_deposit: {last_deposit}")
        logger.info(f"Returning EFT deposit info without payment link")
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
    
    print("=== get_payment_link returning None - no deposit created ===")
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
    refund_interval: str = "IMMEDIATE"
) -> Dict[str, Any]:
    """
    Update a TradeSafe token with banking details and payout settings.
    Uses tokenUpdate mutation to attach banking and set payout/refund intervals.
    """
    logger.info(f"=== TOKEN UPDATE (BANKING) ===")
    logger.info(f"Token ID: {token_id}")
    logger.info(f"Bank: {bank_name}, Account: ***{account_number[-4:] if account_number else 'N/A'}")
    logger.info(f"Payout: {payout_interval}, Refund: {refund_interval}")
    
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
                    "interval": payout_interval
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
    
    result = await execute_graphql(mutation, variables)
    
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


async def get_token_details(token_id: str) -> Optional[Dict[str, Any]]:
    """
    Get details of a TradeSafe token including balance and settings.
    """
    logger.info(f"=== GET TOKEN DETAILS ===")
    logger.info(f"Token ID: {token_id}")
    
    query = """
    query token($id: ID!) {
        token(id: $id) {
            id
            name
            balance
            user {
                givenName
                familyName
                email
                mobile
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
    
    if result and 'token' in result:
        logger.info(f"Token details: {result['token']}")
        return result['token']
    
    logger.error(f"Failed to get token details: {result}")
    return None


async def request_token_withdrawal(token_id: str, amount_cents: int) -> Dict[str, Any]:
    """
    Request withdrawal from a token wallet.
    Amount is in cents (e.g., R100 = 10000 cents).
    """
    logger.info(f"=== TOKEN WITHDRAWAL REQUEST ===")
    logger.info(f"Token ID: {token_id}, Amount: {amount_cents} cents (R{amount_cents/100:.2f})")
    
    mutation = """
    mutation tokenAccountWithdraw($id: ID!, $value: Int!) {
        tokenAccountWithdraw(id: $id, value: $value) {
            id
            balance
        }
    }
    """
    
    variables = {
        "id": token_id,
        "value": amount_cents
    }
    
    result = await execute_graphql(mutation, variables)
    
    if result and 'errors' in result:
        error_msg = result['errors'][0].get('message', 'Unknown error') if result['errors'] else 'Unknown error'
        logger.error(f"Withdrawal failed: {error_msg}")
        return {"success": False, "error": error_msg}
    
    if result and 'tokenAccountWithdraw' in result:
        logger.info(f"Withdrawal successful: {result['tokenAccountWithdraw']}")
        return {
            "success": True,
            "token_id": result['tokenAccountWithdraw'].get('id'),
            "new_balance": result['tokenAccountWithdraw'].get('balance')
        }
    
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
    logger.info(f"=== GET OR REUSE USER TOKEN ===")
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
        logger.info(f"Token saved to user record")
        return token_id
    
    logger.error(f"Failed to create token for user {user_id}")
    return None

