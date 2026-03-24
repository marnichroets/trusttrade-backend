"""
TrustTrade Dispute Models
Pydantic models for dispute data validation and serialization
"""

from pydantic import BaseModel, ConfigDict
from typing import Optional, List


class Dispute(BaseModel):
    """Dispute model"""
    model_config = ConfigDict(extra="ignore")
    
    dispute_id: str
    transaction_id: str
    raised_by_user_id: str
    dispute_type: Optional[str] = "Other"
    description: str
    evidence_photos: List[str] = []
    status: str = "Pending"
    admin_decision: Optional[str] = None
    is_valid_dispute: bool = False
    created_at: str


class DisputeCreate(BaseModel):
    """Create dispute request"""
    transaction_id: str
    dispute_type: str
    description: str


class DisputeUpdate(BaseModel):
    """Update dispute request"""
    status: str
    admin_decision: Optional[str] = None
    is_valid_dispute: Optional[bool] = None


class DisputeStatusUpdate(BaseModel):
    """Admin dispute status update"""
    status: str  # "open", "under_review", "escalated", "resolved"
    resolution: str = ""
    admin_notes: str = ""
