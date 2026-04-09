"""
TrustTrade Admin Routes
Handles admin dashboard, user management, monitoring, and system actions
"""

import os
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional
from fastapi import APIRouter, HTTPException, Request

from core.config import settings
from core.database import get_database
from core.security import get_user_from_token
from models.user import User
from models.transaction import Transaction
from models.dispute import Dispute, DisputeStatusUpdate
from models.common import (
    RiskAssessment, AdminRefundRequest, AdminReleaseRequest,
    AdminNotesRequest, AdminStatusOverride, AdminSendEmail,
    VerificationStatusUpdate
)
from email_service import (
    send_email, send_verification_status_email, send_refund_email,
    send_funds_released_email, send_dispute_resolved_email
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/admin", tags=["Admin"])


async def require_admin(request: Request, db) -> User:
    """Require admin user"""
    user = await get_user_from_token(request, db)
    if not user or not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


# ============ USER MANAGEMENT ============

@router.get("/users")
async def list_all_users(request: Request):
    """List all users (admin only)"""
    db = get_database()
    await require_admin(request, db)
    
    projection = {
        "_id": 0, "user_id": 1, "name": 1, "email": 1, "phone": 1,
        "verified": 1, "is_admin": 1, "created_at": 1, "total_trades": 1,
        "trust_score": 1, "badge": 1, "picture": 1, "id_verified": 1,
        "selfie_verified": 1, "phone_verified": 1
    }
    users = await db.users.find({}, projection).to_list(1000)
    return users


@router.get("/user/{user_id}")
async def get_admin_user_detail(request: Request, user_id: str):
    """Get full user details for admin"""
    db = get_database()
    await require_admin(request, db)
    
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    txn_projection = {
        "_id": 0, "transaction_id": 1, "share_code": 1, "item_description": 1,
        "item_price": 1, "payment_status": 1, "transaction_state": 1, "created_at": 1,
        "buyer_name": 1, "seller_name": 1
    }
    
    buyer_transactions = await db.transactions.find(
        {"buyer_email": user.get("email")},
        txn_projection
    ).sort("created_at", -1).to_list(100)
    
    seller_transactions = await db.transactions.find(
        {"seller_email": user.get("email")},
        txn_projection
    ).sort("created_at", -1).to_list(100)
    
    return {
        "user": user,
        "buyer_transactions": buyer_transactions,
        "seller_transactions": seller_transactions
    }


@router.post("/users/{user_id}/suspend")
async def admin_suspend_user(request: Request, user_id: str):
    """Suspend a user account"""
    db = get_database()
    admin = await require_admin(request, db)
    
    user = await db.users.find_one({"user_id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    await db.users.update_one(
        {"user_id": user_id},
        {"$set": {
            "suspension_flag": True,
            "suspended_at": datetime.now(timezone.utc).isoformat(),
            "suspended_by": admin.email
        }}
    )
    
    try:
        html_content = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Account Suspended</h2>
            <p>Dear {user.get("name", "User")},</p>
            <p>Your TrustTrade account has been suspended. Please contact support for more information.</p>
            <p>Best regards,<br>TrustTrade Team</p>
        </div>
        """
        await send_email(
            to_email=user.get("email"),
            to_name=user.get("name"),
            subject="TrustTrade Account Suspended",
            html_content=html_content
        )
    except Exception as e:
        logger.error(f"Failed to send suspension email: {e}")
    
    return {"message": "User suspended successfully", "user_id": user_id}


@router.post("/users/{user_id}/ban")
async def admin_ban_user(request: Request, user_id: str):
    """Permanently ban a user account"""
    db = get_database()
    admin = await require_admin(request, db)
    
    user = await db.users.find_one({"user_id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    await db.users.update_one(
        {"user_id": user_id},
        {"$set": {
            "banned": True,
            "suspension_flag": True,
            "banned_at": datetime.now(timezone.utc).isoformat(),
            "banned_by": admin.email
        }}
    )
    
    try:
        html_content = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Account Permanently Banned</h2>
            <p>Dear {user.get("name", "User")},</p>
            <p>Your TrustTrade account has been permanently banned due to policy violations.</p>
            <p>Best regards,<br>TrustTrade Team</p>
        </div>
        """
        await send_email(
            to_email=user.get("email"),
            to_name=user.get("name"),
            subject="TrustTrade Account Permanently Banned",
            html_content=html_content
        )
    except Exception as e:
        logger.error(f"Failed to send ban email: {e}")
    
    return {"message": "User banned successfully", "user_id": user_id}


@router.post("/users/{user_id}/verification")
async def admin_update_verification(request: Request, user_id: str, status_data: VerificationStatusUpdate):
    """Update user's ID verification status"""
    db = get_database()
    admin = await require_admin(request, db)
    
    target_user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    valid_statuses = ["pending", "verified", "rejected"]
    if status_data.status.lower() not in valid_statuses:
        raise HTTPException(status_code=400, detail="Invalid status")
    
    update_data = {
        "verified": status_data.status.lower() == "verified",
        "verification_status": status_data.status.lower(),
        "verification_notes": status_data.notes,
        "verification_updated_at": datetime.now(timezone.utc).isoformat(),
        "verification_updated_by": admin.user_id
    }
    
    if status_data.status.lower() == "verified":
        await db.users.update_one(
            {"user_id": user_id},
            {"$addToSet": {"badges": "verified"}}
        )
    
    await db.users.update_one(
        {"user_id": user_id},
        {"$set": update_data}
    )
    
    await send_verification_status_email(
        to_email=target_user["email"],
        to_name=target_user["name"],
        status=status_data.status
    )
    
    return {"message": f"Verification status updated to {status_data.status}", "user_id": user_id}


# ============ TRANSACTION MANAGEMENT ============

@router.get("/transactions")
async def list_all_transactions_admin(request: Request):
    """List all transactions"""
    db = get_database()
    await require_admin(request, db)
    
    projection = {
        "_id": 0, "transaction_id": 1, "share_code": 1, "buyer_name": 1, "buyer_email": 1,
        "seller_name": 1, "seller_email": 1, "item_description": 1, "item_price": 1,
        "payment_status": 1, "release_status": 1, "transaction_state": 1, "tradesafe_state": 1,
        "created_at": 1, "has_dispute": 1, "delivery_method": 1, "tradesafe_id": 1
    }
    transactions = await db.transactions.find({}, projection).sort("created_at", -1).to_list(1000)
    return transactions


@router.get("/transaction/{transaction_id}")
async def get_admin_transaction_detail(request: Request, transaction_id: str):
    """Get full transaction details for admin"""
    db = get_database()
    await require_admin(request, db)
    
    transaction = await db.transactions.find_one({"transaction_id": transaction_id}, {"_id": 0})
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    buyer = None
    seller = None
    
    if transaction.get("buyer_email"):
        buyer_doc = await db.users.find_one({"email": transaction["buyer_email"]}, {"_id": 0})
        if buyer_doc:
            buyer = {
                "user_id": buyer_doc.get("user_id"),
                "name": buyer_doc.get("name"),
                "email": buyer_doc.get("email"),
                "phone": buyer_doc.get("phone"),
                "verified": buyer_doc.get("verified"),
                "trust_score": buyer_doc.get("trust_score", 50),
                "banking_details_added": buyer_doc.get("banking_details_added", False)
            }
    
    if transaction.get("seller_email"):
        seller_doc = await db.users.find_one({"email": transaction["seller_email"]}, {"_id": 0})
        if seller_doc:
            seller = {
                "user_id": seller_doc.get("user_id"),
                "name": seller_doc.get("name"),
                "email": seller_doc.get("email"),
                "phone": seller_doc.get("phone"),
                "verified": seller_doc.get("verified"),
                "trust_score": seller_doc.get("trust_score", 50),
                "banking_details_added": seller_doc.get("banking_details_added", False)
            }
    
    return {
        "transaction": transaction,
        "buyer": buyer,
        "seller": seller
    }


@router.post("/transactions/{transaction_id}/refund")
async def admin_refund_transaction(request: Request, transaction_id: str, refund_data: AdminRefundRequest):
    """Admin: Refund a transaction"""
    db = get_database()
    user = await require_admin(request, db)
    
    transaction = await db.transactions.find_one({"transaction_id": transaction_id}, {"_id": 0})
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    if transaction.get("payment_status") not in ["Paid", "Ready for Payment"]:
        raise HTTPException(status_code=400, detail="Transaction cannot be refunded in current state")
    
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
    
    await send_refund_email(
        to_email=transaction["buyer_email"],
        to_name=transaction["buyer_name"],
        share_code=transaction.get("share_code", transaction_id),
        amount=transaction["total"],
        reason=refund_data.reason
    )
    
    return {"message": "Transaction refunded successfully", "transaction_id": transaction_id}


@router.post("/transactions/{transaction_id}/release")
async def admin_release_funds(request: Request, transaction_id: str, release_data: AdminReleaseRequest):
    """Admin: Manually release funds to seller"""
    db = get_database()
    user = await require_admin(request, db)
    
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
    
    await send_funds_released_email(
        to_email=transaction["seller_email"],
        to_name=transaction["seller_name"],
        share_code=transaction.get("share_code", transaction_id),
        item_description=transaction["item_description"],
        amount=item_price,
        net_amount=net_amount
    )
    
    return {"message": "Funds released successfully", "transaction_id": transaction_id, "net_amount": net_amount}


@router.post("/transactions/{transaction_id}/notes")
async def admin_add_notes(request: Request, transaction_id: str, notes_data: AdminNotesRequest):
    """Admin: Add notes to a transaction"""
    db = get_database()
    user = await require_admin(request, db)
    
    transaction = await db.transactions.find_one({"transaction_id": transaction_id}, {"_id": 0})
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
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


@router.post("/transactions/{transaction_id}/status")
async def admin_override_status(request: Request, transaction_id: str, status_data: AdminStatusOverride):
    """Admin: Override transaction payment status"""
    db = get_database()
    user = await require_admin(request, db)
    
    transaction = await db.transactions.find_one({"transaction_id": transaction_id}, {"_id": 0})
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    valid_statuses = [
        "Pending Seller Confirmation", "Pending Buyer Confirmation",
        "Ready for Payment", "Paid", "Released", "Refunded"
    ]
    
    if status_data.status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid_statuses}")
    
    update_data = {
        "payment_status": status_data.status,
        "status_overridden_at": datetime.now(timezone.utc).isoformat(),
        "status_overridden_by": user.user_id
    }
    
    if status_data.status == "Released":
        update_data["release_status"] = "Released"
        update_data["delivery_confirmed"] = True
    
    await db.transactions.update_one(
        {"transaction_id": transaction_id},
        {"$set": update_data}
    )
    
    return {"message": f"Status overridden to {status_data.status}", "transaction_id": transaction_id}


# ============ DISPUTE MANAGEMENT ============

@router.get("/disputes")
async def list_all_disputes_admin(request: Request):
    """List all disputes"""
    db = get_database()
    await require_admin(request, db)
    
    projection = {
        "_id": 0, "dispute_id": 1, "transaction_id": 1, "raised_by_user_id": 1,
        "raised_by_name": 1, "raised_by_email": 1, "dispute_type": 1, "description": 1,
        "status": 1, "created_at": 1, "resolution": 1, "resolved_at": 1
    }
    disputes = await db.disputes.find({}, projection).sort("created_at", -1).to_list(1000)
    return disputes


@router.get("/dispute/{dispute_id}")
async def get_admin_dispute_detail(request: Request, dispute_id: str):
    """Get full dispute details for admin"""
    db = get_database()
    await require_admin(request, db)
    
    dispute = await db.disputes.find_one({"dispute_id": dispute_id}, {"_id": 0})
    if not dispute:
        raise HTTPException(status_code=404, detail="Dispute not found")
    
    transaction = None
    if dispute.get("transaction_id"):
        transaction = await db.transactions.find_one({"transaction_id": dispute["transaction_id"]}, {"_id": 0})
    
    buyer = None
    seller = None
    
    if transaction:
        if transaction.get("buyer_email"):
            buyer_doc = await db.users.find_one({"email": transaction["buyer_email"]}, {"_id": 0})
            if buyer_doc:
                buyer = {
                    "user_id": buyer_doc.get("user_id"),
                    "name": buyer_doc.get("name"),
                    "email": buyer_doc.get("email"),
                    "phone": buyer_doc.get("phone")
                }
        
        if transaction.get("seller_email"):
            seller_doc = await db.users.find_one({"email": transaction["seller_email"]}, {"_id": 0})
            if seller_doc:
                seller = {
                    "user_id": seller_doc.get("user_id"),
                    "name": seller_doc.get("name"),
                    "email": seller_doc.get("email"),
                    "phone": seller_doc.get("phone")
                }
    
    return {
        "dispute": dispute,
        "transaction": transaction,
        "buyer": buyer,
        "seller": seller
    }


@router.patch("/disputes/{dispute_id}")
async def admin_update_dispute(request: Request, dispute_id: str, status_data: DisputeStatusUpdate):
    """Admin: Update dispute status"""
    db = get_database()
    admin = await require_admin(request, db)
    
    dispute = await db.disputes.find_one({"dispute_id": dispute_id}, {"_id": 0})
    if not dispute:
        raise HTTPException(status_code=404, detail="Dispute not found")
    
    transaction = await db.transactions.find_one(
        {"transaction_id": dispute["transaction_id"]},
        {"_id": 0}
    )
    
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
    
    # Send emails if resolved
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


# ============ STATISTICS ============

@router.get("/stats")
async def get_admin_stats(request: Request):
    """Get admin dashboard stats"""
    db = get_database()
    await require_admin(request, db)
    
    total_users = await db.users.count_documents({})
    total_transactions = await db.transactions.count_documents({})
    pending_transactions = await db.transactions.count_documents({"payment_status": "Pending"})
    pending_disputes = await db.disputes.count_documents({"status": "Pending"})
    pending_verifications = await db.users.count_documents({"id_verification_status": "pending"})
    
    # Calculate total volume
    pipeline = [
        {"$group": {"_id": None, "total": {"$sum": "$item_price"}}}
    ]
    volume_result = await db.transactions.aggregate(pipeline).to_list(1)
    total_volume = volume_result[0]["total"] if volume_result else 0
    
    return {
        "total_users": total_users,
        "total_transactions": total_transactions,
        "pending_transactions": pending_transactions,
        "pending_disputes": pending_disputes,
        "pending_verifications": pending_verifications,
        "total_volume": total_volume
    }


@router.get("/escrow-details")
async def get_escrow_details(request: Request):
    """Get detailed escrow information per user and transaction"""
    db = get_database()
    await require_admin(request, db)
    
    escrow_transactions = await db.transactions.find(
        {"payment_status": "Paid", "release_status": "Not Released"},
        {"_id": 0}
    ).to_list(1000)
    
    user_balances = {}
    
    for txn in escrow_transactions:
        buyer_email = txn.get("buyer_email")
        seller_email = txn.get("seller_email")
        
        fee = txn.get("trusttrade_fee", 0)
        item_price = txn.get("item_price", 0)
        fee_paid_by = txn.get("fee_paid_by", "split")
        
        if fee_paid_by == "seller":
            payable_to_seller = item_price - fee
        elif fee_paid_by == "split":
            payable_to_seller = item_price - (fee / 2)
        else:
            payable_to_seller = item_price
        
        if buyer_email not in user_balances:
            user_balances[buyer_email] = {"as_buyer": 0, "as_seller": 0, "transactions": []}
        user_balances[buyer_email]["as_buyer"] += txn.get("total", 0)
        user_balances[buyer_email]["transactions"].append({
            "transaction_id": txn.get("transaction_id"),
            "share_code": txn.get("share_code"),
            "role": "buyer",
            "amount": txn.get("total", 0)
        })
        
        if seller_email not in user_balances:
            user_balances[seller_email] = {"as_buyer": 0, "as_seller": 0, "transactions": []}
        user_balances[seller_email]["as_seller"] += payable_to_seller
        user_balances[seller_email]["transactions"].append({
            "transaction_id": txn.get("transaction_id"),
            "share_code": txn.get("share_code"),
            "role": "seller",
            "payable": payable_to_seller
        })
    
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
        "user_balances": user_balances
    }


@router.get("/flagged-users")
async def get_flagged_users(request: Request):
    """Get users with high risk scores"""
    db = get_database()
    await require_admin(request, db)
    
    flagged = []
    
    # Users with multiple valid disputes
    dispute_users = await db.users.find(
        {"valid_disputes_count": {"$gte": 2}},
        {"_id": 0, "user_id": 1, "name": 1, "email": 1, "valid_disputes_count": 1, "trust_score": 1}
    ).to_list(100)
    
    for u in dispute_users:
        flagged.append({
            **u,
            "risk_level": "high" if u.get("valid_disputes_count", 0) >= 3 else "medium",
            "flags": ["multiple_disputes"]
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
                flagged.append({
                    **user_doc,
                    "reports_count": r["count"],
                    "risk_level": "high" if r["count"] >= 3 else "medium",
                    "flags": ["multiple_reports"]
                })
    
    return sorted(flagged, key=lambda x: x.get("trust_score", 100))


@router.get("/flagged-transactions")
async def get_flagged_transactions(request: Request):
    """Get transactions with risk flags"""
    db = get_database()
    await require_admin(request, db)
    
    flagged = await db.transactions.find(
        {"risk_level": {"$in": ["medium", "high"]}},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    
    return [Transaction(**t) for t in flagged]


# ============ EMAIL ============

@router.post("/send-email")
async def admin_send_email(request: Request, email_data: AdminSendEmail):
    """Admin: Send custom email to a user"""
    db = get_database()
    await require_admin(request, db)
    
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


# ============ AUTO-RELEASE ============

@router.post("/process-auto-releases")
async def process_auto_releases(request: Request):
    """Process all transactions due for auto-release"""
    db = get_database()
    await require_admin(request, db)
    
    now = datetime.now(timezone.utc).isoformat()
    
    due_transactions = await db.transactions.find({
        "payment_status": "Paid",
        "release_status": "Not Released",
        "auto_release_at": {"$lte": now},
        "auto_released": {"$ne": True}
    }, {"_id": 0}).to_list(100)
    
    released_count = 0
    
    for txn in due_transactions:
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
        
        released_count += 1
    
    return {"message": f"Processed {released_count} auto-releases", "released_count": released_count}


@router.get("/pending-auto-releases")
async def get_pending_auto_releases(request: Request):
    """Get list of transactions pending auto-release"""
    db = get_database()
    await require_admin(request, db)
    
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



# ============ TRADESAFE TOKEN ADMIN ============

@router.get("/tradesafe/token/{token_id}")
async def admin_get_token_details(request: Request, token_id: str):
    """Get TradeSafe token details (admin only)"""
    from tradesafe_service import get_token_details
    
    db = get_database()
    await require_admin(request, db)
    
    logger.info(f"Admin fetching token details: {token_id}")
    
    details = await get_token_details(token_id)
    
    if not details:
        raise HTTPException(status_code=404, detail="Token not found")
    
    return {
        "success": True,
        "token": details
    }


@router.post("/tradesafe/token-withdraw")
async def admin_request_withdrawal(request: Request):
    """Request withdrawal from a token wallet (admin only)"""
    from tradesafe_service import request_token_withdrawal
    
    db = get_database()
    await require_admin(request, db)
    
    body = await request.json()
    token_id = body.get("token_id")
    value = body.get("value")  # In cents
    
    if not token_id or not value:
        raise HTTPException(status_code=400, detail="token_id and value required")
    
    logger.info(f"Admin requesting withdrawal: {token_id}, {value} cents")
    
    result = await request_token_withdrawal(token_id, int(value))
    
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "Withdrawal failed"))
    
    return result


@router.post("/transactions/{transaction_id}/mark-refunded-local")
async def admin_mark_refunded_local(request: Request, transaction_id: str):
    """
    LOCAL STATUS UPDATE ONLY - Does NOT execute a TradeSafe refund.
    
    This endpoint only updates the TrustTrade database to mark a transaction as refunded.
    Use this AFTER manually processing refund via TradeSafe dashboard.
    
    TODO: Implement real TradeSafe refund using allocationRefund mutation
    when TradeSafe API access for refunds is confirmed.
    """
    db = get_database()
    admin_user = await require_admin(request, db)
    
    body = await request.json()
    reason = body.get("reason", "Admin initiated refund")
    
    # Get transaction
    txn = await db.transactions.find_one({"transaction_id": transaction_id}, {"_id": 0})
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    tradesafe_id = txn.get("tradesafe_id")
    if not tradesafe_id:
        raise HTTPException(status_code=400, detail="Transaction not linked to TradeSafe")
    
    logger.info(f"[LOCAL ONLY] Admin marking transaction {transaction_id} as refunded by {admin_user.email}")
    
    # WARNING: This only updates local TrustTrade database state.
    # It does NOT execute a refund on TradeSafe.
    
    # Update transaction status
    timeline = txn.get("timeline", [])
    timeline.append({
        "status": "Marked as Refunded (Local)",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "by": admin_user.name,
        "details": f"{reason} - LOCAL STATUS UPDATE ONLY"
    })
    
    await db.transactions.update_one(
        {"transaction_id": transaction_id},
        {"$set": {
            "payment_status": "Refunded",
            "release_status": "Refunded",
            "refund_reason": reason,
            "refunded_at": datetime.now(timezone.utc).isoformat(),
            "refunded_by": admin_user.email,
            "timeline": timeline
        }}
    )
    
    # Log audit
    await db.admin_audit_log.insert_one({
        "action": "refund",
        "transaction_id": transaction_id,
        "admin_email": admin_user.email,
        "reason": reason,
        "timestamp": datetime.now(timezone.utc).isoformat()
    })
    
    logger.info(f"[LOCAL ONLY] Transaction {transaction_id} marked as refunded")
    
    return {
        "success": True,
        "transaction_id": transaction_id,
        "status": "Marked as Refunded (Local)",
        "warning": "LOCAL STATUS UPDATE ONLY. This does NOT execute a TradeSafe refund. Use TradeSafe dashboard or implement allocationRefund mutation to actually refund funds."
    }


@router.post("/transactions/{transaction_id}/refund-withdraw")
async def admin_refund_withdraw(request: Request, transaction_id: str):
    """
    Withdraw refunded funds from token wallet (admin only).
    Use after refund when funds are sitting in the buyer's token.
    """
    from tradesafe_service import request_token_withdrawal
    
    db = get_database()
    await require_admin(request, db)
    
    # Get transaction
    txn = await db.transactions.find_one({"transaction_id": transaction_id}, {"_id": 0})
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    if txn.get("payment_status") != "Refunded":
        raise HTTPException(status_code=400, detail="Transaction must be refunded first")
    
    # Get buyer's token
    buyer_user_id = txn.get("buyer_user_id")
    buyer = await db.users.find_one({"user_id": buyer_user_id}, {"_id": 0})
    
    if not buyer or not buyer.get("tradesafe_token_id"):
        raise HTTPException(status_code=400, detail="Buyer has no token for withdrawal")
    
    # Amount in cents
    amount_cents = int(txn.get("total", 0) * 100)
    
    if amount_cents <= 0:
        raise HTTPException(status_code=400, detail="Invalid withdrawal amount")
    
    logger.info(f"Admin refund withdrawal: {transaction_id}, {amount_cents} cents")
    
    result = await request_token_withdrawal(buyer["tradesafe_token_id"], amount_cents)
    
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "Withdrawal failed"))
    
    # Update transaction
    await db.transactions.update_one(
        {"transaction_id": transaction_id},
        {"$set": {
            "refund_withdrawn": True,
            "refund_withdrawn_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {
        "success": True,
        "transaction_id": transaction_id,
        "amount_withdrawn": amount_cents / 100,
        "new_balance": result.get("new_balance")
    }
