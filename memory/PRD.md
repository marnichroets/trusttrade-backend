# TrustTrade PRD

## Overview
Professional escrow platform for peer-to-peer transactions in South Africa using TradeSafe payment gateway.

## Core Features
- Transaction Link System - Unique shareable links for every transaction
- TradeSafe Integration - Full payment gateway integration with escrow
- User Ratings and Reviews - 1-5 star rating system
- Trust Badge System - Silver, Gold, Verified badges
- Identity Verification - ID upload, selfie, phone verification
- Live Transaction Activity Board - Platform-wide stats
- Scam Detection System - Automatic flagging
- Delivery Confirmation - Buyer confirms before funds release
- Auto-Release Timer - Based on delivery method
- Report User Feature - Suspicious behavior reporting
- User Profiles - Public profiles with Trust Score

## TradeSafe Happy Path Flow
1. **Transaction Created** → Both parties notified (email + SMS)
2. **Buyer Pays** → FUNDS_RECEIVED → Seller notified (email + SMS)
3. **Seller Dispatches** → INITIATED → Buyer notified (email + SMS)
4. **Buyer Confirms** → FUNDS_RELEASED → Seller notified (email + SMS)

## Changelog

### 2026-03-24: Production Reliability Upgrade (Session 14)
**Implemented:**

1. **Webhook Handler with Full Reliability**
   - New `/app/backend/webhook_handler.py` module
   - Strict idempotency using unique event IDs (SHA256 hash of payload)
   - All webhook events logged to `webhook_events` collection
   - Duplicate webhooks automatically ignored
   - Email deduplication with `emails_sent` array tracking per transaction
   - Comprehensive error logging

2. **Transaction State Machine**
   - New `/app/backend/transaction_state.py` module
   - Strict state transitions enforced
   - States: CREATED → PENDING_CONFIRMATION → AWAITING_PAYMENT → PAYMENT_SECURED → DELIVERY_IN_PROGRESS → DELIVERED → COMPLETED
   - Terminal states: COMPLETED, CANCELLED, REFUNDED
   - Special state: DISPUTED (can transition back to flow)

3. **Background Jobs**
   - New `/app/backend/background_jobs.py` module
   - Fallback payment verification every 3 minutes
   - Auto-release processing every 6 minutes
   - Webhook health check every 15 minutes
   - Graceful error handling

4. **Admin Monitoring Endpoints**
   - `/api/admin/monitoring/summary` - Overall health status
   - `/api/admin/monitoring/webhooks` - Webhook processing stats and failures
   - `/api/admin/monitoring/emails` - Email sending stats and failures
   - `/api/admin/monitoring/transactions` - Stuck transactions

5. **Frontend Integration**
   - TransactionStatusCard integrated into TransactionDetail page
   - TransactionTimeline integrated with visual progress
   - Refresh Status button added
   - mapPaymentStatusToState helper for legacy status mapping

6. **Database Collections**
   - `webhook_events` - All webhook events with idempotency
   - `email_logs` - All email send attempts
   - Indexes created on startup for performance

### 2026-03-22: TradeSafe Happy Path & Admin Overhaul (Session 13)
**Implemented:**

1. **TradeSafe Happy Path Complete**
   - Start Delivery endpoint: `/api/tradesafe/start-delivery/{id}`
   - Accept Delivery endpoint: `/api/tradesafe/accept-delivery/{id}`
   - Webhook handler with SMS for all states

2. **Admin Dashboard Complete Overhaul**
   - Separate pages with proper routing
   - Navigation works correctly
   - All table rows clickable

3. **Admin User Detail Page**
   - Full user information display
   - ID documents viewable and downloadable

4. **Images Fixed**
   - Static files mounted at `/uploads`

## Architecture

### Backend
- **Framework**: FastAPI
- **Database**: MongoDB (motor async driver)
- **File Storage**: Local `/app/uploads/` served via StaticFiles
- **Main file**: `/app/backend/server.py` (4400+ lines - needs refactoring)
- **Webhook Handler**: `/app/backend/webhook_handler.py`
- **State Machine**: `/app/backend/transaction_state.py`
- **Background Jobs**: `/app/backend/background_jobs.py`

### Frontend
- **Framework**: React
- **Styling**: Tailwind CSS + Shadcn UI
- **Routing**: React Router
- **State**: useState/useEffect hooks

### Integrations
- **Email**: Postmark (PRODUCTION)
- **Payments**: TradeSafe (GraphQL API - PRODUCTION)
- **SMS**: Zoom Connect (SMS Messenger API)
- **Auth**: Emergent-managed Google OAuth

## Key Admin Routes
- `/admin` - Dashboard overview
- `/admin/transactions` - All transactions
- `/admin/users` - All users
- `/admin/disputes` - All disputes
- `/admin/transaction/{id}` - Transaction detail
- `/admin/user/{id}` - User detail
- `/admin/dispute/{id}` - Dispute detail

## Key API Endpoints
- `/api/tradesafe-webhook` - Production-ready webhook handler
- `/api/admin/monitoring/summary` - System health check
- `/api/admin/monitoring/webhooks` - Webhook stats
- `/api/admin/monitoring/emails` - Email stats
- `/api/admin/monitoring/transactions` - Stuck transactions

## Prioritized Backlog

### P0 (Critical) - COMPLETED
- [x] Webhook idempotency
- [x] Email deduplication
- [x] Fallback payment verification
- [x] State machine enforcement
- [x] Admin monitoring endpoints

### P1 (High Priority)
- [ ] Refactor `server.py` monolith into routes/services/models
- [ ] AI Scam Detection Enhancement
- [ ] Full admin monitoring UI dashboard

### P2 (Medium Priority)
- [ ] In-App Chat feature
- [ ] Enhanced dispute resolution flow
- [ ] Push notifications

### P3 (Low Priority)
- [ ] Mobile app
- [ ] Multi-language support
