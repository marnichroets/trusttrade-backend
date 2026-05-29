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
    FRONTEND_URL: str = os.environ.get('FRONTEND_URL', 'https://trusttradesa.co.za')
    
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
    
    # Google OAuth
    GOOGLE_CLIENT_ID: str = os.environ.get('GOOGLE_CLIENT_ID', '')
    GOOGLE_CLIENT_SECRET: str = os.environ.get('GOOGLE_CLIENT_SECRET', '')
    GOOGLE_REDIRECT_URI: str = os.environ.get('GOOGLE_REDIRECT_URI', 'https://trusttradesa.co.za/api/auth/google/callback')

    # Admin
    ADMIN_ALERT_EMAIL: str = os.environ.get('ADMIN_ALERT_EMAIL', '')
    ADMIN_ALERT_PHONE: str = os.environ.get('ADMIN_ALERT_PHONE', '')  # SMS for urgent dispute alerts
    ADMIN_EMAIL: str = os.environ.get('ADMIN_EMAIL', '')  # Primary admin email
    ADMIN_RESET_SECRET: str = os.environ.get('ADMIN_RESET_SECRET', '')
    ADMIN_RESET_SECRET: str = os.environ.get('ADMIN_RESET_SECRET', '')
    
    # Backend public URL — used to register the TradeSafe webhook callbackUrl
    BACKEND_URL: str = os.environ.get('BACKEND_URL', 'https://trusttrade-backend-production-3efa.up.railway.app')

    # Platform Constants
    MINIMUM_TRANSACTION_AMOUNT: float = float(os.environ.get('MINIMUM_TRANSACTION_AMOUNT', '500'))
    MAXIMUM_TRANSACTION_AMOUNT: float = float(os.environ.get('MAXIMUM_TRANSACTION_AMOUNT', '0'))
    PAYOUT_THRESHOLD: float = float(os.environ.get('PAYOUT_THRESHOLD', '100'))
    PLATFORM_FEE_PERCENT: float = float(os.environ.get('PLATFORM_FEE_PERCENT', '2'))
    PAYOUT_RELEASE_TIMES: List[str] = [time.strip() for time in os.environ.get('PAYOUT_RELEASE_TIMES', '10:00,15:00').split(',') if time.strip()]
    PAYOUT_CUTOFF_TIMES: List[str] = [time.strip() for time in os.environ.get('PAYOUT_CUTOFF_TIMES', '09:00,14:00').split(',') if time.strip()]
    PAYOUT_CLEARING_DISCLAIMER: str = os.environ.get(
        'PAYOUT_CLEARING_DISCLAIMER',
        'Bank clearing may take up to 2 business days depending on payment runs, weekends, and bank processing.'
    )
    PAYOUT_TIMEZONE: str = os.environ.get('PAYOUT_TIMEZONE', 'Africa/Johannesburg')
    
    # Courier Guy (ShipLogic)
    COURIER_ENABLED: bool = os.environ.get('COURIER_ENABLED', 'True').lower() not in ('false', '0', 'no')
    SHIPLOGIC_API_KEY: str = os.environ.get('SHIPLOGIC_API_KEY', '')
    SHIPLOGIC_API_URL: str = os.environ.get('SHIPLOGIC_API_URL', 'https://api.shiplogic.com')

    # Upload Paths
    UPLOAD_BASE_PATH: str = '/app/uploads'
    PHOTOS_PATH: str = '/app/uploads/photos'
    VERIFICATION_PATH: str = '/app/uploads/verification'
    DISPUTES_PATH: str = '/app/uploads/disputes'
    PDFS_PATH: str = '/app/uploads/pdfs'


# Singleton instance
settings = Settings()
