# TrustTrade - BETA LAUNCH READY

## Status: ✅ READY FOR REAL USERS

### Core Features
1. **Authentication**: JWT email/password
2. **Transactions**: Create, confirm, escrow, payment, release
3. **Auto-Refresh**: Every 8 seconds for active transactions
4. **Emails**: Postmark with clear next-step instructions
5. **Webhooks**: Auto-update on payment events

### Fee Structure
- **TrustTrade Fee**: 1.5% (minimum R5)
- **Processing Fee**: Varies by method
  - EFT: 0.86%
  - Card: 2.88%
  - Ozow: 1.73%

### Fee Calculation Endpoint
```
GET /api/tradesafe/calculate-fees?amount=200&fee_allocation=SELLER_AGENT
```

Returns:
- item_price
- trusttrade_fee (1.5%, min R5)
- processing_fee
- total_fees
- buyer_pays / seller_receives
- payout_time: "1-2 business days"

### Transaction Flow
```
Created → Confirm → Escrow → Payment → Secured → Release
         (auto-refresh every 8s while active)
```

### Email Events
| Event | What It Says |
|-------|--------------|
| Created | Next steps numbered 1-4 |
| Payment | "Funds secured safely" + next steps |
| Released | Payout breakdown + 1-2 business days |

### Webhook URL (Configure in TradeSafe)
```
https://trusttradesa.co.za/api/tradesafe-webhook
```

### Test Endpoint
```
GET /api/test-email?to=your@email.com
```

### Beta Limits
- Min: R100
- Max: R10,000
