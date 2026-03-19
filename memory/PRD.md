# TrustTrade PRD

## Overview
Professional escrow platform for peer-to-peer transactions in South Africa.

## Changelog
- **2026-03-19**: Email/Phone Verification Fixes & OTP System
  - Fixed transaction link email verification bug (case-insensitive comparison)
  - Added `emails_match()` and `phones_match()` helper functions with detailed logging
  - Added phone verification OTP system via SMS Messenger
  - Added phone field to User model with +27 normalization
  - Added phone-based transaction invites
  - Added pre-transaction phone verification check
  - Created PhoneVerification.js page with OTP input
  - Added SMS Messenger API integration

- **2026-03-18**: Payment Button Implementation
- **2026-03-18**: Fixed Token and Transaction Creation
- **2026-03-17**: Initial payment gateway integration

## Email Comparison Fix
```python
def normalize_email(email: str) -> str:
    """Normalize email for comparison - lowercase and strip whitespace."""
    return email.strip().lower() if email else ""

def emails_match(email1: str, email2: str) -> bool:
    """Case-insensitive email comparison with logging."""
    return normalize_email(email1) == normalize_email(email2)
```

## Phone Verification Flow
1. User signs up (Google or email)
2. Redirected to `/verify/phone`
3. Enter SA mobile number (auto-converts to +27 format)
4. Receive 6-digit OTP via SMS
5. Enter OTP (10 min expiry)
6. Phone verified - can now create transactions

## SMS Messenger Integration
- API Key: Stored in `SMS_MESSENGER_API_KEY` env var
- OTP Message: "TrustTrade: Your verification code is [OTP]. Valid for 10 minutes."
- Transaction Invite: "TrustTrade: [Name] sent you a secure transaction. View here: [link]"

## API Endpoints - Phone Verification
- `POST /api/auth/phone/submit` - Submit phone, send OTP
- `POST /api/auth/phone/verify` - Verify OTP code
- `POST /api/auth/phone/resend` - Resend OTP (60s cooldown)
- `GET /api/auth/phone/status` - Get verification status

## Transaction Link Verification
When user clicks share link:
1. Check if user email matches (case-insensitive)
2. Check if user phone matches (format-insensitive)
3. Check recipient_info field for phone/email invites
4. Show clear error if no match found

## Error Messages
| Situation | Message |
|-----------|---------|
| Wrong email | "This transaction link was sent to a different email address. Please log in with the correct account." |
| Wrong phone | "This transaction link was sent to a different phone number. Please log in with the correct account." |
| OTP expired | "Your verification code has expired. Please request a new one." |
| OTP wrong | "Incorrect code. Please try again." |
| Phone taken | "This number is already linked to another account." |

## Files Modified
- `/app/backend/server.py` - Email/phone comparison, OTP endpoints
- `/app/backend/sms_service.py` - NEW: SMS Messenger integration
- `/app/backend/.env` - Added SMS_MESSENGER_API_KEY
- `/app/frontend/src/pages/PhoneVerification.js` - NEW: OTP verification page
- `/app/frontend/src/App.js` - Added /verify/phone route

## Test Reports
- `/app/test_reports/iteration_10.json`
