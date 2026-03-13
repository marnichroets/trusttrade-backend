"""
Brevo Email Service for TrustTrade
Handles transactional emails for escrow transactions
"""

import os
import logging
from typing import Optional, List
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

logger = logging.getLogger(__name__)

# Brevo Configuration
BREVO_API_KEY = os.environ.get('BREVO_API_KEY', '')
SENDER_EMAIL = "noreply@trusttradesa.co.za"
SENDER_NAME = "TrustTrade"

# Initialize Brevo client
_brevo_client = None

def get_brevo_client():
    """Get or create Brevo API client"""
    global _brevo_client, BREVO_API_KEY
    
    # Re-check env var in case it was loaded later
    if not BREVO_API_KEY:
        BREVO_API_KEY = os.environ.get('BREVO_API_KEY', '')
    
    if not BREVO_API_KEY:
        logger.warning("Brevo API key not configured")
        return None
    
    if _brevo_client is None:
        try:
            import sib_api_v3_sdk
            configuration = sib_api_v3_sdk.Configuration()
            configuration.api_key['api-key'] = BREVO_API_KEY
            _brevo_client = sib_api_v3_sdk.ApiClient(configuration)
        except Exception as e:
            logger.error(f"Failed to initialize Brevo client: {e}")
            return None
    
    return _brevo_client


async def send_email(
    to_email: str,
    to_name: str,
    subject: str,
    html_content: str,
    text_content: Optional[str] = None
) -> bool:
    """
    Send a transactional email via Brevo.
    
    Args:
        to_email: Recipient email address
        to_name: Recipient name
        subject: Email subject
        html_content: HTML body content
        text_content: Plain text body (optional)
    
    Returns:
        True if email sent successfully, False otherwise
    """
    client = get_brevo_client()
    
    if not client:
        logger.warning(f"Brevo not configured. Would send email to {to_email}: {subject}")
        return False
    
    try:
        import sib_api_v3_sdk
        from html import unescape
        import re
        
        api_instance = sib_api_v3_sdk.TransactionalEmailsApi(client)
        
        # Generate plain text from HTML if not provided
        if not text_content:
            # Strip HTML tags and decode entities
            text_content = re.sub('<[^<]+?>', '', html_content)
            text_content = unescape(text_content)
            text_content = re.sub(r'\s+', ' ', text_content).strip()
        
        send_smtp_email = sib_api_v3_sdk.SendSmtpEmail(
            to=[{"email": to_email, "name": to_name}],
            sender={"email": SENDER_EMAIL, "name": SENDER_NAME},
            subject=subject,
            html_content=html_content,
            text_content=text_content
        )
        
        response = api_instance.send_transac_email(send_smtp_email)
        logger.info(f"Email sent successfully to {to_email}: {subject} (ID: {response.message_id})")
        return True
        
    except Exception as e:
        logger.error(f"Failed to send email to {to_email}: {e}")
        return False


# ============ EMAIL TEMPLATES ============

def get_transaction_created_email(
    recipient_name: str,
    share_code: str,
    item_description: str,
    amount: float,
    other_party_name: str,
    role: str,
    share_link: str
) -> tuple[str, str]:
    """Generate transaction created email content"""
    
    subject = f"New Transaction Created - {share_code}"
    
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
            .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
            .header {{ background: linear-gradient(135deg, #10b981, #14b8a6); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }}
            .content {{ background: #f8fafc; padding: 30px; border-radius: 0 0 8px 8px; }}
            .highlight {{ background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981; }}
            .amount {{ font-size: 28px; font-weight: bold; color: #10b981; }}
            .btn {{ display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 20px; }}
            .footer {{ text-align: center; padding: 20px; color: #64748b; font-size: 12px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>🛡️ TrustTrade</h1>
                <p>Your transaction is protected by escrow</p>
            </div>
            <div class="content">
                <h2>Hi {recipient_name},</h2>
                <p>A new escrow transaction has been created where you are the <strong>{role}</strong>.</p>
                
                <div class="highlight">
                    <p><strong>Transaction Reference:</strong> {share_code}</p>
                    <p><strong>Item:</strong> {item_description}</p>
                    <p><strong>Amount:</strong> <span class="amount">R {amount:.2f}</span></p>
                    <p><strong>Other Party:</strong> {other_party_name}</p>
                </div>
                
                <p>Click the button below to view the transaction details:</p>
                <a href="{share_link}" class="btn">View Transaction</a>
                
                <p style="margin-top: 30px;">
                    <strong>How TrustTrade Escrow Works:</strong><br>
                    1. Buyer pays into escrow<br>
                    2. Seller delivers the item<br>
                    3. Buyer confirms delivery<br>
                    4. Funds released to seller (10:00 or 15:00 daily)
                </p>
            </div>
            <div class="footer">
                <p>This transaction is secured by TradeSafe escrow.</p>
                <p>© TrustTrade South Africa</p>
            </div>
        </div>
    </body>
    </html>
    """
    
    return subject, html_content


def get_payment_received_email(
    recipient_name: str,
    share_code: str,
    item_description: str,
    amount: float,
    role: str
) -> tuple[str, str]:
    """Generate payment received email content"""
    
    subject = f"Payment Received - {share_code}"
    
    if role == "seller":
        action_text = "Please deliver the item to the buyer. Once they confirm delivery, the funds will be released to your account."
    else:
        action_text = "Your payment is now held securely in escrow. The seller has been notified to deliver your item."
    
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
            .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
            .header {{ background: linear-gradient(135deg, #10b981, #14b8a6); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }}
            .content {{ background: #f8fafc; padding: 30px; border-radius: 0 0 8px 8px; }}
            .success-box {{ background: #d1fae5; border: 1px solid #10b981; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center; }}
            .amount {{ font-size: 32px; font-weight: bold; color: #059669; }}
            .footer {{ text-align: center; padding: 20px; color: #64748b; font-size: 12px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>💰 Payment Received!</h1>
            </div>
            <div class="content">
                <h2>Hi {recipient_name},</h2>
                
                <div class="success-box">
                    <p>✅ Payment has been received and secured in escrow</p>
                    <p class="amount">R {amount:.2f}</p>
                    <p><strong>{share_code}</strong></p>
                </div>
                
                <p><strong>Item:</strong> {item_description}</p>
                
                <p style="background: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0;">
                    <strong>Next Step:</strong> {action_text}
                </p>
                
                <p><em>Funds are released in two batches daily: 10:00 and 15:00</em></p>
            </div>
            <div class="footer">
                <p>© TrustTrade South Africa | Protected by TradeSafe</p>
            </div>
        </div>
    </body>
    </html>
    """
    
    return subject, html_content


def get_funds_released_email(
    recipient_name: str,
    share_code: str,
    item_description: str,
    amount: float,
    net_amount: float
) -> tuple[str, str]:
    """Generate funds released email content"""
    
    subject = f"Funds Released! - {share_code}"
    
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
            .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
            .header {{ background: linear-gradient(135deg, #059669, #10b981); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }}
            .content {{ background: #f8fafc; padding: 30px; border-radius: 0 0 8px 8px; }}
            .success-box {{ background: #d1fae5; border: 2px solid #10b981; padding: 30px; border-radius: 8px; margin: 20px 0; text-align: center; }}
            .amount {{ font-size: 36px; font-weight: bold; color: #059669; }}
            .footer {{ text-align: center; padding: 20px; color: #64748b; font-size: 12px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>🎉 Funds Released!</h1>
                <p>Transaction Complete</p>
            </div>
            <div class="content">
                <h2>Congratulations {recipient_name}!</h2>
                
                <div class="success-box">
                    <p>✅ Your funds have been released</p>
                    <p class="amount">R {net_amount:.2f}</p>
                    <p>will be deposited to your bank account</p>
                </div>
                
                <p><strong>Transaction:</strong> {share_code}</p>
                <p><strong>Item:</strong> {item_description}</p>
                <p><strong>Total Amount:</strong> R {amount:.2f}</p>
                <p><strong>After TrustTrade Fee (2%):</strong> R {net_amount:.2f}</p>
                
                <p style="margin-top: 20px;">
                    Funds will be deposited during the next payout window (10:00 or 15:00).
                    Thank you for using TrustTrade!
                </p>
            </div>
            <div class="footer">
                <p>© TrustTrade South Africa | Protected by TradeSafe</p>
            </div>
        </div>
    </body>
    </html>
    """
    
    return subject, html_content


def get_delivery_confirmed_email(
    recipient_name: str,
    share_code: str,
    item_description: str,
    role: str
) -> tuple[str, str]:
    """Generate delivery confirmed email content"""
    
    subject = f"Delivery Confirmed - {share_code}"
    
    if role == "seller":
        message = "The buyer has confirmed receiving the item. Your funds will be released shortly!"
    else:
        message = "Thank you for confirming delivery. The seller's funds will now be released."
    
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
            .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
            .header {{ background: #3b82f6; color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }}
            .content {{ background: #f8fafc; padding: 30px; border-radius: 0 0 8px 8px; }}
            .info-box {{ background: #dbeafe; border: 1px solid #3b82f6; padding: 20px; border-radius: 8px; margin: 20px 0; }}
            .footer {{ text-align: center; padding: 20px; color: #64748b; font-size: 12px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>📦 Delivery Confirmed!</h1>
            </div>
            <div class="content">
                <h2>Hi {recipient_name},</h2>
                
                <div class="info-box">
                    <p>✅ {message}</p>
                </div>
                
                <p><strong>Transaction:</strong> {share_code}</p>
                <p><strong>Item:</strong> {item_description}</p>
                
                <p>Thank you for using TrustTrade for a safe transaction!</p>
            </div>
            <div class="footer">
                <p>© TrustTrade South Africa</p>
            </div>
        </div>
    </body>
    </html>
    """
    
    return subject, html_content


def get_dispute_opened_email(
    recipient_name: str,
    share_code: str,
    dispute_type: str,
    description: str
) -> tuple[str, str]:
    """Generate dispute opened email content"""
    
    subject = f"Dispute Opened - {share_code}"
    
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
            .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
            .header {{ background: #ef4444; color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }}
            .content {{ background: #f8fafc; padding: 30px; border-radius: 0 0 8px 8px; }}
            .warning-box {{ background: #fef2f2; border: 1px solid #ef4444; padding: 20px; border-radius: 8px; margin: 20px 0; }}
            .footer {{ text-align: center; padding: 20px; color: #64748b; font-size: 12px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>⚠️ Dispute Opened</h1>
            </div>
            <div class="content">
                <h2>Hi {recipient_name},</h2>
                
                <p>A dispute has been opened for your transaction.</p>
                
                <div class="warning-box">
                    <p><strong>Transaction:</strong> {share_code}</p>
                    <p><strong>Type:</strong> {dispute_type}</p>
                    <p><strong>Description:</strong> {description}</p>
                </div>
                
                <p>Our team will review the dispute and contact both parties. Funds will remain in escrow until the dispute is resolved.</p>
                
                <p>Please respond to any requests for additional information promptly.</p>
            </div>
            <div class="footer">
                <p>© TrustTrade South Africa</p>
            </div>
        </div>
    </body>
    </html>
    """
    
    return subject, html_content


# ============ CONVENIENCE FUNCTIONS ============

async def send_transaction_created_email(
    to_email: str,
    to_name: str,
    share_code: str,
    item_description: str,
    amount: float,
    other_party_name: str,
    role: str,
    base_url: str
) -> bool:
    """Send transaction created notification"""
    share_link = f"{base_url}/t/{share_code}"
    subject, html = get_transaction_created_email(
        to_name, share_code, item_description, amount, other_party_name, role, share_link
    )
    return await send_email(to_email, to_name, subject, html)


async def send_payment_received_email(
    to_email: str,
    to_name: str,
    share_code: str,
    item_description: str,
    amount: float,
    role: str
) -> bool:
    """Send payment received notification"""
    subject, html = get_payment_received_email(to_name, share_code, item_description, amount, role)
    return await send_email(to_email, to_name, subject, html)


async def send_funds_released_email(
    to_email: str,
    to_name: str,
    share_code: str,
    item_description: str,
    amount: float,
    net_amount: float
) -> bool:
    """Send funds released notification"""
    subject, html = get_funds_released_email(to_name, share_code, item_description, amount, net_amount)
    return await send_email(to_email, to_name, subject, html)


async def send_delivery_confirmed_email(
    to_email: str,
    to_name: str,
    share_code: str,
    item_description: str,
    role: str
) -> bool:
    """Send delivery confirmation notification"""
    subject, html = get_delivery_confirmed_email(to_name, share_code, item_description, role)
    return await send_email(to_email, to_name, subject, html)


async def send_dispute_opened_email(
    to_email: str,
    to_name: str,
    share_code: str,
    dispute_type: str,
    description: str
) -> bool:
    """Send dispute opened notification"""
    subject, html = get_dispute_opened_email(to_name, share_code, dispute_type, description)
    return await send_email(to_email, to_name, subject, html)
