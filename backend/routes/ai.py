"""
TrustTrade AI Routes
Claude-powered: fraud detection, dispute resolution, description improvement, support chatbot.
"""

import json
import logging
import os
import re
from datetime import datetime, timezone
from typing import List, Optional

import anthropic
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from core.config import settings
from core.database import get_database
from core.security import get_user_from_token

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/ai", tags=["AI"])

MODEL = "claude-opus-4-8"

# Dispute adjudication runs on the most capable model — these are financial
# decisions, so correctness outweighs cost. Kept as a separate constant so it can
# be tuned independently of the general-purpose MODEL used elsewhere.
DISPUTE_MODEL = "claude-opus-4-8"

# Confidence thresholds (percent) that select the resolution path.
AUTO_RESOLVE_MIN_CONFIDENCE = 90   # strictly greater than → AI auto-resolves
AI_RECOMMEND_MIN_CONFIDENCE = 70   # 70–90 → admin approves/overrides; below → manual review

# A dispute at or above this confidence still gets a mandatory admin alert (email).
COMPLEX_CASE_CONFIDENCE = 70       # below this → always notify admin
URGENT_SMS_CONFIDENCE = 50         # below this → also SMS the admin
HIGH_VALUE_THRESHOLD = 2000.0      # transactions above R2,000 always go to an admin

# South African consumer / e-commerce law context the adjudicator must apply.
# Keeps the decision grounded in CPA + ECTA and standard escrow-marketplace practice.
SA_CONSUMER_LAW_CONTEXT = """Apply South African consumer and e-commerce law together with standard escrow-marketplace practice:

CONSUMER PROTECTION ACT 68 of 2008 (CPA):
- s55: the consumer is entitled to goods of good quality, in good working order, free of defects, and reasonably suitable for the purpose generally intended.
- s56: implied warranty of quality — if goods fail to satisfy s55 within 6 months, the consumer may return them for a refund, replacement or repair, at the CONSUMER's election.
- s20: the consumer's right to return goods that do not match their description or sample.
- The supplier (seller) bears the onus of showing the goods conformed to what was agreed.

ELECTRONIC COMMUNICATIONS AND TRANSACTIONS ACT 25 of 2002 (ECTA):
- s44: an online consumer has a 7-day cooling-off period to cancel without reason after receiving goods (limited exceptions, e.g. perishables / personalised goods).
- s46: the supplier must deliver within the agreed period (or 30 days); failing that the consumer may cancel and is owed a full refund.
- The supplier must keep, and be able to produce, proof of delivery.

STANDARD ESCROW / MARKETPLACE PRINCIPLES:
- The SELLER carries the burden of proving the item was delivered (courier tracking, signed POD, photos). No proof of delivery → the buyer is protected.
- The BUYER carries the burden of substantiating a 'not as described' / 'damaged' claim with specifics and evidence (photos, a precise description of the defect).
- Escrow exists to protect the paying buyer. BE CONSERVATIVE: when the evidence is genuinely balanced, or a key fact is unproven, favour the BUYER."""

# Static adjudicator framing + law + output schema. Kept byte-identical across every
# dispute call (the per-dispute facts go in the user message) so it can be sent as a
# cached system prefix. Plain-string concatenation keeps the JSON braces literal.
DISPUTE_SYSTEM_PROMPT = (
    "You are the dispute-resolution adjudicator for TrustTrade, a South African "
    "peer-to-peer escrow platform. Review ALL the evidence in the user message and "
    "decide which party the held escrow funds should favour.\n\n"
    + SA_CONSUMER_LAW_CONTEXT
    + "\n\nINSTRUCTIONS:\n"
    "- Apply the law and escrow principles above. Be conservative — when in doubt, favour the BUYER.\n"
    "- Only assign confidence above 90 when the evidence clearly and unambiguously points one way. "
    "Assign below 70 when key evidence is missing, the accounts conflict without corroboration, or you are unsure.\n"
    "- In \"evidence_considered\", list EVERY individual piece of evidence you weighed (each statement, the "
    "courier tracking, each photo set, each party's history, the delivery method) and, for each, say which "
    "party it favours and why. Do not omit anything you relied on.\n\n"
    "Return ONLY a JSON object, no markdown, no commentary:\n"
    "{\n"
    '  "recommended_decision": "Favour Buyer" or "Favour Seller",\n'
    '  "confidence": <integer 0-100>,\n'
    '  "reasoning": "2-3 sentences explaining why, in plain English, citing the law/principle that applies",\n'
    '  "evidence_considered": [\n'
    '    {"item": "the piece of evidence", "favours": "buyer|seller|neither", "why": "what it shows and how it influenced the decision"}\n'
    "  ],\n"
    '  "missing_evidence": ["evidence that would have made this clearer", "..."],\n'
    '  "seller_has_delivery_proof": <true if there is credible proof the item was delivered (e.g. courier shows delivered, signed POD, photos), else false>,\n'
    '  "dispute_is_about_delivery": <true if the core complaint is non-delivery / item not received, else false>,\n'
    '  "buyer_complaint_is_specific": <true if the buyer gave a specific, substantiated complaint, false if it is a bare \'not received\'/\'not happy\' with no detail>,\n'
    '  "conflicting_evidence": <true if both parties present evidence that directly contradicts each other>,\n'
    '  "fraud_indicators": ["any sign of fraud or bad faith by either party", "..."]\n'
    "}"
)

# When False, a >90% recommendation is still recorded and flagged for a final
# admin click instead of closing the dispute unattended. Fund movement
# (refund/release) is always a separate, human-controlled financial action and is
# never triggered automatically by the AI.
AI_AUTO_RESOLVE_ENABLED = os.getenv("AI_AUTO_RESOLVE_ENABLED", "true").lower() == "true"


def _resolution_path(confidence: int) -> str:
    """Map a 0-100 confidence score to one of the three resolution paths."""
    if confidence > AUTO_RESOLVE_MIN_CONFIDENCE:
        return "auto_resolve"
    if confidence >= AI_RECOMMEND_MIN_CONFIDENCE:
        return "ai_recommends"
    return "manual_review"


def _get_client() -> Optional[anthropic.AsyncAnthropic]:
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        logger.warning("[AI] ANTHROPIC_API_KEY not configured")
        return None
    return anthropic.AsyncAnthropic(api_key=api_key)


def _extract_json(text: str) -> dict:
    """Extract JSON from a Claude response, stripping any markdown fences."""
    text = text.strip()
    # Strip ```json ... ``` or ``` ... ``` wrappers
    match = re.search(r"```(?:json)?\s*([\s\S]+?)\s*```", text)
    if match:
        text = match.group(1)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    # Fallback: pull the first balanced {...} object out of any surrounding prose
    # (newer models may prepend a sentence of reasoning before the JSON).
    brace = re.search(r"\{[\s\S]*\}", text)
    if brace:
        try:
            return json.loads(brace.group(0))
        except json.JSONDecodeError:
            return {}
    return {}


# ============ BACKGROUND TASK FUNCTIONS ============
# These are called automatically from transaction/dispute creation routes.

async def analyze_transaction_fraud(transaction_id: str, transaction_doc: dict, user_doc: dict):
    """
    Run AI fraud analysis on a newly created transaction and save the result.
    Designed to be fire-and-forget via asyncio.create_task().
    """
    client = _get_client()
    if not client:
        return

    try:
        item_price = transaction_doc.get("item_price", 0)
        description = transaction_doc.get("item_description", "")
        delivery = transaction_doc.get("delivery_method", "unknown")
        trust_score = (user_doc or {}).get("trust_score", 50)
        valid_disputes = (user_doc or {}).get("valid_disputes_count", 0)
        total_trades = (user_doc or {}).get("total_trades", 0)
        verified = (user_doc or {}).get("verified", False)
        account_created = (user_doc or {}).get("created_at", "unknown")

        prompt = f"""You are a fraud detection system for TrustTrade, a South African peer-to-peer escrow platform.

Analyze this transaction for fraud risk indicators:
- Item description: {description}
- Amount: R{item_price:,.2f}
- Delivery method: {delivery}
- Creator trust score: {trust_score}/100
- Creator completed trades: {total_trades}
- Creator valid disputes against them: {valid_disputes}
- Creator identity verified: {verified}
- Creator account created: {account_created}

Return ONLY a JSON object, no markdown:
{{
  "risk_level": "low|medium|high",
  "risk_score": <integer 0-100>,
  "flags": ["list", "of", "risk", "flags"],
  "summary": "one-sentence plain-English summary",
  "recommendation": "brief action for the platform to take"
}}"""

        response = await client.messages.create(
            model=MODEL,
            max_tokens=512,
            messages=[{"role": "user", "content": prompt}],
        )

        text = next((b.text for b in response.content if b.type == "text"), "{}")
        result = _extract_json(text)

        db = get_database()
        await db.transactions.update_one(
            {"transaction_id": transaction_id},
            {"$set": {
                "ai_fraud_analysis": {
                    **result,
                    "analyzed_at": datetime.now(timezone.utc).isoformat(),
                }
            }},
        )
        logger.info(f"[AI_FRAUD] {transaction_id}: risk={result.get('risk_level', 'unknown')}")

    except Exception as exc:
        logger.error(f"[AI_FRAUD] Failed for {transaction_id}: {exc}")


async def _courier_tracking_summary(transaction_doc: dict) -> str:
    """Best-effort one-line courier tracking summary for the AI context."""
    waybill = (
        transaction_doc.get("waybill")
        or transaction_doc.get("tracking_reference")
        or transaction_doc.get("courier_waybill")
    )
    if not waybill:
        return "No courier waybill on file (not a courier shipment, or not yet booked)."
    try:
        from services.courier_guy import track_shipment
        tracking = await track_shipment(str(waybill))
        return (
            f"Waybill {waybill}: status={tracking.get('status')!r}, "
            f"last update={tracking.get('timestamp')!r}, "
            f"{len(tracking.get('events', []))} tracking event(s) recorded."
        )
    except Exception as exc:
        return f"Waybill {waybill}: tracking lookup unavailable ({exc})."


def _party_history(user_doc: Optional[dict], role: str) -> str:
    u = user_doc or {}
    return (
        f"{role}: trust score {u.get('trust_score', 50)}/100, "
        f"{u.get('total_trades', 0)} completed trade(s), "
        f"{u.get('valid_disputes_count', 0)} valid dispute(s) previously upheld against them."
    )


async def _notify_parties_resolved(transaction_doc: dict, resolution_text: str, admin_notes: str = ""):
    """Email both parties that the dispute has been resolved. Best-effort."""
    try:
        from email_service import send_dispute_resolved_email
        share_code = transaction_doc.get("share_code", transaction_doc.get("transaction_id", ""))
        for email_key, name_key in (("buyer_email", "buyer_name"), ("seller_email", "seller_name")):
            to_email = transaction_doc.get(email_key)
            if not to_email:
                continue
            await send_dispute_resolved_email(
                to_email=to_email,
                to_name=transaction_doc.get(name_key, "TrustTrade user"),
                share_code=share_code,
                resolution=resolution_text,
                admin_notes=admin_notes,
            )
    except Exception as exc:
        logger.error(f"[AI_DISPUTE] Failed to notify parties of resolution: {exc}")


async def analyze_dispute(dispute_id: str, dispute_doc: dict, transaction_doc: dict):
    """
    Adjudicate a dispute with Claude: review all available evidence, produce a
    recommended decision + confidence + reasoning, and route it down one of three
    resolution paths (auto-resolve / AI-recommends / manual-review).

    Designed to be fire-and-forget via asyncio.create_task(), and also callable
    synchronously from the admin endpoint.
    """
    client = _get_client()
    if not client:
        logger.warning(f"[AI_DISPUTE] {dispute_id}: no Anthropic client; skipping")
        return

    db = get_database()
    try:
        # Gather both parties' records for history/score context.
        buyer_doc = None
        seller_doc = None
        if transaction_doc.get("buyer_email"):
            buyer_doc = await db.users.find_one({"email": transaction_doc["buyer_email"]}, {"_id": 0})
        if transaction_doc.get("seller_email"):
            seller_doc = await db.users.find_one({"email": transaction_doc["seller_email"]}, {"_id": 0})

        tracking_summary = await _courier_tracking_summary(transaction_doc)

        evidence_photos = dispute_doc.get("evidence_photos") or []
        photos_line = (
            f"{len(evidence_photos)} photo(s) uploaded: {', '.join(evidence_photos)}"
            if evidence_photos else "No photo evidence uploaded."
        )

        buyer_statement = dispute_doc.get("buyer_statement") or "(no buyer statement provided)"
        seller_statement = dispute_doc.get("seller_statement") or "(no seller statement provided)"

        raiser_email = dispute_doc.get("raised_by_email", "unknown")
        raiser_role = (
            "buyer" if transaction_doc.get("buyer_email") == raiser_email else
            "seller" if transaction_doc.get("seller_email") == raiser_email else "a party"
        )

        # Only the per-dispute facts vary — they go in the user message. The static
        # adjudicator framing + law + output schema live in DISPUTE_SYSTEM_PROMPT,
        # sent as a cached system prefix below.
        case = f"""TRANSACTION
- Item: {transaction_doc.get('item_description', 'Unknown item')}
- Amount: R{transaction_doc.get('item_price', 0):,.2f}
- Delivery method: {transaction_doc.get('delivery_method', 'unknown')}
- Current state: {transaction_doc.get('tradesafe_state') or transaction_doc.get('payment_status', 'unknown')}

DISPUTE
- Type: {dispute_doc.get('dispute_type', 'Other')}
- Raised by: the {raiser_role} ({raiser_email})
- Reason given: {dispute_doc.get('description', '(none)')}

PARTY STATEMENTS
- Buyer's statement: {buyer_statement}
- Seller's statement: {seller_statement}

EVIDENCE
- {photos_line}
- Courier tracking: {tracking_summary}

PARTY HISTORY
- {_party_history(buyer_doc, 'Buyer')}
- {_party_history(seller_doc, 'Seller')}"""

        # Cache the static system prefix (framing + SA law + schema). It's byte-identical
        # across disputes, so repeated adjudications within the cache TTL read it at ~0.1x.
        # (Note: the prefix must exceed the model's minimum cacheable size to actually cache.)
        response = await client.messages.create(
            model=DISPUTE_MODEL,
            max_tokens=1200,
            system=[{
                "type": "text",
                "text": DISPUTE_SYSTEM_PROMPT,
                "cache_control": {"type": "ephemeral"},
            }],
            messages=[{"role": "user", "content": case}],
        )

        usage = getattr(response, "usage", None)
        if usage is not None:
            logger.info(
                f"[AI_DISPUTE] {dispute_id} usage — input={getattr(usage, 'input_tokens', '?')} "
                f"cache_read={getattr(usage, 'cache_read_input_tokens', 0)} "
                f"cache_write={getattr(usage, 'cache_creation_input_tokens', 0)} "
                f"output={getattr(usage, 'output_tokens', '?')}"
            )

        text = next((b.text for b in response.content if b.type == "text"), "{}")
        result = _extract_json(text)

        # Normalise the model output defensively.
        ai_decision = result.get("recommended_decision", "")
        if ai_decision not in ("Favour Buyer", "Favour Seller"):
            ai_decision = "Favour Buyer" if "buyer" in str(ai_decision).lower() else "Favour Seller"
        try:
            confidence = int(round(float(result.get("confidence", 0))))
        except (TypeError, ValueError):
            confidence = 0
        confidence = max(0, min(100, confidence))

        # ---- Objective facts (independent of the model) used for hard rules. ----
        tracking_delivered = "delivered" in tracking_summary.lower()
        raiser_is_buyer = raiser_role == "buyer"
        buyer_raised_evidence = bool(evidence_photos) and raiser_is_buyer
        seller_has_proof = bool(result.get("seller_has_delivery_proof")) or tracking_delivered
        about_delivery = bool(result.get("dispute_is_about_delivery"))
        complaint_specific = bool(result.get("buyer_complaint_is_specific", True))
        conflicting = bool(result.get("conflicting_evidence"))
        fraud_indicators = [f for f in (result.get("fraud_indicators") or []) if str(f).strip()]

        # ---- Deterministic hard rules (override the model, "regardless of confidence"). ----
        decision = ai_decision
        forced_rule = None
        if about_delivery and not seller_has_proof:
            # Standard escrow / ECTA s46: seller cannot prove delivery → buyer protected.
            decision = "Favour Buyer"
            forced_rule = "no_delivery_proof"
        elif about_delivery and tracking_delivered and raiser_is_buyer \
                and not complaint_specific and not buyer_raised_evidence:
            # Bare 'not received' with no evidence, but tracking shows delivered → seller.
            decision = "Favour Seller"
            forced_rule = "tracking_delivered_unsubstantiated_claim"

        path = _resolution_path(confidence)

        # ---- Complex-case detection: always notify an admin for these. ----
        amount = float(transaction_doc.get("item_price", 0) or 0)
        buyer_history = int((buyer_doc or {}).get("valid_disputes_count", 0) or 0)
        seller_history = int((seller_doc or {}).get("valid_disputes_count", 0) or 0)

        complex_reasons = []
        if confidence < COMPLEX_CASE_CONFIDENCE:
            complex_reasons.append(f"AI confidence below {COMPLEX_CASE_CONFIDENCE}% ({confidence}%)")
        if conflicting:
            complex_reasons.append("Both parties have conflicting evidence")
        if amount > HIGH_VALUE_THRESHOLD:
            complex_reasons.append(f"Transaction value above R{HIGH_VALUE_THRESHOLD:,.0f} (R{amount:,.2f})")
        if buyer_history > 0 or seller_history > 0:
            complex_reasons.append(
                f"Previous dispute history (buyer: {buyer_history}, seller: {seller_history})"
            )
        if tracking_delivered and raiser_is_buyer and about_delivery:
            complex_reasons.append("Courier tracking ('delivered') contradicts the buyer's claim")
        if fraud_indicators:
            complex_reasons.append("Fraud indicators detected: " + "; ".join(fraud_indicators[:5]))
        if forced_rule and decision != ai_decision:
            complex_reasons.append(
                f"A deterministic rule ({forced_rule}) overrode the AI's recommendation ({ai_decision})"
            )

        ai_resolution = {
            "recommended_decision": decision,
            "ai_raw_decision": ai_decision,
            "confidence": confidence,
            "reasoning": result.get("reasoning", ""),
            "evidence_considered": result.get("evidence_considered", []) or [],
            "missing_evidence": result.get("missing_evidence", []) or [],
            "fraud_indicators": fraud_indicators,
            "forced_rule": forced_rule,
            "complex_case_reasons": complex_reasons,
            "resolution_path": path,
            "model": DISPUTE_MODEL,
            "analyzed_at": datetime.now(timezone.utc).isoformat(),
        }

        is_complex = bool(complex_reasons)
        await _apply_resolution_path(
            db, dispute_id, dispute_doc, transaction_doc, ai_resolution, is_complex=is_complex
        )

        if is_complex:
            await _notify_admin_complex_case(
                dispute_doc, transaction_doc, ai_resolution,
                buyer_doc=buyer_doc, seller_doc=seller_doc,
                buyer_statement=buyer_statement, seller_statement=seller_statement,
                raiser_role=raiser_role, raiser_email=raiser_email,
            )

        logger.info(
            f"[AI_DISPUTE] {dispute_id}: {decision} @ {confidence}% → path={path} "
            f"forced={forced_rule} complex={is_complex} ({len(complex_reasons)} reason(s))"
        )

    except Exception as exc:
        logger.error(f"[AI_DISPUTE] Failed for {dispute_id}: {exc}")


async def _admin_dispute_link(dispute_id: str) -> str:
    """Direct link to the admin dispute page for notifications."""
    base = (settings.FRONTEND_URL or "").rstrip("/")
    return f"{base}/admin/dispute/{dispute_id}"


async def _notify_admin_complex_case(
    dispute_doc, transaction_doc, ai_resolution, *,
    buyer_doc, seller_doc, buyer_statement, seller_statement,
    raiser_role, raiser_email,
):
    """Email (and, for urgent cases, SMS) the admin about a complex dispute.

    Best-effort: failures are logged but never block dispute processing.
    """
    dispute_id = dispute_doc.get("dispute_id", "")
    confidence = ai_resolution.get("confidence", 0)
    decision = ai_resolution.get("recommended_decision", "")
    share_code = transaction_doc.get("share_code", transaction_doc.get("transaction_id", ""))
    admin_link = await _admin_dispute_link(dispute_id)

    destination = settings.ADMIN_ALERT_EMAIL or settings.ADMIN_EMAIL
    if destination:
        try:
            from email_service import send_admin_dispute_alert_email
            await send_admin_dispute_alert_email(
                destination=destination,
                dispute_id=dispute_id,
                share_code=share_code,
                item_description=transaction_doc.get("item_description", "Unknown item"),
                amount=float(transaction_doc.get("item_price", 0) or 0),
                dispute_type=dispute_doc.get("dispute_type", "Other"),
                raised_by_role=raiser_role,
                raised_by_email=raiser_email,
                buyer_name=transaction_doc.get("buyer_name", "Buyer"),
                seller_name=transaction_doc.get("seller_name", "Seller"),
                buyer_statement=buyer_statement,
                seller_statement=seller_statement,
                reason=dispute_doc.get("description", "(none)"),
                ai_decision=decision,
                ai_confidence=confidence,
                ai_reasoning=ai_resolution.get("reasoning", ""),
                missing_evidence=ai_resolution.get("missing_evidence", []),
                suggested_resolution=decision,
                flag_reasons=ai_resolution.get("complex_case_reasons", []),
                admin_link=admin_link,
            )
        except Exception as exc:
            logger.error(f"[AI_DISPUTE] Admin alert email failed for {dispute_id}: {exc}")
    else:
        logger.warning(f"[AI_DISPUTE] No admin alert email configured; skipping email for {dispute_id}")

    # Urgent cases also get an SMS so the admin acts immediately.
    if confidence < URGENT_SMS_CONFIDENCE and settings.ADMIN_ALERT_PHONE:
        try:
            from sms_service import send_admin_dispute_alert_sms
            await send_admin_dispute_alert_sms(
                to_phone=settings.ADMIN_ALERT_PHONE,
                dispute_id=dispute_id,
                confidence=confidence,
                decision=decision,
                share_code=share_code,
                admin_link=admin_link,
            )
        except Exception as exc:
            logger.error(f"[AI_DISPUTE] Admin alert SMS failed for {dispute_id}: {exc}")

    # Record that the admin was notified, for the audit trail / dashboard.
    try:
        await get_database().disputes.update_one(
            {"dispute_id": dispute_id},
            {"$set": {
                "ai_resolution.admin_notified": True,
                "ai_resolution.admin_notified_at": datetime.now(timezone.utc).isoformat(),
            }},
        )
    except Exception as exc:
        logger.error(f"[AI_DISPUTE] Failed to flag admin_notified for {dispute_id}: {exc}")


async def _apply_resolution_path(db, dispute_id, dispute_doc, transaction_doc, ai_resolution, is_complex=False):
    """Persist the AI resolution and move the dispute down the correct path.

    Complex cases are never auto-resolved — they are always routed to an admin,
    even at high confidence, so a human makes the final call.
    """
    path = ai_resolution["resolution_path"]
    decision = ai_resolution["recommended_decision"]
    confidence = ai_resolution["confidence"]

    update = {"ai_resolution": ai_resolution}

    if path == "auto_resolve" and AI_AUTO_RESOLVE_ENABLED and not is_complex:
        # >90% confidence: AI closes the dispute and both parties are notified.
        # The actual refund/release remains a separate human-controlled action.
        resolution_text = f"AI auto-resolved in favour of {decision.replace('Favour ', '').lower()} ({confidence}% confidence)."
        update.update({
            "status": "Resolved",
            "review_status": "ai_auto_resolved",
            "resolution": f"{resolution_text} {ai_resolution['reasoning']}".strip(),
            "resolved_by": "ai_auto",
            "resolved_at": datetime.now(timezone.utc).isoformat(),
        })
        await db.disputes.update_one({"dispute_id": dispute_id}, {"$set": update})
        await _notify_parties_resolved(
            transaction_doc,
            resolution_text,
            admin_notes=ai_resolution["reasoning"],
        )
        return

    if path == "auto_resolve":
        # Auto-resolve disabled by config → treat as a strong recommendation.
        update["review_status"] = "ai_recommended"
    elif path == "ai_recommends":
        update["review_status"] = "ai_recommended"
    else:
        update["review_status"] = "manual_review"

    update["status"] = "Under Review"
    await db.disputes.update_one({"dispute_id": dispute_id}, {"$set": update})


# ============ HTTP ENDPOINTS ============

class FraudDetectRequest(BaseModel):
    transaction_id: str


@router.post("/fraud-detect")
async def fraud_detect(request: Request, body: FraudDetectRequest):
    """Return fraud analysis for a transaction (runs fresh if not yet cached)."""
    db = get_database()
    user = await get_user_from_token(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    txn = await db.transactions.find_one({"transaction_id": body.transaction_id}, {"_id": 0})
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")

    # Only the transaction parties or admins may request this
    is_party = (
        txn.get("buyer_user_id") == user.user_id
        or txn.get("seller_user_id") == user.user_id
        or txn.get("buyer_email") == user.email
        or txn.get("seller_email") == user.email
    )
    if not user.is_admin and not is_party:
        raise HTTPException(status_code=403, detail="Access denied")

    # Return cached result if available
    if txn.get("ai_fraud_analysis"):
        return {"transaction_id": body.transaction_id, **txn["ai_fraud_analysis"]}

    # Run fresh analysis synchronously (user is waiting)
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
    await analyze_transaction_fraud(body.transaction_id, txn, user_doc or {})

    txn = await db.transactions.find_one({"transaction_id": body.transaction_id}, {"_id": 0})
    analysis = (txn or {}).get("ai_fraud_analysis", {})
    return {"transaction_id": body.transaction_id, **analysis}


class DisputeAdviceRequest(BaseModel):
    dispute_id: str


def _party_safe_resolution(ai_resolution: dict) -> dict:
    """The subset of the AI resolution safe to show to a dispute party.

    Parties must not see the recommended decision/confidence while a dispute is
    still under review (it would bias their behaviour and any appeal). They only
    see what extra evidence would help, plus whether it was auto-resolved.
    """
    return {
        "resolution_path": ai_resolution.get("resolution_path"),
        "missing_evidence": ai_resolution.get("missing_evidence", []),
        "analyzed_at": ai_resolution.get("analyzed_at"),
    }


@router.post("/dispute-advice")
async def dispute_advice(request: Request, body: DisputeAdviceRequest):
    """Return the AI dispute resolution.

    Admins receive the full recommendation (decision, confidence, reasoning).
    Parties receive only a safe subset (missing evidence) to avoid biasing review.
    """
    db = get_database()
    user = await get_user_from_token(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    dispute = await db.disputes.find_one({"dispute_id": body.dispute_id}, {"_id": 0})
    if not dispute:
        raise HTTPException(status_code=404, detail="Dispute not found")

    txn = await db.transactions.find_one(
        {"transaction_id": dispute.get("transaction_id", "")}, {"_id": 0}
    ) or {}

    is_party = (
        dispute.get("raised_by_user_id") == user.user_id
        or txn.get("buyer_user_id") == user.user_id
        or txn.get("seller_user_id") == user.user_id
        or txn.get("buyer_email") == user.email
        or txn.get("seller_email") == user.email
    )
    if not user.is_admin and not is_party:
        raise HTTPException(status_code=403, detail="Access denied")

    # Run the adjudication if it hasn't happened yet (user/admin is waiting).
    if not dispute.get("ai_resolution"):
        await analyze_dispute(body.dispute_id, dispute, txn)
        dispute = await db.disputes.find_one({"dispute_id": body.dispute_id}, {"_id": 0}) or dispute

    ai_resolution = (dispute or {}).get("ai_resolution", {})
    if user.is_admin:
        return {"dispute_id": body.dispute_id, **ai_resolution}
    return {"dispute_id": body.dispute_id, **_party_safe_resolution(ai_resolution)}


class ImproveDescriptionRequest(BaseModel):
    description: str
    item_price: float
    delivery_method: str = "courier"


IMPROVED_DESCRIPTION_MAX_CHARS = 150


def _trim_to_one_sentence(text: str, max_chars: int = IMPROVED_DESCRIPTION_MAX_CHARS) -> str:
    """Force the model output to a single sentence no longer than max_chars.

    Picks the first sentence boundary (. ! ?), strips trailing whitespace,
    then truncates with an ellipsis if it still exceeds the limit. Used to
    enforce the 150-char one-sentence contract regardless of what the model
    actually returned.
    """
    collapsed = " ".join((text or "").split())
    if not collapsed:
        return ""
    # First sentence-terminator wins.
    first_match = re.search(r"[.!?]", collapsed)
    if first_match:
        first_sentence = collapsed[: first_match.end()].strip()
    else:
        first_sentence = collapsed
    if len(first_sentence) <= max_chars:
        return first_sentence
    # Hard cap: trim to max_chars-1 then append an ellipsis.
    truncated = first_sentence[: max_chars - 1].rstrip()
    return f"{truncated}…"


@router.post("/improve-description")
async def improve_description(request: Request, body: ImproveDescriptionRequest):
    """Return a single-sentence (≤150 char) polished item description."""
    db = get_database()
    user = await get_user_from_token(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    client = _get_client()
    if not client:
        raise HTTPException(status_code=503, detail="AI service not configured")

    prompt = f"""You are helping a South African seller write a one-line escrow item description.

Original description: {body.description}
Item price: R{body.item_price:,.2f}
Delivery method: {body.delivery_method}

STRICT OUTPUT RULES:
- Return EXACTLY ONE sentence.
- Maximum {IMPROVED_DESCRIPTION_MAX_CHARS} characters total.
- No preamble, no commentary, no quotes, no markdown, no line breaks.
- Capture the essentials only (item, condition, any one key detail).

Output the single sentence and nothing else."""

    response = await client.messages.create(
        model=MODEL,
        max_tokens=120,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = next((b.text for b in response.content if b.type == "text"), body.description)
    improved = _trim_to_one_sentence(raw, IMPROVED_DESCRIPTION_MAX_CHARS)
    return {"original": body.description, "improved": improved}


class ChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str


class ChatRequest(BaseModel):
    message: str
    history: Optional[List[ChatMessage]] = []


@router.post("/chat")
async def support_chat(request: Request, body: ChatRequest):
    """TrustTrade support chatbot — answers platform questions and helps users."""
    db = get_database()
    user = await get_user_from_token(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    client = _get_client()
    if not client:
        raise HTTPException(status_code=503, detail="AI service not configured")

    system = (
        "You are a friendly and knowledgeable support assistant for TrustTrade, "
        "South Africa's secure peer-to-peer escrow platform.\n\n"
        "Key platform facts:\n"
        "- Escrow protects both buyer and seller: funds are held until the buyer confirms delivery\n"
        "- Minimum transaction: R500 | No maximum transaction limit\n"
        "- Platform fee: 2% of item price (minimum R5), paid by the buyer on top of the item price\n"
        "- Delivery methods: courier, bank deposit / digital delivery, hand-to-hand\n"
        "- Disputes can be raised if there is a problem with the transaction\n"
        "- Payments are processed via TradeSafe\n"
        "- Auto-release: funds release automatically after the buyer confirms receipt (or after the auto-release period)\n\n"
        "Be concise, accurate, and friendly. "
        "For questions you cannot answer, direct the user to trusttrade.register@gmail.com."
    )

    # Build message history, filtering to only valid roles
    messages = [
        {"role": msg.role, "content": msg.content}
        for msg in (body.history or [])
        if msg.role in ("user", "assistant")
    ]
    messages.append({"role": "user", "content": body.message})

    response = await client.messages.create(
        model=MODEL,
        max_tokens=1024,
        system=system,
        messages=messages,
    )

    reply = next((b.text for b in response.content if b.type == "text"), "")
    return {"reply": reply, "role": "assistant"}
