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

### 2026-03-24: Admin Monitoring Dashboard (Session 14 - Part 2)
**Implemented:**

1. **Real-Time Admin Monitoring Dashboard** (`/admin/monitoring`)
   - Health status banner with color-coded indicators (healthy/warning/critical)
   - 6 key metric cards: Active Transactions, Awaiting Payment, Secured 24h, Webhook Failures, Email Failures, Stuck Transactions
   - Auto-refresh every 15 seconds (toggleable)
   - Manual refresh button

2. **5 Dashboard Tabs:**
   - **Overview**: Webhook & email statistics with success rates
   - **Webhooks**: Full event table with status highlighting (processed/failed/duplicate), retry action for failed webhooks
   - **Emails**: Full logs table with sent/failed status, resend action for failed emails
   - **Stuck Transactions**: Detection for transactions with no update >10 minutes
   - **Admin Actions**: Complete audit log of all admin actions

3. **Manual Admin Actions (with full logging):**
   - Retry failed webhook processing
   - Resend failed emails
   - Manually update transaction status with reason
   - All actions logged to `admin_actions` collection with admin email, timestamp, and details

4. **Backend Endpoints:**
   - `GET /api/admin/monitoring/dashboard` - Comprehensive metrics
   - `GET /api/admin/monitoring/webhook-events` - Webhook event list with filters
   - `GET /api/admin/monitoring/email-logs` - Email log list with filters
   - `GET /api/admin/monitoring/actions` - Admin action audit trail
   - `POST /api/admin/monitoring/retry-webhook/{event_id}` - Retry failed webhook
   - `POST /api/admin/monitoring/resend-email/{txn_id}/{type}` - Resend email
   - `POST /api/admin/monitoring/update-transaction-status/{txn_id}` - Manual status update

5. **AdminNavbar Updated:**
   - Added "Monitoring" link with Activity icon
   - Integrated TrustTrade logo with proper styling

### 2026-03-24: Production Reliability Upgrade (Session 14 - Part 1)
**Implemented:**

1. **Webhook Handler with Full Reliability** (`/app/backend/webhook_handler.py`)
   - Strict idempotency using unique event IDs (SHA256 hash of payload)
   - All webhook events logged to `webhook_events` collection
   - Email deduplication with `emails_sent` array tracking
   - Comprehensive error logging

2. **Transaction State Machine** (`/app/backend/transaction_state.py`)
   - Strict state transitions enforced
   - States: CREATED → PENDING_CONFIRMATION → AWAITING_PAYMENT → PAYMENT_SECURED → DELIVERY_IN_PROGRESS → DELIVERED → COMPLETED

3. **Background Jobs** (`/app/backend/background_jobs.py`)
   - Fallback payment verification every 3 minutes
   - Auto-release processing every 6 minutes
   - Webhook health check every 15 minutes

## Architecture

### Backend
- **Framework**: FastAPI
- **Database**: MongoDB (motor async driver)
- **File Storage**: Local `/app/uploads/` served via StaticFiles
- **Main file**: `/app/backend/server.py` (4600+ lines - needs refactoring)
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
- `/admin/monitoring` - **NEW** Real-time system monitoring
- `/admin/transactions` - All transactions
- `/admin/users` - All users
- `/admin/disputes` - All disputes
- `/admin/transaction/{id}` - Transaction detail
- `/admin/user/{id}` - User detail
- `/admin/dispute/{id}` - Dispute detail

## Key API Endpoints
- `/api/tradesafe-webhook` - Production-ready webhook handler
- `/api/admin/monitoring/dashboard` - System health metrics
- `/api/admin/monitoring/webhook-events` - Webhook event list
- `/api/admin/monitoring/email-logs` - Email log list
- `/api/admin/monitoring/actions` - Admin action audit trail
- `/api/admin/monitoring/retry-webhook/{event_id}` - Retry webhook
- `/api/admin/monitoring/resend-email/{txn_id}/{type}` - Resend email
- `/api/admin/monitoring/update-transaction-status/{txn_id}` - Manual status update

## Database Collections
- `transactions` - Main transaction data
- `users` - User accounts and profiles
- `disputes` - Dispute records
- `webhook_events` - Webhook event log (idempotency)
- `email_logs` - Email send attempts
- `admin_actions` - Admin action audit trail

## Prioritized Backlog

### P0 (Critical) - COMPLETED
- [x] Webhook idempotency
- [x] Email deduplication
- [x] Fallback payment verification
- [x] State machine enforcement
- [x] Admin monitoring dashboard
- [x] Admin manual actions (retry, resend, update status)
- [x] Admin action logging/audit trail

### P1 (High Priority)
- [ ] Refactor `server.py` monolith into routes/services/models
- [ ] AI Scam Detection Enhancement

### P2 (Medium Priority)
- [ ] In-App Chat feature
- [ ] Enhanced dispute resolution flow
- [ ] Push notifications

### P3 (Low Priority)
- [ ] Mobile app
- [ ] Multi-language support
