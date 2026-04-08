"""
TrustTrade Core Configuration
Centralized configuration management using environment variables
"""

import os
from pathlib import Path
from dotenv import load_dotenv
from typing import List

# Load environment variables
ROOT_DIR = Path(__file__).parent.parent
load_dotenv(ROOT_DIR / '.env')


class Settings:
    """Application settings loaded from environment variables"""
    
    # Database
    MONGO_URL: str = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
    DB_NAME: str = os.environ.get('DB_NAME', 'trusttrade')
    
    # CORS
    CORS_ORIGINS: List[str] = os.environ.get('CORS_ORIGINS', '*').split(',')
    
    # Frontend URL for email links
    FRONTEND_URL: str = os.environ.get('FRONTEND_URL', 'https://www.trusttradesa.co.za')
    
    # TradeSafe Integration
    TRADESAFE_CLIENT_ID: str = os.environ.get('TRADESAFE_CLIENT_ID', '')
    TRADESAFE_CLIENT_SECRET: str = os.environ.get('TRADESAFE_CLIENT_SECRET', '')
    TRADESAFE_ENV: str = os.environ.get('TRADESAFE_ENV', 'production')
    TRADESAFE_API_URL: str = os.environ.get('TRADESAFE_API_URL', 'https://api.tradesafe.co.za/graphql')
    TRADESAFE_AUTH_URL: str = os.environ.get('TRADESAFE_AUTH_URL', 'https://auth.tradesafe.co.za/oauth/token')
    TRADESAFE_PAYMENT_URL: str = os.environ.get('TRADESAFE_PAYMENT_URL', 'https://pay.tradesafe.co.za')
    
    # Postmark Email
    POSTMARK_API_KEY: str = os.environ.get('POSTMARK_API_KEY', '')
    POSTMARK_SENDER_EMAIL: str = os.environ.get('POSTMARK_SENDER_EMAIL', 'noreply@trusttradesa.co.za')
    
    # SMS Messenger
    SMS_MESSENGER_API_KEY: str = os.environ.get('SMS_MESSENGER_API_KEY', '')
    SMS_MESSENGER_EMAIL: str = os.environ.get('SMS_MESSENGER_EMAIL', '')
    SMS_MESSENGER_API_URL: str = os.environ.get('SMS_MESSENGER_API_URL', 'https://sms1.smsmessenger.co.za/app/api/rest/v1/sms/send')
    
    # Admin
    ADMIN_ALERT_EMAIL: str = os.environ.get('ADMIN_ALERT_EMAIL', '')
    ADMIN_EMAIL: str = os.environ.get('ADMIN_EMAIL', '')  # Primary admin email
    
    # Platform Constants
    MINIMUM_TRANSACTION_AMOUNT: float = 100.0  # R100 minimum
    MAXIMUM_TRANSACTION_AMOUNT: float = 500000.0  # R500,000 maximum
    PAYOUT_THRESHOLD: float = 100.0  # R100 payout threshold
    PLATFORM_FEE_PERCENT: float = 2.0  # 2% platform fee
    
    # Upload Paths
    UPLOAD_BASE_PATH: str = '/app/uploads'
    PHOTOS_PATH: str = '/app/uploads/photos'
    VERIFICATION_PATH: str = '/app/uploads/verification'
    DISPUTES_PATH: str = '/app/uploads/disputes'
    PDFS_PATH: str = '/app/uploads/pdfs'


# Singleton instance
settings = Settings()
