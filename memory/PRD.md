# TrustTrade - Escrow Platform PRD

## Original Problem Statement
Build a professional, full-stack escrow application called "TrustTrade" with a clean, modern fintech design (white base, blue accents). The platform facilitates secure peer-to-peer transactions in South African Rand (R).

## Core Features

### Phase 1: MVP (COMPLETED)
- User Management: Signup/Login/Logout with Emergent-managed Google OAuth
- Core Pages: Home, New Transaction, Transactions List/Details, Disputes, Admin Dashboard
- Core Functionality: Transaction creation with 2% fee, delivery confirmation, dispute lodging
- Privacy: Users can only see their own data; admins can see everything
- Currency: All monetary values in South African Rand (R)
- Email notifications: MOCKED (mock_send_email function)

### Phase 2: Professional Upgrade (COMPLETED)
- Terms & Conditions page with mandatory acceptance on signup
- Transaction Enhancements: Item condition, photo uploads (1-5 images), confirmation checkboxes
- Seller Confirmation: Seller must confirm transaction details before buyer can pay
- Structured Disputes: Dispute form with predefined reasons and mandatory evidence uploads
- Transaction Timeline: Visual timeline on transaction details page
- PDF Agreements: Auto-generated downloadable PDF escrow agreement
- Role Selection: User selects if they are "Buyer" or "Seller" when creating transaction
- Account Suspension: Flag users after 3 valid disputes

### Phase 3: Trust & Ratings System (MOSTLY COMPLETE)
- [x] Fee Split: Option for buyer, seller, or 50/50 (default) to pay escrow fee
- [x] Fee Agreement Message: Warning displayed during transaction creation
- [x] User Ratings/Reviews: 5-star rating system after completed transactions
- [x] Trust Score System: Score out of 100 based on trades, ratings, disputes, verification
- [x] User Profiles: Public profiles displaying ratings, badges, trust score
- [x] Trust Badges: Silver/Gold/Verified badges based on transaction history
- [x] Transaction Share Links: Shareable TT-XXXXXX codes for easy sharing
- [x] Live Activity Board: Dashboard showing platform-wide stats
- [x] Report User: Feature to report suspicious or abusive users
- [x] Auto-Release Timer: 48-hour automatic fund release if buyer doesn't respond
- [ ] Identity Verification: Flow for users to verify identity (ID, selfie, phone OTP)
- [ ] Scam Detection: Automatic flagging of suspicious accounts

## Technical Architecture

### Backend
- Framework: FastAPI
- Database: MongoDB (via motor async driver)
- Authentication: Emergent-managed Google OAuth
- Session: HTTP-only cookies with 7-day expiration
- File Storage: /app/uploads (photos, disputes, pdfs)

### Frontend
- Framework: React
- Styling: Tailwind CSS + shadcn/ui components
- Routing: React Router

### Key Files
- `/app/backend/server.py` - Main API with all endpoints
- `/app/backend/pdf_generator.py` - PDF escrow agreement generation
- `/app/frontend/src/pages/NewTransaction.js` - Transaction creation form
- `/app/frontend/src/pages/AuthCallback.js` - OAuth callback handler
- `/app/frontend/src/components/ProtectedRoute.js` - Route guard

## Database Schema

### users
```
{
  user_id: string,
  email: string,
  name: string,
  picture: string,
  role: "buyer" | "seller" | "admin",
  is_admin: boolean,
  terms_accepted: boolean,
  terms_accepted_at: string,
  suspension_flag: boolean,
  valid_disputes_count: number,
  total_trades: number,
  successful_trades: number,
  average_rating: number,
  trust_score: number,
  badges: string[],
  verified: boolean,
  created_at: string
}
```

### transactions
```
{
  transaction_id: string,
  creator_role: "buyer" | "seller",
  buyer_user_id: string,
  seller_user_id: string,
  buyer_name: string,
  buyer_email: string,
  seller_name: string,
  seller_email: string,
  item_description: string,
  item_condition: string,
  known_issues: string,
  item_photos: string[],
  item_price: number,
  trusttrade_fee: number,
  total: number,
  fee_paid_by: "buyer" | "seller" | "split",
  payment_status: string,
  seller_confirmed: boolean,
  delivery_confirmed: boolean,
  release_status: string,
  agreement_pdf_path: string,
  timeline: array,
  created_at: string
}
```

### disputes
```
{
  dispute_id: string,
  transaction_id: string,
  raised_by_user_id: string,
  dispute_type: string,
  description: string,
  evidence_photos: string[],
  status: string,
  admin_decision: string,
  is_valid_dispute: boolean,
  created_at: string
}
```

## API Endpoints

### Auth
- POST /api/auth/session - Exchange session_id for user data
- GET /api/auth/me - Get current user
- POST /api/auth/logout - Logout

### Transactions
- POST /api/transactions - Create transaction
- GET /api/transactions - List user's transactions
- GET /api/transactions/{id} - Get transaction details
- PATCH /api/transactions/{id}/photos - Add photos
- POST /api/transactions/{id}/seller-confirm - Seller confirmation
- PATCH /api/transactions/{id}/delivery - Confirm delivery
- POST /api/transactions/{id}/rate - Submit rating
- GET /api/transactions/{id}/agreement-pdf - Download PDF

### Disputes
- POST /api/disputes - Create dispute
- GET /api/disputes - List disputes
- PATCH /api/disputes/{id} - Update dispute (admin)
- PATCH /api/disputes/{id}/evidence - Add evidence

### Admin
- GET /api/admin/users - List all users
- GET /api/admin/transactions - List all transactions
- GET /api/admin/disputes - List all disputes
- GET /api/admin/stats - Dashboard stats

## Recent Changes (December 2025)

### Fixed Issues
1. **Transaction Creation Bug (P0)** - Added `fee_paid_by` field to both `TransactionCreate` and `Transaction` Pydantic models
2. **Logo Size** - Made logo 4x bigger (h-28 md:h-32 = 128px)
3. **Transaction Flow Fix** - Confirm Delivery now only appears AFTER payment is marked as "Paid"

### New Features Implemented
1. **Transaction Share Links** - Every transaction gets a unique TT-XXXXXX share code
   - Route: `/t/{shareCode}` for viewing transaction preview
   - One-click copy link button on transaction detail page
   - Sign-in required to join transaction
   
2. **User Profile Page** - `/profile` and `/profile/:userId`
   - Trust score display (out of 100)
   - Trust badges (Silver, Gold, Verified)
   - Stats: Total trades, successful trades, avg rating, disputes
   - Trust score breakdown with progress bars

3. **Trust Score System** - Calculated dynamically:
   - Transaction History: 4pts per successful trade (max 40)
   - User Ratings: 6pts per star (max 30)
   - Dispute Record: 20pts minus 5 per valid dispute (min 0)
   - Verification: 10pts if verified

4. **Live Activity Board** - `/activity`
   - Real-time platform statistics
   - Completed trades today, total secured, fraud cases
   - Auto-refresh every 30 seconds

5. **Rating System** - 5-star rating after transaction completion
   - Buyers rate sellers, sellers rate buyers
   - Optional text review
   - Ratings displayed on profiles

7. **Report User System** - Users can report suspicious behavior
   - Report reasons: Scam attempt, Abuse, Suspicious behavior, Fake account, etc.
   - Admin review queue
   
8. **Auto-Release Timer** - 48-hour automatic fund release
   - Timer starts when payment is marked as "Paid"
   - Displays countdown on transaction detail page
   - Admin endpoints to process and view pending auto-releases

9. **Share Page Protection Message** - "This transaction is protected by TrustTrade escrow"

### Transaction Flow (Updated)
1. Buyer/Seller creates transaction → Generates shareable link (TT-XXXXXX)
2. Creator shares link via WhatsApp/SMS/Email
3. Other party opens link, signs in, joins transaction
4. Seller confirms transaction details → Status: "Ready for Payment"
5. Admin marks payment received → Status: "Paid" (in production: payment gateway)
6. Buyer confirms delivery → Status: "Released" (funds released to seller)
7. Both parties rate each other

## Known Issues
1. **React hydration errors** in dashboard table components (LOW severity, doesn't affect functionality)
2. **Authentication flow** - Users reported occasional redirects to homepage (needs monitoring)

## Upcoming Tasks (Priority Order)
1. Build Rating/Review UI modal for completed transactions
2. Build User Profile page with trust metrics
3. Implement Trust Badge display system
4. Add In-App Chat feature
5. Create Live Transaction Board

## Future/Backlog
- Identity Verification flow
- Auto-Release Timer
- AI Scam Detection
- Payment Gateway Integration (Stripe Connect)
- Real Email Integration (SendGrid)
