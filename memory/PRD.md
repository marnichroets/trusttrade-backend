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
│   ├── routes/        # auth.py, users.py, admin.py, transactions.py
│   ├── models/        # user.py, transaction.py, dispute.py
│   ├── tradesafe_service.py  # TradeSafe GraphQL integration
│   └── main.py        # Entry point (background jobs disabled)
└── frontend/          # React 18.2.0 + Tailwind
    └── src/
        ├── context/AuthContext.js  # JWT session management
        ├── pages/                  # LoginPage, Dashboard, BankingSettings, TransactionDetail, etc.
        └── utils/api.js           # Axios with JWT interceptor
```

## Key Technical Decisions
- JWT tokens stored in localStorage with Bearer auth header
- TradeSafe tokens saved per user in `users.tradesafe_token_id`
- Money stored as cents (integers) in backend, formatted to Rands in frontend
- Background jobs disabled to prevent 502 startup errors

## Transaction State Flow (Fixed April 11, 2026)
```
CREATED → Pending Confirmation
    ↓
[Creator auto-confirms their side]
    ↓
Pending [Other Party] Confirmation
    ↓
[Other party clicks "Confirm Transaction Details"]
    ↓
Both Confirmed → Ready for Payment
    ↓
[Seller creates escrow]
    ↓
[Buyer sees payment methods & pays]
    ↓
Funds Secured → Delivery in Progress → Released
```

## What's Been Implemented (April 2026)

### Authentication
- [x] Native JWT email/password auth (replaced Emergent Auth)
- [x] Login → AuthContext.login() → /dashboard redirect
- [x] Session persistence on page refresh

### TradeSafe Integration
- [x] Persistent TradeSafe token per user
- [x] Banking details submission endpoint
- [x] Admin token lookup and withdrawal endpoints

### Beta Launch Fixes (April 11, 2026)
- [x] Transaction limits: R100 min, R10,000 max
- [x] Image upload logging for debugging
- [x] Banking details read-only display after save
- [x] Transaction confirmation flow: buyer and seller confirm endpoints
- [x] Confirmation status UI with visual indicators

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
- Image Upload: 5MB max, jpg/jpeg/png/webp/heic/heif

## P0/P1/P2 Priorities

### P0 (Critical) - COMPLETED
- [x] Frontend auth redirect verification
- [x] Token status report for legacy tokens
- [x] Beta transaction limits
- [x] Transaction confirmation flow fix

### P1 (High)
- [ ] Implement real TradeSafe refund (allocationRefund mutation)
- [ ] Attach banking details to legacy tokens for withdrawal

### P2 (Medium)
- [ ] Re-enable background jobs safely
- [ ] AI Scam Detection enhancements

### P3 (Future)
- [ ] Push notifications
- [ ] Mobile app

## Test Credentials
- Test User: testuser@example.com / Test@123
- Seller: seller@example.com / Seller@123
- Admin: marnichr@gmail.com / Admin@123

## API Endpoints for Transaction Flow
- `POST /api/transactions` - Create transaction
- `POST /api/transactions/{id}/buyer-confirm` - Buyer confirms
- `POST /api/transactions/{id}/seller-confirm` - Seller confirms
- `POST /api/tradesafe/create-transaction` - Create TradeSafe escrow
- `POST /api/tradesafe/payment-link/{id}` - Get payment link

## Legacy Token Status (Requires Recovery)
| Token ID | Balance | Banking | Valid |
|----------|---------|---------|-------|
| 32sAJcSESxnxp7uvmZrjk | R492.81 | None | false |
| 32sccVmYVj2HJftMu3AQh | R489.94 | None | false |

**Note**: These tokens use fake mobile (+2700000000) and have no banking details - both required for withdrawal.
