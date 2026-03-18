# TrustTrade PRD

## Overview
Professional escrow platform for peer-to-peer transactions in South Africa. Core feature: shareable transaction links with secure payment gateway integration.

## Changelog
- **2026-03-18**: FIXED Payment Gateway Integration - Complete Fix
  - Fixed GraphQL mutation to use `CreateTransactionInput` (not `TransactionCreateInput`)
  - Fixed relation structure: `parties.create[]` and `allocations.create[]`
  - Fixed enum values: `BUYER_SELLER` (not `50_50`), removed `PRIVATE` privacy
  - Removed unsupported `reference` field from `TokenInput`
  - Fixed nested `user` object structure for token creation
  - Added detailed error logging showing exact API request/response
  - Token creation and transaction creation now working successfully
- **2026-03-18**: Removed all TradeSafe branding from user-facing text
- **2026-03-17**: Initial payment gateway integration

## API Schema Corrections (Important for future reference)

### Token Creation
```graphql
mutation tokenCreate($input: TokenInput!) {
  tokenCreate(input: $input) {
    id
    name
  }
}
# Input structure:
{
  "input": {
    "user": {
      "givenName": "...",
      "familyName": "...",
      "email": "...",
      "mobile": "+27...",
      "idNumber": "8501015009087",
      "idType": "NATIONAL",
      "idCountry": "ZAF"
    }
  }
}
```

### Transaction Creation
```graphql
mutation transactionCreate($input: CreateTransactionInput!) {
  transactionCreate(input: $input) {
    id
    uuid
    reference
    state
    allocations { id title value state }
    parties { id role }
  }
}
# Input structure:
{
  "input": {
    "title": "...",
    "description": "...",
    "industry": "GENERAL_GOODS_SERVICES",
    "currency": "ZAR",
    "feeAllocation": "BUYER_SELLER",  # Options: BUYER, SELLER, BUYER_SELLER
    "reference": "internal-ref",
    "parties": {
      "create": [
        { "role": "BUYER", "token": "buyer_token_id" },
        { "role": "SELLER", "token": "seller_token_id" }
      ]
    },
    "allocations": {
      "create": [
        {
          "title": "Payment for item/service",
          "description": "...",
          "value": 50000,  # In cents
          "daysToDeliver": 7,
          "daysToInspect": 2
        }
      ]
    }
  }
}
```

## Platform Settings
- **Minimum Transaction**: R500
- **Platform Fee**: 2% TrustTrade fee
- **Currency**: ZAR (R)
- **Payment Methods**: EFT, Card, Ozow

## Core Features (Implemented)
1. Transaction Link System
2. User Profiles with Trust Scores
3. Identity Verification
4. Scam Detection (rule-based)
5. Auto-Release Timer
6. Report User
7. Wallet System
8. Banking Details
9. Admin Dashboard
10. Secure Payment Gateway

## Files Modified
- `/app/backend/tradesafe_service.py` - Fixed all API calls
- `/app/backend/server.py` - Updated endpoint with pre-flight checks
- `/app/frontend/src/pages/TransactionDetail.js` - Removed TradeSafe branding

## Test Reports
- `/app/test_reports/iteration_10.json`
