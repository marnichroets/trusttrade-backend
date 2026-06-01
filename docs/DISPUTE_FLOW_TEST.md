# Disputes flow — end-to-end live test

Run these against the deployed backend after the dispute changes deploy. You need an
**admin JWT** (`Authorization: Bearer <token>`) and a **funded test transaction**
(escrow secured, `tradesafe_allocation_id` present). Replace `$BASE`, `$TT`, `$TXN`,
`$DISPUTE`, and `$TOKEN` as you go.

```
BASE=https://trusttrade-backend-production-3efa.up.railway.app
```

> ⚠️ This moves real (sandbox) money. Use a sandbox/test transaction, not a live one.

---

## 0. Pick a funded test transaction
Confirm it's funded and courier/standard with an allocation:
```
curl -s $BASE/api/admin/transaction/$TXN -H "Authorization: Bearer $TOKEN" \
  | python -m json.tool | grep -E 'payment_status|tradesafe_allocation_id|item_price'
```
Expect `payment_status: "Funds Secured"` and a non-null `tradesafe_allocation_id`.

---

## 1. Raise a dispute (as the buyer or seller)
Use the buyer's/seller's token (not admin) to POST `/api/disputes`, or insert via your
normal dispute UI. Capture the returned `dispute_id` → `$DISPUTE`. Attach a
`buyer_statement`, `seller_statement`, and at least one evidence photo URL so the AI has
something to weigh.

---

## 2. AI analysis (Anthropic) — verify the recommendation is generated
`analyze_dispute` runs automatically on dispute creation (fire-and-forget). Re-fetch the
dispute and confirm `ai_resolution` is populated:
```
curl -s $BASE/api/admin/dispute/$DISPUTE -H "Authorization: Bearer $TOKEN" \
  | python -m json.tool | grep -A20 ai_resolution
```
Expect `recommended_decision` (Favour Buyer/Seller), `confidence`, `reasoning`,
`evidence_considered`. In the Railway logs you should see:
```
[AI_DISPUTE] <id> usage — input=… cache_read=… cache_write=… output=…
```
- `cache_write` > 0 on the first call of a 5-min window; `cache_read` > 0 on a repeat —
  **but only if the static prefix exceeds the model's minimum cacheable size (4096 tokens
  for Opus). At the current prompt size it will read 0; that's expected, not a bug.**
- If `ai_resolution` is empty: check `ANTHROPIC_API_KEY` is set in Railway and the logs for
  `[AI_DISPUTE] … no Anthropic client` or an API error.

---

## 3. Evidence photos visible in admin
Open the dispute in the admin UI (`/admin/dispute/$DISPUTE`) → **Evidence Photos** card.
Photos render from `dispute.evidence_photos`. Cloudinary URLs (full `https://…`) display
directly; bare filenames resolve against `/uploads/`. If a photo 404s, confirm the stored
value is a full Cloudinary URL.

---

## 4a. Resolve — Favour SELLER → funds release
```
curl -s -X POST $BASE/api/admin/disputes/$DISPUTE/ai-decision \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"action":"override","decision":"Favour Seller","notes":"e2e test"}'
```
Expect `payout_result.success: true`. Logs:
```
[DISPUTE_PAYOUT] $TXN released to seller (state=…)
```
If the release cascade can't complete you should see `payout_status=release_failed`, a
CRITICAL admin alert, and **no money moved** (no auto-decline) — that's the designed
safe-stop. Re-fetch the txn: `release_status` → `Released`/`Awaiting Release`.

## 4b. Resolve — Favour BUYER → refund  (use a second test txn)
```
curl -s -X POST $BASE/api/admin/disputes/$DISPUTE2/ai-decision \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"action":"override","decision":"Favour Buyer","notes":"e2e test refund"}'
```
Expect `payout_result.success: true`. Logs:
```
[REFUND] Calling allocationRefund — allocation_id=…
[DISPUTE_PAYOUT] $TXN2 refunded to buyer (withdrawn=…)
```
Re-fetch the txn: `payment_status` → `Refunded`, `refund_status` → `succeeded`.

> ⚠️ **`allocationRefund` is unverified against TradeSafe's schema** (it came from the
> codebase's own TODO). If the log shows `[REFUND] TradeSafe error … Cannot query field
> "allocationRefund"`, that names the wrong mutation — paste it and it's a one-line swap in
> `tradesafe_service.refund_allocation`.

---

## 5. Idempotency / safety re-runs
- POST the **same** ai-decision again → second call should report `skipped: already
  refunded` / `already Released` and move no further money.
- Standalone admin refund still works: `POST /api/admin/transactions/$TXN/refund`
  `{"reason":"manual"}` → calls the same idempotent `refund_transaction`.

---

## What "pass" looks like
- [ ] `ai_resolution` populated with a sensible decision + confidence + evidence list
- [ ] Evidence photos visible in admin
- [ ] Favour Seller → `release_status: Released`, seller payout path triggered
- [ ] Favour Buyer → `payment_status: Refunded`, `refund_status: succeeded`
- [ ] A failed release stops + alerts (no wrong-direction money movement)
- [ ] Re-running a resolution is a no-op (idempotent)
