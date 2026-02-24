from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Cookie
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
    buyer_user_id: str
    seller_user_id: Optional[str] = None
    buyer_name: str
    buyer_email: str
    seller_name: str
    seller_email: str
    item_description: str
    item_price: float
    trusttrade_fee: float
    total: float
    payment_status: str = "Pending"
    delivery_confirmed: bool = False
    release_status: str = "Not Released"
    created_at: str

class TransactionCreate(BaseModel):
    seller_name: str
    seller_email: str
    item_description: str
    item_price: float

class TransactionUpdate(BaseModel):
    delivery_confirmed: bool

class Dispute(BaseModel):
    model_config = ConfigDict(extra="ignore")
    dispute_id: str
    transaction_id: str
    raised_by_user_id: str
    description: str
    status: str = "Pending"
    created_at: str

class DisputeCreate(BaseModel):
    transaction_id: str
    description: str

class DisputeUpdate(BaseModel):
    status: str

class SessionExchangeRequest(BaseModel):
    session_id: str

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
                headers={"X-Session-ID": request.session_id}
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

# Transaction Endpoints
@api_router.post("/transactions", response_model=Transaction, status_code=201)
async def create_transaction(request: Request, transaction_data: TransactionCreate):
    """Create a new transaction"""
    user = await get_user_from_token(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Calculate fees
    item_price = transaction_data.item_price
    trusttrade_fee = round(item_price * 0.02, 2)
    total = round(item_price + trusttrade_fee, 2)
    
    transaction_id = f"txn_{uuid.uuid4().hex[:12]}"
    
    transaction = {
        "transaction_id": transaction_id,
        "buyer_user_id": user.user_id,
        "seller_user_id": None,
        "buyer_name": user.name,
        "buyer_email": user.email,
        "seller_name": transaction_data.seller_name,
        "seller_email": transaction_data.seller_email,
        "item_description": transaction_data.item_description,
        "item_price": item_price,
        "trusttrade_fee": trusttrade_fee,
        "total": total,
        "payment_status": "Pending",
        "delivery_confirmed": False,
        "release_status": "Not Released",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.transactions.insert_one(transaction)
    
    # Mock emails
    mock_send_email(
        user.email,
        "Transaction Created",
        f"Your transaction {transaction_id} has been created for {item_price} ZAR."
    )
    mock_send_email(
        transaction_data.seller_email,
        "New Transaction",
        f"You have a new transaction {transaction_id} from {user.name}."
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
        if (transaction["buyer_user_id"] != user.user_id and
            transaction["buyer_email"] != user.email and
            transaction["seller_email"] != user.email):
            raise HTTPException(status_code=403, detail="Access denied")
    
    return Transaction(**transaction)

@api_router.patch("/transactions/{transaction_id}/delivery")
async def confirm_delivery(request: Request, transaction_id: str, update_data: TransactionUpdate):
    """Confirm delivery and release funds"""
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
    
    if update_data.delivery_confirmed:
        await db.transactions.update_one(
            {"transaction_id": transaction_id},
            {"$set": {
                "delivery_confirmed": True,
                "release_status": "Released",
                "payment_status": "Released"
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
        if (transaction["buyer_user_id"] != user.user_id and
            transaction["buyer_email"] != user.email and
            transaction["seller_email"] != user.email):
            raise HTTPException(status_code=403, detail="Access denied")
    
    dispute_id = f"disp_{uuid.uuid4().hex[:12]}"
    
    dispute = {
        "dispute_id": dispute_id,
        "transaction_id": dispute_data.transaction_id,
        "raised_by_user_id": user.user_id,
        "description": dispute_data.description,
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
            f"Dispute {dispute_id} raised for transaction {dispute_data.transaction_id} by {user.name}."
        )
    
    return Dispute(**dispute)

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
    
    result = await db.disputes.update_one(
        {"dispute_id": dispute_id},
        {"$set": {"status": update_data.status}}
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