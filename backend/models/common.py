"""
TrustTrade Common/Shared Models
Pydantic models for auth, wallet, and other shared data
"""

from pydantic import BaseModel
from typing import Optional


# Auth Models
class SessionExchangeRequest(BaseModel):
    """Session exchange request for Google OAuth"""
    session_id: str


class TermsAcceptance(BaseModel):
    """Terms acceptance request"""
    accepted: bool


class PhoneSubmitRequest(BaseModel):
    """Phone number submission for verification"""
    phone: str


class OTPVerifyRequest(BaseModel):
    """OTP verification request"""
    phone: str
    otp_code: str


class PhoneOtpRequest(BaseModel):
    """Phone OTP request for verification flow"""
    phone_number: str


class PhoneOtpVerify(BaseModel):
    """Phone OTP verification"""
    phone_number: str
    otp: str


# Banking/Wallet Models
class BankingDetailsUpdate(BaseModel):
    """Update banking details request"""
    bank_name: str
    account_holder: str
    account_number: str
    branch_code: str
    account_type: str = "savings"


class WalletResponse(BaseModel):
    """Wallet information response"""
    balance: float
    pending_balance: float
    total_earned: float
    payout_threshold: float = 500.0
    progress_percent: float
    remaining_to_payout: float
    can_payout: bool
    banking_details_set: bool


# Risk Assessment Models
class RiskAssessment(BaseModel):
    """Risk assessment result"""
    risk_level: str  # "low", "medium", "high"
    risk_score: int  # 0-100
    flags: list
    warnings: list


# Admin Action Models
class AdminRefundRequest(BaseModel):
    """Admin refund request"""
    reason: str = ""


class AdminReleaseRequest(BaseModel):
    """Admin fund release request"""
    notes: str = ""


class AdminNotesRequest(BaseModel):
    """Admin notes request"""
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


# TradeSafe Webhook Model
class TradeSafeWebhookPayload(BaseModel):
    """TradeSafe webhook payload structure"""
    event: Optional[str] = None
    transaction_id: Optional[str] = None
    reference: Optional[str] = None
    status: Optional[str] = None
    amount: Optional[float] = None
    data: Optional[dict] = None
