"""
TrustTrade Dispute Routes
Handles dispute creation, management, and resolution
"""

import uuid
import logging
from datetime import datetime, timezone
from typing import List
from fastapi import APIRouter, HTTPException, Request

from core.config import settings
from core.database import get_database
from core.security import get_user_from_token
from models.dispute import Dispute, DisputeCreate, DisputeUpdate
from email_service import send_dispute_opened_email

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/disputes", tags=["Disputes"])


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
    
    if not user.is_admin:
        if (transaction.get("buyer_user_id") != user.user_id and
            transaction.get("buyer_email") != user.email and
            transaction.get("seller_email") != user.email):
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
    """List disputes for current user (or all for admin)"""
    db = get_database()
    
    user = await get_user_from_token(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    if user.is_admin:
        query = {}
    else:
        # Get user's transactions
        user_transactions = await db.transactions.find(
            {
                "$or": [
                    {"buyer_user_id": user.user_id},
                    {"buyer_email": user.email},
                    {"seller_email": user.email}
                ]
            },
            {"_id": 0, "transaction_id": 1}
        ).to_list(1000)
        
        transaction_ids = [t["transaction_id"] for t in user_transactions]
        query = {"transaction_id": {"$in": transaction_ids}}
    
    disputes = await db.disputes.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
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
