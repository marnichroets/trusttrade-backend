# TrustTrade - BETA LAUNCH READY

## Status: ✅ READY FOR REAL USERS

### Authentication
1. **Email/Password**: Standard JWT login
2. **Google Sign-In**: OAuth via Emergent Auth
   - Endpoint: `POST /api/auth/google/callback`
   - Creates new user if email doesn't exist
   - Logs in existing user if email exists

### Core Features
- Transaction create, confirm, escrow, payment
- Auto-refresh every 8 seconds for active transactions
- Email notifications via Postmark
- TradeSafe webhook integration

### Fee Structure
- **TrustTrade Fee**: 1.5% (minimum R5)
- **Processing Fee**: Varies by method
  - EFT: 0.86%
  - Card: 2.88%
  - Ozow: 1.73%

### Transaction Flow
```
Created → Confirm → Escrow → Payment → Secured → Release
```

### Key Endpoints
- `POST /api/auth/login` - Email/password login
- `POST /api/auth/google/callback` - Google OAuth
- `POST /api/tradesafe/create-transaction` - Create escrow
- `POST /api/tradesafe/sync/{id}` - Force sync status
- `POST /api/tradesafe-webhook` - Webhook receiver

### Production Domains
- www.trusttradesa.co.za
- trusttradesa.co.za

### Test Credentials
- Buyer: testuser@example.com / Test@123
- Seller: seller@example.com / Seller@123
- Admin: marnichr@gmail.com / Admin@123

### Beta Limits
- Min: R100
- Max: R10,000
