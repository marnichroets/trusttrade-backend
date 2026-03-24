"""
TrustTrade Configuration
All environment variables and platform settings
"""

import os
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
ROOT_DIR = Path(__file__).parent.parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB Configuration
MONGO_URL = os.environ.get('MONGO_URL')
DB_NAME = os.environ.get('DB_NAME')

# CORS Configuration
CORS_ORIGINS = os.environ.get('CORS_ORIGINS', '*').split(',')

# Frontend URL for email links
FRONTEND_URL = os.environ.get('FRONTEND_URL', 'https://trusttradesa.co.za')

# TradeSafe Integration
TRADESAFE_CLIENT_ID = os.environ.get('TRADESAFE_CLIENT_ID', '')
TRADESAFE_CLIENT_SECRET = os.environ.get('TRADESAFE_CLIENT_SECRET', '')
TRADESAFE_ENV = os.environ.get('TRADESAFE_ENV', 'production')
TRADESAFE_API_URL = os.environ.get('TRADESAFE_API_URL', 'https://api.tradesafe.co.za/graphql')
TRADESAFE_AUTH_URL = os.environ.get('TRADESAFE_AUTH_URL', 'https://auth.tradesafe.co.za/oauth/token')
TRADESAFE_PAYMENT_URL = os.environ.get('TRADESAFE_PAYMENT_URL', 'https://pay.tradesafe.co.za')

# Postmark Email Integration
POSTMARK_API_KEY = os.environ.get('POSTMARK_API_KEY', '')
POSTMARK_SENDER_EMAIL = os.environ.get('POSTMARK_SENDER_EMAIL', 'noreply@trusttradesa.co.za')

# SMS Messenger Integration
SMS_MESSENGER_API_KEY = os.environ.get('SMS_MESSENGER_API_KEY', '')
SMS_MESSENGER_EMAIL = os.environ.get('SMS_MESSENGER_EMAIL', '')

# Admin Configuration
ADMIN_ALERT_EMAIL = os.environ.get('ADMIN_ALERT_EMAIL', '')
ADMIN_EMAIL = "marnichr@gmail.com"  # Primary admin email

# Platform Constants
MINIMUM_TRANSACTION_AMOUNT = 500.0  # R500 minimum
MAXIMUM_TRANSACTION_AMOUNT = 500000.0  # R500,000 maximum
PAYOUT_THRESHOLD = 500.0  # R500 payout threshold
PLATFORM_FEE_PERCENT = 2.0  # 2% platform fee

# Payment methods allowed
ALLOWED_PAYMENT_METHODS = ["EFT", "CARD", "OZOW"]
