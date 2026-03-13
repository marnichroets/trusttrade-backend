"""
TradeSafe Payment Gateway Integration Service
Handles OAuth authentication and API calls to TradeSafe escrow system
"""

import os
import httpx
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any

logger = logging.getLogger(__name__)

# TradeSafe Configuration
TRADESAFE_CLIENT_ID = os.environ.get('TRADESAFE_CLIENT_ID', '')
TRADESAFE_CLIENT_SECRET = os.environ.get('TRADESAFE_CLIENT_SECRET', '')
TRADESAFE_TOKEN_URL = 'https://auth.tradesafe.co.za/oauth/token'
TRADESAFE_API_URL = os.environ.get('TRADESAFE_API_URL', 'https://api-developer.tradesafe.dev/graphql')

# Cache for access token
_token_cache = {
    'access_token': None,
    'expires_at': None
}

# TrustTrade Platform Settings
MINIMUM_TRANSACTION_AMOUNT = 150.0  # R150 minimum
PAYOUT_THRESHOLD = 500.0  # R500 payout threshold
PLATFORM_FEE_PERCENT = 2.0  # 2% platform fee


async def get_tradesafe_token() -> Optional[str]:
    """
    Get OAuth access token from TradeSafe.
    Caches the token and refreshes when expired.
    """
    global _token_cache
    
    # Check if we have a valid cached token
    if _token_cache['access_token'] and _token_cache['expires_at']:
        if datetime.now(timezone.utc) < _token_cache['expires_at']:
            return _token_cache['access_token']
    
    if not TRADESAFE_CLIENT_ID or not TRADESAFE_CLIENT_SECRET:
        logger.warning("TradeSafe credentials not configured")
        return None
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                TRADESAFE_TOKEN_URL,
                data={
                    'grant_type': 'client_credentials',
                    'client_id': TRADESAFE_CLIENT_ID,
                    'client_secret': TRADESAFE_CLIENT_SECRET
                },
                headers={'Content-Type': 'application/x-www-form-urlencoded'}
            )
            
            if response.status_code != 200:
                logger.error(f"TradeSafe token request failed: {response.text}")
                return None
            
            data = response.json()
            access_token = data.get('access_token')
            expires_in = data.get('expires_in', 3600)  # Default 1 hour
            
            # Cache the token
            _token_cache['access_token'] = access_token
            _token_cache['expires_at'] = datetime.now(timezone.utc) + timedelta(seconds=expires_in - 60)
            
            logger.info("TradeSafe access token obtained successfully")
            return access_token
            
    except Exception as e:
        logger.error(f"Error fetching TradeSafe token: {e}")
        return None


async def create_tradesafe_transaction(
    transaction_id: str,
    title: str,
    description: str,
    amount: float,
    buyer_email: str,
    seller_email: str,
    fee_allocation: str = "SELLER"  # BUYER, SELLER, or SPLIT
) -> Optional[Dict[str, Any]]:
    """
    Create a new escrow transaction in TradeSafe.
    
    Args:
        transaction_id: Internal TrustTrade transaction ID
        title: Transaction title
        description: Item/service description
        amount: Transaction amount in ZAR (cents)
        buyer_email: Buyer's email
        seller_email: Seller's email
        fee_allocation: Who pays the TradeSafe fee
    
    Returns:
        TradeSafe transaction details or None on failure
    """
    token = await get_tradesafe_token()
    if not token:
        logger.error("Cannot create TradeSafe transaction: No access token")
        return None
    
    # Convert amount to cents for TradeSafe API
    amount_cents = int(amount * 100)
    
    # GraphQL mutation for creating a transaction
    mutation = """
    mutation CreateTransaction($input: TransactionCreateInput!) {
        transactionCreate(input: $input) {
            id
            title
            state
            allocations {
                id
                name
                value
                state
            }
        }
    }
    """
    
    variables = {
        "input": {
            "title": title,
            "description": description,
            "industry": "GENERAL_GOODS_SERVICES",
            "feeAllocation": fee_allocation,
            "reference": transaction_id,
            "allocations": [
                {
                    "name": "Payment",
                    "value": amount_cents,
                    "units": 1,
                    "unitCost": amount_cents,
                    "daysToDeliver": 7,
                    "daysToInspect": 2
                }
            ]
        }
    }
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                TRADESAFE_API_URL,
                json={"query": mutation, "variables": variables},
                headers={
                    'Authorization': f'Bearer {token}',
                    'Content-Type': 'application/json'
                }
            )
            
            if response.status_code != 200:
                logger.error(f"TradeSafe API error: {response.text}")
                return None
            
            data = response.json()
            
            if 'errors' in data:
                logger.error(f"TradeSafe GraphQL errors: {data['errors']}")
                return None
            
            return data.get('data', {}).get('transactionCreate')
            
    except Exception as e:
        logger.error(f"Error creating TradeSafe transaction: {e}")
        return None


async def get_tradesafe_transaction(tradesafe_id: str) -> Optional[Dict[str, Any]]:
    """
    Get transaction details from TradeSafe.
    """
    token = await get_tradesafe_token()
    if not token:
        return None
    
    query = """
    query GetTransaction($id: ID!) {
        transaction(id: $id) {
            id
            title
            state
            createdAt
            allocations {
                id
                name
                value
                state
            }
        }
    }
    """
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                TRADESAFE_API_URL,
                json={"query": query, "variables": {"id": tradesafe_id}},
                headers={
                    'Authorization': f'Bearer {token}',
                    'Content-Type': 'application/json'
                }
            )
            
            if response.status_code != 200:
                return None
            
            data = response.json()
            return data.get('data', {}).get('transaction')
            
    except Exception as e:
        logger.error(f"Error fetching TradeSafe transaction: {e}")
        return None


async def get_payment_link(tradesafe_id: str) -> Optional[str]:
    """
    Get payment link for a TradeSafe transaction.
    """
    token = await get_tradesafe_token()
    if not token:
        return None
    
    query = """
    query GetPaymentLink($id: ID!) {
        transaction(id: $id) {
            paymentLink
        }
    }
    """
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                TRADESAFE_API_URL,
                json={"query": query, "variables": {"id": tradesafe_id}},
                headers={
                    'Authorization': f'Bearer {token}',
                    'Content-Type': 'application/json'
                }
            )
            
            if response.status_code != 200:
                return None
            
            data = response.json()
            return data.get('data', {}).get('transaction', {}).get('paymentLink')
            
    except Exception as e:
        logger.error(f"Error fetching payment link: {e}")
        return None


def validate_minimum_transaction(amount: float) -> tuple[bool, str]:
    """
    Validate that transaction meets minimum amount requirement.
    
    Returns:
        (is_valid, error_message)
    """
    if amount < MINIMUM_TRANSACTION_AMOUNT:
        return False, f"Minimum transaction amount is R{MINIMUM_TRANSACTION_AMOUNT:.0f}"
    return True, ""


def calculate_platform_fee(amount: float) -> float:
    """
    Calculate the 2% TrustTrade platform fee.
    """
    return round(amount * (PLATFORM_FEE_PERCENT / 100), 2)


def check_payout_threshold(wallet_balance: float) -> tuple[bool, float]:
    """
    Check if wallet balance meets payout threshold.
    
    Returns:
        (can_payout, amount_to_payout)
    """
    if wallet_balance >= PAYOUT_THRESHOLD:
        return True, wallet_balance
    return False, 0.0


def get_payout_progress(wallet_balance: float) -> dict:
    """
    Get payout progress for UI display.
    """
    progress_percent = min((wallet_balance / PAYOUT_THRESHOLD) * 100, 100)
    remaining = max(PAYOUT_THRESHOLD - wallet_balance, 0)
    
    return {
        "balance": wallet_balance,
        "threshold": PAYOUT_THRESHOLD,
        "progress_percent": round(progress_percent, 1),
        "remaining_to_payout": remaining,
        "can_payout": wallet_balance >= PAYOUT_THRESHOLD
    }
