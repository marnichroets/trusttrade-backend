"""
TrustTrade Common Models
Shared Pydantic models and utilities
"""

from pydantic import BaseModel
from typing import List, Optional


class RiskAssessment(BaseModel):
    """Risk assessment result"""
    risk_level: str  # "low", "medium", "high"
    risk_score: int  # 0-100
    flags: List[str]
    warnings: List[str]


# Admin Request Models
class AdminRefundRequest(BaseModel):
    """Admin refund request"""
    reason: str = ""


class AdminReleaseRequest(BaseModel):
    """Admin release funds request"""
    notes: str = ""


class AdminNotesRequest(BaseModel):
    """Admin add notes request"""
    notes: str


class AdminStatusOverride(BaseModel):
    """Admin status override request"""
    status: str


class AdminSendEmail(BaseModel):
    """Admin send email request"""
    to_email: str
    to_name: str
    subject: str
    body: str


class VerificationStatusUpdate(BaseModel):
    """Admin verification status update"""
    status: str  # "pending", "verified", "rejected"
    notes: str = ""
