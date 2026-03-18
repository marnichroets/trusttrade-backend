# TrustTrade PRD

## Overview
Professional escrow platform for peer-to-peer transactions in South Africa. Core feature: shareable transaction links with secure payment gateway integration.

## Changelog
- **2026-03-18**: FIXED Token Creation Error & Removed TradeSafe Branding
  - Fixed GraphQL mutation to use correct field structure (`user` wrapper with `givenName`, `familyName`, `mobile`, `idNumber`, `idType`, `idCountry`)
  - Replaced all "TradeSafe" references with "TrustTrade" branding throughout platform
  - Updated error messages to be user-friendly (no internal service names)
- **2026-03-17**: Payment Gateway Integration COMPLETED
  - OAuth token exchange with client credentials grant
  - Transaction creation with buyer/seller tokens
  - Payment URL generation (EFT, Card, Ozow)
  - Webhook handler for state changes (FUNDS_RECEIVED, INITIATED, FUNDS_RELEASED, DISPUTED)
  - Start delivery / Accept delivery endpoints
  - Fee breakdown API with 2% TrustTrade fee
  - Minimum transaction updated to R500
- **2026-03-12**: Fixed Total Escrow Value display - admins see exact, users see rounded
- **2026-03-11**: Postmark email integration replaced Brevo
- **2026-03-10**: Admin Dashboard with user/transaction/dispute management

## Platform Settings
- **Minimum Transaction**: R500
- **Payout Threshold**: R500 (auto-payout when reached)
- **Platform Fee**: 2% TrustTrade agent fee
- **Currency**: ZAR (R)
- **Payment Methods**: EFT, Card, Ozow

## Payment Gateway Integration (COMPLETED)

### Backend Endpoints
- `POST /api/tradesafe/create-transaction` - Create secure escrow
- `GET /api/tradesafe/payment-url/{transaction_id}` - Get payment link
- `POST /api/tradesafe/start-delivery/{transaction_id}` - Seller marks dispatched
- `POST /api/tradesafe/accept-delivery/{transaction_id}` - Buyer confirms receipt
- `GET /api/tradesafe/transaction-status/{transaction_id}` - Get current state
- `GET /api/tradesafe/fee-breakdown` - Calculate fee breakdown
- `POST /api/tradesafe-webhook` - Handle payment callbacks

### Transaction Flow
1. Seller or buyer creates transaction on TrustTrade (R500 minimum)
2. Secure link sent to other party
3. Both parties confirm transaction details
4. TrustTrade escrow created
5. Buyer redirected to secure payment page (EFT/Card/Ozow)
6. Webhook fires FUNDS_RECEIVED → seller notified
7. Seller delivers item and marks as dispatched
8. Buyer confirms receipt
9. Webhook fires FUNDS_RELEASED → seller receives funds (minus fees)

### Fee Structure
- TrustTrade Fee: 2% of transaction amount
- Payment Gateway Fee: ~2.5% (varies by payment method)
- Fee Allocation: Buyer pays all, Seller pays all, or 50/50 split

### Token Creation (Fixed)
Required fields for user tokens:
- `givenName`: First name
- `familyName`: Last name
- `email`: Email address
- `mobile`: Phone in +27 format
- `idNumber`: SA ID number (13 digits)
- `idType`: "NATIONAL"
- `idCountry`: "ZAF"

## Branding Rules
- NO mention of third-party payment provider names to users
- All user-facing text uses "TrustTrade" branding only
- Error messages should be generic and user-friendly
- Internal logs can reference technical details

## Core Features (Implemented)
1. **Transaction Link System** - Shareable links (TT-XXXXXX)
2. **User Profiles** - Ratings, badges, trust scores
3. **Identity Verification** - ID, selfie upload with admin review
4. **Scam Detection** - Rule-based risk assessment
5. **Auto-Release Timer** - Based on delivery method
6. **Report User** - User reporting system
7. **Wallet System** - Balance tracking, payout progress
8. **Banking Details** - SA bank integration
9. **Admin Dashboard** - User/transaction/dispute management
10. **Secure Payments** - Escrow with real payment processing

## Pending Improvements
- **AI Scam Detection**: Upgrade from rule-based to AI model
- **Refactor server.py**: Split monolithic file into routes/models/services

## De-prioritized
- In-app chat (user requested to skip)

## Technical Architecture
- Backend: FastAPI + MongoDB
- Frontend: React + Tailwind CSS + Shadcn UI
- Auth: Emergent Google OAuth
- Email: Postmark
- Payments: Secure escrow gateway (sandbox configured, ready for production)

## Files Structure
```
/app/backend/
├── server.py              # Main API endpoints
├── tradesafe_service.py   # OAuth & GraphQL integration
├── email_service.py       # Postmark integration
└── .env                   # Credentials

/app/frontend/src/
├── pages/
│   ├── TransactionDetail.js  # Escrow UI integration
│   ├── NewTransaction.js     # R500 minimum validation
│   ├── PaymentSuccess.js     # Payment redirect
│   └── PaymentCancelled.js   # Payment redirect
└── App.js                    # Routes including /transaction/*
```

## Test Reports
- `/app/test_reports/iteration_10.json` - Payment integration tests
