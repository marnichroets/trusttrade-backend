# TrustTrade PRD

## Overview
Professional escrow platform for peer-to-peer transactions in South Africa. Core feature: shareable transaction links with TradeSafe payment gateway integration.

## Changelog
- **2026-03-17**: TradeSafe Payment Gateway Integration COMPLETED
  - OAuth token exchange with client credentials grant
  - Transaction creation with buyer/seller tokens
  - Payment URL generation (EFT, Card, Ozow)
  - Webhook handler for state changes (FUNDS_RECEIVED, INITIATED, FUNDS_RELEASED, DISPUTED)
  - Start delivery / Accept delivery endpoints
  - Fee breakdown API with 2% TrustTrade fee
  - Minimum transaction updated to R500
- **2026-03-12**: Fixed Total Escrow Value display - admins see exact, users see rounded
- **2026-03-12**: Implemented Transaction Settings (R500 minimum, wallet system, banking details)
- **2026-03-11**: Postmark email integration replaced Brevo
- **2026-03-10**: Admin Dashboard with user/transaction/dispute management

## Platform Settings
- **Minimum Transaction**: R500 (TradeSafe requirement)
- **Payout Threshold**: R500 (auto-payout when reached)
- **Platform Fee**: 2% TrustTrade agent fee
- **Currency**: ZAR (R)
- **Payment Methods**: EFT, Card, Ozow

## TradeSafe Integration (COMPLETED)

### Backend Endpoints
- `POST /api/tradesafe/create-transaction` - Create TradeSafe escrow
- `GET /api/tradesafe/payment-url/{transaction_id}` - Get payment link
- `POST /api/tradesafe/start-delivery/{transaction_id}` - Seller marks dispatched
- `POST /api/tradesafe/accept-delivery/{transaction_id}` - Buyer confirms receipt
- `GET /api/tradesafe/transaction-status/{transaction_id}` - Get current state
- `GET /api/tradesafe/fee-breakdown` - Calculate fee breakdown
- `POST /api/tradesafe-webhook` - Handle TradeSafe callbacks

### Transaction Flow
1. Seller or buyer creates transaction on TrustTrade (R500 minimum)
2. Secure link sent to other party
3. Both parties confirm transaction details
4. TradeSafe escrow created
5. Buyer redirected to TradeSafe payment page (EFT/Card/Ozow)
6. Webhook fires FUNDS_RECEIVED → seller notified
7. Seller delivers item and marks as dispatched
8. Buyer confirms receipt
9. Webhook fires FUNDS_RELEASED → seller receives funds (minus fees)

### Fee Structure
- TrustTrade Fee: 2% of transaction amount
- TradeSafe Fee: ~2.5% (varies by payment method)
- Fee Allocation: Buyer pays all, Seller pays all, or 50/50 split

### Environment Variables (in /app/backend/.env)
- TRADESAFE_CLIENT_ID
- TRADESAFE_CLIENT_SECRET
- TRADESAFE_AUTH_URL
- TRADESAFE_API_URL
- TRADESAFE_PAYMENT_URL
- TRADESAFE_ENV (sandbox/production)

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
10. **TradeSafe Payments** - Secure escrow with real payment processing

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
- Payments: TradeSafe (sandbox configured, ready for production)

## Files Structure
```
/app/backend/
├── server.py              # Main API endpoints
├── tradesafe_service.py   # TradeSafe OAuth & GraphQL
├── email_service.py       # Postmark integration
└── .env                   # Credentials

/app/frontend/src/
├── pages/
│   ├── TransactionDetail.js  # TradeSafe UI integration
│   ├── NewTransaction.js     # R500 minimum validation
│   ├── PaymentSuccess.js     # TradeSafe redirect
│   └── PaymentCancelled.js   # TradeSafe redirect
└── App.js                    # Routes including /transaction/*
```

## Test Reports
- `/app/test_reports/iteration_10.json` - TradeSafe integration tests
