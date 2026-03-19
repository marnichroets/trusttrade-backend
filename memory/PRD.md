# TrustTrade PRD

## Overview
Professional escrow platform for peer-to-peer transactions in South Africa. Core feature: shareable transaction links with secure payment gateway integration.

## Changelog
- **2026-03-18**: Payment Button and Flow Implementation
  - Added prominent "Pay Securely with TrustTrade" button for buyers
  - Button shows only when: user is BUYER and payment status is "Awaiting Payment"
  - Added payment summary with fee breakdown on payment card
  - Added "Awaiting Buyer Payment" status card for sellers
  - Updated PaymentSuccess page with better confirmation UI
  - Fixed transactionDeposit mutation to return Deposit object properly
  - Added support for EFT (returns bank details) and interactive payments (Ozow/Card)
  - Note: Sandbox has issues with Ozow payment links - works with EFT for testing
- **2026-03-18**: Fixed Token and Transaction Creation
  - Fixed GraphQL mutation types and structures
  - Removed unsupported fields, fixed enum values
- **2026-03-17**: Initial payment gateway integration

## Payment Flow
1. Buyer/Seller creates transaction (R500 minimum)
2. Secure link sent to other party
3. Both parties confirm transaction details
4. User clicks "Create TrustTrade Escrow"
5. **Buyer sees "Pay Securely with TrustTrade" button**
6. Buyer clicks button → redirected to payment page (or bank details for EFT)
7. Buyer pays using EFT, Card, or Ozow
8. Webhook fires FUNDS_RECEIVED → seller notified
9. Seller delivers and marks as dispatched
10. Buyer confirms receipt → funds released

## Payment Button Logic
```javascript
// Show payment button when:
const canMakePayment = hasEscrow && isBuyer && 
  (escrowState === 'CREATED' || escrowState === 'PENDING' || 
   transaction.payment_status === 'Awaiting Payment');

// Show seller waiting card when:
const isAwaitingBuyerPayment = hasEscrow && isSeller && 
  (escrowState === 'CREATED' || escrowState === 'PENDING' || 
   transaction.payment_status === 'Awaiting Payment');
```

## Fee Display
- Item Price: R599.99
- TrustTrade Fee (2%): R12.00
- Payment Processing Fee: (shown at checkout)
- Estimated Total: R611.99

## Redirect URLs
- Success: https://trusttradesa.co.za/transaction/success?tx={transaction_id}
- Failure: https://trusttradesa.co.za/transaction/failed?tx={transaction_id}  
- Cancel: https://trusttradesa.co.za/transaction/cancelled?tx={transaction_id}

## API Endpoints
- `POST /api/tradesafe/create-transaction` - Create escrow
- `GET /api/tradesafe/payment-url/{id}` - Get payment link/deposit
- `POST /api/tradesafe/start-delivery/{id}` - Seller marks dispatched
- `POST /api/tradesafe/accept-delivery/{id}` - Buyer confirms receipt
- `POST /api/tradesafe-webhook` - Handle payment callbacks

## Known Sandbox Limitations
- Ozow/Card payment links throw internal errors in sandbox
- EFT method works but returns bank details instead of payment link
- In production, interactive payment methods should work properly

## Files Modified
- `/app/backend/tradesafe_service.py` - Fixed payment link generation
- `/app/backend/server.py` - Updated payment-url endpoint
- `/app/frontend/src/pages/TransactionDetail.js` - Added payment button, seller waiting card
- `/app/frontend/src/pages/PaymentSuccess.js` - Enhanced success page

## Test Reports
- `/app/test_reports/iteration_10.json`
