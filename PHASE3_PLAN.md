# TrustTrade Phase 3 - Trust & Rating System Implementation Plan

## Features to Implement (Token Budget: 40k)

### PRIORITY 1: Core Trust System
1. **Fee Split Option** - Add to transaction creation (buyer/seller/50-50)
2. **User Ratings** - 5-star system after completed transactions
3. **Trust Score** - 0-100 calculated from trades, ratings, disputes
4. **User Profile Stats** - Display trades, rating, badges
5. **Auto-Release Timer** - 48hr countdown after delivery

### PRIORITY 2: Trust Building
6. **Trust Badges** - Silver (3 trades), Gold (10 trades), Verified
7. **User Profiles Page** - Public profile with all stats
8. **Rating System** - Mutual rating after transaction complete

### Backend Changes Needed:
- User model: total_trades, successful_trades, average_rating, trust_score, badges[], verified
- Transaction model: fee_paid_by, buyer_rating, seller_rating, buyer_review, seller_review, auto_release_at
- New endpoints: POST /transactions/:id/rate, GET /users/:id/profile, GET /stats/live
- Trust score calculation function
- Badge award function

### Frontend Changes Needed:
- Fee split selector in NewTransaction
- Rating modal after delivery confirmation
- User profile page component
- Trust score badge display
- Live stats dashboard

## Implementation Status:
- [x] User model enhanced
- [ ] Transaction model enhanced
- [ ] Rating endpoints
- [ ] Trust score calculation
- [ ] User profile page
- [ ] Fee split UI
- [ ] Auto-release timer logic
