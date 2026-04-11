# TrustTrade - Production-Ready Escrow Platform for South Africa

## Original Problem Statement
Build a production-ready escrow payment platform for peer-to-peer transactions in South Africa using TradeSafe as the payment provider. The platform needed native JWT email/password authentication (no Emergent Auth), persistent TradeSafe token reuse per user, secure money calculations, and admin tooling for fund recovery.

## Core Requirements
- Native Email/Password authentication using JWT
- Persistent TradeSafe token reuse per user (one token per user, not per transaction)
- Secure money calculations using Decimals/cents on backend
- Explicit policy, FAQ, and banking detail submission pages
- Admin endpoints for token management and fund recovery

## Architecture
```
/app/
├── backend/           # FastAPI + MongoDB
│   ├── routes/        # auth.py, users.py, admin.py, transactions.py, tradesafe.py
│   ├── models/        # user.py, transaction.py, dispute.py
│   ├── tradesafe_service.py  # TradeSafe GraphQL integration
│   └── main.py        # Entry point (background jobs disabled)
└── frontend/          # React 18.2.0 + Tailwind
    └── src/
        ├── context/AuthContext.js  # JWT session management
        ├── pages/                  # LoginPage, Dashboard, TransactionDetail, etc.
        └── utils/api.js           # Axios with JWT interceptor
```

## Transaction State Flow
```
CREATED → Pending Confirmation
    ↓
[Creator auto-confirms their side]
    ↓
Pending [Other Party] Confirmation
    ↓
[Other party confirms]
    ↓
Both Confirmed → Ready for Payment
    ↓
[Seller creates TradeSafe escrow]
    ↓
Awaiting Payment → [Buyer pays]
    ↓
Funds Secured → Delivery in Progress → Released
```

## What's Been Implemented (April 2026)

### Authentication
- [x] Native JWT email/password auth
- [x] Login → AuthContext.login() → /dashboard redirect
- [x] Session persistence on page refresh

### Transaction Flow
- [x] Buyer/Seller confirmation endpoints
- [x] Both parties must confirm before escrow
- [x] Fee allocation: BUYER_AGENT, SELLER_AGENT, SPLIT_AGENT
- [x] Escrow creation with TradeSafe API

### Bug Fixes (April 11, 2026)
- [x] Transaction limits: R100 min, R10,000 max (beta)
- [x] Transaction confirmation flow fix
- [x] Escrow creation fix (wrong field name, db check syntax)
- [x] Fee allocation display fix (uppercase handling)

## Known Limitations
- Real TradeSafe refund NOT implemented (only local DB update)
- Background jobs commented out in main.py
- Legacy tokens have `valid: false` - requires TradeSafe support

## 3rd Party Integrations
- TradeSafe (Escrow Payments) - Production API
- Postmark (Emails)
- SMS Messenger/Zoom Connect (OTP)

## Beta Launch Limits
- Minimum Transaction: R100
- Maximum Transaction: R10,000
- Image Upload: 5MB max

## P0/P1/P2 Priorities

### P0 (Critical) - COMPLETED
- [x] Frontend auth redirect
- [x] Transaction confirmation flow
- [x] Escrow creation
- [x] Fee allocation saving/display

### P1 (High)
- [ ] Real TradeSafe refund (allocationRefund mutation)
- [ ] Legacy token fund recovery

### P2 (Medium)
- [ ] Re-enable background jobs
- [ ] Email notifications
- [ ] SMS notifications
- [ ] AI Scam Detection

### P3 (Future)
- [ ] Push notifications
- [ ] Mobile app

## Test Credentials
- Test User: testuser@example.com / Test@123
- Seller: seller@example.com / Seller@123
- Admin: marnichr@gmail.com / Admin@123

## API Endpoints
- `POST /api/transactions` - Create transaction
- `POST /api/transactions/{id}/buyer-confirm` - Buyer confirms
- `POST /api/transactions/{id}/seller-confirm` - Seller confirms
- `POST /api/tradesafe/create-transaction` - Create TradeSafe escrow
- `GET /api/tradesafe/payment-url/{id}` - Get payment link

## Logging
Transaction flow logs use prefixes:
- `[TXN]` - Transaction confirmation events
- `[ESCROW]` - Escrow creation events
