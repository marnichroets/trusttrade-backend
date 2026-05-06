"""
Postmark Email Service for TrustTrade
Handles transactional emails for escrow transactions
Professional email templates with consistent branding
"""

import os
import asyncio
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
BRAND_NAVY  = "#0F1E35"   # dark navy — header / footer / accents
BRAND_BLUE  = "#2563eb"   # kept for badge fallback
CYAN_LINE   = "#00D1FF"   # 3-px top-border accent
LIGHT_GREY  = "#f8f9fa"
LABEL_GREY  = "#6B7280"
TEXT_DARK   = "#111827"
TEXT_MUTED  = "#6B7280"
BORDER_CLR  = "#E5E7EB"

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
            text_content = re.sub(r'<(?:br|p|div|tr|li|h[1-6])[^>]*>', '\n', html_content, flags=re.IGNORECASE)
            text_content = re.sub('<[^<]+?>', '', text_content)
            text_content = unescape(text_content)
            text_content = re.sub(r'\n{3,}', '\n\n', text_content)
            text_content = re.sub(r'[ \t]+', ' ', text_content).strip()

        print(f"[EMAIL] Calling Postmark API...")
        response = client.emails.send(
            From=f"{SENDER_NAME} <{SENDER_EMAIL}>",
            To=f"{to_name} <{to_email}>",
            ReplyTo="trusttrade.register@gmail.com",
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


# Logo URL for emails — served from backend static files
EMAIL_LOGO_URL = "https://trusttrade-backend-production-3efa.up.railway.app/static/trusttrade-logo.png"

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
    """Generate a professional TrustTrade email with dark navy header/footer."""

    # ── Details rows ──────────────────────────────────────────────────────────
    details_rows = ""
    for i, (label, value) in enumerate(details.items()):
        row_bg = "#F9FAFB" if i % 2 == 0 else "#FFFFFF"
        details_rows += f"""
        <tr>
          <td style="padding:10px 16px;background:{row_bg};font-size:11px;text-transform:uppercase;letter-spacing:0.6px;color:{TEXT_MUTED};width:38%;vertical-align:top;font-weight:600;border-bottom:1px solid {BORDER_CLR};">{label}</td>
          <td style="padding:10px 16px;background:{row_bg};font-size:14px;color:{TEXT_DARK};font-weight:500;vertical-align:top;border-bottom:1px solid {BORDER_CLR};">{value}</td>
        </tr>"""

    # ── Status badge ──────────────────────────────────────────────────────────
    badge_html = ""
    if status_badge:
        badge_color = status_color or BRAND_BLUE
        badge_html = f"""
        <div style="margin-bottom:20px;">
          <span style="display:inline-block;background:{badge_color};color:white;padding:5px 14px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;">{status_badge}</span>
        </div>"""

    # ── CTA button ────────────────────────────────────────────────────────────
    cta_html = ""
    if cta_text and cta_link:
        cta_html = f"""
        <div style="text-align:center;margin:32px 0;">
          <a href="{cta_link}" style="display:inline-block;background:{BRAND_NAVY};color:white;padding:14px 36px;text-decoration:none;font-size:14px;font-weight:700;letter-spacing:0.3px;">
            {cta_text} &rarr;
          </a>
        </div>"""

    # ── How It Works ──────────────────────────────────────────────────────────
    hiw_html = ""
    if show_how_it_works:
        steps = [
            ("01", "Buyer pays into escrow"),
            ("02", "Seller delivers the item"),
            ("03", "Buyer confirms delivery"),
            ("04", "Funds released to seller (10:00 or 15:00 daily)"),
        ]
        step_rows = ""
        for num, step in steps:
            step_rows += f"""
            <tr>
              <td style="padding:8px 0;">
                <span style="display:inline-block;width:22px;height:22px;background:{BRAND_NAVY};color:white;text-align:center;line-height:22px;font-size:10px;font-weight:700;margin-right:12px;vertical-align:middle;">{num}</span>
                <span style="font-size:13px;color:{TEXT_DARK};vertical-align:middle;">{step}</span>
              </td>
            </tr>"""
        hiw_html = f"""
        <table style="width:100%;border-collapse:collapse;border:1px solid {BORDER_CLR};margin-top:28px;">
          <tr>
            <td style="padding:10px 16px;background:{BRAND_NAVY};font-size:10px;text-transform:uppercase;letter-spacing:1px;color:rgba(255,255,255,0.65);font-weight:700;">
              HOW TRUSTTRADE WORKS
            </td>
          </tr>
          <tr>
            <td style="padding:16px 20px;background:white;">
              <table style="width:100%;border-collapse:collapse;">{step_rows}</table>
            </td>
          </tr>
        </table>"""

    # ── Full template ─────────────────────────────────────────────────────────
    return f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{heading}</title>
</head>
<body style="margin:0;padding:0;background:#F0F2F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;-webkit-font-smoothing:antialiased;">
<table role="presentation" style="width:100%;border-collapse:collapse;background:#F0F2F5;">
<tr><td style="padding:32px 16px;">

  <table role="presentation" style="max-width:580px;margin:0 auto;border-collapse:collapse;width:100%;">

    <!-- ── HEADER ── -->
    <tr>
      <td style="background:{BRAND_NAVY};padding:28px 32px;text-align:center;">
        <img src="{EMAIL_LOGO_URL}" alt="TrustTrade" style="height:44px;max-width:200px;display:block;margin:0 auto 10px;">
        <p style="margin:0;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:rgba(255,255,255,0.4);font-weight:600;">SECURE ESCROW &middot; SOUTH AFRICA</p>
      </td>
    </tr>

    <!-- ── HEADING BAND ── -->
    <tr>
      <td style="background:white;padding:28px 32px 0;border-top:3px solid {CYAN_LINE};">
        <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:{BRAND_NAVY};letter-spacing:-0.3px;">{heading}</h1>
        {badge_html}
      </td>
    </tr>

    <!-- ── BODY ── -->
    <tr>
      <td style="background:white;padding:0 32px 36px;">

        <p style="font-size:15px;color:{TEXT_DARK};margin:0 0 20px;line-height:1.5;">Hi {greeting_name},</p>

        <div style="font-size:14px;color:{TEXT_DARK};line-height:1.7;margin:0 0 28px;">{intro_text}</div>

        <!-- Transaction Details -->
        <table style="width:100%;border-collapse:collapse;border:1px solid {BORDER_CLR};margin-bottom:28px;">
          <tr>
            <td colspan="2" style="padding:10px 16px;background:{BRAND_NAVY};font-size:10px;text-transform:uppercase;letter-spacing:1px;color:rgba(255,255,255,0.65);font-weight:700;">
              TRANSACTION DETAILS
            </td>
          </tr>
          {details_rows}
        </table>

        {cta_html}

        {hiw_html}

      </td>
    </tr>

    <!-- ── FOOTER ── -->
    <tr>
      <td style="background:{BRAND_NAVY};padding:24px 32px;text-align:center;">
        <p style="margin:0 0 6px;font-size:12px;color:rgba(255,255,255,0.45);">
          &copy; 2026 TrustTrade South Africa. All rights reserved.
        </p>
        <p style="margin:0 0 6px;font-size:12px;">
          <a href="https://www.trusttradesa.co.za" style="color:rgba(255,255,255,0.55);text-decoration:none;">trusttradesa.co.za</a>
          &nbsp;&middot;&nbsp;
          <a href="https://www.trusttradesa.co.za/privacy" style="color:rgba(255,255,255,0.55);text-decoration:none;">Privacy</a>
          &nbsp;&middot;&nbsp;
          <a href="https://www.trusttradesa.co.za/terms" style="color:rgba(255,255,255,0.55);text-decoration:none;">Terms</a>
        </p>
        <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.25);">Secured by TrustTrade Escrow</p>
      </td>
    </tr>

  </table>

</td></tr>
</table>
</body>
</html>"""


# ============ EMAIL VERIFICATION ============

async def send_verification_email(email: str, name: str, verification_url: str) -> bool:
    """Send email address verification email to a new user."""
    subject = "Verify your TrustTrade email address"
    html = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F0F2F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
<table role="presentation" style="width:100%;border-collapse:collapse;background:#F0F2F5;">
<tr><td style="padding:32px 16px;">
  <table role="presentation" style="max-width:560px;margin:0 auto;border-collapse:collapse;width:100%;">
    <tr>
      <td style="background:{BRAND_NAVY};padding:28px 32px;text-align:center;">
        <img src="{EMAIL_LOGO_URL}" alt="TrustTrade" style="height:40px;max-width:180px;display:block;margin:0 auto 8px;">
        <p style="margin:0;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:rgba(255,255,255,0.4);font-weight:600;">SECURE ESCROW &middot; SOUTH AFRICA</p>
      </td>
    </tr>
    <tr>
      <td style="background:white;padding:32px 32px 8px;border-top:3px solid {CYAN_LINE};">
        <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:{BRAND_NAVY};">Verify your email address</h1>
        <p style="font-size:15px;color:{TEXT_DARK};margin:0 0 24px;line-height:1.5;">Hi {name},</p>
        <p style="font-size:14px;color:{TEXT_DARK};line-height:1.7;margin:0 0 28px;">
          Thank you for creating a TrustTrade account. Click the button below to verify your email
          address and activate your account.
        </p>
        <div style="text-align:center;margin:32px 0;">
          <a href="{verification_url}" style="display:inline-block;background:{BRAND_NAVY};color:white;padding:14px 40px;text-decoration:none;font-size:14px;font-weight:700;letter-spacing:0.3px;">
            Verify Email Address &rarr;
          </a>
        </div>
        <p style="font-size:13px;color:{LABEL_GREY};line-height:1.6;margin:0 0 16px;">
          If the button doesn't work, copy and paste this link into your browser:<br>
          <a href="{verification_url}" style="color:#2563eb;word-break:break-all;">{verification_url}</a>
        </p>
        <p style="font-size:12px;color:{LABEL_GREY};margin:0 0 28px;">
          This link expires in 24 hours. If you did not create a TrustTrade account, you can safely ignore this email.
        </p>
      </td>
    </tr>
    <tr>
      <td style="background:{BRAND_NAVY};padding:20px 32px;text-align:center;">
        <p style="margin:0 0 4px;font-size:12px;color:rgba(255,255,255,0.45);">&copy; 2026 TrustTrade South Africa.</p>
        <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.25);">Secured by TrustTrade Escrow</p>
      </td>
    </tr>
  </table>
</td></tr>
</table>
</body>
</html>"""
    return await send_email(email, name, subject, html)


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
    
    subject = f"TrustTrade: New Transaction {share_code}"
    
    if role.lower() == "buyer":
        intro_text = f"""A new escrow transaction has been created for your purchase. You are the <strong>Buyer</strong>.
        
        <div style="background: #e8f5e9; padding: 12px; border-radius: 8px; margin: 16px 0;">
            <strong>What happens next:</strong><br>
            1. Review and confirm the transaction details<br>
            2. Make payment through our secure escrow<br>
            3. Receive your item<br>
            4. Confirm delivery to release funds to seller
        </div>"""
    else:
        intro_text = f"""A new escrow transaction has been created. You are the <strong>Seller</strong>.
        
        <div style="background: #fff3e0; padding: 12px; border-radius: 8px; margin: 16px 0;">
            <strong>What happens next:</strong><br>
            1. Review and confirm the transaction details<br>
            2. Wait for buyer to make payment<br>
            3. Ship the item once payment is secured<br>
            4. Receive payout within 1-2 business days after buyer confirms
        </div>"""
    
    details = {
        "Reference": share_code,
        "Item": item_description,
        "Amount": f"R {amount:,.2f}",
        "Other Party": other_party_name,
        "Your Role": role.capitalize(),
        "Status": "Awaiting Confirmation"
    }
    
    html_content = get_base_email_template(
        heading="New Transaction Created",
        greeting_name=recipient_name,
        intro_text=intro_text,
        details=details,
        cta_text="View Transaction",
        cta_link=share_link,
        show_how_it_works=False,
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
    
    subject = f"TrustTrade: Payment Secured - {share_code}"
    
    if role.lower() == "seller":
        intro_text = """<strong style="color: #10b981;">Payment has been secured in escrow!</strong>
        
        <div style="background: #e8f5e9; padding: 12px; border-radius: 8px; margin: 16px 0;">
            <strong>What you need to do:</strong><br>
            1. Ship/deliver the item to the buyer<br>
            2. Mark as shipped in TrustTrade<br>
            3. Wait for buyer to confirm receipt<br><br>
            <strong>Payout:</strong> 1-2 business days after buyer confirms delivery
        </div>"""
    else:
        intro_text = """<strong style="color: #10b981;">Your payment has been secured safely in TrustTrade Escrow!</strong>
        
        <div style="background: #e3f2fd; padding: 12px; border-radius: 8px; margin: 16px 0;">
            <strong>What happens next:</strong><br>
            1. Seller will ship/deliver the item<br>
            2. Inspect the item when you receive it<br>
            3. Click "Confirm Delivery" to release funds to seller<br><br>
            <strong>Your money is protected</strong> until you confirm delivery.
        </div>"""
    
    # Add note about payment processor emails - prominent placement
    processor_note = """
    <div style='margin-top: 20px; padding: 16px; background-color: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 4px;'>
        <p style='font-size: 13px; color: #92400e; margin: 0; font-weight: 500;'>
            <strong>Note:</strong> You may also receive a separate notification from our payment processor — this is normal.
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
    
    subject = f"TrustTrade: Funds Released - {share_code}"
    
    fee_amount = amount - net_amount
    
    intro_text = f"""<strong style="color: #10b981;">Congratulations! Your funds have been released!</strong>
    
    <div style="background: #e8f5e9; padding: 16px; border-radius: 8px; margin: 16px 0;">
        <strong>Payout Details:</strong><br><br>
        <table style="width: 100%;">
            <tr><td>Item Amount:</td><td style="text-align: right;">R {amount:,.2f}</td></tr>
            <tr><td>TrustTrade Fee (2%, min R5):</td><td style="text-align: right;">- R {fee_amount:,.2f}</td></tr>
            <tr style="font-weight: bold; font-size: 16px;"><td>You Receive:</td><td style="text-align: right; color: #10b981;">R {net_amount:,.2f}</td></tr>
        </table>
    </div>
    
    <p><strong>Expected Deposit:</strong> Within 1-2 business days to your registered bank account.</p>
    """
    
    details = {
        "Reference": share_code,
        "Item": item_description,
        "Status": "Funds Released"
    }
    
    html_content = get_base_email_template(
        heading="Funds Released",
        greeting_name=recipient_name,
        intro_text=intro_text,
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
    logger.info("=" * 60)
    logger.info("[TX_EMAIL] === TRANSACTION CREATED EMAIL ===")
    logger.info(f"[TX_EMAIL] Event: transaction_created")
    logger.info(f"[TX_EMAIL] Recipient: {to_email}")
    logger.info(f"[TX_EMAIL] Name: {to_name}")
    logger.info(f"[TX_EMAIL] Role: {role}")
    logger.info(f"[TX_EMAIL] Share Code: {share_code}")
    logger.info(f"[TX_EMAIL] Item: {item_description}")
    logger.info(f"[TX_EMAIL] Amount: R{amount}")
    logger.info("=" * 60)
    
    try:
        share_link = f"{base_url}/t/{share_code}"
        subject, html = get_transaction_created_email(
            to_name, share_code, item_description, amount, other_party_name, role, share_link
        )
        logger.info(f"[TX_EMAIL] Subject: {subject}")
        logger.info(f"[TX_EMAIL] Calling send_email()...")
        
        result = await send_email(to_email, to_name, subject, html)
        
        logger.info(f"[TX_EMAIL] RESULT: {'SUCCESS' if result else 'FAILED'}")
        return result
    except Exception as e:
        logger.error(f"[TX_EMAIL] EXCEPTION: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return False


async def send_payment_received_email(
    to_email: str,
    to_name: str,
    share_code: str,
    item_description: str,
    amount: float,
    role: str
) -> bool:
    """Send payment received notification"""
    logger.info("=" * 60)
    logger.info("[TX_EMAIL] === PAYMENT RECEIVED EMAIL ===")
    logger.info(f"[TX_EMAIL] Event: payment_received")
    logger.info(f"[TX_EMAIL] Recipient: {to_email}")
    logger.info(f"[TX_EMAIL] Name: {to_name}")
    logger.info(f"[TX_EMAIL] Role: {role}")
    logger.info(f"[TX_EMAIL] Share Code: {share_code}")
    logger.info("=" * 60)
    
    try:
        subject, html = get_payment_received_email(to_name, share_code, item_description, amount, role)
        logger.info(f"[TX_EMAIL] Subject: {subject}")
        logger.info(f"[TX_EMAIL] Calling send_email()...")
        
        result = await send_email(to_email, to_name, subject, html)
        
        logger.info(f"[TX_EMAIL] RESULT: {'SUCCESS' if result else 'FAILED'}")
        return result
    except Exception as e:
        logger.error(f"[TX_EMAIL] EXCEPTION: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return False


async def send_delivery_started_email(
    to_email: str,
    to_name: str,
    share_code: str,
    item_description: str,
    seller_name: str
) -> bool:
    """Send delivery started notification to buyer"""
    logger.info("=" * 60)
    logger.info("[TX_EMAIL] === DELIVERY STARTED EMAIL ===")
    logger.info(f"[TX_EMAIL] Event: delivery_started")
    logger.info(f"[TX_EMAIL] Recipient: {to_email}")
    logger.info(f"[TX_EMAIL] Name: {to_name}")
    logger.info(f"[TX_EMAIL] Share Code: {share_code}")
    logger.info("=" * 60)
    
    try:
        subject, html = get_delivery_started_email(to_name, share_code, item_description, seller_name)
        logger.info(f"[TX_EMAIL] Subject: {subject}")
        logger.info(f"[TX_EMAIL] Calling send_email()...")
        
        result = await send_email(to_email, to_name, subject, html)
        
        logger.info(f"[TX_EMAIL] RESULT: {'SUCCESS' if result else 'FAILED'}")
        return result
    except Exception as e:
        logger.error(f"[TX_EMAIL] EXCEPTION: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return False


async def send_delivery_confirmed_email(
    to_email: str,
    to_name: str,
    share_code: str,
    item_description: str,
    role: str
) -> bool:
    """Send delivery confirmation notification"""
    logger.info("=" * 60)
    logger.info("[TX_EMAIL] === DELIVERY CONFIRMED EMAIL ===")
    logger.info(f"[TX_EMAIL] Event: delivery_confirmed")
    logger.info(f"[TX_EMAIL] Recipient: {to_email}")
    logger.info(f"[TX_EMAIL] Name: {to_name}")
    logger.info(f"[TX_EMAIL] Role: {role}")
    logger.info(f"[TX_EMAIL] Share Code: {share_code}")
    logger.info("=" * 60)
    
    try:
        subject, html = get_delivery_confirmed_email(to_name, share_code, item_description, role)
        logger.info(f"[TX_EMAIL] Subject: {subject}")
        logger.info(f"[TX_EMAIL] Calling send_email()...")
        
        result = await send_email(to_email, to_name, subject, html)
        
        logger.info(f"[TX_EMAIL] RESULT: {'SUCCESS' if result else 'FAILED'}")
        return result
    except Exception as e:
        logger.error(f"[TX_EMAIL] EXCEPTION: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return False


async def send_funds_released_email(
    to_email: str,
    to_name: str,
    share_code: str,
    item_description: str,
    amount: float,
    net_amount: float
) -> bool:
    """Send funds released notification"""
    logger.info("=" * 60)
    logger.info("[TX_EMAIL] === FUNDS RELEASED EMAIL ===")
    logger.info(f"[TX_EMAIL] Event: funds_released")
    logger.info(f"[TX_EMAIL] Recipient: {to_email}")
    logger.info(f"[TX_EMAIL] Name: {to_name}")
    logger.info(f"[TX_EMAIL] Share Code: {share_code}")
    logger.info(f"[TX_EMAIL] Amount: R{amount}, Net: R{net_amount}")
    logger.info("=" * 60)
    
    try:
        subject, html = get_funds_released_email(to_name, share_code, item_description, amount, net_amount)
        logger.info(f"[TX_EMAIL] Subject: {subject}")
        logger.info(f"[TX_EMAIL] Calling send_email()...")
        
        result = await send_email(to_email, to_name, subject, html)
        
        logger.info(f"[TX_EMAIL] RESULT: {'SUCCESS' if result else 'FAILED'}")
        return result
    except Exception as e:
        logger.error(f"[TX_EMAIL] EXCEPTION: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return False


async def send_dispute_opened_email(
    to_email: str,
    to_name: str,
    share_code: str,
    dispute_type: str,
    description: str
) -> bool:
    """Send dispute opened notification"""
    logger.info("=" * 60)
    logger.info("[TX_EMAIL] === DISPUTE OPENED EMAIL ===")
    logger.info(f"[TX_EMAIL] Event: dispute_opened")
    logger.info(f"[TX_EMAIL] Recipient: {to_email}")
    logger.info(f"[TX_EMAIL] Share Code: {share_code}")
    logger.info(f"[TX_EMAIL] Dispute Type: {dispute_type}")
    logger.info("=" * 60)
    
    try:
        subject, html = get_dispute_opened_email(to_name, share_code, dispute_type, description)
        logger.info(f"[TX_EMAIL] Subject: {subject}")
        result = await send_email(to_email, to_name, subject, html)
        logger.info(f"[TX_EMAIL] RESULT: {'SUCCESS' if result else 'FAILED'}")
        return result
    except Exception as e:
        logger.error(f"[TX_EMAIL] EXCEPTION: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return False


async def send_dispute_resolved_email(
    to_email: str,
    to_name: str,
    share_code: str,
    resolution: str,
    admin_notes: str = ""
) -> bool:
    """Send dispute resolved notification"""
    logger.info("=" * 60)
    logger.info("[TX_EMAIL] === DISPUTE RESOLVED EMAIL ===")
    logger.info(f"[TX_EMAIL] Event: dispute_resolved")
    logger.info(f"[TX_EMAIL] Recipient: {to_email}")
    logger.info(f"[TX_EMAIL] Share Code: {share_code}")
    logger.info(f"[TX_EMAIL] Resolution: {resolution}")
    logger.info("=" * 60)
    
    try:
        subject, html = get_dispute_resolved_email(to_name, share_code, resolution, admin_notes)
        logger.info(f"[TX_EMAIL] Subject: {subject}")
        result = await send_email(to_email, to_name, subject, html)
        logger.info(f"[TX_EMAIL] RESULT: {'SUCCESS' if result else 'FAILED'}")
        return result
    except Exception as e:
        logger.error(f"[TX_EMAIL] EXCEPTION: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return False


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


# ============ SMART DEAL EMAILS ============

_SD_FRONTEND = os.environ.get("FRONTEND_URL", "https://www.trusttradesa.co.za")


def _smart_deal_details(deal: dict) -> dict:
    return {
        "Deal ID": deal["deal_id"],
        "Title": deal["title"],
        "Amount": f"R {deal['amount']:,.2f}",
        "Client": deal.get("client_name") or deal["client_email"],
        "Freelancer": deal.get("freelancer_name") or deal["freelancer_email"],
        "Days to Deliver": f"{deal['days_to_deliver']} days",
    }


def _sd_html(heading: str, name: str, intro: str, deal: dict,
             cta_text: str, badge: str, badge_color: str) -> str:
    link = f"{_SD_FRONTEND}/smart-deals/{deal['deal_id']}"
    return get_base_email_template(
        heading=heading,
        greeting_name=name,
        intro_text=intro,
        details=_smart_deal_details(deal),
        cta_text=cta_text,
        cta_link=link,
        show_how_it_works=False,
        status_badge=badge,
        status_color=badge_color,
    )


async def send_smart_deal_created(
    freelancer_email: str,
    freelancer_name: str,
    client_name: str,
    deal_id: str,
    title: str,
    amount: float,
    scope: str,
    days: int,
) -> bool:
    """Email to freelancer when a new Smart Deal is created for them."""
    logger.info(f"[SMART_DEAL_EMAIL] send_smart_deal_created -> {freelancer_email}, deal={deal_id}")
    subject = f"Your Smart Deal is ready to accept — {title}"
    link = f"https://www.trusttradesa.co.za/smart-deals/{deal_id}"
    scope_display = scope[:200] + ("..." if len(scope) > 200 else "")
    details = {
        "Deal ID": deal_id,
        "Title": title,
        "Amount": f"R {amount:,.2f}",
        "Scope": scope_display,
        "Days to Deliver": f"{days} days",
        "Client": client_name,
    }
    html = get_base_email_template(
        heading="You've been invited to a Smart Deal",
        greeting_name=freelancer_name,
        intro_text=(
            f"<strong>{client_name}</strong> wants to hire you through TrustTrade's secure escrow platform. "
            f"Review the deal details below and click the button to accept. "
            f"Once you accept, the client funds the escrow — your payment is protected until you deliver and it's approved."
        ),
        details=details,
        cta_text="View &amp; Accept Deal",
        cta_link=link,
        show_how_it_works=False,
        status_badge="Action Required",
        status_color="#f97316",
    )
    return await send_email(freelancer_email, freelancer_name, subject, html)


async def send_smart_deal_accepted(deal: dict, client_name: str, freelancer_name: str) -> bool:
    """Email to client when freelancer accepts."""
    subject = f"TrustTrade: {freelancer_name} accepted your Smart Deal"
    html = _sd_html(
        heading="Freelancer accepted your deal",
        name=client_name,
        intro=(
            f"Great news — <strong>{freelancer_name}</strong> has accepted your Smart Deal. "
            f"The next step is to fund the escrow so work can begin. "
            f"Your payment is held securely and only released when you approve the delivery."
        ),
        deal=deal,
        cta_text="Fund Escrow",
        badge="Fund Escrow to Start",
        badge_color="#3b82f6",
    )
    return await send_email(deal["client_email"], client_name, subject, html)


async def send_smart_deal_funded(deal: dict, client_name: str, freelancer_name: str) -> bool:
    """Email to freelancer when escrow is funded."""
    subject = f"Payment secured — start your work on {deal['title']}"
    html = _sd_html(
        heading="Payment secured — start your work",
        name=freelancer_name,
        intro=(
            f"<strong>{client_name}</strong> has funded the escrow. "
            f"You can now start working on the deal. "
            f"When your work is complete, mark it as delivered from the deal page. "
            f"Payment will be released once the client approves your delivery."
        ),
        deal=deal,
        cta_text="View Deal",
        badge="Work in Progress",
        badge_color="#10b981",
    )
    return await send_email(deal["freelancer_email"], freelancer_name, subject, html)


async def send_smart_deal_delivered(deal: dict, client_name: str, freelancer_name: str) -> bool:
    """Email to client when freelancer marks as delivered."""
    subject = f"TrustTrade: {freelancer_name} has delivered — review and approve"
    html = _sd_html(
        heading="Delivery ready for review",
        name=client_name,
        intro=(
            f"<strong>{freelancer_name}</strong> has marked the work as delivered. "
            f"Please review the deliverable and approve to release payment, "
            f"or raise a dispute if there is an issue. "
            f"<strong>Payment will only be released when you manually approve.</strong>"
        ),
        deal=deal,
        cta_text="Review & Approve",
        badge="Action Required",
        badge_color="#8b5cf6",
    )
    return await send_email(deal["client_email"], client_name, subject, html)


async def send_smart_deal_approved(deal: dict, client_name: str, freelancer_name: str) -> bool:
    """Email to freelancer when client approves and payment is released."""
    subject = f"TrustTrade: Payment approved and being released — {deal['title']}"
    html = _sd_html(
        heading="Payment approved!",
        name=freelancer_name,
        intro=(
            f"<strong>{client_name}</strong> has approved the delivery and your payment is being released. "
            f"Funds will be processed by TradeSafe Escrow and deposited to your account. "
            f"Thank you for completing this Smart Deal on TrustTrade."
        ),
        deal=deal,
        cta_text="View Deal",
        badge="Payment Released",
        badge_color="#10b981",
    )
    return await send_email(deal["freelancer_email"], freelancer_name, subject, html)


async def send_smart_deal_disputed(
    deal: dict,
    client_name: str,
    freelancer_name: str,
    reason: str,
    raised_by_name: str,
    admin_email: str,
) -> bool:
    """Email both parties and admin when a dispute is raised."""
    subject = f"TrustTrade DISPUTE: {deal['deal_id']} — {deal['title']}"
    details_with_reason = {**_smart_deal_details(deal), "Dispute Reason": reason[:200]}
    link = f"{_SD_FRONTEND}/smart-deals/{deal['deal_id']}"

    def _dispute_html(name: str, intro: str) -> str:
        return get_base_email_template(
            heading="Dispute raised — admin investigating",
            greeting_name=name,
            intro_text=intro,
            details=details_with_reason,
            cta_text="View Deal",
            cta_link=link,
            show_how_it_works=False,
            status_badge="Disputed",
            status_color="#ef4444",
        )

    party_intro = (
        f"A dispute has been raised on this Smart Deal by <strong>{raised_by_name}</strong>. "
        f"Funds remain securely in escrow while TrustTrade admin investigates. "
        f"You will be contacted if further information is required."
    )
    admin_intro = (
        f"<strong>Dispute raised by:</strong> {raised_by_name} ({deal['client_email']})<br>"
        f"<strong>Reason:</strong> {reason}<br><br>"
        f"Client: {client_name} ({deal['client_email']})<br>"
        f"Freelancer: {freelancer_name} ({deal['freelancer_email']})"
    )

    results = await asyncio.gather(
        send_email(deal["client_email"], client_name, subject, _dispute_html(client_name, party_intro)),
        send_email(deal["freelancer_email"], freelancer_name, subject, _dispute_html(freelancer_name, party_intro)),
        send_email(admin_email, "TrustTrade Admin", subject, _dispute_html("Admin", admin_intro)),
        return_exceptions=True,
    )
    return all(r is True for r in results)
