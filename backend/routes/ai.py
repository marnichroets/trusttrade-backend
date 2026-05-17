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

from core.database import get_database
from core.security import get_user_from_token

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/ai", tags=["AI"])

MODEL = "claude-opus-4-7"


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


async def analyze_dispute(dispute_id: str, dispute_doc: dict, transaction_doc: dict):
    """
    Generate initial AI resolution advice for a newly opened dispute and save it.
    Designed to be fire-and-forget via asyncio.create_task().
    """
    client = _get_client()
    if not client:
        return

    try:
        prompt = f"""You are a neutral dispute resolution advisor for TrustTrade, a South African escrow platform.

Dispute details:
- Type: {dispute_doc.get('dispute_type', 'General')}
- Description: {dispute_doc.get('description', '')}

Related transaction:
- Item: {transaction_doc.get('item_description', 'Unknown item')}
- Amount: R{transaction_doc.get('item_price', 0):,.2f}
- Delivery method: {transaction_doc.get('delivery_method', 'unknown')}

Provide balanced, practical advice. Return ONLY a JSON object, no markdown:
{{
  "likely_outcome": "brief neutral prediction",
  "recommended_steps": ["step 1", "step 2", "step 3"],
  "evidence_needed": ["evidence type 1", "evidence type 2"],
  "resolution_timeframe": "estimated timeframe (e.g. 3-5 business days)",
  "summary": "one-paragraph neutral analysis of the situation"
}}"""

        response = await client.messages.create(
            model=MODEL,
            max_tokens=768,
            messages=[{"role": "user", "content": prompt}],
        )

        text = next((b.text for b in response.content if b.type == "text"), "{}")
        result = _extract_json(text)

        db = get_database()
        await db.disputes.update_one(
            {"dispute_id": dispute_id},
            {"$set": {
                "ai_analysis": {
                    **result,
                    "analyzed_at": datetime.now(timezone.utc).isoformat(),
                }
            }},
        )
        logger.info(f"[AI_DISPUTE] {dispute_id}: analysis saved")

    except Exception as exc:
        logger.error(f"[AI_DISPUTE] Failed for {dispute_id}: {exc}")


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


@router.post("/dispute-advice")
async def dispute_advice(request: Request, body: DisputeAdviceRequest):
    """Return AI resolution advice for a dispute (runs fresh if not yet cached)."""
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

    if dispute.get("ai_analysis"):
        return {"dispute_id": body.dispute_id, **dispute["ai_analysis"]}

    await analyze_dispute(body.dispute_id, dispute, txn)

    dispute = await db.disputes.find_one({"dispute_id": body.dispute_id}, {"_id": 0})
    analysis = (dispute or {}).get("ai_analysis", {})
    return {"dispute_id": body.dispute_id, **analysis}


class ImproveDescriptionRequest(BaseModel):
    description: str
    item_price: float
    delivery_method: str = "courier"


@router.post("/improve-description")
async def improve_description(request: Request, body: ImproveDescriptionRequest):
    """Return a polished, professional version of a transaction item description."""
    db = get_database()
    user = await get_user_from_token(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    client = _get_client()
    if not client:
        raise HTTPException(status_code=503, detail="AI service not configured")

    prompt = f"""You are helping a South African seller write a clear, professional escrow transaction description.

Original description: {body.description}
Item price: R{body.item_price:,.2f}
Delivery method: {body.delivery_method}

Rewrite the description to be clear, professional, and suitable for an escrow agreement. Include all relevant details: condition, specifications, and what's included in the sale. Keep it concise (2-4 sentences). Return ONLY the improved description text — no preamble, no commentary."""

    response = await client.messages.create(
        model=MODEL,
        max_tokens=512,
        messages=[{"role": "user", "content": prompt}],
    )

    improved = next((b.text for b in response.content if b.type == "text"), body.description)
    return {"original": body.description, "improved": improved.strip()}


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
        "For questions you cannot answer, direct the user to support@trusttradesa.co.za."
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
