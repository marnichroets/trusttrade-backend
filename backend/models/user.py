"""
TrustTrade User Models
Pydantic models for user data validation and serialization
"""

from pydantic import BaseModel, ConfigDict
from typing import Optional, List


class BankingDetails(BaseModel):
    """User banking details for payouts"""
    bank_name: str = ""
    account_holder: str = ""
    account_number: str = ""
    branch_code: str = ""
    account_type: str = "savings"  # savings, checking
    verified: bool = False


class User(BaseModel):
    """User model for authentication and profile data"""
    model_config = ConfigDict(extra="ignore")
    
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    role: str = "buyer"
    is_admin: bool = False
    terms_accepted: bool = False
    terms_accepted_at: Optional[str] = None
    suspension_flag: bool = False
    valid_disputes_count: int = 0
    total_trades: int = 0
    successful_trades: int = 0
    average_rating: float = 0.0
    trust_score: int = 50
    badges: List[str] = []
    verified: bool = False
    # Phone verification
    phone: Optional[str] = None  # Stored in +27 format
    phone_verified: bool = False
    phone_verified_at: Optional[str] = None
    # Wallet & Banking
    wallet_balance: float = 0.0
    pending_balance: float = 0.0  # Funds in escrow awaiting release
    total_earned: float = 0.0
    banking_details: Optional[dict] = None
    banking_details_verified: bool = False
    # TradeSafe token - persistent per user
    tradesafe_token_id: Optional[str] = None
    tradesafe_token_reference: Optional[str] = None
    banking_details_completed: bool = False
    payout_interval: str = "IMMEDIATE"
    refund_interval: str = "IMMEDIATE"
    created_at: Optional[str] = None


class UserSession(BaseModel):
    """User session for authentication"""
    model_config = ConfigDict(extra="ignore")
    
    user_id: str
    session_token: str
    expires_at: str
    created_at: str


class UserProfile(BaseModel):
    """Public user profile info"""
    user_id: str
    name: str
    email: str
    picture: Optional[str] = None
    trust_score: int = 50
    total_trades: int = 0
    successful_trades: int = 0
    average_rating: float = 0.0
    valid_disputes_count: int = 0
    badges: List[str] = []
    verified: bool = False
    suspended: bool = False
    created_at: str


class UserReport(BaseModel):
    """User report model"""
    report_id: str
    reporter_user_id: str
    reported_user_id: str
    reason: str
    description: str
    transaction_id: Optional[str] = None
    status: str = "Pending"  # Pending, Reviewed, Resolved, Dismissed
    admin_notes: Optional[str] = None
    created_at: str


class UserReportCreate(BaseModel):
    """Create user report request"""
    reported_user_id: str
    reason: str
    description: str
    transaction_id: Optional[str] = None


class VerificationStatus(BaseModel):
    """User verification status"""
    id_verified: bool = False
    id_document_path: Optional[str] = None
    selfie_verified: bool = False
    selfie_path: Optional[str] = None
    phone_verified: bool = False
    phone_number: Optional[str] = None
    fully_verified: bool = False


# Request/Response Models
class SessionExchangeRequest(BaseModel):
    """OAuth session exchange request"""
    session_id: str


class TermsAcceptance(BaseModel):
    """Terms acceptance request"""
    accepted: bool


class BankingDetailsUpdate(BaseModel):
    """Update banking details for a user"""
    bank_name: str
    account_holder: str
    account_number: str
    branch_code: str
    account_type: str = "savings"
    id_number: Optional[str] = None
    company_registration_number: Optional[str] = None


class WalletResponse(BaseModel):
    """Wallet information response"""
    balance: float
    pending_balance: float
    total_earned: float
    payout_threshold: float
    progress_percent: float
    remaining_to_payout: float
    can_payout: bool
    banking_details_set: bool


class PhoneSubmitRequest(BaseModel):
    """Phone number submission for verification"""
    phone: str


class OTPVerifyRequest(BaseModel):
    """OTP verification request"""
    phone: str
    otp_code: str


class PhoneOtpRequest(BaseModel):
    """Phone OTP request with optional validation"""
    phone_number: str
    expected_phone_masked: Optional[str] = None  # e.g., "+27•••2758" - for validation


class PhoneOtpVerify(BaseModel):
    """Phone OTP verification"""
    phone_number: str
    otp: str
