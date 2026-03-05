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

# Pydantic Models
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
    created_at: str

class UserSession(BaseModel):
    model_config = ConfigDict(extra="ignore")
    user_id: str
    session_token: str
    expires_at: str
    created_at: str

class Transaction(BaseModel):
    model_config = ConfigDict(extra="ignore")
    transaction_id: str
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
    payment_status: str = "Pending Seller Confirmation"
    seller_confirmed: bool = False
    seller_confirmed_at: Optional[str] = None
    delivery_confirmed: bool = False
    release_status: str = "Not Released"
    agreement_pdf_path: Optional[str] = None
    buyer_details_confirmed: bool = False
    seller_details_confirmed: bool = False
    item_accuracy_confirmed: bool = False
    timeline: List[dict] = []
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

class SessionExchangeRequest(BaseModel):
    session_id: str

class TermsAcceptance(BaseModel):
    accepted: bool

# Mock email function
def mock_send_email(to_email: str, subject: str, body: str):
    logger.info(f"MOCK EMAIL TO: {to_email}")
    logger.info(f"SUBJECT: {subject}")
    logger.info(f"BODY: {body}")
    logger.info("---")

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
    
    # Calculate fees
    item_price = transaction_data.item_price
    trusttrade_fee = round(item_price * 0.02, 2)
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
    
    transaction = {
        "transaction_id": transaction_id,
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
        "payment_status": "Pending Seller Confirmation" if transaction_data.creator_role == "buyer" else "Pending Buyer Confirmation",
        "seller_confirmed": False,
        "delivery_confirmed": False,
        "release_status": "Not Released",
        "buyer_details_confirmed": transaction_data.buyer_details_confirmed,
        "seller_details_confirmed": transaction_data.seller_details_confirmed,
        "item_accuracy_confirmed": transaction_data.item_accuracy_confirmed,
        "timeline": timeline,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.transactions.insert_one(transaction)
    
    # Mock emails
    mock_send_email(
        buyer_email,
        "Transaction Created",
        f"Your transaction {transaction_id} has been created for R{item_price:.2f}."
    )
    mock_send_email(
        seller_email,
        "New Transaction",
        f"You have a new transaction {transaction_id} from {buyer_name}."
    )
    
    # Email admin if exists
    admin = await db.users.find_one({"is_admin": True}, {"_id": 0})
    if admin:
        mock_send_email(
            admin["email"],
            "New Transaction Created",
            f"Transaction {transaction_id} created by {user.name}."
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
    
    return Transaction(**transaction)

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
        
        # Mock emails
        mock_send_email(
            transaction["seller_email"],
            "Funds Released",
            f"Transaction {transaction_id} funds have been released."
        )
        
        admin = await db.users.find_one({"is_admin": True}, {"_id": 0})
        if admin:
            mock_send_email(
                admin["email"],
                "Transaction Completed",
                f"Transaction {transaction_id} has been completed."
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
        # Update timeline
        timeline = transaction.get("timeline", [])
        timeline.append({
            "status": "Payment Received in Escrow",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "by": "TrustTrade System"
        })
        
        await db.transactions.update_one(
            {"transaction_id": transaction_id},
            {"$set": {
                "payment_status": "Paid",
                "timeline": timeline
            }}
        )
        
        # Mock email to buyer that payment received
        mock_send_email(
            transaction["buyer_email"],
            "Payment Received in Escrow",
            f"Your payment for transaction {transaction_id} has been received and is held in escrow. The seller will now deliver the item."
        )
        
        # Mock email to seller that payment received
        mock_send_email(
            transaction["seller_email"],
            "Payment Received - Please Deliver",
            f"Payment for transaction {transaction_id} has been received. Please deliver the item to the buyer."
        )
        
        return {"message": "Payment confirmed", "status": "Paid"}
    
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
    
    # Email admin
    admin = await db.users.find_one({"is_admin": True}, {"_id": 0})
    if admin:
        mock_send_email(
            admin["email"],
            "New Dispute Raised",
            f"Dispute {dispute_id} raised for transaction {dispute_data.transaction_id} by {user.name}. Type: {dispute_data.dispute_type}"
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

# Admin Endpoints
@api_router.get("/admin/users", response_model=List[User])
async def list_all_users(request: Request):
    """List all users (admin only)"""
    user = await get_user_from_token(request)
    if not user or not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")
    
    users = await db.users.find({}, {"_id": 0}).to_list(1000)
    return [User(**u) for u in users]

@api_router.get("/admin/transactions", response_model=List[Transaction])
async def list_all_transactions_admin(request: Request):
    """List all transactions (admin only)"""
    user = await get_user_from_token(request)
    if not user or not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")
    
    transactions = await db.transactions.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return [Transaction(**t) for t in transactions]

@api_router.get("/admin/disputes", response_model=List[Dispute])
async def list_all_disputes_admin(request: Request):
    """List all disputes (admin only)"""
    user = await get_user_from_token(request)
    if not user or not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")
    
    disputes = await db.disputes.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return [Dispute(**d) for d in disputes]

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