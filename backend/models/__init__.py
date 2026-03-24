"""
TrustTrade Models Module
All Pydantic models for the application
"""

from models.user import (
    User,
    UserSession,
    UserProfile,
    UserReport,
    UserReportCreate,
    BankingDetails,
    BankingDetailsUpdate,
    WalletResponse,
    VerificationStatus,
    SessionExchangeRequest,
    TermsAcceptance,
    PhoneSubmitRequest,
    OTPVerifyRequest,
    PhoneOtpRequest,
    PhoneOtpVerify
)

from models.transaction import (
    Transaction,
    TransactionCreate,
    TransactionUpdate,
    TransactionPreview,
    SellerConfirmation,
    RatingSubmit,
    PaymentConfirmation,
    TradeSafeTransactionCreate,
    TradeSafeDeliveryAction,
    TradeSafeWebhookPayload
)

from models.dispute import (
    Dispute,
    DisputeCreate,
    DisputeUpdate,
    DisputeStatusUpdate
)

from models.common import (
    RiskAssessment,
    AdminRefundRequest,
    AdminReleaseRequest,
    AdminNotesRequest,
    AdminStatusOverride,
    AdminSendEmail,
    VerificationStatusUpdate
)

__all__ = [
    # User models
    'User',
    'UserSession',
    'UserProfile',
    'UserReport',
    'UserReportCreate',
    'BankingDetails',
    'BankingDetailsUpdate',
    'WalletResponse',
    'VerificationStatus',
    'SessionExchangeRequest',
    'TermsAcceptance',
    'PhoneSubmitRequest',
    'OTPVerifyRequest',
    'PhoneOtpRequest',
    'PhoneOtpVerify',
    
    # Transaction models
    'Transaction',
    'TransactionCreate',
    'TransactionUpdate',
    'TransactionPreview',
    'SellerConfirmation',
    'RatingSubmit',
    'PaymentConfirmation',
    'TradeSafeTransactionCreate',
    'TradeSafeDeliveryAction',
    'TradeSafeWebhookPayload',
    
    # Dispute models
    'Dispute',
    'DisputeCreate',
    'DisputeUpdate',
    'DisputeStatusUpdate',
    
    # Common models
    'RiskAssessment',
    'AdminRefundRequest',
    'AdminReleaseRequest',
    'AdminNotesRequest',
    'AdminStatusOverride',
    'AdminSendEmail',
    'VerificationStatusUpdate'
]
