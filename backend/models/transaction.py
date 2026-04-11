"""
TrustTrade Transaction Models
Pydantic models for transaction data validation and serialization
"""

from pydantic import BaseModel, ConfigDict
from typing import Optional, List


class Transaction(BaseModel):
    """Full transaction model"""
    model_config = ConfigDict(extra="ignore")
    
    transaction_id: str
    share_code: Optional[str] = None  # Short shareable code like TT-483920
    creator_role: Optional[str] = "buyer"
    buyer_user_id: Optional[str] = None
    seller_user_id: Optional[str] = None
    buyer_name: str
    buyer_email: str
    buyer_phone: Optional[str] = None  # Phone in +27 format
    seller_name: str
    seller_email: str
    seller_phone: Optional[str] = None  # Phone in +27 format
    recipient_info: Optional[str] = None  # Email or phone used for invite
    recipient_type: Optional[str] = None  # "email" or "phone"
    item_description: str
    item_condition: Optional[str] = None
    known_issues: Optional[str] = None
    item_photos: List[str] = []
    item_price: float
    trusttrade_fee: Optional[float] = 0.0
    total: Optional[float] = None
    seller_receives: Optional[float] = None  # Pre-calculated payout after fee
    fee_allocation: str = "SELLER_AGENT"  # BUYER_AGENT, SELLER_AGENT, or SPLIT_AGENT
    delivery_method: str = "courier"  # "courier", "bank_deposit", "digital"
    auto_release_days: int = 3
    payment_status: str = "Pending Seller Confirmation"
    buyer_confirmed: bool = False
    buyer_confirmed_at: Optional[str] = None
    seller_confirmed: bool = False
    seller_confirmed_at: Optional[str] = None
    delivery_confirmed: bool = False
    release_status: str = "Not Released"
    agreement_pdf_path: Optional[str] = None
    buyer_details_confirmed: bool = False
    seller_details_confirmed: bool = False
    item_accuracy_confirmed: bool = False
    buyer_rating: Optional[int] = None
    buyer_review: Optional[str] = None
    seller_rating: Optional[int] = None
    seller_review: Optional[str] = None
    auto_release_at: Optional[str] = None
    auto_released: bool = False
    risk_level: Optional[str] = None  # "low", "medium", "high"
    risk_flags: List[str] = []
    timeline: List[dict] = []
    # TradeSafe Integration Fields
    tradesafe_id: Optional[str] = None
    tradesafe_allocation_id: Optional[str] = None
    tradesafe_state: Optional[str] = None
    tradesafe_fee_allocation: Optional[str] = None  # BUYER_AGENT, SELLER_AGENT, or SPLIT_AGENT
    funds_received_at: Optional[str] = None
    delivery_started_at: Optional[str] = None
    delivery_confirmed_at: Optional[str] = None
    released_at: Optional[str] = None
    created_at: Optional[str] = None  # Made optional for legacy records


class TransactionCreate(BaseModel):
    """Create transaction request"""
    creator_role: str  # "buyer" or "seller"
    buyer_name: Optional[str] = None
    buyer_email: Optional[str] = None
    seller_name: Optional[str] = None
    seller_email: Optional[str] = None
    item_description: str
    item_category: str = "other"
    item_condition: str
    known_issues: Optional[str] = "None"
    item_price: float
    fee_allocation: str = "SELLER_AGENT"  # BUYER_AGENT, SELLER_AGENT, or SPLIT_AGENT
    delivery_method: str = "courier"
    buyer_details_confirmed: bool
    seller_details_confirmed: bool
    item_accuracy_confirmed: bool


class TransactionUpdate(BaseModel):
    """Update transaction request"""
    delivery_confirmed: bool


class TransactionPreview(BaseModel):
    """Limited transaction info for share link preview"""
    share_code: str
    transaction_id: str
    item_description: str
    item_price: float
    trusttrade_fee: float
    total: float
    fee_paid_by: str
    payment_status: str
    buyer_name: str
    seller_name: str
    item_condition: Optional[str] = None
    created_at: str


class SellerConfirmation(BaseModel):
    """Seller confirmation request"""
    confirmed: bool


class BuyerConfirmation(BaseModel):
    """Buyer confirmation request"""
    confirmed: bool


class RatingSubmit(BaseModel):
    """Rating submission request"""
    rating: int
    review: Optional[str] = None


class PaymentConfirmation(BaseModel):
    """Payment confirmation request"""
    confirmed: bool


# TradeSafe Integration Models
class TradeSafeTransactionCreate(BaseModel):
    """Request model for creating TradeSafe transaction"""
    transaction_id: str
    fee_allocation: str = "SELLER_AGENT"  # BUYER_AGENT, SELLER_AGENT, or SPLIT_AGENT


class TradeSafeDeliveryAction(BaseModel):
    """Request model for delivery actions"""
    transaction_id: str


class TradeSafeWebhookPayload(BaseModel):
    """TradeSafe webhook payload structure"""
    event: Optional[str] = None
    transaction_id: Optional[str] = None
    reference: Optional[str] = None
    status: Optional[str] = None
    amount: Optional[float] = None
    data: Optional[dict] = None
