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
from datetime import datetime, timezone, timedelta
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
EMAIL_LOGO_HTML = (
    f'<img src="{EMAIL_LOGO_URL}" alt="TrustTrade" width="220" '
    'style="display:block;width:220px;max-width:100%;height:auto;'
    'margin:0 auto 10px;object-fit:contain;">'
)

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
            ("01", "Buyer pays securely — funds held safely"),
            ("02", "Seller delivers the item"),
            ("03", "Buyer confirms delivery"),
            ("04", "Payout processing · up to 2 business days"),
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
      <td style="background:{BRAND_NAVY};padding:24px 32px;text-align:center;border-bottom:3px solid {CYAN_LINE};">
        {EMAIL_LOGO_HTML}
        <p style="margin:0;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:rgba(255,255,255,0.65);font-weight:600;">SECURE PAYMENTS &middot; SOUTH AFRICA</p>
      </td>
    </tr>

    <!-- ── HEADING BAND ── -->
    <tr>
      <td style="background:white;padding:28px 32px 0;">
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
        <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.25);">Secured by TrustTrade</p>
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
    subject = "Verify your TrustTrade email"
    html = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F0F2F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
<table role="presentation" style="width:100%;border-collapse:collapse;background:#F0F2F5;">
<tr><td style="padding:32px 16px;">
  <table role="presentation" style="max-width:560px;margin:0 auto;border-collapse:collapse;width:100%;">
    <tr>
      <td style="background:{BRAND_NAVY};padding:24px 32px;text-align:center;border-bottom:3px solid {CYAN_LINE};">
        {EMAIL_LOGO_HTML}
        <p style="margin:0;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:rgba(255,255,255,0.65);font-weight:600;">SECURE PAYMENTS &middot; SOUTH AFRICA</p>
      </td>
    </tr>
    <tr>
      <td style="background:white;padding:32px 32px 8px;">
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
        <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.25);">Secured by TrustTrade</p>
      </td>
    </tr>
  </table>
</td></tr>
</table>
</body>
</html>"""
    return await send_email(email, name, subject, html)


async def send_welcome_email(email: str, name: str, frontend_url: str) -> bool:
    """Send a welcome email immediately after successful registration."""
    first_name = name.split()[0] if name else name
    cta_link = "https://trusttradesa.co.za/transactions/new"
    subject = "Welcome to TrustTrade \U0001f389"
    html = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F0F2F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
<table role="presentation" style="width:100%;border-collapse:collapse;background:#F0F2F5;">
<tr><td style="padding:32px 16px;">
  <table role="presentation" style="max-width:560px;margin:0 auto;border-collapse:collapse;width:100%;">

    <!-- Header -->
    <tr>
      <td style="background:{BRAND_NAVY};padding:28px 32px;text-align:center;border-bottom:3px solid {CYAN_LINE};">
        {EMAIL_LOGO_HTML}
        <p style="margin:0;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:rgba(255,255,255,0.65);font-weight:600;">SECURE PAYMENTS &middot; SOUTH AFRICA</p>
      </td>
    </tr>

    <!-- Welcome heading -->
    <tr>
      <td style="background:white;padding:32px 32px 0;">
        <h1 style="margin:0 0 6px;font-size:24px;font-weight:700;color:{BRAND_NAVY};">Welcome to TrustTrade, {first_name}!</h1>
        <p style="margin:0 0 24px;font-size:14px;color:{TEXT_MUTED};">Your account is ready. Here's everything you need to know.</p>
      </td>
    </tr>

    <!-- Intro body -->
    <tr>
      <td style="background:white;padding:0 32px 28px;">
        <p style="font-size:15px;color:{TEXT_DARK};line-height:1.7;margin:0 0 20px;">
          We're excited to have you on board. TrustTrade is South Africa's secure payment protection platform — we hold your payment safely until <strong>both parties are satisfied</strong>, then release the funds. No more getting scammed. No more chasing payments.
        </p>

        <!-- What is escrow -->
        <table style="width:100%;border-collapse:collapse;border:1px solid {BORDER_CLR};margin-bottom:24px;">
          <tr>
            <td style="padding:10px 16px;background:{BRAND_NAVY};font-size:10px;text-transform:uppercase;letter-spacing:1px;color:rgba(255,255,255,0.65);font-weight:700;">
              HOW ARE PAYMENTS PROTECTED?
            </td>
          </tr>
          <tr>
            <td style="padding:18px 20px;background:#f9fafb;">
              <p style="font-size:14px;color:{TEXT_DARK};line-height:1.7;margin:0;">
                Think of TrustTrade as a trusted middleman. When you buy something, your money goes into a secure vault — not to the seller. The seller only gets paid once <strong>you confirm</strong> you've received what was agreed. If something goes wrong, we step in to resolve it.
              </p>
            </td>
          </tr>
        </table>

        <!-- How it works steps -->
        <table style="width:100%;border-collapse:collapse;border:1px solid {BORDER_CLR};margin-bottom:28px;">
          <tr>
            <td style="padding:10px 16px;background:{BRAND_NAVY};font-size:10px;text-transform:uppercase;letter-spacing:1px;color:rgba(255,255,255,0.65);font-weight:700;">
              HOW IT WORKS — 4 SIMPLE STEPS
            </td>
          </tr>
          <tr>
            <td style="padding:20px 20px 16px;">
              <table style="width:100%;border-collapse:collapse;">
                <tr>
                  <td style="padding:10px 0;border-bottom:1px solid {BORDER_CLR};">
                    <span style="display:inline-block;width:26px;height:26px;background:{BRAND_NAVY};color:white;text-align:center;line-height:26px;font-size:11px;font-weight:700;margin-right:14px;vertical-align:middle;">1</span>
                    <span style="font-size:14px;color:{TEXT_DARK};vertical-align:middle;"><strong>Create a deal</strong> &mdash; enter the item details, price, and invite the other party</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:10px 0;border-bottom:1px solid {BORDER_CLR};">
                    <span style="display:inline-block;width:26px;height:26px;background:{BRAND_NAVY};color:white;text-align:center;line-height:26px;font-size:11px;font-weight:700;margin-right:14px;vertical-align:middle;">2</span>
                    <span style="font-size:14px;color:{TEXT_DARK};vertical-align:middle;"><strong>Buyer pays securely</strong> &mdash; funds are held safely, not accessible to the seller yet</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:10px 0;border-bottom:1px solid {BORDER_CLR};">
                    <span style="display:inline-block;width:26px;height:26px;background:{BRAND_NAVY};color:white;text-align:center;line-height:26px;font-size:11px;font-weight:700;margin-right:14px;vertical-align:middle;">3</span>
                    <span style="font-size:14px;color:{TEXT_DARK};vertical-align:middle;"><strong>Seller delivers</strong> &mdash; item is shipped or handed over as agreed</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:10px 0;">
                    <span style="display:inline-block;width:26px;height:26px;background:{BRAND_NAVY};color:white;text-align:center;line-height:26px;font-size:11px;font-weight:700;margin-right:14px;vertical-align:middle;">4</span>
                    <span style="font-size:14px;color:{TEXT_DARK};vertical-align:middle;"><strong>Buyer confirms receipt</strong> &mdash; funds are released to the seller. Everyone wins.</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

        <!-- Trust signals -->
        <table style="width:100%;border-collapse:collapse;margin-bottom:32px;">
          <tr>
            <td style="width:33%;padding:14px 10px;text-align:center;vertical-align:top;">
              <div style="font-size:22px;margin-bottom:6px;">&#128274;</div>
              <p style="font-size:12px;font-weight:700;color:{BRAND_NAVY};margin:0 0 4px;">Funds Protected</p>
              <p style="font-size:11px;color:{TEXT_MUTED};margin:0;line-height:1.5;">Money held securely until you're satisfied</p>
            </td>
            <td style="width:33%;padding:14px 10px;text-align:center;vertical-align:top;">
              <div style="font-size:22px;margin-bottom:6px;">&#9989;</div>
              <p style="font-size:12px;font-weight:700;color:{BRAND_NAVY};margin:0 0 4px;">Dispute Resolution</p>
              <p style="font-size:11px;color:{TEXT_MUTED};margin:0;line-height:1.5;">Our team steps in if anything goes wrong</p>
            </td>
            <td style="width:33%;padding:14px 10px;text-align:center;vertical-align:top;">
              <div style="font-size:22px;margin-bottom:6px;">&#127466;&#127462;</div>
              <p style="font-size:12px;font-weight:700;color:{BRAND_NAVY};margin:0 0 4px;">Built for SA</p>
              <p style="font-size:11px;color:{TEXT_MUTED};margin:0;line-height:1.5;">EFT, card, and Ozow payments supported</p>
            </td>
          </tr>
        </table>

        <!-- CTA -->
        <div style="text-align:center;margin:0 0 8px;">
          <a href="{cta_link}" style="display:inline-block;background:{BRAND_NAVY};color:white;padding:16px 44px;text-decoration:none;font-size:15px;font-weight:700;letter-spacing:0.3px;border-bottom:3px solid {CYAN_LINE};">
            Create Your First Deal &rarr;
          </a>
        </div>
        <p style="text-align:center;font-size:12px;color:{TEXT_MUTED};margin:12px 0 0;">Questions? Reply to this email or visit <a href="https://trusttradesa.co.za/faq" style="color:#2563eb;">our FAQ</a>.</p>
      </td>
    </tr>

    <!-- Footer -->
    <tr>
      <td style="background:{BRAND_NAVY};padding:24px 32px;text-align:center;">
        <p style="margin:0 0 6px;font-size:12px;color:rgba(255,255,255,0.45);">&copy; 2026 TrustTrade South Africa. All rights reserved.</p>
        <p style="margin:0 0 4px;font-size:12px;">
          <a href="https://www.trusttradesa.co.za" style="color:rgba(255,255,255,0.55);text-decoration:none;">trusttradesa.co.za</a>
          &nbsp;&middot;&nbsp;
          <a href="https://www.trusttradesa.co.za/privacy" style="color:rgba(255,255,255,0.55);text-decoration:none;">Privacy</a>
          &nbsp;&middot;&nbsp;
          <a href="https://www.trusttradesa.co.za/terms" style="color:rgba(255,255,255,0.55);text-decoration:none;">Terms</a>
        </p>
        <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.25);">Secured by TrustTrade</p>
      </td>
    </tr>

  </table>
</td></tr>
</table>
</body>
</html>"""
    return await send_email(email, name, subject, html)


REGISTRATION_NOTIFY_EMAIL = "trusttrade.register@gmail.com"


async def send_admin_new_user_email(
    admin_email: str,
    user_name: str,
    user_email: str,
    signup_method: str,
    signup_at: str,
    phone: str = None,
) -> bool:
    """Send an internal admin notification when a new user registers."""
    # Always notify the dedicated registration inbox regardless of admin_email setting
    destination = REGISTRATION_NOTIFY_EMAIL
    subject = "New TrustTrade Registration"
    rows = [
        ("Name", user_name),
        ("Email", user_email),
        ("Signed up via", signup_method),
        ("Date &amp; time", signup_at),
    ]
    if phone:
        rows.insert(2, ("Phone", phone))
    rows_html = ""
    for i, (label, value) in enumerate(rows):
        bg = "#F9FAFB" if i % 2 == 0 else "#FFFFFF"
        rows_html += (
            f'<tr>'
            f'<td style="padding:10px 16px;background:{bg};font-size:11px;text-transform:uppercase;'
            f'letter-spacing:0.6px;color:{TEXT_MUTED};width:38%;vertical-align:top;font-weight:600;'
            f'border-bottom:1px solid {BORDER_CLR};">{label}</td>'
            f'<td style="padding:10px 16px;background:{bg};font-size:14px;color:{TEXT_DARK};'
            f'font-weight:500;vertical-align:top;border-bottom:1px solid {BORDER_CLR};">{value}</td>'
            f'</tr>'
        )
    html = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F0F2F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
<table role="presentation" style="width:100%;border-collapse:collapse;background:#F0F2F5;">
<tr><td style="padding:32px 16px;">
  <table role="presentation" style="max-width:560px;margin:0 auto;border-collapse:collapse;width:100%;">
    <tr>
      <td style="background:{BRAND_NAVY};padding:24px 32px;text-align:center;border-bottom:3px solid {CYAN_LINE};">
        {EMAIL_LOGO_HTML}
        <p style="margin:0;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:rgba(255,255,255,0.65);font-weight:600;">ADMIN NOTIFICATION</p>
      </td>
    </tr>
    <tr>
      <td style="background:white;padding:28px 32px 0;">
        <h1 style="margin:0 0 8px;font-size:20px;font-weight:700;color:{BRAND_NAVY};">New user signed up</h1>
        <p style="font-size:14px;color:{TEXT_MUTED};margin:0 0 24px;">A new account was created on TrustTrade.</p>
      </td>
    </tr>
    <tr>
      <td style="background:white;padding:0 32px 36px;">
        <table style="width:100%;border-collapse:collapse;border:1px solid {BORDER_CLR};">
          <tr>
            <td colspan="2" style="padding:10px 16px;background:{BRAND_NAVY};font-size:10px;text-transform:uppercase;letter-spacing:1px;color:rgba(255,255,255,0.65);font-weight:700;">
              USER DETAILS
            </td>
          </tr>
          {rows_html}
        </table>
      </td>
    </tr>
    <tr>
      <td style="background:{BRAND_NAVY};padding:20px 32px;text-align:center;">
        <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.35);">TrustTrade internal notification &mdash; do not forward</p>
      </td>
    </tr>
  </table>
</td></tr>
</table>
</body>
</html>"""
    return await send_email(destination, "TrustTrade Admin", subject, html)


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
        intro_text = f"""A new protected transaction has been created for your purchase. You are the <strong>Buyer</strong>.

        <div style="background: #e8f5e9; padding: 12px; border-radius: 8px; margin: 16px 0;">
            <strong>What happens next:</strong><br>
            1. Review and confirm the transaction details<br>
            2. Make your payment — funds are held securely until delivery is confirmed<br>
            3. Receive your item<br>
            4. Confirm delivery to release funds to seller
        </div>"""
    else:
        intro_text = f"""A new protected transaction has been created. You are the <strong>Seller</strong>.
        
        <div style="background: #fff3e0; padding: 12px; border-radius: 8px; margin: 16px 0;">
            <strong>What happens next:</strong><br>
            1. Review and confirm the transaction details<br>
            2. Wait for buyer to make payment<br>
            3. Complete the agreed release conditions once payment is secured<br>
            4. Payouts are processed as quickly as possible after buyer confirmation and may take up to 2 business days
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
        cta_text="Review and Pay Securely" if role.lower() == "buyer" else "View Transaction",
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
    role: str,
    delivery_method: str = "courier"
) -> tuple[str, str]:
    """Generate payment received email content"""
    
    subject = f"TrustTrade: Payment Secured - {share_code}"
    flow = (delivery_method or "courier").lower()
    is_delivery = flow == "courier"
    is_inperson = flow == "bank_deposit"
    is_instant = flow in ("digital", "instant", "immediate")

    if role.lower() == "seller":
        if is_delivery:
            intro_text = """<strong style="color: #10b981;">Payment has been secured!</strong>

            <div style="background: #e8f5e9; padding: 12px; border-radius: 8px; margin: 16px 0;">
                <strong>What you need to do:</strong><br>
                1. Dispatch the item to the buyer<br>
                2. Mark it as dispatched in TrustTrade<br>
                3. Wait for buyer confirmation<br><br>
                <strong>Payout:</strong> processed as quickly as possible after escrow release; bank settlement may take up to 2 business days
            </div>"""
        elif is_inperson:
            intro_text = """<strong style="color: #10b981;">Payment has been secured!</strong>

            <div style="background: #e8f5e9; padding: 12px; border-radius: 8px; margin: 16px 0;">
                <strong>What you need to do:</strong><br>
                1. Meet the buyer to exchange the item<br>
                2. Mark it as handed over in TrustTrade<br>
                3. Buyer confirms receipt to release your funds<br><br>
                <strong>Payout:</strong> processed as quickly as possible after escrow release; bank settlement may take up to 2 business days
            </div>"""
        elif is_instant:
            intro_text = """<strong style="color: #10b981;">Payment has been secured!</strong>

            <div style="background: #e8f5e9; padding: 12px; border-radius: 8px; margin: 16px 0;">
                <strong>Digital delivery:</strong><br>
                Deliver your files, codes, or service to the buyer and mark the delivery complete in TrustTrade.<br>
                Buyer confirms receipt to release your funds.<br><br>
                <strong>Payout:</strong> processed as quickly as possible after escrow release; bank settlement may take up to 2 business days
            </div>"""
        else:
            intro_text = """<strong style="color: #10b981;">Payment has been secured!</strong>

            <div style="background: #e8f5e9; padding: 12px; border-radius: 8px; margin: 16px 0;">
                <strong>What happens next:</strong><br>
                Complete the agreed release conditions and update the transaction. Funds remain protected until release conditions are met.<br><br>
                <strong>Payout:</strong> processed as quickly as possible after escrow release; bank settlement may take up to 2 business days
            </div>"""
    else:
        if is_delivery:
            intro_text = """<strong style="color: #10b981;">Your payment has been secured safely with TrustTrade!</strong>

            <div style="background: #e3f2fd; padding: 12px; border-radius: 8px; margin: 16px 0;">
                <strong>What happens next:</strong><br>
                1. Seller dispatches the item<br>
                2. Inspect the item when you receive it<br>
                3. Confirm receipt in TrustTrade to release funds to the seller<br><br>
                <strong>Your money is protected</strong> until you confirm receipt.
            </div>"""
        elif is_inperson:
            intro_text = """<strong style="color: #10b981;">Your payment has been secured safely with TrustTrade!</strong>

            <div style="background: #e3f2fd; padding: 12px; border-radius: 8px; margin: 16px 0;">
                <strong>What happens next:</strong><br>
                1. Meet the seller to collect the item<br>
                2. Inspect the item at handover<br>
                3. Confirm receipt in TrustTrade to release funds to the seller<br><br>
                <strong>Your money is protected</strong> until you confirm receipt.
            </div>"""
        elif is_instant:
            intro_text = """<strong style="color: #10b981;">Your payment has been secured safely with TrustTrade!</strong>

            <div style="background: #e3f2fd; padding: 12px; border-radius: 8px; margin: 16px 0;">
                <strong>Digital delivery:</strong><br>
                The seller will deliver the files, codes, or service to you.<br>
                Once you are satisfied, confirm receipt in TrustTrade to release the funds.<br><br>
                <strong>Your money is protected</strong> until you confirm receipt.
            </div>"""
        else:
            intro_text = """<strong style="color: #10b981;">Your payment has been secured safely with TrustTrade!</strong>

            <div style="background: #e3f2fd; padding: 12px; border-radius: 8px; margin: 16px 0;">
                <strong>What happens next:</strong><br>
                Funds remain protected until the agreed release conditions are met. Confirm completion only when satisfied.
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
        "Status": "Payment Secured"
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
    amount: float,
    delivery_method: str = "courier"
) -> tuple[str, str]:
    """
    Generate IMMEDIATE payment secured email for buyer.
    This email is sent the MOMENT payment is confirmed to arrive before TradeSafe's email.
    """
    
    subject = f"{share_code} — Payment Secured by TrustTrade"
    
    flow = (delivery_method or "courier").lower()
    protection_copy = "Your funds are protected until you confirm delivery."
    if flow == "digital":
        protection_copy = "Your funds are protected and will be released according to the agreed instant-flow conditions."
    elif flow != "courier":
        protection_copy = "Your funds are protected until the agreed release conditions are met."

    intro_html = f"""
    <p style='font-size: 18px; color: #10b981; font-weight: 700; margin: 0 0 16px 0;'>Your payment has been secured safely with TrustTrade.</p>
    <p style='font-size: 15px; color: #212529; margin: 0 0 20px 0; line-height: 1.6;'>{protection_copy}</p>
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
        "Status": "Payment Secured"
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
    amount: float,
    delivery_method: str = "courier"
) -> bool:
    """
    Send IMMEDIATE payment secured email to buyer.
    Called the MOMENT webhook receives FUNDS_RECEIVED - must be fast!
    """
    subject, html = get_immediate_payment_secured_email(to_name, share_code, item_description, amount, delivery_method)
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
    
    subject = f"{share_code} — Release approved"

    if role.lower() == "seller":
        intro_text = "The buyer has confirmed receipt. Release approved — funds released to wallet. Bank clearing may take up to 2 business days."
        status_text = "Release approved"
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


# South African Standard Time — payouts are timed against the local banking day.
SAST = timezone(timedelta(hours=2))


def estimated_payout_arrival(released_at: Optional[datetime] = None) -> datetime:
    """Estimate the date funds will reflect in the seller's bank account.

    Rule: released before 10:00 SAST → next business day; released at/after 10:00
    → the business day after that. Weekends (Sat/Sun) roll forward to Monday.
    """
    if released_at is None:
        now = datetime.now(SAST)
    else:
        if released_at.tzinfo is None:
            released_at = released_at.replace(tzinfo=timezone.utc)
        now = released_at.astimezone(SAST)

    days_ahead = 1 if now.hour < 10 else 2
    arrival = now + timedelta(days=days_ahead)
    while arrival.weekday() >= 5:  # 5 = Saturday, 6 = Sunday
        arrival += timedelta(days=1)
    return arrival


def format_payout_arrival_date(released_at: Optional[datetime] = None) -> str:
    """Human-friendly arrival date, e.g. 'Tuesday, 3 June 2025'.

    Built without strftime('%-d') so it works identically on Windows and Linux.
    """
    dt = estimated_payout_arrival(released_at)
    return f"{dt.strftime('%A')}, {dt.day} {dt.strftime('%B %Y')}"


def get_funds_released_email(
    recipient_name: str,
    share_code: str,
    item_description: str,
    amount: float,
    net_amount: float,
    bank_name: Optional[str] = None
) -> tuple[str, str]:
    """Generate funds released email content"""

    subject = "Your funds are on their way! 🎉"

    fee_amount = amount - net_amount
    arrival_date = format_payout_arrival_date()
    # Use the seller's actual bank, falling back to a generic phrase when unknown.
    bank_phrase = f"your {bank_name} account" if bank_name else "your bank account"

    intro_text = f"""<strong style="color: #10b981;">Your payment has been released from escrow! 🎉</strong>

    <p style="margin: 14px 0;">Your payment has been released from escrow and is being processed to
    <strong>{bank_phrase}</strong>. Bank transfers typically take 1–2 business days to reflect.
    You can expect the funds by <strong>{arrival_date}</strong>.</p>

    <div style="background: #e8f5e9; padding: 16px; border-radius: 8px; margin: 16px 0;">
        <strong>Payout Details:</strong><br><br>
        <table style="width: 100%;">
            <tr><td>Item Amount:</td><td style="text-align: right;">R {amount:,.2f}</td></tr>
            <tr><td>TrustTrade Fee (2%, min R5):</td><td style="text-align: right;">- R {fee_amount:,.2f}</td></tr>
            <tr style="font-weight: bold; font-size: 16px;"><td>You Receive:</td><td style="text-align: right; color: #10b981;">R {net_amount:,.2f}</td></tr>
        </table>
    </div>

    <p>Estimated arrival in your account: <strong>{arrival_date}</strong> (up to 2 business days).</p>
    """

    details = {
        "Transaction / Deal ID": share_code,
        "You Receive": f"R {net_amount:,.2f}",
        "Estimated Arrival": arrival_date,
        "Item": item_description,
        "Status": "Payout processing",
    }

    html_content = get_base_email_template(
        heading="Your funds are on their way!",
        greeting_name=recipient_name,
        intro_text=intro_text,
        details=details,
        cta_text="View Transaction",
        cta_link=f"https://www.trusttradesa.co.za/t/{share_code}",
        show_how_it_works=False,
        status_badge="Payout processing",
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
    
    intro_text = "A dispute has been opened for this transaction. Our team will review the case and contact both parties. Funds will remain securely protected until the dispute is resolved. Please respond to any requests for additional information promptly."
    
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
        "Account": "TrustTrade"
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
    role: str,
    delivery_method: str = "courier"
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
        subject, html = get_payment_received_email(to_name, share_code, item_description, amount, role, delivery_method)
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


async def send_eft_payment_details_email(
    *,
    to_email: str,
    to_name: str,
    share_code: str,
    item_description: str,
    bank: str,
    account_name: str,
    account_number: str,
    branch_code: str,
    reference: str,
    amount: float,
    instructions: str,
) -> bool:
    """Email the buyer the EFT bank-transfer details + reference for a manual payment."""
    logger.info(f"[TX_EMAIL] === EFT PAYMENT DETAILS EMAIL === to={to_email} ref={reference}")

    def esc(v):
        s = "" if v is None else str(v)
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

    subject = f"TrustTrade: EFT payment details for {share_code}"
    intro_text = (
        f"Please pay <strong>R {float(amount or 0):,.2f}</strong> via EFT for "
        f"<strong>{esc(item_description)}</strong> ({esc(share_code)}) using the bank details below. "
        f"{esc(instructions)}<br><br>"
        f"<strong>Use the reference exactly as shown</strong> so we can match your payment. "
        f"Your transaction stays in <em>Awaiting Payment</em> until the funds are confirmed."
    )
    details = {
        "Bank": esc(bank),
        "Account Name": esc(account_name),
        "Account Number": esc(account_number),
        "Branch Code": esc(branch_code),
        "Reference": esc(reference),
        "Amount to Pay": f"R {float(amount or 0):,.2f}",
    }
    html = get_base_email_template(
        heading="Complete your EFT payment",
        greeting_name=to_name,
        intro_text=intro_text,
        details=details,
        show_how_it_works=False,
        status_badge="Awaiting Payment",
        status_color="#f39c12",
    )
    return await send_email(to_email, to_name, subject, html)


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


def get_courier_booked_email(
    recipient_name: str,
    share_code: str,
    item_description: str,
    waybill: str,
    tracking_url: str,
    service_name: str,
    role: str,
    collection_preference: str,
) -> tuple[str, str]:
    """Generate the 'Courier Guy shipment booked' email for buyer or seller."""

    subject = f"{share_code} — Courier Guy booked · Waybill {waybill}"

    is_dropoff = (collection_preference or "").lower() == "dropoff"
    if role.lower() == "seller":
        if is_dropoff:
            intro_text = (
                "Payment is secured in escrow and we've booked your Courier Guy shipment. "
                "Please drop the parcel at your nearest Courier Guy point and quote the waybill number below."
            )
        else:
            intro_text = (
                "Payment is secured in escrow and we've booked your Courier Guy shipment. "
                "Courier Guy will collect the parcel from your address — please have it packaged and ready."
            )
    else:
        intro_text = (
            "Good news! Payment is secured and the Courier Guy shipment has been booked. "
            "Use the waybill number below to track your parcel all the way to your door."
        )

    details = {
        "Reference": share_code,
        "Item": item_description,
        "Waybill": waybill,
        "Courier": service_name or "Courier Guy",
        "Method": "Seller drop-off" if is_dropoff else "Courier Guy collection",
    }

    html_content = get_base_email_template(
        heading="Courier Guy Shipment Booked",
        greeting_name=recipient_name,
        intro_text=intro_text,
        details=details,
        cta_text="Track Your Shipment",
        cta_link=tracking_url or f"https://www.trusttradesa.co.za/t/{share_code}",
        show_how_it_works=False,
        status_badge="Shipment Booked",
        status_color="#3b82f6",
    )

    return subject, html_content


async def send_courier_booked_email(
    to_email: str,
    to_name: str,
    share_code: str,
    item_description: str,
    waybill: str,
    tracking_url: str,
    service_name: str,
    role: str,
    collection_preference: str = None,
) -> bool:
    """Notify a buyer or seller that the Courier Guy shipment has been booked."""
    logger.info(f"[TX_EMAIL] === COURIER BOOKED EMAIL === to={to_email} role={role} waybill={waybill}")
    try:
        subject, html = get_courier_booked_email(
            to_name, share_code, item_description, waybill, tracking_url,
            service_name, role, collection_preference,
        )
        result = await send_email(to_email, to_name, subject, html)
        logger.info(f"[TX_EMAIL] Courier booked email RESULT: {'SUCCESS' if result else 'FAILED'} to={to_email}")
        return result
    except Exception as e:
        logger.error(f"[TX_EMAIL] Courier booked email EXCEPTION: {e}")
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
    net_amount: float,
    bank_name: Optional[str] = None
) -> bool:
    """Send funds released notification"""
    logger.info("=" * 60)
    logger.info("[TX_EMAIL] === FUNDS RELEASED EMAIL ===")
    logger.info(f"[TX_EMAIL] Event: funds_released")
    logger.info(f"[TX_EMAIL] Recipient: {to_email}")
    logger.info(f"[TX_EMAIL] Name: {to_name}")
    logger.info(f"[TX_EMAIL] Share Code: {share_code}")
    logger.info(f"[TX_EMAIL] Amount: R{amount}, Net: R{net_amount}, Bank: {bank_name or 'unknown'}")
    logger.info("=" * 60)

    try:
        subject, html = get_funds_released_email(to_name, share_code, item_description, amount, net_amount, bank_name)
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


async def send_admin_dispute_alert_email(
    *,
    destination: str,
    dispute_id: str,
    share_code: str,
    item_description: str,
    amount: float,
    dispute_type: str,
    raised_by_role: str,
    raised_by_email: str,
    buyer_name: str,
    seller_name: str,
    buyer_statement: str,
    seller_statement: str,
    reason: str,
    ai_decision: str,
    ai_confidence: int,
    ai_reasoning: str,
    missing_evidence: list,
    suggested_resolution: str,
    flag_reasons: list,
    admin_link: str,
) -> bool:
    """Notify the admin that a dispute needs human attention (complex case).

    Includes a full dispute summary, the AI's reasoning + confidence, what
    evidence is missing, a direct link to the admin dispute page, and the
    suggested resolution with reasoning.
    """
    def esc(v):
        s = "" if v is None else str(v)
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

    def _row(label, value, bg):
        return (
            f'<tr>'
            f'<td style="padding:10px 16px;background:{bg};font-size:11px;text-transform:uppercase;'
            f'letter-spacing:0.6px;color:{TEXT_MUTED};width:38%;vertical-align:top;font-weight:600;'
            f'border-bottom:1px solid {BORDER_CLR};">{label}</td>'
            f'<td style="padding:10px 16px;background:{bg};font-size:14px;color:{TEXT_DARK};'
            f'font-weight:500;vertical-align:top;border-bottom:1px solid {BORDER_CLR};">{value}</td>'
            f'</tr>'
        )

    summary_rows = [
        ("Dispute ID", dispute_id),
        ("Reference", share_code),
        ("Item", esc(item_description)),
        ("Amount", f"R {amount:,.2f}"),
        ("Type", esc(dispute_type)),
        ("Raised by", f"{raised_by_role} ({esc(raised_by_email)})"),
        ("Buyer", esc(buyer_name)),
        ("Seller", esc(seller_name)),
    ]
    summary_html = "".join(
        _row(lbl, val, "#F9FAFB" if i % 2 == 0 else "#FFFFFF")
        for i, (lbl, val) in enumerate(summary_rows)
    )

    flags_html = "".join(
        f'<li style="margin-bottom:6px;color:{TEXT_DARK};font-size:14px;">{esc(r)}</li>'
        for r in (flag_reasons or [])
    ) or f'<li style="color:{TEXT_MUTED};font-size:14px;">(none recorded)</li>'

    missing_html = "".join(
        f'<li style="margin-bottom:6px;color:{TEXT_DARK};font-size:14px;">{esc(m)}</li>'
        for m in (missing_evidence or [])
    ) or f'<li style="color:{TEXT_MUTED};font-size:14px;">None — evidence was sufficient.</li>'

    conf_color = "#16A34A" if ai_confidence >= 90 else ("#D97706" if ai_confidence >= 70 else "#DC2626")

    subject = f"⚠️ Dispute needs review: {share_code} ({ai_confidence}% AI confidence)"
    html = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F0F2F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
<table role="presentation" style="width:100%;border-collapse:collapse;background:#F0F2F5;">
<tr><td style="padding:32px 16px;">
  <table role="presentation" style="max-width:600px;margin:0 auto;border-collapse:collapse;width:100%;">
    <tr>
      <td style="background:{BRAND_NAVY};padding:24px 32px;text-align:center;border-bottom:3px solid {CYAN_LINE};">
        {EMAIL_LOGO_HTML}
        <p style="margin:0;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:rgba(255,255,255,0.65);font-weight:600;">DISPUTE ALERT — ACTION REQUIRED</p>
      </td>
    </tr>
    <tr>
      <td style="background:white;padding:28px 32px 0;">
        <h1 style="margin:0 0 8px;font-size:20px;font-weight:700;color:{BRAND_NAVY};">A dispute needs your review</h1>
        <p style="font-size:14px;color:{TEXT_MUTED};margin:0 0 20px;">The AI flagged this dispute as a complex case. It has not been auto-resolved.</p>
      </td>
    </tr>

    <!-- Why flagged -->
    <tr><td style="background:white;padding:0 32px 8px;">
      <div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:6px;padding:14px 18px;">
        <p style="margin:0 0 8px;font-size:11px;text-transform:uppercase;letter-spacing:0.6px;color:#B91C1C;font-weight:700;">Why this was flagged</p>
        <ul style="margin:0;padding-left:18px;">{flags_html}</ul>
      </div>
    </td></tr>

    <!-- Dispute summary -->
    <tr><td style="background:white;padding:20px 32px 0;">
      <table style="width:100%;border-collapse:collapse;border:1px solid {BORDER_CLR};">
        <tr><td colspan="2" style="padding:10px 16px;background:{BRAND_NAVY};font-size:10px;text-transform:uppercase;letter-spacing:1px;color:rgba(255,255,255,0.65);font-weight:700;">DISPUTE SUMMARY</td></tr>
        {summary_html}
      </table>
    </td></tr>

    <!-- Reason + statements -->
    <tr><td style="background:white;padding:18px 32px 0;">
      <p style="margin:0 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:0.6px;color:{TEXT_MUTED};font-weight:700;">Reason given</p>
      <p style="margin:0 0 14px;font-size:14px;color:{TEXT_DARK};white-space:pre-wrap;">{esc(reason)}</p>
      <p style="margin:0 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:0.6px;color:{TEXT_MUTED};font-weight:700;">Buyer statement</p>
      <p style="margin:0 0 12px;font-size:14px;color:{TEXT_DARK};white-space:pre-wrap;">{esc(buyer_statement)}</p>
      <p style="margin:0 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:0.6px;color:{TEXT_MUTED};font-weight:700;">Seller statement</p>
      <p style="margin:0 0 4px;font-size:14px;color:{TEXT_DARK};white-space:pre-wrap;">{esc(seller_statement)}</p>
    </td></tr>

    <!-- AI analysis -->
    <tr><td style="background:white;padding:18px 32px 0;">
      <div style="background:#F5F3FF;border:1px solid #DDD6FE;border-radius:6px;padding:16px 18px;">
        <p style="margin:0 0 10px;font-size:11px;text-transform:uppercase;letter-spacing:0.6px;color:#6D28D9;font-weight:700;">AI Analysis</p>
        <p style="margin:0 0 8px;font-size:14px;color:{TEXT_DARK};">
          <strong>Suggested resolution:</strong> {esc(suggested_resolution)}
          &nbsp;<span style="background:{conf_color};color:white;font-size:12px;font-weight:700;padding:2px 8px;border-radius:10px;">{ai_confidence}% confident</span>
        </p>
        <p style="margin:0 0 12px;font-size:14px;color:{TEXT_DARK};line-height:1.55;">{esc(ai_reasoning)}</p>
        <p style="margin:0 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:0.6px;color:{TEXT_MUTED};font-weight:700;">Evidence missing</p>
        <ul style="margin:0;padding-left:18px;">{missing_html}</ul>
      </div>
    </td></tr>

    <!-- CTA -->
    <tr><td style="background:white;padding:22px 32px 30px;text-align:center;">
      <a href="{admin_link}" style="display:inline-block;background:{BRAND_NAVY};color:white;text-decoration:none;font-size:14px;font-weight:700;padding:13px 28px;border-radius:6px;">Open dispute in admin →</a>
    </td></tr>

    <tr>
      <td style="background:{BRAND_NAVY};padding:20px 32px;text-align:center;">
        <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.35);">TrustTrade internal notification &mdash; do not forward</p>
      </td>
    </tr>
  </table>
</td></tr>
</table>
</body>
</html>"""
    return await send_email(destination, "TrustTrade Admin", subject, html)


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


# ============ BANKING CHANGE EMAILS ============

async def send_banking_change_otp_email(to_email: str, to_name: str, otp: str) -> bool:
    """OTP verification email for a banking details change request."""
    subject = "TrustTrade: Verify your banking details change"
    html = get_base_email_template(
        heading="Banking Details Change Verification",
        greeting_name=to_name,
        intro_text=(
            "We received a request to change the banking details on your TrustTrade account. "
            "Use the verification code below to confirm this request. "
            "<strong>Do not share this code with anyone.</strong><br><br>"
            "If you did not make this request, please contact us immediately at "
            "<a href='mailto:trusttrade.register@gmail.com' style='color:#2563eb;'>trusttrade.register@gmail.com</a> "
            "and secure your account."
        ),
        details={
            "Verification Code": f"<span style='font-size:28px;font-weight:700;letter-spacing:6px;color:#0F1E35;font-family:monospace;'>{otp}</span>",
            "Expires In": "10 minutes",
            "Action Required": "Enter this code on the TrustTrade banking settings page",
        },
        show_how_it_works=False,
        status_badge="Security Alert",
        status_color="#dc2626",
    )
    return await send_email(to_email, to_name, subject, html)


async def send_banking_change_confirmed_email(to_email: str, to_name: str, bank_name: str, activates_at_iso: str) -> bool:
    """Sent when OTP is verified — cooling-off period has started."""
    try:
        from datetime import datetime as _dt
        activates_dt = _dt.fromisoformat(activates_at_iso.replace("Z", "+00:00"))
        activates_display = activates_dt.strftime("%d %B %Y at %H:%M UTC")
    except Exception:
        activates_display = activates_at_iso

    subject = "TrustTrade: Banking details change — 24-hour security hold"
    html = get_base_email_template(
        heading="Banking Details Change Requested",
        greeting_name=to_name,
        intro_text=(
            "Your banking details change has been verified. For your security, "
            "the new details will be held for a <strong>24-hour cooling-off period</strong> before they become active. "
            "During this window you can cancel the change from your account settings.<br><br>"
            "If you did not make this change, please "
            "<a href='mailto:trusttrade.register@gmail.com' style='color:#2563eb;'>contact support immediately</a>."
        ),
        details={
            "New Bank": bank_name,
            "Status": "Pending — cooling-off period",
            "Activates": activates_display,
        },
        show_how_it_works=False,
        status_badge="Change Pending",
        status_color="#d97706",
    )
    return await send_email(to_email, to_name, subject, html)


async def send_banking_details_activated_email(to_email: str, to_name: str, bank_name: str) -> bool:
    """Sent when the 24-hour cooling-off period expires and details are activated."""
    subject = "TrustTrade: Your banking details have been updated"
    html = get_base_email_template(
        heading="Banking Details Updated",
        greeting_name=to_name,
        intro_text=(
            "The 24-hour security hold has passed and your new banking details are now active. "
            "Future payouts will be sent to the new account.<br><br>"
            "If you did not authorise this change, please "
            "<a href='mailto:trusttrade.register@gmail.com' style='color:#dc2626;'>contact support immediately</a>."
        ),
        details={
            "New Bank": bank_name,
            "Status": "Active",
            "Effective": "Now",
        },
        show_how_it_works=False,
        status_badge="Details Updated",
        status_color="#059669",
    )
    return await send_email(to_email, to_name, subject, html)


async def send_banking_change_cancelled_email(to_email: str, to_name: str) -> bool:
    """Sent when a pending banking change request is cancelled."""
    subject = "TrustTrade: Banking details change cancelled"
    html = get_base_email_template(
        heading="Banking Details Change Cancelled",
        greeting_name=to_name,
        intro_text=(
            "Your pending banking details change request has been cancelled. "
            "Your existing banking details remain active and unchanged.<br><br>"
            "If you did not cancel this request, please "
            "<a href='mailto:trusttrade.register@gmail.com' style='color:#dc2626;'>contact support immediately</a>."
        ),
        details={
            "Action": "Change cancelled",
            "Your Details": "Unchanged — existing account still active",
        },
        show_how_it_works=False,
        status_badge="Cancelled",
        status_color="#6b7280",
    )
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
            f"<strong>{client_name}</strong> wants to hire you through TrustTrade's secure payment platform. "
            f"Review the deal details below and click the button to accept. "
            f"Once you accept, the client funds the deal — your payment is protected until you deliver and it's approved."
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
            f"The next step is to fund the deal so work can begin. "
            f"Your payment is held securely and only released when you approve the delivery."
        ),
        deal=deal,
        cta_text="Fund Deal",
        badge="Fund Deal to Start",
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
        f"Funds remain securely protected while TrustTrade admin investigates. "
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
