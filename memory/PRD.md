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

### Phase 3: Trust & Ratings System (IN PROGRESS)
- [x] Fee Split: Option for buyer, seller, or 50/50 (default) to pay escrow fee
- [x] Fee Agreement Message: Warning displayed during transaction creation
- [ ] User Ratings/Reviews: 5-star rating system after completed transactions
- [ ] Trust Badges: Silver/Gold/Verified badges based on transaction history
- [ ] User Profiles: Public profiles displaying ratings, badges, trust score
- [ ] Identity Verification: Flow for users to verify identity (ID, selfie, phone)
- [ ] Live Activity Board: Dashboard showing platform-wide stats
- [ ] Scam Detection: Automatic flagging of suspicious accounts
- [ ] In-App Chat: Messaging system within transactions
- [ ] Auto-Release Timer: Auto-release funds after timeout
- [ ] Report User: Feature to report suspicious users

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
2. **Logo Size** - Made logo 4x bigger (h-20 md:h-24 = 96px)
3. **Transaction Flow Fix** - Confirm Delivery now only appears AFTER payment is marked as "Paid"

### New Features
1. **Fee Split Options** - Default changed to 50/50 split
2. **Fee Agreement Warning** - Added message: "Escrow fee option must be agreed by both parties before payment"
3. **Fee Payer Badge** - Both buyer and seller can see who pays the fee on transaction details
4. **Payment Confirmation Endpoint** - Admin can mark transaction as "Paid" via `/api/transactions/{id}/confirm-payment`
5. **Status Guidance Cards** - Contextual messages for each transaction state (Awaiting Payment, Payment Received)

### Transaction Flow (Updated)
1. Buyer/Seller creates transaction
2. Seller confirms transaction details → Status: "Ready for Payment"
3. Admin marks payment received → Status: "Paid" (in production: payment gateway)
4. Buyer confirms delivery → Status: "Released" (funds released to seller)

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
