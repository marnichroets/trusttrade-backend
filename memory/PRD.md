# TrustTrade PRD

## Overview
Professional escrow platform for peer-to-peer transactions in South Africa using TradeSafe payment gateway.

## Architecture (v2.0.0 - Refactored)

### Backend Structure
```
/app/backend/
├── main.py                 # FastAPI application entry point
├── server.py               # Thin wrapper for uvicorn compatibility
├── server.py.backup        # Original 4900+ line monolith backup
├── core/                   # Configuration, database, security
│   ├── config.py           # Environment-based configuration
│   ├── database.py         # MongoDB connection management
│   └── security.py         # Authentication utilities
├── models/                 # Pydantic models
│   ├── user.py             # User, Session, Profile models
│   ├── transaction.py      # Transaction, TradeSafe models
│   ├── dispute.py          # Dispute models
│   └── common.py           # Shared models (Risk, Admin requests)
├── routes/                 # API route handlers
│   ├── auth.py             # Authentication, phone verification
│   ├── transactions.py     # Transaction CRUD, file uploads
│   ├── tradesafe.py        # TradeSafe escrow integration
│   ├── share.py            # Share link functionality
│   ├── disputes.py         # Dispute management
│   ├── users.py            # User profiles, verification, wallet
│   ├── admin.py            # Admin dashboard, user/transaction management
│   ├── monitoring.py       # System health monitoring
│   └── webhooks.py         # TradeSafe webhooks, alerts
├── services/               # Existing business logic
│   ├── email_service.py    # Postmark email integration
│   ├── sms_service.py      # SMS Messenger integration
│   ├── tradesafe_service.py # TradeSafe API client
│   ├── webhook_handler.py  # Webhook processing
│   ├── alert_service.py    # Critical alert system
│   ├── background_jobs.py  # Payment verification jobs
│   └── pdf_generator.py    # Escrow agreement PDFs
└── .env.example            # Environment variable template
```

## Core Features
- Transaction Link System - Unique shareable links for every transaction
- TradeSafe Integration - Full payment gateway integration with escrow (PRODUCTION)
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

### 2026-03-24: P0 Login Bug Fix - Auth State Management
**Fixed critical login bug where users were redirected to homepage after Google OAuth:**

1. **Root Cause:** Race condition between React state updates and navigation. After OAuth callback, `login()` updated state but `navigate('/dashboard')` happened before React re-rendered with new state.

2. **Solution - Token-based Auth with Synchronous State Initialization:**
   - `AuthContext.js`: Added `getInitialState()` function that reads from localStorage SYNCHRONOUSLY before React renders, preventing flash of unauthenticated state
   - `ProtectedRoute.js`: Added localStorage check as fallback for race conditions, with 100ms delay for state sync
   - `AuthCallback.js`: Added 50ms delay before navigation to allow React state to settle
   - `api.js`: Axios interceptor adds Bearer token from localStorage to all API requests

3. **Key Files Updated:**
   - `/app/frontend/src/context/AuthContext.js`
   - `/app/frontend/src/components/ProtectedRoute.js`
   - `/app/frontend/src/pages/AuthCallback.js`
   - `/app/frontend/src/utils/api.js`

4. **Backend Already Working:**
   - `/api/auth/session` returns `session_token` in response body
   - `/api/auth/me` accepts Bearer token in Authorization header
   - `/app/backend/core/security.py` checks both cookies and Authorization header

5. **Testing Results (iteration_15.json):**
   - 17/17 backend tests passed
   - Frontend auth flow verified
   - ProtectedRoute correctly handles authenticated/unauthenticated users

### 2026-03-24: Backend Refactoring (v2.0.0)
**Major refactoring from monolithic server.py (4900+ lines) to modular production structure:**

1. **New Directory Structure:**
   - `core/` - Configuration (config.py), database (database.py), security (security.py)
   - `models/` - Pydantic models for user, transaction, dispute, common
   - `routes/` - 9 route files for auth, transactions, tradesafe, share, disputes, users, admin, monitoring, webhooks

2. **New Entry Point:**
   - `main.py` - FastAPI application with lifespan handler, CORS, and all routers
   - `server.py` - Thin wrapper for uvicorn compatibility (server:app)
   - `server.py.backup` - Original monolith preserved

3. **Environment Configuration:**
   - `.env.example` - Template with all required environment variables
   - All credentials from environment variables (no hardcoding)

4. **Testing Results:**
   - 20/20 backend tests passed
   - API version 2.0.0 confirms refactored code running
   - All existing functionality preserved

### 2026-03-24: White & Blue Color Scheme Update (Session 14 - Part 4)
**Implemented:**

1. **Landing Page - White & Blue Theme:**
   - White navbar with blue Sign Up button
   - Light blue gradient hero section
   - Logo in white card container for blending
   - Blue accent text and stats
   - Light blue "How It Works" section
   - White features section
   - Blue gradient CTA section
   - White footer

2. **Admin Navbar - White & Blue:**
   - White background with blue accent badge
   - Blue active state highlighting
   - Blue hover states

3. **Admin Dashboard - Blue Accents:**
   - Blue primary color
   - Blue info color

4. **Admin Monitoring - Blue Theme:**
   - Blue loading spinner
   - Blue health status colors
   - Blue accents throughout

### 2026-03-24: Critical Alert System & Logo Integration (Session 14 - Part 3)
**Implemented:**

1. **Critical Alert System** (`/app/backend/alert_service.py`)
   - Email alerts via Postmark for critical issues
   - Alert types: failed webhooks, failed emails, stuck transactions, payment not synced
   - Rate limiting (max 1 alert per issue type per transaction every 10 min)
   - All alerts stored in `alerts` collection
   - Alert resolve functionality for admin

2. **Alert Endpoints:**
   - `GET /api/admin/alerts` - Get alerts with stats
   - `POST /api/admin/alerts/{id}/resolve` - Resolve alert
   - `POST /api/admin/alerts/test` - Send test alert

3. **Admin Monitoring Dashboard - Alerts Tab:**
   - Active alerts counter with badge
   - Critical alerts highlighted in red
   - Resolve button for each alert
   - Email sent indicator
   - Alert statistics (unresolved, total 24h)

4. **TrustTrade Logo Integration (EVERYWHERE):**
   - Landing page navbar
   - Landing page hero section
   - Landing page footer
   - Admin navbar
   - Admin dashboard header
   - Admin monitoring page header
   - Dashboard layout header
   - Share transaction page
   - All email templates

5. **Database Query Optimizations:**
   - Added projections to list endpoints (users, transactions, disputes)
   - Reduced data transfer for admin list views
   - Limited reports to 500 items

### 2026-03-24: Admin Monitoring Dashboard (Session 14 - Part 2)
**Implemented:**
- Real-time system monitoring dashboard at `/admin/monitoring`
- Health status banner (healthy/warning/critical)
- 6 key metric cards
- Auto-refresh every 15 seconds
- 5 tabs: Overview, Alerts, Webhooks, Emails, Stuck Transactions, Actions
- Manual admin actions (retry webhook, resend email, update status)

### 2026-03-24: Production Reliability Upgrade (Session 14 - Part 1)
**Implemented:**
- Webhook handler with strict idempotency
- Email deduplication
- Transaction state machine
- Background jobs (payment verification, auto-release, health check)

## Architecture

### Backend
- **Framework**: FastAPI
- **Database**: MongoDB (motor async driver)
- **Main file**: `/app/backend/server.py` (4900+ lines - needs refactoring)
- **Alert Service**: `/app/backend/alert_service.py`
- **Webhook Handler**: `/app/backend/webhook_handler.py`
- **State Machine**: `/app/backend/transaction_state.py`
- **Background Jobs**: `/app/backend/background_jobs.py`

### Frontend
- **Framework**: React
- **Styling**: Tailwind CSS + Shadcn UI
- **Logo**: `/app/frontend/public/trusttrade-logo.png`

### Integrations
- **Email**: Postmark (PRODUCTION)
- **Payments**: TradeSafe (PRODUCTION)
- **SMS**: Zoom Connect (SMS Messenger API)
- **Auth**: Emergent-managed Google OAuth

## Key Admin Routes
- `/admin` - Dashboard overview
- `/admin/monitoring` - Real-time system monitoring
- `/admin/transactions` - All transactions
- `/admin/users` - All users
- `/admin/disputes` - All disputes

## Key API Endpoints
- `/api/tradesafe-webhook` - Production-ready webhook handler
- `/api/admin/monitoring/dashboard` - System health metrics
- `/api/admin/alerts` - Alert management
- `/api/admin/alerts/{id}/resolve` - Resolve alert
- `/api/admin/alerts/test` - Test alert

## Database Collections
- `transactions` - Transaction data
- `users` - User accounts
- `disputes` - Dispute records
- `webhook_events` - Webhook log (idempotency)
- `email_logs` - Email attempts
- `alerts` - System alerts
- `admin_actions` - Admin audit trail

## Deployment Readiness
- ✅ All environment variables externalized
- ✅ Logo using local path (not hardcoded URL)
- ✅ Database queries optimized with projections
- ✅ Rate limiting on alerts
- ✅ Admin access control on all admin endpoints
- ✅ CORS configured
- ✅ Static files served correctly

## Prioritized Backlog

### P0 (Critical) - COMPLETED
- [x] Webhook idempotency
- [x] Email deduplication
- [x] Fallback payment verification
- [x] State machine enforcement
- [x] Admin monitoring dashboard
- [x] Critical alert system with email notifications
- [x] TrustTrade logo everywhere
- [x] Backend refactoring (v2.0.0)
- [x] **Login bug fix - Auth state management with token-based auth**

### P1 (High Priority)
- [ ] Admin Manual Actions wiring (Retry Webhook, Resend Email)
- [ ] AI Scam Detection Enhancement

### P2 (Medium Priority)
- [ ] In-App Chat feature
- [ ] Enhanced dispute resolution flow
- [ ] Push notifications
- [ ] Robust Pre-Login Auth Check on landing page
- [ ] Verify logo size adjustments

### P3 (Low Priority)
- [ ] Mobile app
- [ ] Multi-language support
