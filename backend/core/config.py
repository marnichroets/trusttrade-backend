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
    
    # Environment (development, staging, production)
    ENV: str = os.environ.get('ENV', 'development')
    
    # Database
    MONGO_URL: str = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
    DB_NAME: str = os.environ.get('DB_NAME', 'trusttrade')
    
    # CORS with environment-aware defaults
    @staticmethod
    def _get_cors_origins() -> List[str]:
        """Get CORS origins with intelligent defaults based on environment.
        Strips whitespace from comma-separated values."""
        cors_env = os.environ.get('CORS_ORIGINS', '').strip()
        
        # If explicitly set, use it (strip whitespace from each origin)
        if cors_env and cors_env != '*':
            return [origin.strip() for origin in cors_env.split(',') if origin.strip()]
        
        # Default wildcard for development only
        if cors_env == '*':
            return ['*']
        
        # Environment-based defaults
        env = os.environ.get('ENV', 'development').lower()
        
        if env == 'production':
            return ['https://trusttradesa.co.za']
        elif env == 'staging':
            return ['https://staging.trusttradesa.co.za', 'https://trusttradesa.co.za']
        else:  # development
            return [
                'http://localhost:3000',
                'http://localhost:5173',
                'http://127.0.0.1:3000',
                'http://127.0.0.1:5173'
            ]
    
    CORS_ORIGINS: List[str] = _get_cors_origins()
    
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
    ADMIN_RESET_SECRET: str = os.environ.get('ADMIN_RESET_SECRET', '')
    ADMIN_RESET_SECRET: str = os.environ.get('ADMIN_RESET_SECRET', '')
    
    # Platform Constants - Beta Launch Limits
    MINIMUM_TRANSACTION_AMOUNT: float = 100.0  # R100 minimum (beta)
    MAXIMUM_TRANSACTION_AMOUNT: float = 10000.0  # R10,000 maximum (beta)
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