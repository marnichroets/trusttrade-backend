"""
TrustTrade Dispute Routes
Handles dispute creation, management, and resolution
"""

import uuid
import logging
import re
from datetime import datetime, timezone
from typing import List
from fastapi import APIRouter, HTTPException, Request

from core.config import settings
from core.database import get_database
from core.security import get_user_from_token
from models.dispute import Dispute, DisputeCreate, DisputeUpdate
from email_service import send_dispute_opened_email
from sms_service import normalize_phone_number

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/disputes", tags=["Disputes"])


def _norm(value: str | None) -> str:
    return (value or "").strip().lower()


def user_transaction_access_query(user):
    user_email = _norm(user.email)
    user_phone = normalize_phone_number(getattr(user, "phone", None) or "")
    conditions = []
    if getattr(user, "user_id", None):
        conditions.extend([
            {"buyer_user_id": user.user_id},
            {"seller_user_id": user.user_id},
        ])
    if user_email:
        email_match = {"$regex": f"^{re.escape(user_email)}$", "$options": "i"}
        conditions.extend([
            {"buyer_email": email_match},
            {"seller_email": email_match},
            {"recipient_info": email_match},
        ])
    if user_phone:
        conditions.extend([
            {"buyer_phone": user_phone},
            {"seller_phone": user_phone},
            {"recipient_info": user_phone},
        ])
    return {"$or": conditions} if conditions else {"transaction_id": None}


def user_can_access_transaction(transaction: dict, user) -> bool:
    user_email = _norm(user.email)
    user_phone = normalize_phone_number(getattr(user, "phone", None) or "")
    return any([
        transaction.get("buyer_user_id") == user.user_id,
        transaction.get("seller_user_id") == user.user_id,
        _norm(transaction.get("buyer_email")) == user_email,
        _norm(transaction.get("seller_email")) == user_email,
        _norm(transaction.get("recipient_info")) == user_email,
        user_phone and transaction.get("buyer_phone") == user_phone,
        user_phone and transaction.get("seller_phone") == user_phone,
        user_phone and transaction.get("recipient_info") == user_phone,
    ])


@router.post("", response_model=Dispute, status_code=201)
async def create_dispute(request: Request, dispute_data: DisputeCreate):
    """Create a new dispute"""
    db = get_database()
    
    user = await get_user_from_token(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Verify transaction access
    transaction = await db.transactions.find_one(
        {"transaction_id": dispute_data.transaction_id},
        {"_id": 0}
    )
    
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    if not user.is_admin and not user_can_access_transaction(transaction, user):
        raise HTTPException(status_code=403, detail="Access denied")
    
    dispute_id = f"disp_{uuid.uuid4().hex[:12]}"
    
    dispute = {
        "dispute_id": dispute_id,
        "transaction_id": dispute_data.transaction_id,
        "raised_by_user_id": user.user_id,
        "dispute_type": dispute_data.dispute_type,
        "description": dispute_data.description,
        "evidence_photos": [],
        "status": "Pending",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.disputes.insert_one(dispute)
    
    # Mark transaction as having a dispute
    await db.transactions.update_one(
        {"transaction_id": dispute_data.transaction_id},
        {"$set": {"has_dispute": True}}
    )
    
    # Determine the other party and send notification email
    is_buyer = transaction.get("buyer_user_id") == user.user_id or transaction.get("buyer_email") == user.email
    
    if is_buyer:
        await send_dispute_opened_email(
            to_email=transaction["seller_email"],
            to_name=transaction["seller_name"],
            share_code=transaction.get("share_code", dispute_data.transaction_id),
            dispute_type=dispute_data.dispute_type,
            description=dispute_data.description
        )
    else:
        await send_dispute_opened_email(
            to_email=transaction["buyer_email"],
            to_name=transaction["buyer_name"],
            share_code=transaction.get("share_code", dispute_data.transaction_id),
            dispute_type=dispute_data.dispute_type,
            description=dispute_data.description
        )
    
    return Dispute(**dispute)


@router.patch("/{dispute_id}/evidence")
async def update_dispute_evidence(request: Request, dispute_id: str, evidence_filenames: List[str]):
    """Update dispute with evidence photo filenames"""
    db = get_database()
    
    user = await get_user_from_token(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    dispute = await db.disputes.find_one(
        {"dispute_id": dispute_id},
        {"_id": 0}
    )
    
    if not dispute:
        raise HTTPException(status_code=404, detail="Dispute not found")
    
    # Only dispute creator can add evidence
    if dispute["raised_by_user_id"] != user.user_id:
        raise HTTPException(status_code=403, detail="Only dispute creator can add evidence")
    
    await db.disputes.update_one(
        {"dispute_id": dispute_id},
        {"$set": {"evidence_photos": evidence_filenames}}
    )
    
    return {"message": "Evidence updated successfully"}


@router.get("", response_model=List[Dispute])
async def list_disputes(request: Request):
    """List disputes linked to the authenticated user's own transactions.

    Admin-wide dispute visibility is intentionally limited to /api/admin/disputes.
    """
    db = get_database()
    
    user = await get_user_from_token(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    transaction_projection = {
        "_id": 0,
        "transaction_id": 1,
        "buyer_user_id": 1,
        "seller_user_id": 1,
        "buyer_email": 1,
        "seller_email": 1,
        "buyer_phone": 1,
        "seller_phone": 1,
        "recipient_info": 1,
        "recipient_type": 1,
        "invite_type": 1,
    }
    user_transactions = await db.transactions.find(
        user_transaction_access_query(user),
        transaction_projection
    ).to_list(1000)

    transaction_ids = [t["transaction_id"] for t in user_transactions if t.get("transaction_id")]
    if not transaction_ids:
        logger.warning(
            "[DISPUTES_SCOPE_DEBUG] user_id=%s email=%s transaction_ids=[] dispute_ids=[] transactions=[]",
            getattr(user, "user_id", None),
            getattr(user, "email", None),
        )
        return []

    query = {"transaction_id": {"$in": transaction_ids}}
    
    disputes = await db.disputes.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    logger.warning(
        "[DISPUTES_SCOPE_DEBUG] user_id=%s email=%s transaction_ids=%s dispute_ids=%s transactions=%s",
        getattr(user, "user_id", None),
        getattr(user, "email", None),
        transaction_ids,
        [d.get("dispute_id") for d in disputes],
        [
            {
                "transaction_id": t.get("transaction_id"),
                "buyer_user_id": t.get("buyer_user_id"),
                "seller_user_id": t.get("seller_user_id"),
                "buyer_email": t.get("buyer_email"),
                "seller_email": t.get("seller_email"),
                "buyer_phone": t.get("buyer_phone"),
                "seller_phone": t.get("seller_phone"),
                "recipient_info": t.get("recipient_info"),
                "recipient_type": t.get("recipient_type"),
                "invite_type": t.get("invite_type"),
            }
            for t in user_transactions
        ],
    )
    return [Dispute(**d) for d in disputes]


@router.patch("/{dispute_id}")
async def update_dispute(request: Request, dispute_id: str, update_data: DisputeUpdate):
    """Update dispute status (admin only)"""
    db = get_database()
    
    user = await get_user_from_token(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")
    
    update_fields = {"status": update_data.status}
    
    # Handle admin decision
    if update_data.admin_decision:
        update_fields["admin_decision"] = update_data.admin_decision
    
    # Handle valid dispute marking
    if update_data.is_valid_dispute is not None:
        update_fields["is_valid_dispute"] = update_data.is_valid_dispute
        
        # If marking as valid, increment user's dispute count
        if update_data.is_valid_dispute:
            dispute = await db.disputes.find_one({"dispute_id": dispute_id}, {"_id": 0})
            if dispute:
                raised_by_user_id = dispute["raised_by_user_id"]
                
                # Increment valid disputes count
                user_result = await db.users.find_one_and_update(
                    {"user_id": raised_by_user_id},
                    {"$inc": {"valid_disputes_count": 1}},
                    return_document=True,
                    projection={"_id": 0}
                )
                
                # Check if should suspend (3 or more valid disputes)
                if user_result and user_result.get("valid_disputes_count", 0) >= 3:
                    await db.users.update_one(
                        {"user_id": raised_by_user_id},
                        {"$set": {"suspension_flag": True}}
                    )
                    logger.info(f"User {raised_by_user_id} flagged for suspension (3+ valid disputes)")
    
    result = await db.disputes.update_one(
        {"dispute_id": dispute_id},
        {"$set": update_fields}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Dispute not found")
    
    updated_dispute = await db.disputes.find_one(
        {"dispute_id": dispute_id},
        {"_id": 0}
    )
    
    return Dispute(**updated_dispute)
