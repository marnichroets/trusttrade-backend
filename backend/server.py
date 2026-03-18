from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Cookie, UploadFile, File
from fastapi.responses import FileResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
import httpx
import shutil
from pdf_generator import generate_escrow_agreement_pdf
from email_service import (
    send_transaction_created_email,
    send_payment_received_email,
    send_funds_released_email,
    send_delivery_confirmed_email,
    send_dispute_opened_email,
    send_verification_status_email,
    send_dispute_resolved_email,
    send_refund_email
)
from tradesafe_service import (
    get_tradesafe_token,
    create_tradesafe_transaction,
    get_tradesafe_transaction,
    get_payment_link,
    start_delivery,
    accept_delivery,
    get_transaction_by_reference,
    validate_minimum_transaction,
    calculate_fees,
    map_tradesafe_state_to_status,
    TransactionState,
    MINIMUM_TRANSACTION_AMOUNT as TRADESAFE_MINIMUM,
    ALLOWED_PAYMENT_METHODS
)

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Platform Constants - Updated to R500 minimum for TradeSafe
MINIMUM_TRANSACTION_AMOUNT = 500.0  # R500 minimum for TradeSafe
PAYOUT_THRESHOLD = 500.0  # R500 payout threshold
PLATFORM_FEE_PERCENT = 2.0  # 2% platform fee

# Pydantic Models
class BankingDetails(BaseModel):
    """User banking details for payouts"""
    bank_name: str = ""
    account_holder: str = ""
    account_number: str = ""
    branch_code: str = ""
    account_type: str = "savings"  # savings, checking
    verified: bool = False

class User(BaseModel):
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
    # Wallet & Banking
    wallet_balance: float = 0.0
    pending_balance: float = 0.0  # Funds in escrow awaiting release
    total_earned: float = 0.0
    banking_details: Optional[dict] = None  # Changed from BankingDetails to dict for flexibility
    banking_details_verified: bool = False
    created_at: Optional[str] = None  # Made optional for existing users

class UserSession(BaseModel):
    model_config = ConfigDict(extra="ignore")
    user_id: str
    session_token: str
    expires_at: str
    created_at: str

class Transaction(BaseModel):
    model_config = ConfigDict(extra="ignore")
    transaction_id: str
    share_code: Optional[str] = None  # Short shareable code like TT-483920
    creator_role: Optional[str] = "buyer"
    buyer_user_id: Optional[str] = None
    seller_user_id: Optional[str] = None
    buyer_name: str
    buyer_email: str
    seller_name: str
    seller_email: str
    item_description: str
    item_condition: Optional[str] = None
    known_issues: Optional[str] = None
    item_photos: List[str] = []
    item_price: float
    trusttrade_fee: float
    total: float
    fee_paid_by: str = "split"  # "buyer", "seller", or "split" (default: 50/50 split)
    delivery_method: str = "courier"  # "courier", "bank_deposit", "digital"
    auto_release_days: int = 3  # Days until auto-release based on delivery method
    payment_status: str = "Pending Seller Confirmation"
    seller_confirmed: bool = False
    seller_confirmed_at: Optional[str] = None
    delivery_confirmed: bool = False
    release_status: str = "Not Released"
    agreement_pdf_path: Optional[str] = None
    buyer_details_confirmed: bool = False
    seller_details_confirmed: bool = False
    item_accuracy_confirmed: bool = False
    buyer_rating: Optional[int] = None
    buyer_review: Optional[str] = None
    seller_rating: Optional[int] = None
    seller_review: Optional[str] = None
    auto_release_at: Optional[str] = None  # Timestamp for auto-release
    auto_released: bool = False  # Flag indicating auto-release occurred
    risk_level: Optional[str] = None  # "low", "medium", "high"
    risk_flags: List[str] = []
    timeline: List[dict] = []
    # TradeSafe Integration Fields
    tradesafe_id: Optional[str] = None  # TradeSafe transaction ID
    tradesafe_allocation_id: Optional[str] = None  # TradeSafe allocation ID
    tradesafe_state: Optional[str] = None  # Current TradeSafe state
    funds_received_at: Optional[str] = None  # When funds were secured
    delivery_started_at: Optional[str] = None  # When seller started delivery
    delivery_confirmed_at: Optional[str] = None  # When buyer confirmed delivery
    released_at: Optional[str] = None  # When funds were released
    created_at: str

class TransactionCreate(BaseModel):
    creator_role: str  # "buyer" or "seller"
    buyer_name: Optional[str] = None
    buyer_email: Optional[str] = None
    seller_name: Optional[str] = None
    seller_email: Optional[str] = None
    item_description: str
    item_condition: str
    known_issues: str
    item_price: float
    fee_paid_by: str = "split"  # "buyer", "seller", or "split" (default: 50/50 split)
    delivery_method: str = "courier"  # "courier", "bank_deposit", "digital"
    buyer_details_confirmed: bool
    seller_details_confirmed: bool
    item_accuracy_confirmed: bool

class TransactionUpdate(BaseModel):
    delivery_confirmed: bool

class RatingSubmit(BaseModel):
    rating: int
    review: Optional[str] = None

class SellerConfirmation(BaseModel):
    confirmed: bool

class Dispute(BaseModel):
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
    transaction_id: str
    dispute_type: str
    description: str

class DisputeUpdate(BaseModel):
    status: str
    admin_decision: Optional[str] = None
    is_valid_dispute: Optional[bool] = None

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
    reported_user_id: str
    reason: str
    description: str
    transaction_id: Optional[str] = None

class SessionExchangeRequest(BaseModel):
    session_id: str

class TermsAcceptance(BaseModel):
    accepted: bool

class BankingDetailsUpdate(BaseModel):
    """Update banking details for a user"""
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
    payout_threshold: float = PAYOUT_THRESHOLD
    progress_percent: float
    remaining_to_payout: float
    can_payout: bool
    banking_details_set: bool

# Helper to generate short share code
import random
import string

def generate_share_code() -> str:
    """Generate a short, user-friendly share code like TT-483920"""
    numbers = ''.join(random.choices(string.digits, k=6))
    return f"TT-{numbers}"

# Mock email function
def mock_send_email(to_email: str, subject: str, body: str):
    logger.info(f"MOCK EMAIL TO: {to_email}")
    logger.info(f"SUBJECT: {subject}")
    logger.info(f"BODY: {body}")
    logger.info("---")

# Scam Detection System
class RiskAssessment(BaseModel):
    risk_level: str  # "low", "medium", "high"
    risk_score: int  # 0-100
    flags: List[str]
    warnings: List[str]

async def assess_transaction_risk(user: User, item_price: float) -> RiskAssessment:
    """Assess risk level for a transaction"""
    risk_score = 0
    flags = []
    warnings = []
    
    # Get user's account age
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
    created_at = user_doc.get("created_at")
    if created_at:
        account_age_days = (datetime.now(timezone.utc) - datetime.fromisoformat(created_at.replace('Z', '+00:00'))).days
    else:
        account_age_days = 0
    
    # Flag 1: New account with high-value transaction
    if account_age_days < 7 and item_price > 5000:
        risk_score += 30
        flags.append("new_account_high_value")
        warnings.append("New account attempting high-value transaction (R5,000+)")
    
    # Flag 2: Account with multiple valid disputes
    valid_disputes = user_doc.get("valid_disputes_count", 0)
    if valid_disputes >= 2:
        risk_score += 25
        flags.append("multiple_disputes")
        warnings.append(f"User has {valid_disputes} valid disputes against them")
    
    # Flag 3: Unverified account with high-value transaction
    if not user_doc.get("verified", False) and item_price > 10000:
        risk_score += 20
        flags.append("unverified_high_value")
        warnings.append("Unverified account with very high-value transaction (R10,000+)")
    
    # Flag 4: Very low trust score
    trust_score = user_doc.get("trust_score", 50)
    if trust_score < 30:
        risk_score += 25
        flags.append("low_trust_score")
        warnings.append(f"User has a low trust score ({trust_score}/100)")
    
    # Flag 5: Account is suspended or flagged
    if user_doc.get("suspension_flag", False):
        risk_score += 50
        flags.append("suspended_account")
        warnings.append("User account has been flagged for suspension")
    
    # Flag 6: Unusually low price (potential scam)
    if item_price < 50:
        risk_score += 10
        flags.append("very_low_price")
        warnings.append("Transaction amount is unusually low")
    
    # Determine risk level
    if risk_score >= 60:
        risk_level = "high"
    elif risk_score >= 30:
        risk_level = "medium"
    else:
        risk_level = "low"
    
    return RiskAssessment(
        risk_level=risk_level,
        risk_score=risk_score,
        flags=flags,
        warnings=warnings
    )

async def assess_user_risk(user_id: str) -> RiskAssessment:
    """Assess risk level for a user account"""
    risk_score = 0
    flags = []
    warnings = []
    
    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not user_doc:
        return RiskAssessment(risk_level="low", risk_score=0, flags=[], warnings=[])
    
    # Check account age
    created_at = user_doc.get("created_at")
    if created_at:
        account_age_days = (datetime.now(timezone.utc) - datetime.fromisoformat(created_at.replace('Z', '+00:00'))).days
    else:
        account_age_days = 0
    
    if account_age_days < 3:
        risk_score += 15
        flags.append("very_new_account")
        warnings.append("Account is less than 3 days old")
    
    # Check disputes
    valid_disputes = user_doc.get("valid_disputes_count", 0)
    if valid_disputes >= 3:
        risk_score += 40
        flags.append("many_disputes")
        warnings.append(f"User has {valid_disputes} valid disputes - account may need review")
    elif valid_disputes >= 1:
        risk_score += 15
        flags.append("has_disputes")
    
    # Check reports against user
    reports_count = await db.reports.count_documents({"reported_user_id": user_id, "status": {"$ne": "Dismissed"}})
    if reports_count >= 3:
        risk_score += 35
        flags.append("multiple_reports")
        warnings.append(f"User has {reports_count} reports against them")
    elif reports_count >= 1:
        risk_score += 10
        flags.append("has_reports")
    
    # Check verification status
    if not user_doc.get("verified", False):
        risk_score += 10
        flags.append("unverified")
    
    # Check trust score
    trust_score = user_doc.get("trust_score", 50)
    if trust_score < 20:
        risk_score += 30
        flags.append("very_low_trust")
        warnings.append(f"Very low trust score: {trust_score}/100")
    
    # Determine risk level
    if risk_score >= 60:
        risk_level = "high"
    elif risk_score >= 30:
        risk_level = "medium"
    else:
        risk_level = "low"
    
    return RiskAssessment(
        risk_level=risk_level,
        risk_score=risk_score,
        flags=flags,
        warnings=warnings
    )

# Helper to get user from session token
async def get_user_from_token(request: Request) -> Optional[User]:
    # Check cookie first, then Authorization header
    session_token = request.cookies.get("session_token")
    if not session_token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            session_token = auth_header.split(" ")[1]
    
    if not session_token:
        return None
    
    # Find session
    session_doc = await db.user_sessions.find_one(
        {"session_token": session_token},
        {"_id": 0}
    )
    
    if not session_doc:
        return None
    
    # Check expiry
    expires_at = session_doc["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    
    if expires_at < datetime.now(timezone.utc):
        return None
    
    # Get user
    user_doc = await db.users.find_one(
        {"user_id": session_doc["user_id"]},
        {"_id": 0}
    )
    
    if not user_doc:
        return None
    
    return User(**user_doc)

# Auth Endpoints
@api_router.post("/auth/session")
async def exchange_session(request: SessionExchangeRequest, response: Response):
    """Exchange session_id for user data and set session cookie"""
    try:
        # Call Emergent Auth API
        async with httpx.AsyncClient() as client:
            auth_response = await client.get(
                "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
                headers={"X-Session-ID": request.session_id},
                timeout=10.0
            )
            
            if auth_response.status_code != 200:
                raise HTTPException(status_code=401, detail="Invalid session")
            
            auth_data = auth_response.json()
        
        # Check if user exists
        email = auth_data["email"]
        user_doc = await db.users.find_one({"email": email}, {"_id": 0})
        
        # Determine if admin
        is_admin = email == "marnichr@gmail.com"
        
        if not user_doc:
            # Create new user
            user_id = f"user_{uuid.uuid4().hex[:12]}"
            user_data = {
                "user_id": user_id,
                "email": email,
                "name": auth_data.get("name", ""),
                "picture": auth_data.get("picture", ""),
                "role": "admin" if is_admin else "buyer",
                "is_admin": is_admin,
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            await db.users.insert_one(user_data)
        else:
            user_id = user_doc["user_id"]
            # Update user if needed
            update_data = {
                "name": auth_data.get("name", user_doc.get("name", "")),
                "picture": auth_data.get("picture", user_doc.get("picture", "")),
                "is_admin": is_admin,
                "role": "admin" if is_admin else user_doc.get("role", "buyer")
            }
            await db.users.update_one(
                {"user_id": user_id},
                {"$set": update_data}
            )
        
        # Create session
        session_token = auth_data["session_token"]
        expires_at = datetime.now(timezone.utc) + timedelta(days=7)
        
        session_data = {
            "user_id": user_id,
            "session_token": session_token,
            "expires_at": expires_at.isoformat(),
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        
        await db.user_sessions.insert_one(session_data)
        
        # Set cookie
        response.set_cookie(
            key="session_token",
            value=session_token,
            httponly=True,
            secure=True,
            samesite="none",
            path="/",
            max_age=7*24*60*60
        )
        
        # Return user data
        user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
        return User(**user)
    
    except Exception as e:
        logger.error(f"Session exchange error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/auth/me", response_model=User)
async def get_current_user(request: Request):
    """Get current authenticated user"""
    try:
        user = await get_user_from_token(request)
        if not user:
            raise HTTPException(status_code=401, detail="Not authenticated")
        return user
    except Exception as e:
        logger.error(f"Auth me error: {str(e)}")
        raise HTTPException(status_code=401, detail="Not authenticated")

@api_router.post("/auth/logout")
async def logout(request: Request, response: Response):
    """Logout user and clear session"""
    session_token = request.cookies.get("session_token")
    if session_token:
        await db.user_sessions.delete_one({"session_token": session_token})
    
    response.delete_cookie(key="session_token", path="/")
    return {"message": "Logged out successfully"}

# Terms & Conditions Endpoint
@api_router.get("/terms")
async def get_terms():
    """Get terms and conditions content"""
    terms_content = """
# TrustTrade Terms & Conditions

## 1. Service Description
TrustTrade is a neutral escrow payment facilitator. TrustTrade does not take possession, ownership, or control of goods sold between users.

## 2. Item Responsibility
TrustTrade does not guarantee the condition, authenticity, legality, or performance of any item listed. Users are fully responsible for ensuring item descriptions are accurate and truthful.

## 3. Dispute Resolution
In the event of a dispute, TrustTrade may review evidence submitted by both parties and make a decision at its sole discretion.

## 4. Liability Limitation
TrustTrade's total liability is limited to the transaction fee charged (2% of item price).

## 5. Account Suspension
TrustTrade reserves the right to suspend accounts engaged in fraudulent or abusive behavior. Users who receive 3 valid disputes may have their accounts flagged for review.

## 6. Legal Compliance
All users agree to comply with South African law and regulations.

## 7. Acceptance
By using TrustTrade services, you agree to these terms and conditions.
"""
    return {"content": terms_content}

@api_router.post("/users/accept-terms")
async def accept_terms(request: Request, acceptance: TermsAcceptance):
    """User accepts terms and conditions"""
    user = await get_user_from_token(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    if acceptance.accepted:
        await db.users.update_one(
            {"user_id": user.user_id},
            {"$set": {
                "terms_accepted": True,
                "terms_accepted_at": datetime.now(timezone.utc).isoformat()
            }}
        )
        return {"message": "Terms accepted"}
    else:
        raise HTTPException(status_code=400, detail="Terms must be accepted")

# File Upload Endpoints
@api_router.post("/upload/photo")
async def upload_photo(request: Request, file: UploadFile = File(...)):
    """Upload a photo for transaction or dispute"""
    user = await get_user_from_token(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Validate file type
    allowed_extensions = {".jpg", ".jpeg", ".png", ".webp"}
    file_ext = Path(file.filename).suffix.lower()
    if file_ext not in allowed_extensions:
        raise HTTPException(status_code=400, detail="Only image files allowed (jpg, png, webp)")
    
    # Validate file size (5MB max)
    file.file.seek(0, 2)
    file_size = file.file.tell()
    file.file.seek(0)
    if file_size > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File size must be less than 5MB")
    
    # Generate unique filename
    unique_filename = f"{uuid.uuid4().hex}{file_ext}"
    file_path = Path("/app/uploads/photos") / unique_filename
    
    # Save file
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    return {"filename": unique_filename, "path": str(file_path)}

@api_router.post("/upload/dispute-evidence")
async def upload_dispute_evidence(request: Request, file: UploadFile = File(...)):
    """Upload evidence photo for dispute"""
    user = await get_user_from_token(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Validate file type
    allowed_extensions = {".jpg", ".jpeg", ".png", ".webp"}
    file_ext = Path(file.filename).suffix.lower()
    if file_ext not in allowed_extensions:
        raise HTTPException(status_code=400, detail="Only image files allowed")
    
    # Validate file size
    file.file.seek(0, 2)
    file_size = file.file.tell()
    file.file.seek(0)
    if file_size > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File size must be less than 5MB")
    
    # Generate unique filename
    unique_filename = f"{uuid.uuid4().hex}{file_ext}"
    file_path = Path("/app/uploads/disputes") / unique_filename
    
    # Save file
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    return {"filename": unique_filename, "path": str(file_path)}

# Transaction Endpoints
@api_router.post("/transactions", response_model=Transaction, status_code=201)
async def create_transaction(request: Request, transaction_data: TransactionCreate):
    """Create a new transaction"""
    user = await get_user_from_token(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Check if user is suspended
    if user.suspension_flag:
        raise HTTPException(status_code=403, detail="Account suspended. Contact admin.")
    
    # Validate minimum transaction amount (R150)
    if transaction_data.item_price < MINIMUM_TRANSACTION_AMOUNT:
        raise HTTPException(
            status_code=400, 
            detail=f"Minimum transaction amount is R{MINIMUM_TRANSACTION_AMOUNT:.0f}"
        )
    
    # Calculate fees (2% platform fee)
    item_price = transaction_data.item_price
    trusttrade_fee = round(item_price * (PLATFORM_FEE_PERCENT / 100), 2)
    total = round(item_price + trusttrade_fee, 2)
    
    transaction_id = f"txn_{uuid.uuid4().hex[:12]}"
    
    # Determine buyer and seller based on creator role
    if transaction_data.creator_role == "buyer":
        buyer_user_id = user.user_id
        buyer_name = user.name
        buyer_email = user.email
        seller_user_id = None
        seller_name = transaction_data.seller_name
        seller_email = transaction_data.seller_email
    else:  # creator_role == "seller"
        seller_user_id = user.user_id
        seller_name = user.name
        seller_email = user.email
        buyer_user_id = None
        buyer_name = transaction_data.buyer_name
        buyer_email = transaction_data.buyer_email
    
    # Initialize timeline
    timeline = [{
        "status": "Transaction Created",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "by": user.name
    }]
    
    # Generate unique share code
    share_code = generate_share_code()
    # Ensure uniqueness
    while await db.transactions.find_one({"share_code": share_code}):
        share_code = generate_share_code()
    
    # Assess transaction risk
    risk_assessment = await assess_transaction_risk(user, item_price)
    
    # Add risk warning to timeline if medium/high risk
    if risk_assessment.risk_level in ["medium", "high"]:
        timeline.append({
            "status": f"Risk Assessment: {risk_assessment.risk_level.upper()}",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "by": "TrustTrade System",
            "details": risk_assessment.warnings
        })
    
    # Determine auto-release days based on delivery method
    delivery_method = transaction_data.delivery_method
    if delivery_method == "courier":
        auto_release_days = 3  # 3 days after delivery confirmation
    elif delivery_method == "bank_deposit":
        auto_release_days = 2  # 2 days after payment confirmation
    elif delivery_method == "digital":
        auto_release_days = 0  # Immediate release after confirmation
    else:
        auto_release_days = 3  # Default to courier
    
    transaction = {
        "transaction_id": transaction_id,
        "share_code": share_code,
        "creator_role": transaction_data.creator_role,
        "buyer_user_id": buyer_user_id,
        "seller_user_id": seller_user_id,
        "buyer_name": buyer_name,
        "buyer_email": buyer_email,
        "seller_name": seller_name,
        "seller_email": seller_email,
        "item_description": transaction_data.item_description,
        "item_condition": transaction_data.item_condition,
        "known_issues": transaction_data.known_issues,
        "item_photos": [],
        "item_price": item_price,
        "trusttrade_fee": trusttrade_fee,
        "total": total,
        "fee_paid_by": transaction_data.fee_paid_by,
        "delivery_method": delivery_method,
        "auto_release_days": auto_release_days,
        "payment_status": "Pending Seller Confirmation" if transaction_data.creator_role == "buyer" else "Pending Buyer Confirmation",
        "seller_confirmed": False,
        "delivery_confirmed": False,
        "release_status": "Not Released",
        "buyer_details_confirmed": transaction_data.buyer_details_confirmed,
        "seller_details_confirmed": transaction_data.seller_details_confirmed,
        "item_accuracy_confirmed": transaction_data.item_accuracy_confirmed,
        "risk_level": risk_assessment.risk_level,
        "risk_flags": risk_assessment.flags,
        "timeline": timeline,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.transactions.insert_one(transaction)
    
    # Get base URL for email links
    base_url = os.environ.get('FRONTEND_URL', 'https://trusttradesa.co.za')
    
    # Send transaction created emails via Brevo
    await send_transaction_created_email(
        to_email=buyer_email,
        to_name=buyer_name,
        share_code=share_code,
        item_description=transaction_data.item_description,
        amount=item_price,
        other_party_name=seller_name,
        role="Buyer",
        base_url=base_url
    )
    await send_transaction_created_email(
        to_email=seller_email,
        to_name=seller_name,
        share_code=share_code,
        item_description=transaction_data.item_description,
        amount=item_price,
        other_party_name=buyer_name,
        role="Seller",
        base_url=base_url
    )
    
    return Transaction(**transaction)

@api_router.get("/transactions", response_model=List[Transaction])
async def list_transactions(request: Request):
    """List transactions for current user (or all for admin)"""
    user = await get_user_from_token(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Admin sees all
    if user.is_admin:
        query = {}
    else:
        # Users see only their transactions
        query = {
            "$or": [
                {"buyer_user_id": user.user_id},
                {"buyer_email": user.email},
                {"seller_email": user.email}
            ]
        }
    
    transactions = await db.transactions.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return [Transaction(**t) for t in transactions]

@api_router.get("/transactions/{transaction_id}", response_model=Transaction)
async def get_transaction(request: Request, transaction_id: str):
    """Get transaction details"""
    user = await get_user_from_token(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    transaction = await db.transactions.find_one(
        {"transaction_id": transaction_id},
        {"_id": 0}
    )
    
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    # Check privacy
    if not user.is_admin:
        if (transaction.get("buyer_user_id") != user.user_id and
            transaction.get("buyer_email") != user.email and
            transaction.get("seller_email") != user.email):
            raise HTTPException(status_code=403, detail="Access denied")
    
    # Generate share_code for old transactions that don't have one
    if not transaction.get("share_code"):
        share_code = generate_share_code()
        while await db.transactions.find_one({"share_code": share_code}):
            share_code = generate_share_code()
        await db.transactions.update_one(
            {"transaction_id": transaction_id},
            {"$set": {"share_code": share_code}}
        )
        transaction["share_code"] = share_code
    
    return Transaction(**transaction)

class TransactionPreview(BaseModel):
    """Limited transaction info for share link preview"""
    share_code: str
    transaction_id: str
    item_description: str
    item_price: float
    trusttrade_fee: float
    total: float
    fee_paid_by: str
    payment_status: str
    buyer_name: str
    seller_name: str
    item_condition: Optional[str] = None
    created_at: str

@api_router.get("/share/{share_code}", response_model=TransactionPreview)
async def get_transaction_by_share_code(share_code: str):
    """Get transaction preview by share code - requires auth to view full details"""
    transaction = await db.transactions.find_one(
        {"share_code": share_code},
        {"_id": 0}
    )
    
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    return TransactionPreview(
        share_code=transaction["share_code"],
        transaction_id=transaction["transaction_id"],
        item_description=transaction["item_description"],
        item_price=transaction["item_price"],
        trusttrade_fee=transaction["trusttrade_fee"],
        total=transaction["total"],
        fee_paid_by=transaction.get("fee_paid_by", "split"),
        payment_status=transaction["payment_status"],
        buyer_name=transaction["buyer_name"],
        seller_name=transaction["seller_name"],
        item_condition=transaction.get("item_condition"),
        created_at=transaction["created_at"]
    )

@api_router.post("/share/{share_code}/join")
async def join_transaction_by_share_code(request: Request, share_code: str):
    """Join a transaction via share code - links user to transaction"""
    user = await get_user_from_token(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    transaction = await db.transactions.find_one(
        {"share_code": share_code},
        {"_id": 0}
    )
    
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    # Check if user's email matches buyer or seller
    is_buyer = transaction.get("buyer_email") == user.email
    is_seller = transaction.get("seller_email") == user.email
    
    if not is_buyer and not is_seller:
        raise HTTPException(status_code=403, detail="Your email doesn't match this transaction")
    
    # Link user to transaction
    update_field = "buyer_user_id" if is_buyer else "seller_user_id"
    
    # Check if already linked
    if transaction.get(update_field):
        # Already linked, just return success
        return {"message": "Already joined", "transaction_id": transaction["transaction_id"], "role": "buyer" if is_buyer else "seller"}
    
    # Update timeline
    timeline = transaction.get("timeline", [])
    timeline.append({
        "status": f"{'Buyer' if is_buyer else 'Seller'} Joined via Share Link",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "by": user.name
    })
    
    await db.transactions.update_one(
        {"share_code": share_code},
        {"$set": {update_field: user.user_id, "timeline": timeline}}
    )
    
    return {"message": "Successfully joined transaction", "transaction_id": transaction["transaction_id"], "role": "buyer" if is_buyer else "seller"}

@api_router.patch("/transactions/{transaction_id}/photos")
async def update_transaction_photos(request: Request, transaction_id: str, photo_filenames: List[str]):
    """Update transaction with uploaded photo filenames"""
    user = await get_user_from_token(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    transaction = await db.transactions.find_one(
        {"transaction_id": transaction_id},
        {"_id": 0}
    )
    
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    # Only creator can update photos
    creator_role = transaction.get("creator_role")
    if creator_role == "buyer" and transaction.get("buyer_user_id") != user.user_id:
        raise HTTPException(status_code=403, detail="Only transaction creator can add photos")
    if creator_role == "seller" and transaction.get("seller_user_id") != user.user_id:
        raise HTTPException(status_code=403, detail="Only transaction creator can add photos")
    
    await db.transactions.update_one(
        {"transaction_id": transaction_id},
        {"$set": {"item_photos": photo_filenames}}
    )
    
    return {"message": "Photos updated successfully"}

@api_router.post("/transactions/{transaction_id}/seller-confirm")
async def seller_confirm_transaction(request: Request, transaction_id: str, confirmation: SellerConfirmation):
    """Seller confirms transaction details"""
    user = await get_user_from_token(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    transaction = await db.transactions.find_one(
        {"transaction_id": transaction_id},
        {"_id": 0}
    )
    
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    # Only seller can confirm
    if transaction.get("seller_email") != user.email:
        raise HTTPException(status_code=403, detail="Only seller can confirm transaction")
    
    if confirmation.confirmed:
        # Update timeline
        timeline = transaction.get("timeline", [])
        timeline.append({
            "status": "Seller Confirmed",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "by": user.name
        })
        
        # Generate escrow agreement PDF
        pdf_filename = f"agreement_{transaction_id}.pdf"
        pdf_path = Path("/app/uploads/pdfs") / pdf_filename
        
        try:
            generate_escrow_agreement_pdf(transaction, str(pdf_path))
        except Exception as e:
            logger.error(f"PDF generation failed: {str(e)}")
        
        await db.transactions.update_one(
            {"transaction_id": transaction_id},
            {"$set": {
                "seller_confirmed": True,
                "seller_confirmed_at": datetime.now(timezone.utc).isoformat(),
                "payment_status": "Ready for Payment",
                "agreement_pdf_path": pdf_filename if pdf_path.exists() else None,
                "timeline": timeline
            }}
        )
        
        # Mock email notifications
        mock_send_email(
            transaction["buyer_email"],
            "Seller Confirmed Transaction",
            f"Transaction {transaction_id} has been confirmed by seller. Escrow agreement is ready."
        )
        
        return {"message": "Transaction confirmed", "agreement_pdf": pdf_filename if pdf_path.exists() else None}
    
    return {"message": "Confirmation cancelled"}

@api_router.get("/transactions/{transaction_id}/agreement-pdf")
async def download_agreement_pdf(request: Request, transaction_id: str):
    """Download escrow agreement PDF"""
    user = await get_user_from_token(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    transaction = await db.transactions.find_one(
        {"transaction_id": transaction_id},
        {"_id": 0}
    )
    
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    # Check privacy
    if not user.is_admin:
        if (transaction.get("buyer_email") != user.email and
            transaction.get("seller_email") != user.email):
            raise HTTPException(status_code=403, detail="Access denied")
    
    pdf_filename = transaction.get("agreement_pdf_path")
    if not pdf_filename:
        raise HTTPException(status_code=404, detail="Agreement PDF not generated yet")
    
    pdf_path = Path("/app/uploads/pdfs") / pdf_filename
    if not pdf_path.exists():
        raise HTTPException(status_code=404, detail="PDF file not found")
    
    return FileResponse(
        path=str(pdf_path),
        media_type="application/pdf",
        filename=f"TrustTrade_Agreement_{transaction_id}.pdf"
    )

@api_router.patch("/transactions/{transaction_id}/delivery")
async def confirm_delivery(request: Request, transaction_id: str, update_data: TransactionUpdate):
    """Confirm delivery and release funds - only allowed after payment is confirmed"""
    user = await get_user_from_token(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    transaction = await db.transactions.find_one(
        {"transaction_id": transaction_id},
        {"_id": 0}
    )
    
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    # Only buyer can confirm
    if transaction["buyer_user_id"] != user.user_id and transaction["buyer_email"] != user.email:
        raise HTTPException(status_code=403, detail="Only buyer can confirm delivery")
    
    # Check that payment has been made
    if transaction.get("payment_status") != "Paid":
        raise HTTPException(status_code=400, detail="Cannot confirm delivery before payment is received")
    
    if update_data.delivery_confirmed:
        # Update timeline
        timeline = transaction.get("timeline", [])
        timeline.append({
            "status": "Delivery Confirmed & Funds Released",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "by": user.name
        })
        
        await db.transactions.update_one(
            {"transaction_id": transaction_id},
            {"$set": {
                "delivery_confirmed": True,
                "release_status": "Released",
                "payment_status": "Released",
                "timeline": timeline
            }}
        )
        
        # Calculate net amount after fee
        net_amount = transaction["item_price"] - (transaction["item_price"] * 0.02)
        
        # Send funds released email via Brevo
        await send_funds_released_email(
            to_email=transaction["seller_email"],
            to_name=transaction["seller_name"],
            share_code=transaction.get("share_code", transaction_id),
            item_description=transaction["item_description"],
            amount=transaction["item_price"],
            net_amount=net_amount
        )
        
        # Send delivery confirmed email to buyer
        await send_delivery_confirmed_email(
            to_email=transaction["buyer_email"],
            to_name=transaction["buyer_name"],
            share_code=transaction.get("share_code", transaction_id),
            item_description=transaction["item_description"],
            role="buyer"
        )
    
    updated_transaction = await db.transactions.find_one(
        {"transaction_id": transaction_id},
        {"_id": 0}
    )
    
    return Transaction(**updated_transaction)

class PaymentConfirmation(BaseModel):
    confirmed: bool

@api_router.post("/transactions/{transaction_id}/confirm-payment")
async def confirm_payment(request: Request, transaction_id: str, payment: PaymentConfirmation):
    """Mark transaction as paid (admin only for now - would be payment gateway in production)"""
    user = await get_user_from_token(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Only admin can confirm payment (in production this would be done by payment gateway)
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Only admin can confirm payment")
    
    transaction = await db.transactions.find_one(
        {"transaction_id": transaction_id},
        {"_id": 0}
    )
    
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    if not transaction.get("seller_confirmed"):
        raise HTTPException(status_code=400, detail="Seller must confirm transaction first")
    
    if payment.confirmed:
        # Calculate auto-release time (48 hours from now)
        auto_release_at = (datetime.now(timezone.utc) + timedelta(hours=48)).isoformat()
        
        # Update timeline
        timeline = transaction.get("timeline", [])
        timeline.append({
            "status": "Payment Received in Escrow",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "by": "TrustTrade System"
        })
        timeline.append({
            "status": "Auto-Release Timer Started (48 hours)",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "by": "TrustTrade System"
        })
        
        await db.transactions.update_one(
            {"transaction_id": transaction_id},
            {"$set": {
                "payment_status": "Paid",
                "auto_release_at": auto_release_at,
                "timeline": timeline
            }}
        )
        
        # Send payment received emails via Brevo
        await send_payment_received_email(
            to_email=transaction["buyer_email"],
            to_name=transaction["buyer_name"],
            share_code=transaction.get("share_code", transaction_id),
            item_description=transaction["item_description"],
            amount=transaction["item_price"],
            role="buyer"
        )
        
        await send_payment_received_email(
            to_email=transaction["seller_email"],
            to_name=transaction["seller_name"],
            share_code=transaction.get("share_code", transaction_id),
            item_description=transaction["item_description"],
            amount=transaction["item_price"],
            role="seller"
        )
        
        return {"message": "Payment confirmed", "status": "Paid", "auto_release_at": auto_release_at}
    
    return {"message": "Payment not confirmed"}

@api_router.post("/transactions/{transaction_id}/rate")
async def rate_transaction(request: Request, transaction_id: str, rating_data: RatingSubmit):
    """Submit rating for completed transaction"""
    user = await get_user_from_token(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    transaction = await db.transactions.find_one({"transaction_id": transaction_id}, {"_id": 0})
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    # Check if transaction is completed
    if not transaction.get("delivery_confirmed"):
        raise HTTPException(status_code=400, detail="Cannot rate incomplete transaction")
    
    # Determine if user is buyer or seller
    is_buyer = transaction.get("buyer_user_id") == user.user_id or transaction.get("buyer_email") == user.email
    is_seller = transaction.get("seller_user_id") == user.user_id or transaction.get("seller_email") == user.email
    
    if not is_buyer and not is_seller:
        raise HTTPException(status_code=403, detail="Not part of this transaction")
    
    # Update rating
    if is_buyer:
        if transaction.get("buyer_rating"):
            raise HTTPException(status_code=400, detail="Already rated")
        await db.transactions.update_one(
            {"transaction_id": transaction_id},
            {"$set": {"buyer_rating": rating_data.rating, "buyer_review": rating_data.review}}
        )
        # Update seller's average rating
        seller_email = transaction["seller_email"]
        await update_user_rating(seller_email, rating_data.rating)
    else:
        if transaction.get("seller_rating"):
            raise HTTPException(status_code=400, detail="Already rated")
        await db.transactions.update_one(
            {"transaction_id": transaction_id},
            {"$set": {"seller_rating": rating_data.rating, "seller_review": rating_data.review}}
        )
        # Update buyer's average rating
        buyer_email = transaction["buyer_email"]
        await update_user_rating(buyer_email, rating_data.rating)
    
    return {"message": "Rating submitted", "rating": rating_data.rating}

async def update_user_rating(email: str, new_rating: int):
    """Recalculate user's average rating"""
    user_doc = await db.users.find_one({"email": email}, {"_id": 0})
    if not user_doc:
        return
    
    # Count ratings
    buyer_ratings = await db.transactions.count_documents({"buyer_email": email, "seller_rating": {"$exists": True}})
    seller_ratings = await db.transactions.count_documents({"seller_email": email, "buyer_rating": {"$exists": True}})
    
    # Calculate average
    buyer_ratings_pipeline = db.transactions.find({"buyer_email": email, "seller_rating": {"$exists": True}}, {"_id": 0, "seller_rating": 1})
    seller_ratings_pipeline = db.transactions.find({"seller_email": email, "buyer_rating": {"$exists": True}}, {"_id": 0, "buyer_rating": 1})
    
    total_rating = 0
    count = 0
    async for txn in buyer_ratings_pipeline:
        total_rating += txn.get("seller_rating", 0)
        count += 1
    async for txn in seller_ratings_pipeline:
        total_rating += txn.get("buyer_rating", 0)
        count += 1
    
    avg_rating = round(total_rating / count, 1) if count > 0 else 0.0
    
    # Update user with new stats
    await db.users.update_one(
        {"email": email},
        {"$set": {
            "average_rating": avg_rating,
            "total_trades": count,
            "successful_trades": count
        }}
    )
    
    # Award badges
    badges = []
    if count >= 3:
        badges.append("Silver")
    if count >= 10:
        badges.append("Gold")
    if user_doc.get("verified"):
        badges.append("Verified")
    
    await db.users.update_one({"email": email}, {"$set": {"badges": badges}})

# Dispute Endpoints
@api_router.post("/disputes", response_model=Dispute, status_code=201)
async def create_dispute(request: Request, dispute_data: DisputeCreate):
    """Create a new dispute"""
    user = await get_user_from_token(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Verify transaction access
    transaction = await db.transactions.find_one(
        {"transaction_id": dispute_data.transaction_id},
        {"_id": 0}
    )
    
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    if not user.is_admin:
        if (transaction.get("buyer_user_id") != user.user_id and
            transaction.get("buyer_email") != user.email and
            transaction.get("seller_email") != user.email):
            raise HTTPException(status_code=403, detail="Access denied")
    
    dispute_id = f"disp_{uuid.uuid4().hex[:12]}"
    
    dispute = {
        "dispute_id": dispute_id,
        "transaction_id": dispute_data.transaction_id,
        "raised_by_user_id": user.user_id,
        "dispute_type": dispute_data.dispute_type,
        "description": dispute_data.description,
        "evidence_photos": [],  # Will be updated separately
        "status": "Pending",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.disputes.insert_one(dispute)
    
    # Send dispute opened email to both parties via Brevo
    # Determine the other party
    is_buyer = transaction.get("buyer_user_id") == user.user_id or transaction.get("buyer_email") == user.email
    
    if is_buyer:
        # Notify seller
        await send_dispute_opened_email(
            to_email=transaction["seller_email"],
            to_name=transaction["seller_name"],
            share_code=transaction.get("share_code", dispute_data.transaction_id),
            dispute_type=dispute_data.dispute_type,
            description=dispute_data.description
        )
    else:
        # Notify buyer
        await send_dispute_opened_email(
            to_email=transaction["buyer_email"],
            to_name=transaction["buyer_name"],
            share_code=transaction.get("share_code", dispute_data.transaction_id),
            dispute_type=dispute_data.dispute_type,
            description=dispute_data.description
        )
    
    return Dispute(**dispute)

@api_router.patch("/disputes/{dispute_id}/evidence")
async def update_dispute_evidence(request: Request, dispute_id: str, evidence_filenames: List[str]):
    """Update dispute with evidence photo filenames"""
    user = await get_user_from_token(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    dispute = await db.disputes.find_one(
        {"dispute_id": dispute_id},
        {"_id": 0}
    )
    
    if not dispute:
        raise HTTPException(status_code=404, detail="Dispute not found")
    
    # Only dispute creator can add evidence
    if dispute["raised_by_user_id"] != user.user_id:
        raise HTTPException(status_code=403, detail="Only dispute creator can add evidence")
    
    await db.disputes.update_one(
        {"dispute_id": dispute_id},
        {"$set": {"evidence_photos": evidence_filenames}}
    )
    
    return {"message": "Evidence updated successfully"}

@api_router.get("/disputes", response_model=List[Dispute])
async def list_disputes(request: Request):
    """List disputes for current user (or all for admin)"""
    user = await get_user_from_token(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    if user.is_admin:
        query = {}
    else:
        # Get user's transactions
        user_transactions = await db.transactions.find(
            {
                "$or": [
                    {"buyer_user_id": user.user_id},
                    {"buyer_email": user.email},
                    {"seller_email": user.email}
                ]
            },
            {"_id": 0}
        ).to_list(1000)
        
        transaction_ids = [t["transaction_id"] for t in user_transactions]
        query = {"transaction_id": {"$in": transaction_ids}}
    
    disputes = await db.disputes.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return [Dispute(**d) for d in disputes]

@api_router.patch("/disputes/{dispute_id}")
async def update_dispute(request: Request, dispute_id: str, update_data: DisputeUpdate):
    """Update dispute status (admin only)"""
    user = await get_user_from_token(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")
    
    update_fields = {"status": update_data.status}
    
    # Handle admin decision
    if update_data.admin_decision:
        update_fields["admin_decision"] = update_data.admin_decision
    
    # Handle valid dispute marking
    if update_data.is_valid_dispute is not None:
        update_fields["is_valid_dispute"] = update_data.is_valid_dispute
        
        # If marking as valid, increment user's dispute count
        if update_data.is_valid_dispute:
            dispute = await db.disputes.find_one({"dispute_id": dispute_id}, {"_id": 0})
            if dispute:
                raised_by_user_id = dispute["raised_by_user_id"]
                
                # Increment valid disputes count
                user_result = await db.users.find_one_and_update(
                    {"user_id": raised_by_user_id},
                    {"$inc": {"valid_disputes_count": 1}},
                    return_document=True,
                    projection={"_id": 0}
                )
                
                # Check if should suspend (3 or more valid disputes)
                if user_result and user_result.get("valid_disputes_count", 0) >= 3:
                    await db.users.update_one(
                        {"user_id": raised_by_user_id},
                        {"$set": {"suspension_flag": True}}
                    )
                    logger.info(f"User {raised_by_user_id} flagged for suspension (3+ valid disputes)")
    
    result = await db.disputes.update_one(
        {"dispute_id": dispute_id},
        {"$set": update_fields}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Dispute not found")
    
    updated_dispute = await db.disputes.find_one(
        {"dispute_id": dispute_id},
        {"_id": 0}
    )
    
    return Dispute(**updated_dispute)

# User Profile Endpoint
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

@api_router.get("/users/{user_id}/profile", response_model=UserProfile)
async def get_user_profile(request: Request, user_id: str):
    """Get public user profile"""
    current_user = await get_user_from_token(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Calculate trust score if not set
    trust_score = user_doc.get("trust_score", 50)
    
    # Recalculate trust score dynamically
    successful_trades = user_doc.get("successful_trades", 0)
    average_rating = user_doc.get("average_rating", 0.0)
    valid_disputes = user_doc.get("valid_disputes_count", 0)
    is_verified = user_doc.get("verified", False)
    
    # Trust score formula: max 100
    # - Transaction history: up to 40 points (4 points per successful trade, max 10 trades)
    # - User ratings: up to 30 points (6 points per star)
    # - Dispute record: up to 20 points (starts at 20, -5 per valid dispute)
    # - Verification: 10 points
    
    trade_score = min(40, successful_trades * 4)
    rating_score = int(average_rating * 6)
    dispute_score = max(0, 20 - valid_disputes * 5)
    verification_score = 10 if is_verified else 0
    
    calculated_trust_score = trade_score + rating_score + dispute_score + verification_score
    
    # Update trust score in database if changed
    if calculated_trust_score != trust_score:
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"trust_score": calculated_trust_score}}
        )
        trust_score = calculated_trust_score
    
    return UserProfile(
        user_id=user_doc["user_id"],
        name=user_doc.get("name", ""),
        email=user_doc.get("email", ""),
        picture=user_doc.get("picture"),
        trust_score=trust_score,
        total_trades=user_doc.get("total_trades", 0),
        successful_trades=user_doc.get("successful_trades", 0),
        average_rating=user_doc.get("average_rating", 0.0),
        valid_disputes_count=user_doc.get("valid_disputes_count", 0),
        badges=user_doc.get("badges", []),
        verified=user_doc.get("verified", False),
        suspended=user_doc.get("suspension_flag", False),
        created_at=user_doc.get("created_at", datetime.now(timezone.utc).isoformat())
    )

# Report User Endpoints
@api_router.post("/reports", response_model=UserReport)
async def create_report(request: Request, report_data: UserReportCreate):
    """Create a user report"""
    user = await get_user_from_token(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Cannot report yourself
    if report_data.reported_user_id == user.user_id:
        raise HTTPException(status_code=400, detail="Cannot report yourself")
    
    # Check if reported user exists
    reported_user = await db.users.find_one({"user_id": report_data.reported_user_id})
    if not reported_user:
        raise HTTPException(status_code=404, detail="Reported user not found")
    
    # Create report
    report_id = f"report_{uuid.uuid4().hex[:12]}"
    report = {
        "report_id": report_id,
        "reporter_user_id": user.user_id,
        "reported_user_id": report_data.reported_user_id,
        "reason": report_data.reason,
        "description": report_data.description,
        "transaction_id": report_data.transaction_id,
        "status": "Pending",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.reports.insert_one(report)
    
    # Notify admin (mock email)
    admin = await db.users.find_one({"is_admin": True})
    if admin:
        mock_send_email(
            admin.get("email", "admin@trusttrade.co.za"),
            "New User Report",
            f"User {user.name} reported {reported_user.get('name', 'Unknown')} for: {report_data.reason}"
        )
    
    return UserReport(**report)

@api_router.get("/reports", response_model=List[UserReport])
async def list_reports(request: Request):
    """List reports (admin only)"""
    user = await get_user_from_token(request)
    if not user or not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")
    
    reports = await db.reports.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return [UserReport(**r) for r in reports]

@api_router.patch("/reports/{report_id}")
async def update_report(request: Request, report_id: str, status: str, admin_notes: Optional[str] = None):
    """Update report status (admin only)"""
    user = await get_user_from_token(request)
    if not user or not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")
    
    update_data = {"status": status}
    if admin_notes:
        update_data["admin_notes"] = admin_notes
    
    result = await db.reports.update_one(
        {"report_id": report_id},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Report not found")
    
    return {"message": "Report updated"}

# Identity Verification Endpoints
class VerificationStatus(BaseModel):
    id_verified: bool = False
    id_document_path: Optional[str] = None
    selfie_verified: bool = False
    selfie_path: Optional[str] = None
    phone_verified: bool = False
    phone_number: Optional[str] = None
    fully_verified: bool = False

class PhoneOtpRequest(BaseModel):
    phone_number: str

class PhoneOtpVerify(BaseModel):
    phone_number: str
    otp: str

# Store OTPs temporarily (in production use Redis)
otp_store = {}

# Risk Assessment Endpoints
@api_router.get("/risk/user/{user_id}")
async def get_user_risk_assessment(request: Request, user_id: str):
    """Get risk assessment for a user (admin or self only)"""
    current_user = await get_user_from_token(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Only admin or the user themselves can see risk assessment
    if not current_user.is_admin and current_user.user_id != user_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    assessment = await assess_user_risk(user_id)
    return assessment

@api_router.get("/admin/flagged-users")
async def get_flagged_users(request: Request):
    """Get users with high risk scores (admin only)"""
    user = await get_user_from_token(request)
    if not user or not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")
    
    # Find users with issues
    flagged = []
    
    # Users with multiple valid disputes
    dispute_users = await db.users.find(
        {"valid_disputes_count": {"$gte": 2}},
        {"_id": 0, "user_id": 1, "name": 1, "email": 1, "valid_disputes_count": 1, "trust_score": 1}
    ).to_list(100)
    
    for u in dispute_users:
        assessment = await assess_user_risk(u["user_id"])
        flagged.append({
            **u,
            "risk_level": assessment.risk_level,
            "risk_score": assessment.risk_score,
            "flags": assessment.flags,
            "warnings": assessment.warnings
        })
    
    # Users with multiple reports
    reported_users = await db.reports.aggregate([
        {"$match": {"status": {"$ne": "Dismissed"}}},
        {"$group": {"_id": "$reported_user_id", "count": {"$sum": 1}}},
        {"$match": {"count": {"$gte": 2}}}
    ]).to_list(100)
    
    for r in reported_users:
        if not any(f["user_id"] == r["_id"] for f in flagged):
            user_doc = await db.users.find_one({"user_id": r["_id"]}, {"_id": 0, "user_id": 1, "name": 1, "email": 1, "trust_score": 1})
            if user_doc:
                assessment = await assess_user_risk(r["_id"])
                flagged.append({
                    **user_doc,
                    "reports_count": r["count"],
                    "risk_level": assessment.risk_level,
                    "risk_score": assessment.risk_score,
                    "flags": assessment.flags,
                    "warnings": assessment.warnings
                })
    
    return sorted(flagged, key=lambda x: x.get("risk_score", 0), reverse=True)

@api_router.get("/admin/flagged-transactions")
async def get_flagged_transactions(request: Request):
    """Get transactions with risk flags (admin only)"""
    user = await get_user_from_token(request)
    if not user or not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")
    
    # Find transactions with medium or high risk
    flagged = await db.transactions.find(
        {"risk_level": {"$in": ["medium", "high"]}},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    
    return [Transaction(**t) for t in flagged]

@api_router.get("/verification/status", response_model=VerificationStatus)
async def get_verification_status(request: Request):
    """Get user's verification status"""
    user = await get_user_from_token(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
    
    verification = user_doc.get("verification", {})
    
    return VerificationStatus(
        id_verified=verification.get("id_verified", False),
        id_document_path=verification.get("id_document_path"),
        selfie_verified=verification.get("selfie_verified", False),
        selfie_path=verification.get("selfie_path"),
        phone_verified=verification.get("phone_verified", False),
        phone_number=verification.get("phone_number"),
        fully_verified=user_doc.get("verified", False)
    )

@api_router.post("/verification/id")
async def upload_id_document(request: Request, file: UploadFile = File(...)):
    """Upload ID document for verification"""
    user = await get_user_from_token(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Validate file type (images and PDF allowed for ID)
    allowed_types = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp', 'image/gif', 'application/pdf']
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Please upload a valid photo (JPG, PNG) or PDF file")
    
    # Validate file size (max 5MB)
    max_size = 5 * 1024 * 1024  # 5MB
    contents = await file.read()
    if len(contents) > max_size:
        raise HTTPException(status_code=400, detail="File size must be less than 5MB")
    
    # Save file
    upload_dir = Path("/app/uploads/verification")
    upload_dir.mkdir(parents=True, exist_ok=True)
    
    file_ext = file.filename.split('.')[-1] if '.' in file.filename else 'jpg'
    file_path = upload_dir / f"id_{user.user_id}_{uuid.uuid4().hex[:8]}.{file_ext}"
    
    with open(file_path, "wb") as buffer:
        buffer.write(contents)
    
    # Update user verification status
    await db.users.update_one(
        {"user_id": user.user_id},
        {"$set": {
            "verification.id_verified": True,
            "verification.id_document_path": str(file_path),
            "verification.id_uploaded_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {"message": "ID document uploaded successfully", "status": "pending_review"}

@api_router.post("/verification/selfie")
async def upload_selfie(request: Request, file: UploadFile = File(...)):
    """Upload selfie for verification"""
    user = await get_user_from_token(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Validate file type (only images for selfie)
    allowed_types = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp', 'image/gif']
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Please upload a photo for your selfie")
    
    # Validate file size (max 5MB)
    max_size = 5 * 1024 * 1024  # 5MB
    contents = await file.read()
    if len(contents) > max_size:
        raise HTTPException(status_code=400, detail="File size must be less than 5MB")
    
    # Save file
    upload_dir = Path("/app/uploads/verification")
    upload_dir.mkdir(parents=True, exist_ok=True)
    
    file_ext = file.filename.split('.')[-1] if '.' in file.filename else 'jpg'
    file_path = upload_dir / f"selfie_{user.user_id}_{uuid.uuid4().hex[:8]}.{file_ext}"
    
    with open(file_path, "wb") as buffer:
        buffer.write(contents)
    
    # Update user verification status
    await db.users.update_one(
        {"user_id": user.user_id},
        {"$set": {
            "verification.selfie_verified": True,
            "verification.selfie_path": str(file_path),
            "verification.selfie_uploaded_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {"message": "Selfie uploaded successfully", "status": "pending_review"}

@api_router.post("/verification/phone/send-otp")
async def send_phone_otp(request: Request, data: PhoneOtpRequest):
    """Send OTP to phone number"""
    user = await get_user_from_token(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    phone = data.phone_number.replace(" ", "").replace("-", "")
    if len(phone) < 9:
        raise HTTPException(status_code=400, detail="Invalid phone number")
    
    # Generate OTP (in production, send via SMS service like Twilio)
    otp = ''.join(random.choices(string.digits, k=6))
    
    # Store OTP (expires in 10 minutes)
    otp_store[f"{user.user_id}_{phone}"] = {
        "otp": otp,
        "expires": datetime.now(timezone.utc) + timedelta(minutes=10)
    }
    
    # Mock SMS sending
    logger.info(f"MOCK SMS TO +27{phone}: Your TrustTrade verification code is {otp}")
    
    return {"message": "OTP sent successfully", "phone": f"+27{phone[:2]}****{phone[-2:]}"}

@api_router.post("/verification/phone/verify-otp")
async def verify_phone_otp(request: Request, data: PhoneOtpVerify):
    """Verify phone OTP"""
    user = await get_user_from_token(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    phone = data.phone_number.replace(" ", "").replace("-", "")
    key = f"{user.user_id}_{phone}"
    
    stored = otp_store.get(key)
    if not stored:
        raise HTTPException(status_code=400, detail="No OTP found. Please request a new code.")
    
    if datetime.now(timezone.utc) > stored["expires"]:
        del otp_store[key]
        raise HTTPException(status_code=400, detail="OTP expired. Please request a new code.")
    
    if stored["otp"] != data.otp:
        raise HTTPException(status_code=400, detail="Invalid OTP")
    
    # OTP verified - update user
    del otp_store[key]
    
    # Check if all verification steps are complete
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
    verification = user_doc.get("verification", {})
    
    all_verified = (
        verification.get("id_verified", False) and 
        verification.get("selfie_verified", False)
    )
    
    # Update user with phone verification and full verified status
    update_data = {
        "verification.phone_verified": True,
        "verification.phone_number": f"+27{phone}",
        "verification.phone_verified_at": datetime.now(timezone.utc).isoformat()
    }
    
    if all_verified:
        update_data["verified"] = True
        # Add Verified badge if not already present
        badges = user_doc.get("badges", [])
        if "Verified" not in badges:
            badges.append("Verified")
            update_data["badges"] = badges
    
    await db.users.update_one(
        {"user_id": user.user_id},
        {"$set": update_data}
    )
    
    return {"message": "Phone verified successfully", "fully_verified": all_verified}

# Admin Endpoints
@api_router.get("/admin/users")
async def list_all_users(request: Request):
    """List all users (admin only)"""
    user = await get_user_from_token(request)
    if not user or not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")
    
    users = await db.users.find({}, {"_id": 0}).to_list(1000)
    # Return raw data, not validated User objects to avoid validation errors
    return users

@api_router.get("/admin/transactions")
async def list_all_transactions_admin(request: Request):
    """List all transactions (admin only)"""
    user = await get_user_from_token(request)
    if not user or not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")
    
    transactions = await db.transactions.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    # Return raw data to avoid validation errors with old transactions
    return transactions

@api_router.get("/admin/disputes")
async def list_all_disputes_admin(request: Request):
    """List all disputes (admin only)"""
    user = await get_user_from_token(request)
    if not user or not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")
    
    disputes = await db.disputes.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    # Return raw data to avoid validation errors
    return disputes

@api_router.get("/admin/stats")
async def get_admin_stats(request: Request):
    """Get admin dashboard stats"""
    user = await get_user_from_token(request)
    if not user or not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")
    
    total_users = await db.users.count_documents({})
    total_transactions = await db.transactions.count_documents({})
    pending_transactions = await db.transactions.count_documents({"payment_status": "Pending"})
    pending_disputes = await db.disputes.count_documents({"status": "Pending"})
    
    return {
        "total_users": total_users,
        "total_transactions": total_transactions,
        "pending_transactions": pending_transactions,
        "pending_disputes": pending_disputes
    }

@api_router.get("/admin/escrow-details")
async def get_escrow_details(request: Request):
    """Get detailed escrow information per user and transaction (admin only)"""
    user = await get_user_from_token(request)
    if not user or not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")
    
    # Get all transactions with funds in escrow (Paid but not Released)
    escrow_transactions = await db.transactions.find(
        {"payment_status": "Paid", "release_status": "Not Released"},
        {"_id": 0}
    ).to_list(1000)
    
    # Calculate per-user escrow balances
    user_balances = {}
    
    for txn in escrow_transactions:
        buyer_email = txn.get("buyer_email")
        seller_email = txn.get("seller_email")
        
        # Calculate payable to seller based on fee_paid_by
        fee = txn.get("trusttrade_fee", 0)
        item_price = txn.get("item_price", 0)
        fee_paid_by = txn.get("fee_paid_by", "split")
        
        if fee_paid_by == "seller":
            payable_to_seller = item_price - fee
        elif fee_paid_by == "split":
            payable_to_seller = item_price - (fee / 2)
        else:  # buyer pays
            payable_to_seller = item_price
        
        # Track buyer's funds in escrow
        if buyer_email not in user_balances:
            user_balances[buyer_email] = {"as_buyer": 0, "as_seller": 0, "transactions": []}
        user_balances[buyer_email]["as_buyer"] += txn.get("total", 0)
        user_balances[buyer_email]["transactions"].append({
            "transaction_id": txn.get("transaction_id"),
            "share_code": txn.get("share_code"),
            "role": "buyer",
            "amount": txn.get("total", 0)
        })
        
        # Track seller's pending payable
        if seller_email not in user_balances:
            user_balances[seller_email] = {"as_buyer": 0, "as_seller": 0, "transactions": []}
        user_balances[seller_email]["as_seller"] += payable_to_seller
        user_balances[seller_email]["transactions"].append({
            "transaction_id": txn.get("transaction_id"),
            "share_code": txn.get("share_code"),
            "role": "seller",
            "payable": payable_to_seller
        })
    
    # Calculate totals
    total_in_escrow = sum(txn.get("total", 0) for txn in escrow_transactions)
    total_payable = sum(
        txn.get("item_price", 0) - (
            txn.get("trusttrade_fee", 0) if txn.get("fee_paid_by") == "seller"
            else txn.get("trusttrade_fee", 0) / 2 if txn.get("fee_paid_by") == "split"
            else 0
        )
        for txn in escrow_transactions
    )
    
    return {
        "total_in_escrow": total_in_escrow,
        "total_payable_to_sellers": total_payable,
        "platform_fees_earned": total_in_escrow - total_payable,
        "transactions_count": len(escrow_transactions),
        "user_balances": user_balances,
        "transactions": [
            {
                "transaction_id": t.get("transaction_id"),
                "share_code": t.get("share_code"),
                "buyer": t.get("buyer_name"),
                "seller": t.get("seller_name"),
                "total_in_escrow": t.get("total"),
                "item_price": t.get("item_price"),
                "fee": t.get("trusttrade_fee"),
                "fee_paid_by": t.get("fee_paid_by"),
                "payable_to_seller": t.get("item_price", 0) - (
                    t.get("trusttrade_fee", 0) if t.get("fee_paid_by") == "seller"
                    else t.get("trusttrade_fee", 0) / 2 if t.get("fee_paid_by") == "split"
                    else 0
                )
            }
            for t in escrow_transactions
        ]
    }


# ============ ADMIN ACTION ENDPOINTS ============

class AdminRefundRequest(BaseModel):
    reason: str = ""

@api_router.post("/admin/transactions/{transaction_id}/refund")
async def admin_refund_transaction(request: Request, transaction_id: str, refund_data: AdminRefundRequest):
    """Admin: Refund a transaction"""
    user = await get_user_from_token(request)
    if not user or not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")
    
    transaction = await db.transactions.find_one({"transaction_id": transaction_id}, {"_id": 0})
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    if transaction.get("payment_status") not in ["Paid", "Ready for Payment"]:
        raise HTTPException(status_code=400, detail="Transaction cannot be refunded in current state")
    
    # Update transaction status
    await db.transactions.update_one(
        {"transaction_id": transaction_id},
        {"$set": {
            "payment_status": "Refunded",
            "release_status": "Refunded",
            "refund_reason": refund_data.reason,
            "refunded_at": datetime.now(timezone.utc).isoformat(),
            "refunded_by": user.user_id
        }}
    )
    
    # Send refund email to buyer
    await send_refund_email(
        to_email=transaction["buyer_email"],
        to_name=transaction["buyer_name"],
        share_code=transaction.get("share_code", transaction_id),
        amount=transaction["total"],
        reason=refund_data.reason
    )
    
    return {"message": "Transaction refunded successfully", "transaction_id": transaction_id}


class AdminReleaseRequest(BaseModel):
    notes: str = ""

@api_router.post("/admin/transactions/{transaction_id}/release")
async def admin_release_funds(request: Request, transaction_id: str, release_data: AdminReleaseRequest):
    """Admin: Manually release funds to seller"""
    user = await get_user_from_token(request)
    if not user or not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")
    
    transaction = await db.transactions.find_one({"transaction_id": transaction_id}, {"_id": 0})
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    if transaction.get("release_status") == "Released":
        raise HTTPException(status_code=400, detail="Funds already released")
    
    # Calculate net amount
    fee = transaction.get("trusttrade_fee", 0)
    item_price = transaction.get("item_price", 0)
    fee_paid_by = transaction.get("fee_paid_by", "split")
    
    if fee_paid_by == "seller":
        net_amount = item_price - fee
    elif fee_paid_by == "split":
        net_amount = item_price - (fee / 2)
    else:
        net_amount = item_price
    
    # Update transaction status
    await db.transactions.update_one(
        {"transaction_id": transaction_id},
        {"$set": {
            "payment_status": "Released",
            "release_status": "Released",
            "delivery_confirmed": True,
            "released_at": datetime.now(timezone.utc).isoformat(),
            "released_by": user.user_id,
            "admin_release_notes": release_data.notes
        }}
    )
    
    # Send funds released email to seller
    await send_funds_released_email(
        to_email=transaction["seller_email"],
        to_name=transaction["seller_name"],
        share_code=transaction.get("share_code", transaction_id),
        item_description=transaction["item_description"],
        amount=item_price,
        net_amount=net_amount
    )
    
    return {"message": "Funds released successfully", "transaction_id": transaction_id, "net_amount": net_amount}


class AdminNotesRequest(BaseModel):
    notes: str

@api_router.post("/admin/transactions/{transaction_id}/notes")
async def admin_add_notes(request: Request, transaction_id: str, notes_data: AdminNotesRequest):
    """Admin: Add notes to a transaction"""
    user = await get_user_from_token(request)
    if not user or not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")
    
    transaction = await db.transactions.find_one({"transaction_id": transaction_id}, {"_id": 0})
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    # Append to existing notes
    existing_notes = transaction.get("admin_notes", [])
    new_note = {
        "note": notes_data.notes,
        "added_by": user.email,
        "added_at": datetime.now(timezone.utc).isoformat()
    }
    existing_notes.append(new_note)
    
    await db.transactions.update_one(
        {"transaction_id": transaction_id},
        {"$set": {"admin_notes": existing_notes}}
    )
    
    return {"message": "Notes added successfully", "notes": existing_notes}


class VerificationStatusUpdate(BaseModel):
    status: str  # "pending", "verified", "rejected"
    notes: str = ""

@api_router.post("/admin/users/{user_id}/verification")
async def admin_update_verification(request: Request, user_id: str, status_data: VerificationStatusUpdate):
    """Admin: Update user's ID verification status"""
    admin = await get_user_from_token(request)
    if not admin or not admin.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")
    
    target_user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    valid_statuses = ["pending", "verified", "rejected"]
    if status_data.status.lower() not in valid_statuses:
        raise HTTPException(status_code=400, detail="Invalid status")
    
    # Update user verification status
    update_data = {
        "verified": status_data.status.lower() == "verified",
        "verification_status": status_data.status.lower(),
        "verification_notes": status_data.notes,
        "verification_updated_at": datetime.now(timezone.utc).isoformat(),
        "verification_updated_by": admin.user_id
    }
    
    # Add verified badge if verified
    if status_data.status.lower() == "verified":
        await db.users.update_one(
            {"user_id": user_id},
            {"$addToSet": {"badges": "verified"}}
        )
    
    await db.users.update_one(
        {"user_id": user_id},
        {"$set": update_data}
    )
    
    # Send email notification
    await send_verification_status_email(
        to_email=target_user["email"],
        to_name=target_user["name"],
        status=status_data.status
    )
    
    return {"message": f"Verification status updated to {status_data.status}", "user_id": user_id}


class DisputeStatusUpdate(BaseModel):
    status: str  # "open", "under_review", "escalated", "resolved"
    resolution: str = ""
    admin_notes: str = ""

@api_router.patch("/admin/disputes/{dispute_id}")
async def admin_update_dispute(request: Request, dispute_id: str, status_data: DisputeStatusUpdate):
    """Admin: Update dispute status"""
    admin = await get_user_from_token(request)
    if not admin or not admin.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")
    
    dispute = await db.disputes.find_one({"dispute_id": dispute_id}, {"_id": 0})
    if not dispute:
        raise HTTPException(status_code=404, detail="Dispute not found")
    
    # Get linked transaction
    transaction = await db.transactions.find_one(
        {"transaction_id": dispute["transaction_id"]},
        {"_id": 0}
    )
    
    # Update dispute
    update_data = {
        "status": status_data.status.title().replace("_", " "),
        "admin_notes": status_data.admin_notes,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "updated_by": admin.user_id
    }
    
    if status_data.status.lower() == "resolved":
        update_data["resolution"] = status_data.resolution
        update_data["resolved_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.disputes.update_one(
        {"dispute_id": dispute_id},
        {"$set": update_data}
    )
    
    # Send emails to both parties if resolved
    if status_data.status.lower() == "resolved" and transaction:
        share_code = transaction.get("share_code", dispute["transaction_id"])
        
        await send_dispute_resolved_email(
            to_email=transaction["buyer_email"],
            to_name=transaction["buyer_name"],
            share_code=share_code,
            resolution=status_data.resolution,
            admin_notes=status_data.admin_notes
        )
        
        await send_dispute_resolved_email(
            to_email=transaction["seller_email"],
            to_name=transaction["seller_name"],
            share_code=share_code,
            resolution=status_data.resolution,
            admin_notes=status_data.admin_notes
        )
    
    return {"message": f"Dispute status updated to {status_data.status}", "dispute_id": dispute_id}


class AdminStatusOverride(BaseModel):
    status: str

@api_router.post("/admin/transactions/{transaction_id}/status")
async def admin_override_status(request: Request, transaction_id: str, status_data: AdminStatusOverride):
    """Admin: Override transaction payment status"""
    user = await get_user_from_token(request)
    if not user or not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")
    
    transaction = await db.transactions.find_one({"transaction_id": transaction_id}, {"_id": 0})
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    valid_statuses = [
        "Pending Seller Confirmation", "Pending Buyer Confirmation",
        "Ready for Payment", "Paid", "Released", "Refunded"
    ]
    
    if status_data.status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid_statuses}")
    
    # Update status
    update_data = {
        "payment_status": status_data.status,
        "status_overridden_at": datetime.now(timezone.utc).isoformat(),
        "status_overridden_by": user.user_id
    }
    
    # If setting to Released, also update release_status
    if status_data.status == "Released":
        update_data["release_status"] = "Released"
        update_data["delivery_confirmed"] = True
    
    await db.transactions.update_one(
        {"transaction_id": transaction_id},
        {"$set": update_data}
    )
    
    return {"message": f"Status overridden to {status_data.status}", "transaction_id": transaction_id}


class AdminSendEmail(BaseModel):
    to_email: str
    to_name: str
    subject: str
    body: str

@api_router.post("/admin/send-email")
async def admin_send_email(request: Request, email_data: AdminSendEmail):
    """Admin: Send custom email to a user"""
    user = await get_user_from_token(request)
    if not user or not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")
    
    from email_service import send_email
    
    # Build simple HTML email
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
            .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
            .header {{ background: linear-gradient(135deg, #3b82f6, #2563eb); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }}
            .content {{ background: #f8fafc; padding: 30px; border-radius: 0 0 8px 8px; }}
            .footer {{ text-align: center; padding: 20px; color: #64748b; font-size: 12px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>TrustTrade</h1>
            </div>
            <div class="content">
                <p>{email_data.body.replace(chr(10), '<br>')}</p>
            </div>
            <div class="footer">
                <p>© TrustTrade South Africa</p>
            </div>
        </div>
    </body>
    </html>
    """
    
    result = await send_email(
        to_email=email_data.to_email,
        to_name=email_data.to_name,
        subject=email_data.subject,
        html_content=html_content
    )
    
    if result:
        return {"message": "Email sent successfully"}
    else:
        raise HTTPException(status_code=500, detail="Failed to send email")


# Platform Stats (Public - for Live Activity Board)
@api_router.get("/platform/stats")
async def get_platform_stats(request: Request):
    """Get platform-wide statistics for live activity board"""
    user = await get_user_from_token(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Get today's date range
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    today_iso = today_start.isoformat()
    
    # Total counts
    total_users = await db.users.count_documents({})
    total_transactions = await db.transactions.count_documents({})
    
    # Completed transactions
    completed_transactions = await db.transactions.count_documents({"release_status": "Released"})
    
    # Calculate success rate
    success_rate = round((completed_transactions / total_transactions * 100) if total_transactions > 0 else 0, 1)
    
    # Today's completed trades (simplified - check if released and created today or timeline has today's release)
    completed_today = await db.transactions.count_documents({
        "release_status": "Released",
        "created_at": {"$gte": today_iso}
    })
    
    # Total secured value (all transactions)
    pipeline = [
        {"$match": {"release_status": "Released"}},
        {"$group": {"_id": None, "total": {"$sum": "$total"}}}
    ]
    secured_result = await db.transactions.aggregate(pipeline).to_list(1)
    total_secured = secured_result[0]["total"] if secured_result else 0
    
    # Total escrow value (all time)
    all_pipeline = [
        {"$group": {"_id": None, "total": {"$sum": "$total"}}}
    ]
    all_result = await db.transactions.aggregate(all_pipeline).to_list(1)
    total_escrow_value = all_result[0]["total"] if all_result else 0
    
    # Active transactions (not released)
    active_transactions = await db.transactions.count_documents({
        "release_status": {"$ne": "Released"}
    })
    
    # Pending confirmations
    pending_confirmations = await db.transactions.count_documents({
        "$or": [
            {"seller_confirmed": False},
            {"payment_status": "Ready for Payment"}
        ]
    })
    
    # Pending disputes
    pending_disputes = await db.disputes.count_documents({"status": "Pending"})
    
    # Verified users
    verified_users = await db.users.count_documents({"verified": True})
    
    # Fraud cases (valid disputes today - simplified)
    fraud_cases_today = await db.disputes.count_documents({
        "is_valid_dispute": True,
        "created_at": {"$gte": today_iso}
    })
    
    return {
        "total_users": total_users,
        "total_transactions": total_transactions,
        "completed_transactions": completed_transactions,
        "success_rate": success_rate,
        "completed_today": completed_today,
        "total_secured": total_secured,
        "total_escrow_value": total_escrow_value,
        "active_transactions": active_transactions,
        "pending_confirmations": pending_confirmations,
        "pending_disputes": pending_disputes,
        "verified_users": verified_users,
        "fraud_cases_today": fraud_cases_today
    }

# Auto-Release Endpoint (called by cron job or manually by admin)
@api_router.post("/admin/process-auto-releases")
async def process_auto_releases(request: Request):
    """Process all transactions due for auto-release (admin only)"""
    user = await get_user_from_token(request)
    if not user or not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")
    
    now = datetime.now(timezone.utc).isoformat()
    
    # Find transactions that are:
    # - Paid status
    # - Not yet released
    # - Auto-release time has passed
    # - Not already auto-released
    due_transactions = await db.transactions.find({
        "payment_status": "Paid",
        "release_status": "Not Released",
        "auto_release_at": {"$lte": now},
        "auto_released": {"$ne": True}
    }, {"_id": 0}).to_list(100)
    
    released_count = 0
    
    for txn in due_transactions:
        # Auto-release the transaction
        timeline = txn.get("timeline", [])
        timeline.append({
            "status": "Funds Auto-Released (48-hour timer expired)",
            "timestamp": now,
            "by": "TrustTrade System"
        })
        
        await db.transactions.update_one(
            {"transaction_id": txn["transaction_id"]},
            {"$set": {
                "delivery_confirmed": True,
                "release_status": "Released",
                "payment_status": "Released",
                "auto_released": True,
                "timeline": timeline
            }}
        )
        
        # Send notifications
        mock_send_email(
            txn["buyer_email"],
            "Funds Auto-Released",
            f"Transaction {txn['transaction_id']} funds have been automatically released to the seller after 48 hours without confirmation."
        )
        mock_send_email(
            txn["seller_email"],
            "Funds Released to You",
            f"Transaction {txn['transaction_id']} funds have been automatically released to you after the 48-hour waiting period."
        )
        
        released_count += 1
    
    return {"message": f"Processed {released_count} auto-releases", "released_count": released_count}

# Get transactions pending auto-release
@api_router.get("/admin/pending-auto-releases")
async def get_pending_auto_releases(request: Request):
    """Get list of transactions pending auto-release (admin only)"""
    user = await get_user_from_token(request)
    if not user or not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")
    
    now = datetime.now(timezone.utc)
    
    pending = await db.transactions.find({
        "payment_status": "Paid",
        "release_status": "Not Released",
        "auto_release_at": {"$exists": True},
        "auto_released": {"$ne": True}
    }, {"_id": 0, "transaction_id": 1, "auto_release_at": 1, "buyer_email": 1, "seller_email": 1, "total": 1}).to_list(100)
    
    result = []
    for txn in pending:
        auto_release_time = datetime.fromisoformat(txn["auto_release_at"].replace('Z', '+00:00'))
        time_remaining = auto_release_time - now
        hours_remaining = max(0, time_remaining.total_seconds() / 3600)
        
        result.append({
            "transaction_id": txn["transaction_id"],
            "auto_release_at": txn["auto_release_at"],
            "hours_remaining": round(hours_remaining, 1),
            "buyer_email": txn["buyer_email"],
            "seller_email": txn["seller_email"],
            "total": txn["total"]
        })
    
    return result

# =============================================
# TradeSafe Integration Endpoints
# =============================================

# TradeSafe Configuration
TRADESAFE_CLIENT_ID = os.environ.get("TRADESAFE_CLIENT_ID", "")
TRADESAFE_CLIENT_SECRET = os.environ.get("TRADESAFE_CLIENT_SECRET", "")
TRADESAFE_API_URL = os.environ.get("TRADESAFE_API_URL", "https://api-developer.tradesafe.dev/graphql")  # Use production URL when live
TRADESAFE_AUTH_URL = "https://auth.tradesafe.co.za/oauth/token"

# Store TradeSafe access token (in production use Redis)
tradesafe_token_cache = {"token": None, "expires_at": None}

async def get_tradesafe_token():
    """Get or refresh TradeSafe OAuth token"""
    now = datetime.now(timezone.utc)
    
    # Return cached token if still valid
    if tradesafe_token_cache["token"] and tradesafe_token_cache["expires_at"]:
        if tradesafe_token_cache["expires_at"] > now:
            return tradesafe_token_cache["token"]
    
    # Get new token
    if not TRADESAFE_CLIENT_ID or not TRADESAFE_CLIENT_SECRET:
        logger.warning("TradeSafe credentials not configured")
        return None
    
    async with httpx.AsyncClient() as client:
        response = await client.post(
            TRADESAFE_AUTH_URL,
            data={
                "grant_type": "client_credentials",
                "client_id": TRADESAFE_CLIENT_ID,
                "client_secret": TRADESAFE_CLIENT_SECRET
            }
        )
        
        if response.status_code == 200:
            data = response.json()
            tradesafe_token_cache["token"] = data["access_token"]
            # Token valid for 60 minutes, refresh at 55 minutes
            tradesafe_token_cache["expires_at"] = now + timedelta(minutes=55)
            return data["access_token"]
        else:
            logger.error(f"Failed to get TradeSafe token: {response.text}")
            return None

class TradeSafeWebhookPayload(BaseModel):
    """TradeSafe webhook payload structure"""
    event: Optional[str] = None
    transaction_id: Optional[str] = None
    reference: Optional[str] = None
    status: Optional[str] = None
    amount: Optional[float] = None
    data: Optional[dict] = None

@api_router.post("/tradesafe-webhook")
async def tradesafe_webhook(request: Request):
    """Handle TradeSafe webhook notifications"""
    try:
        payload = await request.json()
        logger.info(f"TradeSafe Webhook received: {payload}")
        
        # Extract relevant data
        event_type = payload.get("event") or payload.get("type")
        reference = payload.get("reference") or payload.get("transaction_id")
        status = payload.get("status")
        
        if not reference:
            logger.warning("TradeSafe webhook missing reference")
            return {"status": "ignored", "reason": "no reference"}
        
        # Find transaction by TradeSafe reference
        transaction = await db.transactions.find_one(
            {"$or": [
                {"tradesafe_reference": reference},
                {"transaction_id": reference}
            ]},
            {"_id": 0}
        )
        
        if not transaction:
            logger.warning(f"Transaction not found for TradeSafe reference: {reference}")
            return {"status": "ignored", "reason": "transaction not found"}
        
        # Handle different webhook events
        update_data = {}
        timeline_entry = None
        
        if event_type in ["DEPOSIT_RECEIVED", "payment.success", "escrow.funded"]:
            # Payment received - funds in escrow
            update_data["payment_status"] = "Paid"
            update_data["auto_release_at"] = (datetime.now(timezone.utc) + timedelta(hours=48)).isoformat()
            timeline_entry = {
                "status": "Payment Received via TradeSafe",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "by": "TradeSafe"
            }
            
            # Send notifications
            mock_send_email(
                transaction["buyer_email"],
                "Payment Received",
                f"Your payment for transaction {transaction['transaction_id']} has been received and is held in escrow."
            )
            mock_send_email(
                transaction["seller_email"],
                "Payment Received - Please Deliver",
                f"Payment for transaction {transaction['transaction_id']} has been received. Please deliver the item."
            )
            
        elif event_type in ["FUNDS_RELEASED", "escrow.released"]:
            # Funds released to seller
            update_data["release_status"] = "Released"
            update_data["payment_status"] = "Released"
            timeline_entry = {
                "status": "Funds Released via TradeSafe",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "by": "TradeSafe"
            }
            
        elif event_type in ["REFUND_PROCESSED", "escrow.refunded"]:
            # Refund processed
            update_data["release_status"] = "Refunded"
            update_data["payment_status"] = "Refunded"
            timeline_entry = {
                "status": "Funds Refunded via TradeSafe",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "by": "TradeSafe"
            }
            
        elif event_type in ["TRANSACTION_CANCELLED", "escrow.cancelled"]:
            # Transaction cancelled
            update_data["payment_status"] = "Cancelled"
            timeline_entry = {
                "status": "Transaction Cancelled",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "by": "TradeSafe"
            }
        
        # Update transaction if we have changes
        if update_data:
            if timeline_entry:
                timeline = transaction.get("timeline", [])
                timeline.append(timeline_entry)
                update_data["timeline"] = timeline
            
            await db.transactions.update_one(
                {"transaction_id": transaction["transaction_id"]},
                {"$set": update_data}
            )
            
            logger.info(f"Transaction {transaction['transaction_id']} updated: {update_data}")
        
        return {"status": "success", "processed": bool(update_data)}
        
    except Exception as e:
        logger.error(f"TradeSafe webhook error: {str(e)}")
        return {"status": "error", "message": str(e)}

@api_router.get("/oauth/callback")
async def tradesafe_oauth_callback(request: Request, code: str = None, state: str = None):
    """Handle TradeSafe OAuth callback"""
    logger.info(f"TradeSafe OAuth callback - code: {code}, state: {state}")
    
    if not code:
        raise HTTPException(status_code=400, detail="Authorization code missing")
    
    # Exchange code for token (if using authorization code flow)
    # For client credentials flow, this endpoint may not be needed
    # but we keep it for flexibility
    
    return {
        "status": "success",
        "message": "OAuth callback received",
        "code": code[:10] + "..." if code else None
    }


# ============ WALLET & BANKING ENDPOINTS ============

@api_router.get("/wallet")
async def get_wallet(request: Request):
    """Get user's wallet information"""
    user = await get_user_from_token(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Get fresh user data from DB
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")
    
    wallet_balance = user_doc.get("wallet_balance", 0.0)
    pending_balance = user_doc.get("pending_balance", 0.0)
    total_earned = user_doc.get("total_earned", 0.0)
    banking_details = user_doc.get("banking_details")
    
    # Calculate payout progress
    progress_percent = min((wallet_balance / PAYOUT_THRESHOLD) * 100, 100)
    remaining = max(PAYOUT_THRESHOLD - wallet_balance, 0)
    
    return {
        "balance": wallet_balance,
        "pending_balance": pending_balance,
        "total_earned": total_earned,
        "payout_threshold": PAYOUT_THRESHOLD,
        "progress_percent": round(progress_percent, 1),
        "remaining_to_payout": remaining,
        "can_payout": wallet_balance >= PAYOUT_THRESHOLD,
        "banking_details_set": banking_details is not None and bool(banking_details.get("account_number"))
    }


@api_router.get("/banking-details")
async def get_banking_details(request: Request):
    """Get user's banking details"""
    user = await get_user_from_token(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")
    
    banking = user_doc.get("banking_details", {})
    
    # Mask account number for security (show last 4 digits only)
    if banking and banking.get("account_number"):
        account_num = banking["account_number"]
        banking["account_number_masked"] = f"****{account_num[-4:]}" if len(account_num) >= 4 else "****"
    
    return banking or {}


@api_router.post("/banking-details")
async def update_banking_details(request: Request, details: BankingDetailsUpdate):
    """Update user's banking details"""
    user = await get_user_from_token(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Validate bank details
    if not details.bank_name or not details.account_number or not details.branch_code:
        raise HTTPException(status_code=400, detail="All banking fields are required")
    
    # Update user's banking details
    banking_data = {
        "bank_name": details.bank_name,
        "account_holder": details.account_holder,
        "account_number": details.account_number,
        "branch_code": details.branch_code,
        "account_type": details.account_type,
        "verified": False,  # Requires manual verification
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.users.update_one(
        {"user_id": user.user_id},
        {"$set": {"banking_details": banking_data, "banking_details_verified": False}}
    )
    
    return {"message": "Banking details updated successfully", "verified": False}


@api_router.get("/platform/settings")
async def get_platform_settings():
    """Get platform settings (public endpoint)"""
    return {
        "minimum_transaction": MINIMUM_TRANSACTION_AMOUNT,
        "payout_threshold": PAYOUT_THRESHOLD,
        "platform_fee_percent": PLATFORM_FEE_PERCENT,
        "currency": "ZAR",
        "currency_symbol": "R",
        "payment_methods": ALLOWED_PAYMENT_METHODS
    }


# ============ TRADESAFE PAYMENT GATEWAY ENDPOINTS ============

class TradeSafeTransactionCreate(BaseModel):
    """Request model for creating TradeSafe transaction"""
    transaction_id: str  # TrustTrade internal transaction ID
    fee_allocation: str = "split"  # buyer, seller, or split


class TradeSafeDeliveryAction(BaseModel):
    """Request model for delivery actions"""
    transaction_id: str


@api_router.post("/tradesafe/create-transaction")
async def create_tradesafe_escrow(request: Request, data: TradeSafeTransactionCreate):
    """
    Create TradeSafe escrow transaction after both parties confirm.
    This links the TrustTrade transaction to TradeSafe payment system.
    """
    user = await get_user_from_token(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Get the TrustTrade transaction
    transaction = await db.transactions.find_one(
        {"transaction_id": data.transaction_id},
        {"_id": 0}
    )
    
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    # Verify user is part of this transaction
    is_buyer = transaction.get("buyer_email") == user.email or transaction.get("buyer_user_id") == user.user_id
    is_seller = transaction.get("seller_email") == user.email or transaction.get("seller_user_id") == user.user_id
    
    if not is_buyer and not is_seller and not user.is_admin:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Check if already linked to TradeSafe
    if transaction.get("tradesafe_id"):
        # Return existing TradeSafe info
        return {
            "tradesafe_id": transaction["tradesafe_id"],
            "status": "already_created",
            "message": "Transaction already linked to TradeSafe"
        }
    
    # Validate minimum amount (R500)
    if transaction["item_price"] < MINIMUM_TRANSACTION_AMOUNT:
        raise HTTPException(
            status_code=400,
            detail=f"Minimum transaction amount is R{MINIMUM_TRANSACTION_AMOUNT:.0f}"
        )
    
    # Create TradeSafe transaction
    result = await create_tradesafe_transaction(
        internal_reference=data.transaction_id,
        title=f"TrustTrade - {transaction['item_description'][:50]}",
        description=transaction.get("item_description", "Item/Service"),
        amount=transaction["item_price"],
        buyer_name=transaction["buyer_name"],
        buyer_email=transaction["buyer_email"],
        seller_name=transaction["seller_name"],
        seller_email=transaction["seller_email"],
        fee_allocation=data.fee_allocation
    )
    
    if not result or "error" in result:
        error_msg = result.get("error", "Failed to create TradeSafe transaction") if result else "Failed to create TradeSafe transaction"
        raise HTTPException(status_code=500, detail=error_msg)
    
    # Store TradeSafe ID and allocation ID in our transaction
    tradesafe_id = result.get("id")
    allocation_id = result.get("allocations", [{}])[0].get("id") if result.get("allocations") else None
    
    # Update timeline
    timeline = transaction.get("timeline", [])
    timeline.append({
        "status": "TradeSafe Escrow Created",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "by": "TrustTrade System",
        "details": f"TradeSafe ID: {tradesafe_id}"
    })
    
    await db.transactions.update_one(
        {"transaction_id": data.transaction_id},
        {"$set": {
            "tradesafe_id": tradesafe_id,
            "tradesafe_allocation_id": allocation_id,
            "tradesafe_state": result.get("state", "CREATED"),
            "payment_status": "Awaiting Payment",
            "timeline": timeline
        }}
    )
    
    return {
        "tradesafe_id": tradesafe_id,
        "allocation_id": allocation_id,
        "state": result.get("state"),
        "status": "created",
        "message": "TradeSafe escrow created successfully"
    }


@api_router.get("/tradesafe/payment-url/{transaction_id}")
async def get_tradesafe_payment_url(request: Request, transaction_id: str):
    """
    Get TradeSafe payment URL for a transaction.
    Buyer uses this to make payment via EFT, Card, or Ozow.
    """
    user = await get_user_from_token(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Get transaction
    transaction = await db.transactions.find_one(
        {"transaction_id": transaction_id},
        {"_id": 0}
    )
    
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    tradesafe_id = transaction.get("tradesafe_id")
    if not tradesafe_id:
        raise HTTPException(status_code=400, detail="Transaction not linked to TradeSafe. Create TradeSafe transaction first.")
    
    # Get payment link from TradeSafe
    payment_info = await get_payment_link(tradesafe_id)
    
    if not payment_info:
        raise HTTPException(status_code=500, detail="Failed to get payment link from TradeSafe")
    
    # Calculate fee breakdown for display
    fee_breakdown = calculate_fees(
        transaction["item_price"],
        transaction.get("fee_paid_by", "split")
    )
    
    return {
        "transaction_id": transaction_id,
        "tradesafe_id": tradesafe_id,
        "payment_link": payment_info.get("payment_link"),
        "payment_methods": payment_info.get("payment_methods", ALLOWED_PAYMENT_METHODS),
        "bank_details": payment_info.get("bank_details"),
        "state": payment_info.get("state"),
        "fee_breakdown": fee_breakdown
    }


@api_router.get("/tradesafe/fee-breakdown")
async def get_fee_breakdown(amount: float, fee_allocation: str = "split"):
    """
    Calculate and return fee breakdown for a transaction amount.
    Public endpoint for displaying fees before transaction creation.
    """
    # Validate minimum amount
    is_valid, error_msg = validate_minimum_transaction(amount)
    if not is_valid:
        raise HTTPException(status_code=400, detail=error_msg)
    
    return calculate_fees(amount, fee_allocation)


@api_router.post("/tradesafe/start-delivery/{transaction_id}")
async def start_tradesafe_delivery(request: Request, transaction_id: str):
    """
    Seller marks item as dispatched/delivered.
    This initiates the delivery phase in TradeSafe.
    """
    user = await get_user_from_token(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Get transaction
    transaction = await db.transactions.find_one(
        {"transaction_id": transaction_id},
        {"_id": 0}
    )
    
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    # Only seller can start delivery
    is_seller = transaction.get("seller_email") == user.email or transaction.get("seller_user_id") == user.user_id
    if not is_seller and not user.is_admin:
        raise HTTPException(status_code=403, detail="Only seller can mark item as delivered")
    
    # Check TradeSafe state - must be FUNDS_RECEIVED
    if transaction.get("tradesafe_state") != "FUNDS_RECEIVED":
        raise HTTPException(
            status_code=400, 
            detail="Cannot start delivery - payment not yet received or already in progress"
        )
    
    allocation_id = transaction.get("tradesafe_allocation_id")
    if not allocation_id:
        raise HTTPException(status_code=400, detail="Transaction not properly linked to TradeSafe")
    
    # Call TradeSafe to start delivery
    result = await start_delivery(allocation_id)
    
    if not result:
        raise HTTPException(status_code=500, detail="Failed to start delivery on TradeSafe")
    
    # Update timeline
    timeline = transaction.get("timeline", [])
    timeline.append({
        "status": "Delivery Started",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "by": user.name,
        "details": "Seller marked item as dispatched"
    })
    
    await db.transactions.update_one(
        {"transaction_id": transaction_id},
        {"$set": {
            "tradesafe_state": "INITIATED",
            "payment_status": "Delivery in Progress",
            "delivery_started_at": datetime.now(timezone.utc).isoformat(),
            "timeline": timeline
        }}
    )
    
    # Send email to buyer
    base_url = os.environ.get('FRONTEND_URL', 'https://trusttradesa.co.za')
    await send_delivery_confirmed_email(
        to_email=transaction["buyer_email"],
        to_name=transaction["buyer_name"],
        share_code=transaction.get("share_code", transaction_id),
        item_description=transaction["item_description"],
        role="buyer"
    )
    
    return {
        "status": "delivery_started",
        "message": "Delivery marked as started. Buyer has been notified.",
        "state": "INITIATED"
    }


@api_router.post("/tradesafe/accept-delivery/{transaction_id}")
async def accept_tradesafe_delivery(request: Request, transaction_id: str):
    """
    Buyer confirms receipt of item/service.
    This triggers fund release to seller.
    """
    user = await get_user_from_token(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Get transaction
    transaction = await db.transactions.find_one(
        {"transaction_id": transaction_id},
        {"_id": 0}
    )
    
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    # Only buyer can accept delivery
    is_buyer = transaction.get("buyer_email") == user.email or transaction.get("buyer_user_id") == user.user_id
    if not is_buyer and not user.is_admin:
        raise HTTPException(status_code=403, detail="Only buyer can confirm delivery")
    
    # Check TradeSafe state - must be INITIATED
    if transaction.get("tradesafe_state") not in ["INITIATED", "SENT", "DELIVERED"]:
        raise HTTPException(
            status_code=400,
            detail="Cannot accept delivery - delivery not yet started or already completed"
        )
    
    allocation_id = transaction.get("tradesafe_allocation_id")
    if not allocation_id:
        raise HTTPException(status_code=400, detail="Transaction not properly linked to TradeSafe")
    
    # Call TradeSafe to accept delivery
    result = await accept_delivery(allocation_id)
    
    if not result:
        raise HTTPException(status_code=500, detail="Failed to accept delivery on TradeSafe")
    
    # Calculate net amount after fees
    net_amount = transaction["item_price"] * (1 - PLATFORM_FEE_PERCENT / 100)
    
    # Update timeline
    timeline = transaction.get("timeline", [])
    timeline.append({
        "status": "Delivery Accepted - Funds Released",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "by": user.name,
        "details": f"Funds of R{net_amount:.2f} released to seller"
    })
    
    await db.transactions.update_one(
        {"transaction_id": transaction_id},
        {"$set": {
            "tradesafe_state": "FUNDS_RELEASED",
            "payment_status": "Released",
            "release_status": "Released",
            "delivery_confirmed": True,
            "delivery_confirmed_at": datetime.now(timezone.utc).isoformat(),
            "timeline": timeline
        }}
    )
    
    # Send email to seller
    await send_funds_released_email(
        to_email=transaction["seller_email"],
        to_name=transaction["seller_name"],
        share_code=transaction.get("share_code", transaction_id),
        item_description=transaction["item_description"],
        amount=transaction["item_price"],
        net_amount=net_amount
    )
    
    return {
        "status": "funds_released",
        "message": "Delivery confirmed. Funds have been released to seller.",
        "state": "FUNDS_RELEASED",
        "net_amount": net_amount
    }


@api_router.get("/tradesafe/transaction-status/{transaction_id}")
async def get_tradesafe_status(request: Request, transaction_id: str):
    """
    Get current TradeSafe status for a transaction.
    """
    user = await get_user_from_token(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Get transaction
    transaction = await db.transactions.find_one(
        {"transaction_id": transaction_id},
        {"_id": 0}
    )
    
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    tradesafe_id = transaction.get("tradesafe_id")
    if not tradesafe_id:
        return {
            "linked": False,
            "message": "Transaction not linked to TradeSafe"
        }
    
    # Get latest status from TradeSafe
    ts_transaction = await get_tradesafe_transaction(tradesafe_id)
    
    if ts_transaction:
        current_state = ts_transaction.get("state")
        
        # Update local state if changed
        if current_state != transaction.get("tradesafe_state"):
            await db.transactions.update_one(
                {"transaction_id": transaction_id},
                {"$set": {
                    "tradesafe_state": current_state,
                    "payment_status": map_tradesafe_state_to_status(current_state)
                }}
            )
        
        return {
            "linked": True,
            "tradesafe_id": tradesafe_id,
            "state": current_state,
            "status": map_tradesafe_state_to_status(current_state),
            "allocations": ts_transaction.get("allocations", [])
        }
    
    return {
        "linked": True,
        "tradesafe_id": tradesafe_id,
        "state": transaction.get("tradesafe_state"),
        "status": transaction.get("payment_status"),
        "error": "Could not fetch latest status from TradeSafe"
    }


@api_router.post("/tradesafe-webhook")
async def handle_tradesafe_webhook(request: Request):
    """
    Webhook handler for TradeSafe transaction state changes.
    TradeSafe sends callbacks when transaction state changes.
    """
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")
    
    logger.info(f"TradeSafe webhook received: {payload}")
    
    # Extract transaction info from webhook
    tradesafe_id = payload.get("id") or payload.get("transaction", {}).get("id")
    new_state = payload.get("state") or payload.get("transaction", {}).get("state")
    reference = payload.get("reference") or payload.get("transaction", {}).get("reference")
    
    if not tradesafe_id and not reference:
        logger.warning("Webhook missing transaction identifier")
        return {"status": "ignored", "reason": "missing identifier"}
    
    # Find our transaction
    query = {}
    if tradesafe_id:
        query["tradesafe_id"] = tradesafe_id
    elif reference:
        query["transaction_id"] = reference
    
    transaction = await db.transactions.find_one(query, {"_id": 0})
    
    if not transaction:
        logger.warning(f"Webhook for unknown transaction: {tradesafe_id or reference}")
        return {"status": "ignored", "reason": "transaction not found"}
    
    # Get previous state
    prev_state = transaction.get("tradesafe_state")
    
    # Update transaction state
    timeline = transaction.get("timeline", [])
    timeline.append({
        "status": f"TradeSafe: {new_state}",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "by": "TradeSafe Webhook"
    })
    
    update_data = {
        "tradesafe_state": new_state,
        "payment_status": map_tradesafe_state_to_status(new_state),
        "timeline": timeline
    }
    
    # Handle specific state changes
    base_url = os.environ.get('FRONTEND_URL', 'https://trusttradesa.co.za')
    
    if new_state == TransactionState.FUNDS_RECEIVED:
        # Funds secured - notify seller to deliver
        update_data["funds_received_at"] = datetime.now(timezone.utc).isoformat()
        
        # Email seller
        await send_payment_received_email(
            to_email=transaction["seller_email"],
            to_name=transaction["seller_name"],
            share_code=transaction.get("share_code", transaction["transaction_id"]),
            item_description=transaction["item_description"],
            amount=transaction["item_price"],
            role="seller"
        )
        
        # Email buyer confirmation
        await send_payment_received_email(
            to_email=transaction["buyer_email"],
            to_name=transaction["buyer_name"],
            share_code=transaction.get("share_code", transaction["transaction_id"]),
            item_description=transaction["item_description"],
            amount=transaction["item_price"],
            role="buyer"
        )
    
    elif new_state == TransactionState.INITIATED:
        # Delivery started - notify buyer
        update_data["delivery_started_at"] = datetime.now(timezone.utc).isoformat()
        
        await send_delivery_confirmed_email(
            to_email=transaction["buyer_email"],
            to_name=transaction["buyer_name"],
            share_code=transaction.get("share_code", transaction["transaction_id"]),
            item_description=transaction["item_description"],
            role="buyer"
        )
    
    elif new_state == TransactionState.FUNDS_RELEASED:
        # Funds released - notify seller
        update_data["delivery_confirmed"] = True
        update_data["release_status"] = "Released"
        update_data["released_at"] = datetime.now(timezone.utc).isoformat()
        
        net_amount = transaction["item_price"] * (1 - PLATFORM_FEE_PERCENT / 100)
        
        await send_funds_released_email(
            to_email=transaction["seller_email"],
            to_name=transaction["seller_name"],
            share_code=transaction.get("share_code", transaction["transaction_id"]),
            item_description=transaction["item_description"],
            amount=transaction["item_price"],
            net_amount=net_amount
        )
    
    elif new_state == TransactionState.DISPUTED:
        # Dispute opened - notify both parties
        await send_dispute_opened_email(
            to_email=transaction["buyer_email"],
            to_name=transaction["buyer_name"],
            share_code=transaction.get("share_code", transaction["transaction_id"]),
            dispute_type="TradeSafe Dispute",
            description="A dispute has been opened on TradeSafe"
        )
        
        await send_dispute_opened_email(
            to_email=transaction["seller_email"],
            to_name=transaction["seller_name"],
            share_code=transaction.get("share_code", transaction["transaction_id"]),
            dispute_type="TradeSafe Dispute",
            description="A dispute has been opened on TradeSafe"
        )
    
    # Update database
    await db.transactions.update_one(
        {"transaction_id": transaction["transaction_id"]},
        {"$set": update_data}
    )
    
    logger.info(f"Processed webhook: {transaction['transaction_id']} state {prev_state} -> {new_state}")
    
    return {"status": "processed", "transaction_id": transaction["transaction_id"], "new_state": new_state}


# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()