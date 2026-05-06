"""
SMS Messenger Service for TrustTrade
Handles OTP verification and transaction notifications via SMS
Uses SMS Messenger South Africa API (Zoom Connect platform)
"""

import os
import httpx
import logging
import random
import string
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any

logger = logging.getLogger(__name__)

# SMS Messenger Configuration - Uses Zoom Connect platform
SMS_MESSENGER_API_KEY = os.getenv('SMS_MESSENGER_API_KEY')
SMS_MESSENGER_EMAIL = os.getenv('SMS_MESSENGER_EMAIL')
SMS_MESSENGER_BASE_URL = "https://sms1.smsmessenger.co.za/app/api/rest/v1"

# OTP Configuration
OTP_LENGTH = 6
OTP_EXPIRY_MINUTES = 10
RESEND_COOLDOWN_SECONDS = 60


def normalize_phone_number(phone: str) -> str:
    """
    Normalize phone number to 27XXXXXXXXX format (no + prefix for API).
    Handles various input formats:
    - 0821234567 -> 27821234567
    - 27821234567 -> 27821234567
    - +27821234567 -> 27821234567
    """
    if not phone:
        return ""
    
    # Remove all non-digit characters
    cleaned = phone.strip()
    digits = ''.join(c for c in cleaned if c.isdigit())
    
    # Handle different formats
    if digits.startswith('27') and len(digits) >= 11:
        return digits
    elif digits.startswith('0') and len(digits) >= 10:
        return '27' + digits[1:]
    elif len(digits) == 9:
        # Assume SA number without leading 0
        return '27' + digits
    else:
        # Return with 27 prefix if looks like a number
        if len(digits) >= 9:
            return '27' + digits[-9:]
        return digits


def normalize_phone_for_display(phone: str) -> str:
    """
    Normalize phone number to +27XXXXXXXXX format for display/storage.
    """
    normalized = normalize_phone_number(phone)
    if normalized and not normalized.startswith('+'):
        return '+' + normalized
    return normalized


def phones_match(phone1: str, phone2: str) -> bool:
    """
    Compare two phone numbers in a format-insensitive way.
    0821234567 should match +27821234567 should match 27821234567
    """
    if not phone1 or not phone2:
        return False
    
    normalized1 = normalize_phone_number(phone1)
    normalized2 = normalize_phone_number(phone2)
    
    logger.info(f"Phone comparison: '{phone1}' -> '{normalized1}' vs '{phone2}' -> '{normalized2}'")
    
    return normalized1 == normalized2


def generate_otp() -> str:
    """Generate a 6-digit OTP code."""
    return ''.join(random.choices(string.digits, k=OTP_LENGTH))


async def send_sms(to_phone: str, message: str) -> Dict[str, Any]:
    """
    Send SMS via SMS Messenger API (Zoom Connect platform).
    Uses email and token headers for authentication.
    
    Args:
        to_phone: Phone number in any format (will be normalized)
        message: SMS message text
    
    Returns:
        Dict with status and message_id or error
    """
    if not SMS_MESSENGER_API_KEY:
        logger.error("SMS_MESSENGER_API_KEY not configured")
        return {"success": False, "error": "SMS service not configured - missing API key"}

    # Normalize phone number (27XXXXXXXXX format, no + prefix)
    normalized_phone = normalize_phone_number(to_phone)
    
    if not normalized_phone or len(normalized_phone) < 11:
        logger.error(f"Invalid phone number: {to_phone} -> {normalized_phone}")
        return {"success": False, "error": "Invalid phone number"}
    
    logger.info("=== SMS SEND ATTEMPT ===")
    logger.info(f"To: {normalized_phone}")
    logger.info(f"Message: {message[:50]}...")
    logger.info(f"API key present: {bool(SMS_MESSENGER_API_KEY)}, email present: {bool(SMS_MESSENGER_EMAIL)}")

    try:
        # SMS Messenger (Zoom Connect) authenticates via email + token query params
        params = {
            "email": SMS_MESSENGER_EMAIL or "",
            "token": SMS_MESSENGER_API_KEY or "",
        }
        payload = {
            "message": message,
            "recipientNumber": normalized_phone
        }

        url = f"{SMS_MESSENGER_BASE_URL}/sms/send"
        logger.info(f"POST {url} | params: email={'***' if SMS_MESSENGER_EMAIL else 'MISSING'}, token={'***' if SMS_MESSENGER_API_KEY else 'MISSING'} | payload: {payload}")

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                url,
                params=params,
                headers={
                    "Content-Type": "application/json",
                    "Accept": "application/json"
                },
                json=payload
            )

            logger.info(f"SMS API Response Status: {response.status_code}")
            logger.info(f"SMS API Response Body: {response.text}")
            
            if response.status_code in [200, 201, 202]:
                # Parse XML response for message ID
                response_text = response.text
                message_id = None
                if "<messageId>" in response_text:
                    start = response_text.find("<messageId>") + len("<messageId>")
                    end = response_text.find("</messageId>")
                    if start > 0 and end > start:
                        message_id = response_text[start:end]
                
                logger.info(f"SMS sent successfully to {normalized_phone}, messageId: {message_id}")
                return {
                    "success": True,
                    "message_id": message_id,
                    "status": "sent",
                    "response": response_text
                }
            else:
                error_detail = response.text
                logger.error(f"SMS API error: {response.status_code} - {error_detail}")
                return {
                    "success": False,
                    "error": f"SMS API error: {response.status_code}",
                    "details": error_detail
                }
                
    except httpx.ConnectError as e:
        logger.error(f"SMS connection error: {e}")
        return {"success": False, "error": f"Connection error: {str(e)}"}
    except httpx.TimeoutException as e:
        logger.error(f"SMS timeout error: {e}")
        return {"success": False, "error": f"Timeout error: {str(e)}"}
    except Exception as e:
        logger.error(f"SMS send error: {e}")
        return {"success": False, "error": str(e)}


async def check_sms_balance() -> Dict[str, Any]:
    """Check SMS credit balance."""
    if not SMS_MESSENGER_API_KEY or not SMS_MESSENGER_EMAIL:
        return {"success": False, "error": "SMS service not configured"}
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                f"{SMS_MESSENGER_BASE_URL}/account/balance",
                params={
                    "email": SMS_MESSENGER_EMAIL or "",
                    "token": SMS_MESSENGER_API_KEY or "",
                }
            )
            
            if response.status_code == 200:
                # Parse XML for balance
                response_text = response.text
                balance = None
                if "<creditBalance>" in response_text:
                    start = response_text.find("<creditBalance>") + len("<creditBalance>")
                    end = response_text.find("</creditBalance>")
                    if start > 0 and end > start:
                        balance = float(response_text[start:end])
                
                return {"success": True, "balance": balance}
            else:
                return {"success": False, "error": response.text}
                
    except Exception as e:
        return {"success": False, "error": str(e)}


async def send_otp_sms(to_phone: str, otp_code: str) -> Dict[str, Any]:
    """
    Send OTP verification SMS.
    
    Args:
        to_phone: Phone number to send OTP to
        otp_code: The 6-digit OTP code
    
    Returns:
        Dict with success status
    """
    message = f"TrustTrade: Your verification code is {otp_code}. Valid for 10 minutes. Do not share this code."
    return await send_sms(to_phone, message)


async def send_transaction_invite_sms(
    to_phone: str, 
    sender_name: str, 
    share_link: str
) -> Dict[str, Any]:
    """
    Send transaction invite SMS when phone number is used instead of email.
    
    Args:
        to_phone: Recipient phone number
        sender_name: Name of the person sending the invite
        share_link: Link to the transaction
    
    Returns:
        Dict with success status
    """
    message = f"TrustTrade: {sender_name} sent you a secure transaction. View here: {share_link}"
    result = await send_sms(to_phone, message)
    logger.info(f"Transaction invite SMS result: {result}")
    return result


async def send_funds_received_sms(
    to_phone: str,
    item_description: str,
    amount: float
) -> Dict[str, Any]:
    """Send SMS when funds are received in escrow."""
    message = f"TrustTrade: Payment of R{amount:.2f} received for '{item_description[:30]}'. Funds secured in escrow. Please deliver the item."
    return await send_sms(to_phone, message)


async def send_delivery_sms(
    to_phone: str,
    item_description: str
) -> Dict[str, Any]:
    """Send SMS when seller marks item as delivered."""
    message = f"TrustTrade: Your item '{item_description[:30]}' has been dispatched. Please confirm receipt when you receive it."
    return await send_sms(to_phone, message)


async def send_funds_released_sms(
    to_phone: str,
    amount: float
) -> Dict[str, Any]:
    """Send SMS when funds are released to seller."""
    message = f"TrustTrade: R{amount:.2f} has been released to your account. Thank you for using TrustTrade!"
    return await send_sms(to_phone, message)


async def send_dispute_sms(
    to_phone: str,
    item_description: str
) -> Dict[str, Any]:
    """Send SMS when a dispute is opened - always send for disputes."""
    message = f"TrustTrade URGENT: A dispute has been opened for '{item_description[:30]}'. Please log in to respond."
    return await send_sms(to_phone, message)


def create_otp_record(phone: str) -> Dict[str, Any]:
    """
    Create a new OTP record for storage.
    
    Returns:
        Dict with otp_code, expires_at, phone, created_at
    """
    otp_code = generate_otp()
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(minutes=OTP_EXPIRY_MINUTES)
    
    return {
        "phone": normalize_phone_for_display(phone),
        "otp_code": otp_code,
        "created_at": now.isoformat(),
        "expires_at": expires_at.isoformat(),
        "verified": False,
        "attempts": 0
    }


def is_otp_valid(otp_record: Dict[str, Any], submitted_code: str) -> tuple:
    """
    Check if submitted OTP is valid.
    
    Returns:
        (is_valid: bool, error_message: str or None)
    """
    if not otp_record:
        return False, "No verification code found. Please request a new one."
    
    # Check if expired
    expires_at = datetime.fromisoformat(otp_record["expires_at"].replace('Z', '+00:00'))
    if datetime.now(timezone.utc) > expires_at:
        return False, "Your verification code has expired. Please request a new one."
    
    # Check if already verified
    if otp_record.get("verified"):
        return False, "This code has already been used."
    
    # Check attempts (max 5)
    if otp_record.get("attempts", 0) >= 5:
        return False, "Too many incorrect attempts. Please request a new code."
    
    # Check code match
    if otp_record["otp_code"] != submitted_code:
        return False, "Incorrect code. Please try again."
    
    return True, None


def can_resend_otp(otp_record: Dict[str, Any]) -> tuple:
    """
    Check if user can request a new OTP (60 second cooldown).
    
    Returns:
        (can_resend: bool, seconds_remaining: int)
    """
    if not otp_record:
        return True, 0
    
    created_at = datetime.fromisoformat(otp_record["created_at"].replace('Z', '+00:00'))
    elapsed = (datetime.now(timezone.utc) - created_at).total_seconds()
    
    if elapsed >= RESEND_COOLDOWN_SECONDS:
        return True, 0
    
    return False, int(RESEND_COOLDOWN_SECONDS - elapsed)
