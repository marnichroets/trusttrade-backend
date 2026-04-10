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
        ├── pages/                  # LoginPage, Dashboard, etc.
        └── utils/api.js           # Axios with JWT interceptor
```

## Key Technical Decisions
- JWT tokens stored in localStorage with Bearer auth header
- TradeSafe tokens saved per user in `users.tradesafe_token_id`
- Money stored as cents (integers) in backend, formatted to Rands in frontend
- Background jobs disabled to prevent 502 startup errors

## What's Been Implemented (April 2026)
- [x] Native JWT email/password auth (replaced Emergent Auth)
- [x] Persistent TradeSafe token per user
- [x] Banking details submission endpoint
- [x] Admin token lookup endpoints (GET /api/admin/tradesafe/token/{id})
- [x] Admin token withdrawal endpoint (POST /api/admin/tradesafe/token-withdraw)
- [x] Local refund marking endpoint (mark-refunded-local)
- [x] Fixed frontend auth redirect flow (LoginPage.js)
- [x] Session persistence on page refresh

## Known Limitations
- Real TradeSafe refund NOT implemented (only local DB update)
- Background jobs commented out in main.py
- Legacy tokens may have `valid: false` status requiring TradeSafe support

## 3rd Party Integrations
- TradeSafe (Escrow Payments) - Production API
- Postmark (Emails)
- SMS Messenger/Zoom Connect (OTP)

## P0/P1/P2 Priorities

### P0 (Critical) - COMPLETED
- [x] Frontend auth redirect verification
- [x] Token status report for legacy tokens

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
- Admin: marnichr@gmail.com / Admin@123

## Legacy Token Status (Requires Recovery)
| Token ID | Balance | Banking | Valid |
|----------|---------|---------|-------|
| 32sAJcSESxnxp7uvmZrjk | R4.93 | None | false |
| 32sccVmYVj2HJftMu3AQh | R4.90 | None | false |
