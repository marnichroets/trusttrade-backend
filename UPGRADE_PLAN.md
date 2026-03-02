# TrustTrade Professional Upgrade - Implementation Plan

## Phase 1: Backend Enhancements ✅
- [x] Install reportlab for PDF generation
- [x] Install python-multipart for file uploads
- [x] Create upload directories for photos, PDFs, disputes

## Phase 2: Database Schema Updates
### User Model
- Add: `terms_accepted` (bool)
- Add: `terms_accepted_at` (datetime)
- Add: `suspension_flag` (bool)
- Add: `valid_disputes_count` (int)

### Transaction Model
- Add: `creator_role` (str: "buyer" | "seller")
- Add: `item_condition` (str)
- Add: `known_issues` (str)
- Add: `item_photos` (list of file paths)
- Add: `seller_confirmed` (bool)
- Add: `seller_confirmed_at` (datetime)
- Add: `agreement_pdf_path` (str)
- Add: `buyer_details_confirmed` (bool)
- Add: `seller_details_confirmed` (bool)
- Add: `item_accuracy_confirmed` (bool)
- Add: `timeline` (list of status changes)

### Dispute Model
- Add: `dispute_type` (str)
- Add: `evidence_photos` (list of file paths)
- Add: `admin_decision` (str: "release_to_seller" | "refund_buyer" | null)
- Add: `is_valid_dispute` (bool)

## Phase 3: New API Endpoints
1. `/api/upload/photo` - Upload transaction/dispute photos
2. `/api/transactions/:id/seller-confirm` - Seller confirms transaction details
3. `/api/transactions/:id/agreement-pdf` - Generate and download escrow agreement
4. `/api/users/:id/suspend` - Admin suspends user account
5. `/api/terms` - Get terms & conditions content

## Phase 4: Frontend Components
### New Pages
- TermsAndConditions.js
- TransactionTimeline component
- AgreementViewer component

### Updated Pages
- NewTransaction.js - Add role selection, condition, photos, checkboxes
- TransactionDetail.js - Add timeline, agreement tab, seller confirmation
- Disputes.js - Add dispute type, evidence upload
- LandingPage.js - Add terms acceptance checkbox

## Phase 5: PDF Generation
- Generate professional escrow agreement PDF
- Include TrustTrade branding
- Add all transaction details
- Store and link to transaction

## Phase 6: Enhanced Features
- Transaction timeline tracking
- Seller confirmation workflow
- Structured dispute system
- Account suspension logic
- Role-based transaction creation

## Implementation Priority
1. **CRITICAL**: Role selection, item condition, seller confirmation
2. **HIGH**: PDF agreement generation, photo uploads
3. **MEDIUM**: Transaction timeline, structured disputes
4. **LOW**: Account suspension automation

## Next Steps
1. Update Pydantic models with new fields
2. Create file upload endpoints
3. Implement PDF generation function
4. Update transaction creation endpoint
5. Add seller confirmation endpoint
6. Create Terms page frontend
7. Update all forms with new fields
8. Test complete flow
