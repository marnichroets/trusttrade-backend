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

### 2026-03-22: TradeSafe Happy Path & Admin Overhaul (Session 13)
**Implemented:**

1. **TradeSafe Happy Path Complete**
   - Start Delivery endpoint: `/api/tradesafe/start-delivery/{id}`
     - Shows when state is FUNDS_RECEIVED
     - Only seller can click
     - Calls TradeSafe allocationStartDelivery mutation
     - Updates state to INITIATED
     - Sends email AND SMS to buyer
   - Accept Delivery endpoint: `/api/tradesafe/accept-delivery/{id}`
     - Shows when state is INITIATED
     - Only buyer can click
     - Calls TradeSafe allocationAcceptDelivery mutation
     - Updates state to FUNDS_RELEASED
     - Sends email AND SMS to seller
   - Webhook handler updated with SMS for all states:
     - FUNDS_RECEIVED: SMS to seller + buyer
     - INITIATED: SMS to buyer
     - FUNDS_RELEASED: SMS to seller

2. **Admin Dashboard Complete Overhaul**
   - Separate pages with proper routing:
     - `/admin` - Dashboard with stats cards
     - `/admin/transactions` - Full transactions list
     - `/admin/users` - Full users list
     - `/admin/disputes` - Full disputes list
     - `/admin/transaction/{id}` - Transaction detail
     - `/admin/user/{id}` - User detail with transactions
     - `/admin/dispute/{id}` - Dispute resolution panel
   - Navigation works correctly (Dashboard, Transactions, Users, Disputes)
   - All table rows are clickable and navigate to detail pages
   - Stats cards with dark navy styling

3. **Admin User Detail Page**
   - Full user information display
   - ID documents viewable and downloadable
   - All transactions as buyer/seller
   - Admin actions: Verify ID, Reject ID, Suspend, Ban

4. **Images Fixed**
   - Static files mounted at `/uploads`
   - Proper URL construction for all image types

### 2026-03-22: Admin Features (Session 12)
- Created AdminTransactionDetail.js
- Created AdminDisputeDetail.js
- Added CSS variables for color system
- Created AdminNavbar component
- Database cleanup (test data removed)

## Architecture

### Backend
- **Framework**: FastAPI
- **Database**: MongoDB (motor async driver)
- **File Storage**: Local `/app/uploads/` served via StaticFiles
- **Main file**: `/app/backend/server.py` (4300+ lines - needs refactoring)

### Frontend
- **Framework**: React
- **Styling**: Tailwind CSS + Shadcn UI
- **Routing**: React Router
- **State**: useState/useEffect hooks

### Integrations
- **Email**: Postmark
- **Payments**: TradeSafe (GraphQL API)
- **SMS**: Zoom Connect (SMS Messenger API)
- **Auth**: Emergent-managed Google OAuth

## Key Admin Routes
- `/admin` - Dashboard overview
- `/admin/transactions` - All transactions
- `/admin/users` - All users
- `/admin/disputes` - All disputes
- `/admin/transaction/:id` - Transaction detail
- `/admin/user/:id` - User detail
- `/admin/dispute/:id` - Dispute detail

## Key API Endpoints
- `POST /api/tradesafe/start-delivery/{id}` - Seller marks as dispatched
- `POST /api/tradesafe/accept-delivery/{id}` - Buyer confirms receipt
- `POST /api/tradesafe/webhook` - TradeSafe state change notifications
- `GET /api/admin/transaction/{id}` - Admin transaction detail
- `GET /api/admin/user/{id}` - Admin user detail
- `GET /api/admin/dispute/{id}` - Admin dispute detail

## Roadmap

### P0 - Completed
- [x] TradeSafe happy path (start delivery, accept delivery)
- [x] SMS notifications for all state changes
- [x] Admin separate pages with navigation
- [x] Clickable table rows
- [x] User detail page
- [x] Image loading fixed

### P1 - Next
- [ ] Refactor server.py monolith into modules
- [ ] AI Scam Detection Enhancement

### P2 - Backlog
- [ ] In-App Chat feature
- [ ] Advanced analytics dashboard
- [ ] Bulk transaction management
