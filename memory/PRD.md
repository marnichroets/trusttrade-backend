# TrustTrade PRD

## Overview
Professional escrow platform for peer-to-peer transactions in South Africa using TradeSafe payment gateway.

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
