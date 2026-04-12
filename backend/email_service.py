"""
Postmark Email Service for TrustTrade
Handles transactional emails for escrow transactions
Professional email templates with consistent branding
"""

import os
import logging
from typing import Optional
from pathlib import Path
from dotenv import load_dotenv
import re
from html import unescape

# Load environment variables
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

logger = logging.getLogger(__name__)

# Postmark Configuration
POSTMARK_API_KEY = os.environ.get('POSTMARK_API_KEY', '')
SENDER_EMAIL = os.environ.get('POSTMARK_SENDER_EMAIL', 'noreply@trusttradesa.co.za')
SENDER_NAME = "TrustTrade"

# Brand Colors
BRAND_NAVY = "#1a2942"
BRAND_BLUE = "#2563eb"
LIGHT_GREY = "#f8f9fa"
LABEL_GREY = "#6c757d"
TEXT_DARK = "#212529"

# Initialize Postmark client
_postmark_client = None

def get_postmark_client():
    """Get or create Postmark API client"""
    global _postmark_client, POSTMARK_API_KEY
    
    # Re-check env var in case it was loaded later
    if not POSTMARK_API_KEY:
        POSTMARK_API_KEY = os.environ.get('POSTMARK_API_KEY', '')
    
    if not POSTMARK_API_KEY:
        logger.warning("Postmark API key not configured")
        return None
    
    if _postmark_client is None:
        try:
            from postmarker.core import PostmarkClient
            _postmark_client = PostmarkClient(server_token=POSTMARK_API_KEY)
            logger.info("Postmark client initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize Postmark client: {e}")
            return None
    
    return _postmark_client


async def send_email(
    to_email: str,
    to_name: str,
    subject: str,
    html_content: str,
    text_content: Optional[str] = None
) -> bool:
    """
    Send a transactional email via Postmark.
    """
    print(f"[EMAIL] Sending email to: {to_email}")
    print(f"[EMAIL] Subject: {subject}")
    logger.info(f"[EMAIL] Sending to: {to_email}, Subject: {subject}")
    
    # Validate email address before attempting to send
    if not to_email or not to_email.strip() or '@' not in to_email:
        print(f"[EMAIL] SKIPPED - invalid/empty address: {to_email}")
        logger.info(f"[EMAIL] SKIPPED: invalid/empty address '{to_email}'")
        return False
    
    client = get_postmark_client()
    
    if not client:
        print(f"[EMAIL] SKIPPED - Postmark not configured")
        logger.info(f"[EMAIL] SKIPPED: Postmark not configured for {to_email}")
        return False
    
    try:
        # Generate plain text from HTML if not provided
        if not text_content:
            text_content = re.sub('<[^<]+?>', '', html_content)
            text_content = unescape(text_content)
            text_content = re.sub(r'\s+', ' ', text_content).strip()
        
        print(f"[EMAIL] Calling Postmark API...")
        response = client.emails.send(
            From=f"{SENDER_NAME} <{SENDER_EMAIL}>",
            To=f"{to_name} <{to_email}>",
            Subject=subject,
            HtmlBody=html_content,
            TextBody=text_content,
            MessageStream="outbound"
        )
        
        message_id = response.get('MessageID', 'unknown')
        print(f"[EMAIL] SUCCESS! MessageID: {message_id}")
        logger.info(f"[EMAIL] SUCCESS: to={to_email}, MessageID={message_id}")
        return True
        
    except Exception as e:
        print(f"[EMAIL ERROR] {str(e)}")
        logger.error(f"[EMAIL ERROR] to={to_email}, error={str(e)}")
        return False


# Logo URL for emails
EMAIL_LOGO_URL = "https://customer-assets.emergentagent.com/job_trust-trade-pay/artifacts/g0wqdpup_TrustTrade%20Logo.png"

# ============ BASE EMAIL TEMPLATE ============

def get_base_email_template(
    heading: str,
    greeting_name: str,
    intro_text: str,
    details: dict,
    cta_text: str = None,
    cta_link: str = None,
    show_how_it_works: bool = True,
    status_badge: str = None,
    status_color: str = None
) -> str:
    """
    Generate a professional email using the base template.
    
    Args:
        heading: Main heading text (e.g., "New Transaction Created")
        greeting_name: Name for greeting (e.g., "Marnich")
        intro_text: Introduction paragraph
        details: Dict of label-value pairs for transaction details
        cta_text: Call-to-action button text
        cta_link: Call-to-action button URL
        show_how_it_works: Whether to show the "How It Works" section
        status_badge: Optional status text to show as a badge
        status_color: Color for status badge (#hex)
    """
    
    # Build details rows
    details_html = ""
    for label, value in details.items():
        details_html += f"""
        <tr>
            <td style="padding: 8px 0; font-size: 12px; text-transform: uppercase; color: {LABEL_GREY}; letter-spacing: 0.5px; width: 120px; vertical-align: top;">{label}</td>
            <td style="padding: 8px 0; font-size: 14px; color: {TEXT_DARK}; font-weight: 500;">{value}</td>
        </tr>
        """
    
    # CTA Button
    cta_html = ""
    if cta_text and cta_link:
        cta_html = f"""
        <div style="text-align: center; margin: 30px 0;">
            <a href="{cta_link}" style="display: inline-block; background-color: {BRAND_NAVY}; color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 600; max-width: 200px;">
                {cta_text}
            </a>
        </div>
        """
    
    # Status Badge
    badge_html = ""
    if status_badge:
        badge_color = status_color or BRAND_BLUE
        badge_html = f"""
        <div style="text-align: center; margin-bottom: 20px;">
            <span style="display: inline-block; background-color: {badge_color}; color: white; padding: 6px 16px; border-radius: 20px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                {status_badge}
            </span>
        </div>
        """
    
    # How It Works Section
    how_it_works_html = ""
    if show_how_it_works:
        how_it_works_html = f"""
        <div style="background-color: {LIGHT_GREY}; padding: 20px; border-radius: 8px; margin-top: 30px;">
            <p style="font-size: 12px; text-transform: uppercase; color: {LABEL_GREY}; letter-spacing: 0.5px; margin: 0 0 12px 0; font-weight: 600;">How TrustTrade Works</p>
            <table style="width: 100%; border-collapse: collapse;">
                <tr>
                    <td style="padding: 6px 0; font-size: 14px; color: {TEXT_DARK};">
                        <span style="display: inline-block; width: 20px; height: 20px; background-color: {BRAND_NAVY}; color: white; border-radius: 50%; text-align: center; line-height: 20px; font-size: 11px; margin-right: 10px;">1</span>
                        Buyer pays into escrow
                    </td>
                </tr>
                <tr>
                    <td style="padding: 6px 0; font-size: 14px; color: {TEXT_DARK};">
                        <span style="display: inline-block; width: 20px; height: 20px; background-color: {BRAND_NAVY}; color: white; border-radius: 50%; text-align: center; line-height: 20px; font-size: 11px; margin-right: 10px;">2</span>
                        Seller delivers item
                    </td>
                </tr>
                <tr>
                    <td style="padding: 6px 0; font-size: 14px; color: {TEXT_DARK};">
                        <span style="display: inline-block; width: 20px; height: 20px; background-color: {BRAND_NAVY}; color: white; border-radius: 50%; text-align: center; line-height: 20px; font-size: 11px; margin-right: 10px;">3</span>
                        Buyer confirms delivery
                    </td>
                </tr>
                <tr>
                    <td style="padding: 6px 0; font-size: 14px; color: {TEXT_DARK};">
                        <span style="display: inline-block; width: 20px; height: 20px; background-color: {BRAND_NAVY}; color: white; border-radius: 50%; text-align: center; line-height: 20px; font-size: 11px; margin-right: 10px;">4</span>
                        Funds released to seller (10:00 or 15:00 daily)
                    </td>
                </tr>
            </table>
        </div>
        """
    
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>{heading}</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
        <table role="presentation" style="width: 100%; border-collapse: collapse;">
            <tr>
                <td style="padding: 20px 16px;">
                    <table role="presentation" style="max-width: 600px; margin: 0 auto; border-collapse: collapse; width: 100%;">
                        
                        <!-- Header -->
                        <tr>
                            <td style="background-color: {BRAND_NAVY}; padding: 24px; text-align: center; border-radius: 8px 8px 0 0;">
                                <img src="{EMAIL_LOGO_URL}" alt="TrustTrade" style="height: 40px; max-width: 200px; display: block; margin: 0 auto;">
                            </td>
                        </tr>
                        
                        <!-- Body -->
                        <tr>
                            <td style="background-color: white; padding: 32px 24px;">
                                
                                {badge_html}
                                
                                <!-- Greeting -->
                                <p style="font-size: 16px; color: {TEXT_DARK}; margin: 0 0 16px 0;">Hi {greeting_name},</p>
                                
                                <!-- Intro Text -->
                                <p style="font-size: 14px; color: {TEXT_DARK}; margin: 0 0 24px 0; line-height: 1.6;">{intro_text}</p>
                                
                                <!-- Transaction Details Box -->
                                <div style="background-color: {LIGHT_GREY}; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
                                    <p style="font-size: 12px; text-transform: uppercase; color: {LABEL_GREY}; letter-spacing: 0.5px; margin: 0 0 16px 0; font-weight: 600;">Transaction Details</p>
                                    <table style="width: 100%; border-collapse: collapse;">
                                        {details_html}
                                    </table>
                                </div>
                                
                                {cta_html}
                                
                                {how_it_works_html}
                                
                            </td>
                        </tr>
                        
                        <!-- Footer -->
                        <tr>
                            <td style="background-color: {LIGHT_GREY}; padding: 24px; text-align: center; border-radius: 0 0 8px 8px;">
                                <p style="margin: 0 0 8px 0; font-size: 12px; color: {LABEL_GREY};">
                                    &copy; 2026 TrustTrade South Africa
                                </p>
                                <p style="margin: 0 0 8px 0; font-size: 12px; color: {LABEL_GREY};">
                                    <a href="https://www.trusttradesa.co.za" style="color: {BRAND_NAVY}; text-decoration: none;">trusttradesa.co.za</a>
                                </p>
                                <p style="margin: 0; font-size: 11px; color: {LABEL_GREY};">
                                    Secured by TrustTrade Escrow
                                </p>
                            </td>
                        </tr>
                        
                    </table>
                </td>
            </tr>
        </table>
    </body>
    </html>
    """
    
    return html_content


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
    
    subject = f"{share_code} - New escrow transaction created"
    
    intro_text = f"A new escrow transaction has been created. You are the <strong>{role}</strong> in this transaction."
    
    details = {
        "Reference": share_code,
        "Item": item_description,
        "Amount": f"R {amount:,.2f}",
        "Other Party": other_party_name,
        "Status": "Awaiting Payment" if role.lower() == "buyer" else "Awaiting Confirmation"
    }
    
    html_content = get_base_email_template(
        heading="New Transaction Created",
        greeting_name=recipient_name,
        intro_text=intro_text,
        details=details,
        cta_text="View Transaction",
        cta_link=share_link,
        show_how_it_works=True,
        status_badge="New Transaction",
        status_color=BRAND_BLUE
    )
    
    return subject, html_content


def get_payment_received_email(
    recipient_name: str,
    share_code: str,
    item_description: str,
    amount: float,
    role: str
) -> tuple[str, str]:
    """Generate payment received email content"""
    
    subject = f"{share_code} — Payment Secured by TrustTrade"
    
    if role.lower() == "seller":
        intro_text = "Great news! Payment has been received and is now secured in escrow. Please deliver the item to the buyer. Once they confirm delivery, the funds will be released to your account."
    else:
        intro_text = "<strong>Your payment has been secured safely in TrustTrade Escrow.</strong><br><br>Your funds are protected until you confirm delivery."
    
    # Add note about payment processor emails - prominent placement
    processor_note = """
    <div style='margin-top: 20px; padding: 16px; background-color: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 4px;'>
        <p style='font-size: 13px; color: #92400e; margin: 0; font-weight: 500;'>
            <strong>Note:</strong> You may also receive a separate payment notification from our secure payment processor — this is completely normal and expected as part of our security process.
        </p>
    </div>
    """
    
    details = {
        "Reference": share_code,
        "Item": item_description,
        "Amount": f"R {amount:,.2f}",
        "Status": "Funds Secured in Escrow"
    }
    
    html_content = get_base_email_template(
        heading="Payment Secured",
        greeting_name=recipient_name,
        intro_text=intro_text + processor_note,
        details=details,
        cta_text="View Transaction",
        cta_link=f"https://www.trusttradesa.co.za/t/{share_code}",
        show_how_it_works=False,
        status_badge="Payment Secured",
        status_color="#10b981"
    )
    
    return subject, html_content


# Priority email - send IMMEDIATELY when payment received (before TradeSafe email)
def get_immediate_payment_secured_email(
    recipient_name: str,
    share_code: str,
    item_description: str,
    amount: float
) -> tuple[str, str]:
    """
    Generate IMMEDIATE payment secured email for buyer.
    This email is sent the MOMENT payment is confirmed to arrive before TradeSafe's email.
    """
    
    subject = f"{share_code} — Payment Secured by TrustTrade"
    
    intro_html = """
    <p style='font-size: 18px; color: #10b981; font-weight: 700; margin: 0 0 16px 0;'>Your payment has been secured safely in TrustTrade Escrow.</p>
    <p style='font-size: 15px; color: #212529; margin: 0 0 20px 0; line-height: 1.6;'>Your funds are protected until you confirm delivery.</p>
    """
    
    # Prominent note about TradeSafe email - this is key!
    processor_note = """
    <div style='margin: 24px 0; padding: 16px 20px; background-color: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 6px;'>
        <p style='font-size: 14px; color: #92400e; margin: 0; line-height: 1.5;'>
            <strong>Note:</strong> You may also receive a separate payment notification from our secure payment processor — this is completely normal and expected.
        </p>
    </div>
    """
    
    details = {
        "Reference": share_code,
        "Item": item_description,
        "Amount": f"R {amount:,.2f}",
        "Status": "Funds Secured in Escrow"
    }
    
    html_content = get_base_email_template(
        heading="Payment Secured",
        greeting_name=recipient_name,
        intro_text=intro_html + processor_note,
        details=details,
        cta_text="View Transaction",
        cta_link=f"https://www.trusttradesa.co.za/t/{share_code}",
        show_how_it_works=True,
        status_badge="Payment Secured",
        status_color="#10b981"
    )
    
    return subject, html_content


async def send_immediate_payment_secured_email(
    to_email: str,
    to_name: str,
    share_code: str,
    item_description: str,
    amount: float
) -> bool:
    """
    Send IMMEDIATE payment secured email to buyer.
    Called the MOMENT webhook receives FUNDS_RECEIVED - must be fast!
    """
    subject, html = get_immediate_payment_secured_email(to_name, share_code, item_description, amount)
    return await send_email(to_email, to_name, subject, html)


def get_delivery_started_email(
    recipient_name: str,
    share_code: str,
    item_description: str,
    seller_name: str
) -> tuple[str, str]:
    """Generate delivery started email for buyer"""
    
    subject = f"{share_code} — Your item is on its way"
    
    intro_text = f"Good news! {seller_name} has dispatched your item. Please confirm delivery once you receive it to release the funds to the seller."
    
    # Add payment processor note
    processor_note = """
    <p style='font-size: 12px; color: #6c757d; margin-top: 16px; padding: 12px; background-color: #f8f9fa; border-radius: 6px;'>
        <strong>Note:</strong> You may receive a separate notification from our secure payment processor — this is normal and part of our security process.
    </p>
    """
    
    details = {
        "Reference": share_code,
        "Item": item_description,
        "Seller": seller_name,
        "Status": "Item Dispatched"
    }
    
    html_content = get_base_email_template(
        heading="Item Dispatched",
        greeting_name=recipient_name,
        intro_text=intro_text + processor_note,
        details=details,
        cta_text="Confirm Delivery",
        cta_link=f"https://www.trusttradesa.co.za/t/{share_code}",
        show_how_it_works=False,
        status_badge="On Its Way",
        status_color="#f59e0b"
    )
    
    return subject, html_content


def get_delivery_confirmed_email(
    recipient_name: str,
    share_code: str,
    item_description: str,
    role: str
) -> tuple[str, str]:
    """Generate delivery confirmed email content"""
    
    subject = f"{share_code} - Delivery confirmed - funds releasing"
    
    if role.lower() == "seller":
        intro_text = "The buyer has confirmed receiving the item. Your funds will be released during the next payout window (10:00 or 15:00 daily)."
        status_text = "Funds Releasing"
    else:
        intro_text = "Thank you for confirming delivery. The seller's funds will now be released. We hope you enjoy your purchase!"
        status_text = "Complete"
    
    details = {
        "Reference": share_code,
        "Item": item_description,
        "Status": "Delivery Confirmed"
    }
    
    html_content = get_base_email_template(
        heading="Delivery Confirmed",
        greeting_name=recipient_name,
        intro_text=intro_text,
        details=details,
        cta_text="View Transaction",
        cta_link=f"https://www.trusttradesa.co.za/t/{share_code}",
        show_how_it_works=False,
        status_badge=status_text,
        status_color="#10b981"
    )
    
    return subject, html_content


def get_funds_released_email(
    recipient_name: str,
    share_code: str,
    item_description: str,
    amount: float,
    net_amount: float
) -> tuple[str, str]:
    """Generate funds released email content"""
    
    subject = f"{share_code} — Your funds have been released"
    
    intro_text = "Congratulations! Your funds have been released and will be deposited to your bank account during the next payout window (10:00 or 15:00 daily)."
    
    # Add payment processor note
    processor_note = """
    <p style='font-size: 12px; color: #6c757d; margin-top: 16px; padding: 12px; background-color: #f8f9fa; border-radius: 6px;'>
        <strong>Note:</strong> You may receive a separate notification from our secure payment processor — this is normal and part of our security process.
    </p>
    """
    
    details = {
        "Reference": share_code,
        "Item": item_description,
        "Total Amount": f"R {amount:,.2f}",
        "TrustTrade Fee (2%)": f"R {(amount - net_amount):,.2f}",
        "Amount Released": f"R {net_amount:,.2f}"
    }
    
    html_content = get_base_email_template(
        heading="Funds Released",
        greeting_name=recipient_name,
        intro_text=intro_text + processor_note,
        details=details,
        cta_text="View Transaction",
        cta_link=f"https://www.trusttradesa.co.za/t/{share_code}",
        show_how_it_works=False,
        status_badge="Funds Released",
        status_color="#10b981"
    )
    
    return subject, html_content


def get_dispute_opened_email(
    recipient_name: str,
    share_code: str,
    dispute_type: str,
    description: str
) -> tuple[str, str]:
    """Generate dispute opened email content"""
    
    subject = f"{share_code} - Dispute opened - action required"
    
    intro_text = "A dispute has been opened for this transaction. Our team will review the case and contact both parties. Funds will remain securely in escrow until the dispute is resolved. Please respond to any requests for additional information promptly."
    
    details = {
        "Reference": share_code,
        "Dispute Type": dispute_type,
        "Description": description[:100] + "..." if len(description) > 100 else description,
        "Status": "Under Review"
    }
    
    html_content = get_base_email_template(
        heading="Dispute Opened",
        greeting_name=recipient_name,
        intro_text=intro_text,
        details=details,
        cta_text="View Dispute",
        cta_link=f"https://www.trusttradesa.co.za/t/{share_code}",
        show_how_it_works=False,
        status_badge="Action Required",
        status_color="#ef4444"
    )
    
    return subject, html_content


def get_dispute_resolved_email(
    recipient_name: str,
    share_code: str,
    resolution: str,
    admin_notes: str
) -> tuple[str, str]:
    """Generate dispute resolved email"""
    
    subject = f"{share_code} - Dispute resolved"
    
    intro_text = "The dispute for this transaction has been resolved. Thank you for your patience during the review process."
    
    details = {
        "Reference": share_code,
        "Resolution": resolution,
        "Status": "Resolved"
    }
    
    if admin_notes:
        details["Notes"] = admin_notes[:100] + "..." if len(admin_notes) > 100 else admin_notes
    
    html_content = get_base_email_template(
        heading="Dispute Resolved",
        greeting_name=recipient_name,
        intro_text=intro_text,
        details=details,
        cta_text="View Transaction",
        cta_link=f"https://www.trusttradesa.co.za/t/{share_code}",
        show_how_it_works=False,
        status_badge="Resolved",
        status_color="#10b981"
    )
    
    return subject, html_content


def get_refund_email(
    recipient_name: str,
    share_code: str,
    amount: float,
    reason: str
) -> tuple[str, str]:
    """Generate refund notification email"""
    
    subject = f"{share_code} - Refund processed"
    
    intro_text = "A refund has been processed for your transaction. The funds will be returned to your original payment method within 3-5 business days."
    
    details = {
        "Reference": share_code,
        "Refund Amount": f"R {amount:,.2f}",
        "Status": "Refund Processed"
    }
    
    if reason:
        details["Reason"] = reason
    
    html_content = get_base_email_template(
        heading="Refund Processed",
        greeting_name=recipient_name,
        intro_text=intro_text,
        details=details,
        cta_text="View Transaction",
        cta_link=f"https://www.trusttradesa.co.za/t/{share_code}",
        show_how_it_works=False,
        status_badge="Refunded",
        status_color=BRAND_BLUE
    )
    
    return subject, html_content


def get_verification_status_email(
    recipient_name: str,
    status: str
) -> tuple[str, str]:
    """Generate ID verification status update email"""
    
    subject = f"TrustTrade - ID verification {status.lower()}"
    
    status_config = {
        "verified": {
            "intro": "Great news! Your ID has been verified successfully. You now have full access to all TrustTrade features.",
            "badge": "Verified",
            "color": "#10b981"
        },
        "rejected": {
            "intro": "Unfortunately, your ID verification was not successful. Please log in and upload a clear photo of your ID document to try again.",
            "badge": "Action Required",
            "color": "#ef4444"
        },
        "pending": {
            "intro": "Your ID document is currently under review. We'll notify you once the verification is complete. This usually takes 1-2 business days.",
            "badge": "Under Review",
            "color": "#f59e0b"
        }
    }
    
    config = status_config.get(status.lower(), status_config["pending"])
    
    details = {
        "Status": status.upper(),
        "Account": "TrustTrade Escrow"
    }
    
    html_content = get_base_email_template(
        heading="ID Verification Update",
        greeting_name=recipient_name,
        intro_text=config["intro"],
        details=details,
        cta_text="View Account",
        cta_link="https://www.trusttradesa.co.za/profile",
        show_how_it_works=False,
        status_badge=config["badge"],
        status_color=config["color"]
    )
    
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


async def send_delivery_started_email(
    to_email: str,
    to_name: str,
    share_code: str,
    item_description: str,
    seller_name: str
) -> bool:
    """Send delivery started notification to buyer"""
    subject, html = get_delivery_started_email(to_name, share_code, item_description, seller_name)
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


async def send_dispute_resolved_email(
    to_email: str,
    to_name: str,
    share_code: str,
    resolution: str,
    admin_notes: str = ""
) -> bool:
    """Send dispute resolved notification"""
    subject, html = get_dispute_resolved_email(to_name, share_code, resolution, admin_notes)
    return await send_email(to_email, to_name, subject, html)


async def send_refund_email(
    to_email: str,
    to_name: str,
    share_code: str,
    amount: float,
    reason: str = ""
) -> bool:
    """Send refund notification"""
    subject, html = get_refund_email(to_name, share_code, amount, reason)
    return await send_email(to_email, to_name, subject, html)


async def send_verification_status_email(
    to_email: str,
    to_name: str,
    status: str
) -> bool:
    """Send ID verification status update"""
    subject, html = get_verification_status_email(to_name, status)
    return await send_email(to_email, to_name, subject, html)
