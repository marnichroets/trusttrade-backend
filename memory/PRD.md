# TrustTrade PRD

## Overview
Professional escrow platform for peer-to-peer transactions in South Africa. Core feature: shareable transaction links.

## Changelog
- **2026-03-12**: Fixed Total Escrow Value display - admins see exact, users see rounded (R 107k+)
- **2026-03-12**: Implemented Transaction Settings:
  - R150 minimum transaction amount
  - R500 payout threshold with wallet system
  - Banking details management for SA banks
  - TradeSafe OAuth service created

## Platform Settings
- **Minimum Transaction**: R150
- **Payout Threshold**: R500 (auto-payout when reached)
- **Platform Fee**: 2%
- **Currency**: ZAR (R)

## Core Features (Implemented)
1. **Transaction Link System** - Shareable links (TT-XXXXXX)
2. **User Profiles** - Ratings, badges, trust scores
3. **Identity Verification** - ID, selfie, phone OTP
4. **Scam Detection** - Rule-based risk assessment
5. **Auto-Release Timer** - 48hr auto-release
6. **Report User** - User reporting system
7. **Wallet System** - Balance tracking, payout progress
8. **Banking Details** - SA bank integration

## Pending Integrations
- **TradeSafe** - Payment gateway (credentials needed)
- **Brevo** - Transactional emails (API key needed)

## De-prioritized
- In-app chat (user requested to skip)

## Technical Architecture
- Backend: FastAPI + MongoDB
- Frontend: React + Tailwind CSS
- Auth: Emergent Google OAuth
