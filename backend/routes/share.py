"""
TrustTrade Share Link Routes
Handles share codes and transaction joining via links
"""

import logging
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Request

from core.database import get_database
from core.security import get_user_from_token, normalize_email, emails_match
from models.transaction import Transaction, TransactionPreview
from sms_service import normalize_phone_number, phones_match

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/share", tags=["Share Links"])


@router.get("/{share_code}", response_model=TransactionPreview)
async def get_transaction_by_share_code(share_code: str):
    """Get transaction preview by share code - requires auth to view full details"""
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
    
    user = await get_user_from_token(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    transaction = await db.transactions.find_one(
        {"share_code": share_code},
        {"_id": 0}
    )
    
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    # Log the comparison details for debugging
    logger.info("=== TRANSACTION LINK VERIFICATION ===")
    logger.info(f"User email: '{user.email}'")
    user_phone = getattr(user, 'phone', None) or ""
    logger.info(f"User phone: '{user_phone}'")
    logger.info(f"Transaction buyer_email: '{transaction.get('buyer_email')}'")
    logger.info(f"Transaction seller_email: '{transaction.get('seller_email')}'")
    logger.info(f"Transaction buyer_phone: '{transaction.get('buyer_phone')}'")
    logger.info(f"Transaction seller_phone: '{transaction.get('seller_phone')}'")
    logger.info(f"Transaction recipient_info: '{transaction.get('recipient_info')}'")
    logger.info(f"Transaction recipient_type: '{transaction.get('recipient_type')}'")
    
    recipient_type = transaction.get("recipient_type", "email")
    recipient_info = transaction.get("recipient_info", "")
    is_buyer = False
    is_seller = False
    
    # RULE: If invited by email -> check email ONLY
    # RULE: If invited by phone -> check phone ONLY
    
    if recipient_type == "email":
        logger.info("Checking EMAIL-based invite verification...")
        
        # Check buyer email match
        buyer_email = transaction.get("buyer_email", "")
        if buyer_email and emails_match(buyer_email, user.email):
            is_buyer = True
            logger.info(f"Email match: user is BUYER (buyer_email={buyer_email})")
        
        # Check seller email match
        seller_email = transaction.get("seller_email", "")
        if seller_email and emails_match(seller_email, user.email):
            is_seller = True
            logger.info(f"Email match: user is SELLER (seller_email={seller_email})")
        
        # Also check recipient_info for email match
        if not is_buyer and not is_seller and recipient_info:
            if emails_match(recipient_info, user.email):
                if transaction.get("creator_role") == "seller":
                    is_buyer = True
                    logger.info("Email match via recipient_info: user is BUYER")
                else:
                    is_seller = True
                    logger.info("Email match via recipient_info: user is SELLER")
    
    elif recipient_type == "phone":
        logger.info("Checking PHONE-based invite verification...")
        
        if not user_phone:
            logger.warning("User has no verified phone number, cannot join phone-based invite")
            raise HTTPException(
                status_code=403, 
                detail="This transaction was sent to a phone number. Please verify your phone number in Settings to access this transaction."
            )
        
        # Check buyer phone match
        buyer_phone = transaction.get("buyer_phone", "")
        if buyer_phone and phones_match(buyer_phone, user_phone):
            is_buyer = True
            logger.info(f"Phone match: user is BUYER (buyer_phone={buyer_phone})")
        
        # Check seller phone match
        seller_phone = transaction.get("seller_phone", "")
        if seller_phone and phones_match(seller_phone, user_phone):
            is_seller = True
            logger.info(f"Phone match: user is SELLER (seller_phone={seller_phone})")
        
        # Also check recipient_info for phone match
        if not is_buyer and not is_seller and recipient_info:
            if phones_match(recipient_info, user_phone):
                if transaction.get("creator_role") == "seller":
                    is_buyer = True
                    logger.info("Phone match via recipient_info: user is BUYER")
                else:
                    is_seller = True
                    logger.info("Phone match via recipient_info: user is SELLER")
    
    logger.info(f"Match result: is_buyer={is_buyer}, is_seller={is_seller}")
    
    if not is_buyer and not is_seller:
        if recipient_type == "phone":
            raise HTTPException(
                status_code=403, 
                detail=f"This transaction was sent to phone number {recipient_info}. Your verified phone number ({user_phone}) does not match. Please use the correct phone number."
            )
        else:
            raise HTTPException(
                status_code=403, 
                detail=f"This transaction was sent to email address {recipient_info}. Your account email ({user.email}) does not match. Please log in with the correct account."
            )
    
    # Link user to transaction
    update_field = "buyer_user_id" if is_buyer else "seller_user_id"
    
    # Check if already linked
    if transaction.get(update_field):
        return {"message": "Already joined", "transaction_id": transaction["transaction_id"], "role": "buyer" if is_buyer else "seller"}
    
    # Update timeline
    timeline = transaction.get("timeline", [])
    timeline.append({
        "status": f"{'Buyer' if is_buyer else 'Seller'} Joined via Share Link",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "by": user.name
    })
    
    # Also update the email/phone on transaction if it was empty
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
