"""
TrustTrade Share Link Routes
Handles share code lookups and joining transactions
"""

import logging
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Request

from core.database import get_database
from core.security import get_user_from_token, normalize_email, emails_match
from models.transaction import TransactionPreview
from services.sms_service import phones_match, normalize_phone_number

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/share", tags=["Share Links"])


@router.get("/{share_code}", response_model=TransactionPreview)
async def get_transaction_by_share_code(share_code: str):
    """Get transaction preview by share code - public endpoint"""
    db = get_database()
    
    transaction = await db.transactions.find_one(
        {"share_code": share_code},
        {"_id": 0}
    )
    
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    return TransactionPreview(
        share_code=transaction["share_code"],
        transaction_id=transaction["transaction_id"],
        item_description=transaction["item_description"],
        item_price=transaction["item_price"],
        trusttrade_fee=transaction["trusttrade_fee"],
        total=transaction["total"],
        fee_paid_by=transaction.get("fee_paid_by", "split"),
        payment_status=transaction["payment_status"],
        buyer_name=transaction["buyer_name"],
        seller_name=transaction["seller_name"],
        item_condition=transaction.get("item_condition"),
        created_at=transaction["created_at"]
    )


@router.post("/{share_code}/join")
async def join_transaction_by_share_code(request: Request, share_code: str):
    """Join a transaction via share code - links user to transaction"""
    db = get_database()
    user = await get_user_from_token(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    transaction = await db.transactions.find_one(
        {"share_code": share_code},
        {"_id": 0}
    )
    
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    # Log comparison details
    logger.info(f"=== TRANSACTION LINK VERIFICATION ===")
    logger.info(f"User email: '{user.email}'")
    user_phone = getattr(user, 'phone', None) or ""
    logger.info(f"User phone: '{user_phone}'")
    
    recipient_type = transaction.get("recipient_type", "email")
    recipient_info = transaction.get("recipient_info", "")
    is_buyer = False
    is_seller = False
    
    if recipient_type == "email":
        # EMAIL-BASED INVITE
        buyer_email = transaction.get("buyer_email", "")
        if buyer_email and emails_match(buyer_email, user.email):
            is_buyer = True
        
        seller_email = transaction.get("seller_email", "")
        if seller_email and emails_match(seller_email, user.email):
            is_seller = True
        
        if not is_buyer and not is_seller and recipient_info:
            if emails_match(recipient_info, user.email):
                if transaction.get("creator_role") == "seller":
                    is_buyer = True
                else:
                    is_seller = True
    
    elif recipient_type == "phone":
        # PHONE-BASED INVITE
        if not user_phone:
            raise HTTPException(
                status_code=403, 
                detail="This transaction was sent to a phone number. Please verify your phone number in Settings to access this transaction."
            )
        
        buyer_phone = transaction.get("buyer_phone", "")
        if buyer_phone and phones_match(buyer_phone, user_phone):
            is_buyer = True
        
        seller_phone = transaction.get("seller_phone", "")
        if seller_phone and phones_match(seller_phone, user_phone):
            is_seller = True
        
        if not is_buyer and not is_seller and recipient_info:
            if phones_match(recipient_info, user_phone):
                if transaction.get("creator_role") == "seller":
                    is_buyer = True
                else:
                    is_seller = True
    
    if not is_buyer and not is_seller:
        if recipient_type == "phone":
            raise HTTPException(
                status_code=403, 
                detail=f"This transaction was sent to phone number {recipient_info}. Your verified phone number ({user_phone}) does not match."
            )
        else:
            raise HTTPException(
                status_code=403, 
                detail=f"This transaction was sent to email address {recipient_info}. Your account email ({user.email}) does not match."
            )
    
    # Link user to transaction
    update_field = "buyer_user_id" if is_buyer else "seller_user_id"
    
    if transaction.get(update_field):
        return {"message": "Already joined", "transaction_id": transaction["transaction_id"], "role": "buyer" if is_buyer else "seller"}
    
    timeline = transaction.get("timeline", [])
    timeline.append({
        "status": f"{'Buyer' if is_buyer else 'Seller'} Joined via Share Link",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "by": user.name
    })
    
    update_data = {update_field: user.user_id, "timeline": timeline}
    if is_buyer and not transaction.get("buyer_email"):
        update_data["buyer_email"] = normalize_email(user.email)
    if is_seller and not transaction.get("seller_email"):
        update_data["seller_email"] = normalize_email(user.email)
    
    await db.transactions.update_one(
        {"share_code": share_code},
        {"$set": update_data}
    )
    
    return {"message": "Successfully joined transaction", "transaction_id": transaction["transaction_id"], "role": "buyer" if is_buyer else "seller"}
