# TrustTrade Testing Checklist

Complete testing checklist for all TrustTrade features. Run automated tests with:
```
cd backend && python tests/test_full_flow.py
```

Live backend: https://trusttrade-backend-production-3efa.up.railway.app

---

## 1. User Registration & Login

### Email/Password
- [ ] `POST /api/auth/register` — new user registers with email, name, phone, password
- [ ] Registration sends email verification link
- [ ] `POST /api/auth/verify-email` — email verification token accepted
- [ ] `POST /api/auth/login` — returns JWT access token
- [ ] `POST /api/auth/login` with wrong password — returns 401
- [ ] `POST /api/auth/login` with unverified email — returns 403 with clear message

### Google OAuth
- [ ] `GET /api/auth/google` — redirects to Google consent screen
- [ ] `GET /api/auth/google/callback` — handles OAuth callback, creates/finds user, returns token
- [ ] Google login with existing email account — merges correctly

### SMS OTP
- [ ] `POST /api/auth/request-otp` — sends OTP SMS to phone number
- [ ] `POST /api/auth/verify-otp` — accepts correct OTP, returns token
- [ ] `POST /api/auth/verify-otp` with wrong OTP — returns 400
- [ ] OTP expires after timeout — returns 400 on expired OTP

### Token / Session
- [ ] `GET /api/users/me` with valid token — returns user profile
- [ ] `GET /api/users/me` without token — returns 401
- [ ] `POST /api/auth/logout` — invalidates session

---

## 2. Create Transaction (End-to-End)

- [ ] `POST /api/transactions` — creates transaction with all required fields
  - Fields: `title`, `description`, `item_price`, `delivery_method`, `transaction_type`
- [ ] Transaction created with `status: payment_pending`
- [ ] `GET /api/transactions/{id}` — returns created transaction
- [ ] Buyer sees payment link / TradeSafe deposit link in response
- [ ] Seller receives email notification on new transaction
- [ ] AI fraud analysis runs automatically (check `ai_fraud_analysis` field after ~5 seconds)
- [ ] `GET /api/transactions` — lists user's transactions (paginated)
- [ ] Transaction title/description validation — rejects empty fields
- [ ] Transaction amount below minimum (R500) — returns 400
- [ ] Transaction amount above maximum (R10,000) — returns 400

### Delivery Methods
- [ ] `physical` delivery — standard flow
- [ ] `digital` / `instant` delivery — buyer gets immediate release button
- [ ] `courier` delivery — courier section appears in UI

---

## 3. Smart Deal Creation (End-to-End)

- [ ] `POST /api/smart-deals/generate` — AI generates deal terms from description
- [ ] `POST /api/smart-deals/create` — creates transaction from Smart Deal template
- [ ] Smart Deal includes milestone/stage breakdown
- [ ] Smart Deal transaction has `smart_deal: true` flag
- [ ] `GET /api/smart-deals/{id}` — returns Smart Deal details
- [ ] Smart Deal with missing fields returns validation error

---

## 4. Payment Flow (TradeSafe)

- [ ] `GET /api/tradesafe/deposit-link/{transaction_id}` — returns TradeSafe payment URL
- [ ] Payment URL is valid and loads TradeSafe payment page
- [ ] After payment: `FUNDS_RECEIVED` webhook fires (or polling catches it within 5 min)
- [ ] Transaction status updates to `payment_received` after funds confirmed
- [ ] Buyer and seller both receive email notifications on payment received

### Release Flow
- [ ] `POST /api/transactions/{id}/release` — seller releases funds (physical delivery)
- [ ] Instant/digital: `POST /api/transactions/{id}/buyer-confirm` — buyer confirms receipt
- [ ] Transaction moves to `funds_released` status after release
- [ ] `TOKEN_WITHDRAWAL` fires automatically after release
- [ ] Transaction moves to `complete` after withdrawal confirmed

---

## 5. Webhooks

- [ ] `POST /api/tradesafe-webhook` — accepts valid TradeSafe webhook payload
- [ ] Webhook signature verification rejects tampered payloads (401)
- [ ] `FUNDS_RECEIVED` event — updates transaction status correctly
- [ ] `FUNDS_RELEASED` event — triggers token withdrawal + status update
- [ ] `COMPLETE` event — marks transaction complete
- [ ] Unknown event type — logs warning, returns 200 (idempotent)
- [ ] Duplicate webhook — idempotent, does not double-process

---

## 6. Seller Payout

- [ ] After `funds_released`: seller balance increases in TradeSafe wallet
- [ ] `GET /api/users/me` — shows pending payout amount
- [ ] Payout scheduled at configured release times (10:00 / 15:00 SAST)
- [ ] `POST /api/tradesafe/withdraw` — triggers manual withdrawal (admin only)
- [ ] Seller receives payout email with amount and ETA
- [ ] Bank clearing disclaimer shown in UI and email

---

## 7. Dispute Creation

- [ ] `POST /api/disputes` — creates dispute for a transaction
  - Fields: `transaction_id`, `reason`, `description`, `evidence_urls[]`
- [ ] Dispute created only for active transactions (not complete/cancelled)
- [ ] Both parties notified via email on dispute creation
- [ ] AI dispute analysis runs automatically (check `ai_analysis` field after ~5 seconds)
- [ ] `GET /api/disputes/{id}` — returns dispute details with AI analysis
- [ ] `GET /api/disputes` — lists user's disputes
- [ ] Admin can view all disputes: `GET /api/admin/disputes`
- [ ] `POST /api/disputes/{id}/resolve` — admin resolves dispute, releases funds to winner
- [ ] Transaction status updates to `disputed` when dispute is opened

---

## 8. AI Features

### Fraud Detection
- [ ] `POST /api/ai/fraud-detect` with `transaction_id` — returns fraud analysis
- [ ] Response includes: `risk_level` (low/medium/high), `risk_score`, `flags[]`, `summary`, `recommendation`
- [ ] Calling again returns cached result (same `analyzed_at`)
- [ ] High risk transactions show warning badge in TransactionDetail UI

### Improve Description
- [ ] `POST /api/ai/improve-description` with `{description, item_price, delivery_method}`
- [ ] Returns `{original, improved}` — improved text is longer/cleaner
- [ ] Empty description returns 400

### Dispute AI Advice
- [ ] `POST /api/ai/dispute-advice` with `{dispute_id}` — returns AI recommendation
- [ ] Response includes: `likely_outcome`, `recommended_steps[]`, `evidence_needed[]`, `resolution_timeframe`, `summary`
- [ ] Calling again returns cached result

### Support Chat
- [ ] `POST /api/ai/chat` with `{message, history: []}` — returns chatbot reply
- [ ] Multi-turn: `POST /api/ai/chat` with `{message, history: [{role, content}]}` — maintains context
- [ ] Off-topic messages get appropriate redirect response
- [ ] Response includes: `{reply, role: "assistant"}`

---

## 9. Courier Guy (ShipLogic)

- [ ] `POST /api/courier/quote` — returns delivery rate options
  - Body: `{pickup_address, delivery_address, parcel}`
  - Response: `{rates: [{service_level, rate, collection_date}]}`
- [ ] `POST /api/courier/book` — books shipment, returns waybill
  - Body: `{quote_id, pickup_address, delivery_address, pickup_contact, delivery_contact, parcel}`
  - Response includes `waybill` number
- [ ] `GET /api/courier/track/{waybill}` — returns tracking status and events
- [ ] Courier endpoints return 401 when unauthenticated
- [ ] Courier endpoints return 503 when `COURIER_ENABLED=false`
- [ ] Invalid address returns 502 (upstream error propagated)

---

## 10. All API Endpoints — Status Code Checks

| Endpoint | Method | Expected Status |
|---|---|---|
| `/` | GET | 200 |
| `/ping` | GET | 200 |
| `/api/auth/register` | POST | 201 |
| `/api/auth/login` | POST | 200 |
| `/api/users/me` (no auth) | GET | 401 |
| `/api/transactions` (no auth) | GET | 401 |
| `/api/transactions` (authed) | GET | 200 |
| `/api/transactions` (authed) | POST | 201 |
| `/api/disputes` (authed) | GET | 200 |
| `/api/ai/improve-description` | POST | 200 |
| `/api/ai/chat` | POST | 200 |
| `/api/courier/quote` (authed) | POST | 200 |
| `/api/admin/users` (no admin) | GET | 403 |
| `/api/tradesafe-webhook` (bad sig) | POST | 401 |

---

## Running Automated Tests

```bash
# Install test dependencies
pip install httpx pytest pytest-asyncio

# Set credentials (or use .env)
export TEST_EMAIL=test@example.com
export TEST_PASSWORD=testpassword123

# Run all tests
cd backend
python tests/test_full_flow.py

# Run specific section
python tests/test_full_flow.py --section auth
python tests/test_full_flow.py --section ai
python tests/test_full_flow.py --section courier
```

See `backend/tests/test_full_flow.py` for the automated test implementation.
