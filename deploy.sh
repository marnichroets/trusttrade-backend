#!/bin/bash

# ===============================
# TrustTrade Backend Deployment Prep Script
# ===============================
# Usage: ./deploy.sh <environment>
# Example: ./deploy.sh production
# Allowed environments: development, staging, production
#
# This script prepares your code and shows the environment
# variables needed for Emergent deployment.
# ===============================

set -e

ENVIRONMENT=$1

if [[ -z "$ENVIRONMENT" ]]; then
  echo "❌ Error: No environment specified."
  echo "Usage: ./deploy.sh <development|staging|production>"
  exit 1
fi

echo "🔹 Preparing TrustTrade Backend for '$ENVIRONMENT' deployment..."
echo ""

# -------------------------------
# 1️⃣ Verify .env is not tracked
# -------------------------------
echo "🔒 Checking for secrets in git..."
if git ls-files | grep -q "\.env$"; then
  echo "❌ ERROR: .env file is tracked by git!"
  echo "   Run: git rm --cached backend/.env frontend/.env"
  exit 1
else
  echo "✅ No .env files tracked - safe to push"
fi

# -------------------------------
# 2️⃣ Set environment-specific variables
# -------------------------------
case "$ENVIRONMENT" in
  production)
    CORS_ORIGINS="https://trusttradesa.co.za,https://www.trusttradesa.co.za"
    FRONTEND_URL="https://trusttradesa.co.za"
    ;;
  staging)
    CORS_ORIGINS="https://staging.trusttradesa.co.za,https://trusttradesa.co.za"
    FRONTEND_URL="https://staging.trusttradesa.co.za"
    ;;
  development)
    CORS_ORIGINS="http://localhost:3000,http://localhost:5173"
    FRONTEND_URL="http://localhost:3000"
    ;;
  *)
    echo "❌ Error: Unknown environment '$ENVIRONMENT'"
    exit 1
    ;;
esac

# -------------------------------
# 3️⃣ Show deployment instructions
# -------------------------------
echo ""
echo "=========================================="
echo "📋 EMERGENT DEPLOYMENT SETTINGS"
echo "=========================================="
echo ""
echo "Repository:    marnichroets/trusttrade-backend"
echo "Branch:        main"
echo "Project Name:  trusttrade-backend"
echo "Runtime:       Python 3.11"
echo "Start Command: uvicorn server:app --host 0.0.0.0 --port 8001"
echo ""
echo "=========================================="
echo "🔐 ENVIRONMENT VARIABLES FOR $ENVIRONMENT"
echo "=========================================="
echo ""
echo "Copy these to Emergent deployment settings:"
echo ""
cat << EOF
ENV=$ENVIRONMENT
CORS_ORIGINS=$CORS_ORIGINS
FRONTEND_URL=$FRONTEND_URL
MONGO_URL=<your-mongodb-connection-string>
DB_NAME=trusttrade
ADMIN_EMAIL=marnichr@gmail.com
POSTMARK_API_KEY=<your-postmark-api-key>
POSTMARK_SENDER_EMAIL=noreply@trusttradesa.co.za
TRADESAFE_CLIENT_ID=<your-tradesafe-client-id>
TRADESAFE_CLIENT_SECRET=<your-tradesafe-client-secret>
TRADESAFE_ENV=production
SMS_MESSENGER_API_KEY=<your-sms-api-key>
SMS_MESSENGER_EMAIL=<your-sms-email>
ADMIN_ALERT_EMAIL=marnichr@gmail.com
EOF
echo ""
echo "=========================================="
echo "📝 DEPLOYMENT STEPS"
echo "=========================================="
echo ""
echo "1. In Emergent, click 'Save to GitHub' to push your code"
echo "2. Go to Emergent Dashboard → Deploy → From GitHub"
echo "3. Select repository: marnichroets/trusttrade-backend"
echo "4. Select branch: main"
echo "5. Set runtime: Python 3.11"
echo "6. Set start command: uvicorn server:app --host 0.0.0.0 --port 8001"
echo "7. Add the environment variables listed above"
echo "8. Click Deploy"
echo ""
echo "✅ Deployment preparation complete!"
echo ""
