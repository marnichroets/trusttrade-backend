"""
TrustTrade Admin Routes
Handles admin dashboard, user management, monitoring, and system actions
"""

import os
import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException, Request, Response

from core.config import settings
from core.database import get_database
from core.security import get_user_from_token, require_admin
from models.user import User
from models.transaction import Transaction
from models.dispute import Dispute, DisputeStatusUpdate
from models.common import (
    RiskAssessment, AdminRefundRequest, AdminReleaseRequest,
    AdminNotesRequest, AdminStatusOverride, AdminSendEmail,
    VerificationStatusUpdate, AdminCancelRequest
)
from email_service import (
    send_email, send_verification_status_email, send_refund_email,
    send_funds_released_email, send_dispute_resolved_email
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/admin", tags=["Admin"])
logger.info("[ADMIN] admin router loaded — POST /api/admin/smart-deals/{deal_id}/release-funds registered")


async def _bg(coro):
    """Fire-and-forget coroutine wrapper."""
    try:
        await coro
    except Exception as exc:
        logger.error(f"[ADMIN_BG] {exc}")


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

    # Release escrow on TradeSafe and request payout processing to seller's bank
    allocation_id = transaction.get("tradesafe_allocation_id")
    seller_token_id = transaction.get("tradesafe_seller_token_id")
    if allocation_id:
        from tradesafe_service import start_delivery, accept_delivery
        try:
            await start_delivery(allocation_id)
            payout_result = await accept_delivery(
                allocation_id,
                seller_token_id=seller_token_id,
                amount=float(net_amount) if net_amount else None,
            )
            logger.info(f"[ADMIN_RELEASE] accept_delivery txn={transaction_id}: {payout_result}")
        except Exception as exc:
            logger.error(f"[ADMIN_RELEASE] TradeSafe release failed for {transaction_id}: {exc}")
    else:
        logger.warning(f"[ADMIN_RELEASE] No tradesafe_allocation_id on txn {transaction_id} — skipping TradeSafe release")

    return {
        "message": "Funds released successfully",
        "transaction_id": transaction_id,
        "net_amount": net_amount,
    }


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


_CANCELLABLE_STATES = {"CREATED", "PENDING_CONFIRMATION", "AWAITING_PAYMENT"}
_CANCELLABLE_PAYMENT_STATUSES = {
    "Pending Seller Confirmation", "Pending Buyer Confirmation",
    "Ready for Payment", "Awaiting Payment", "Pending Payment",
}


@router.post("/transactions/{transaction_id}/cancel")
async def admin_cancel_transaction(request: Request, transaction_id: str, cancel_data: AdminCancelRequest):
    """Admin: Cancel and archive a transaction that hasn't progressed past the payment stage."""
    db = get_database()
    user = await require_admin(request, db)

    transaction = await db.transactions.find_one({"transaction_id": transaction_id}, {"_id": 0})
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")

    if transaction.get("archived"):
        raise HTTPException(status_code=400, detail="Transaction is already archived")

    state = transaction.get("transaction_state", "")
    payment_status = transaction.get("payment_status", "")

    if state not in _CANCELLABLE_STATES:
        raise HTTPException(
            status_code=400,
            detail="Transaction cannot be cancelled: escrow has already been created or funds are secured"
        )

    if payment_status not in _CANCELLABLE_PAYMENT_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Transaction cannot be cancelled in its current payment status: {payment_status}"
        )

    now_iso = datetime.now(timezone.utc).isoformat()
    reason = cancel_data.reason.strip() or "Cancelled by admin"

    timeline = transaction.get("timeline", [])
    timeline.append({
        "status": "Transaction cancelled by admin",
        "timestamp": now_iso,
        "by": user.email,
        "details": reason,
    })

    await db.transactions.update_one(
        {"transaction_id": transaction_id},
        {"$set": {
            "transaction_state": "CANCELLED",
            "payment_status": "Cancelled",
            "archived": True,
            "archived_at": now_iso,
            "cancelled_at": now_iso,
            "cancelled_by": user.email,
            "cancel_reason": reason,
            "timeline": timeline,
        }}
    )

    logger.info(f"[ADMIN_CANCEL] txn={transaction_id} cancelled by {user.email}: {reason}")
    return {"message": "Transaction cancelled and archived", "transaction_id": transaction_id}


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

@router.get("/config-check")
async def check_admin_config(request: Request):
    """Admin-only: Check current admin configuration"""
    db = get_database()
    admin = await require_admin(request, db)
    
    return {
        "admin_email_configured": settings.ADMIN_EMAIL,
        "db_name": settings.DB_NAME,
        "current_user_email": admin.email,
        "current_user_is_admin": admin.is_admin,
        "message": "If ADMIN_EMAIL matches your email but is_admin is false, log out and log back in to sync admin status."
    }


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


@router.post("/tradesafe/token-withdraw-legacy")
async def admin_request_withdrawal_legacy(request: Request):
    """
    DEPRECATED: Legacy withdrawal endpoint requiring explicit amount.
    Use POST /api/admin/tradesafe/token-withdraw instead (only requires token).
    """
    from tradesafe_service import request_token_withdrawal
    
    db = get_database()
    await require_admin(request, db)
    
    body = await request.json()
    token_id = body.get("token_id")
    value = body.get("value")  # In cents
    
    if not token_id or not value:
        raise HTTPException(status_code=400, detail="token_id and value required")
    
    logger.info(f"[LEGACY WITHDRAW] Admin requesting withdrawal: {token_id}, {value} cents")
    
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



# ============ EMAIL TEST ============

@router.get("/test-email")
async def test_email(request: Request, to: str = "marnichr@gmail.com"):
    """
    Send a test email to verify Postmark is working.
    GET /api/admin/test-email?to=email@example.com
    """
    db = get_database()
    await require_admin(request, db)
    
    logger.info(f"[EMAIL TEST] Sending test email to {to}")
    print(f"[EMAIL TEST] Starting test email to {to}")
    
    try:
        result = await send_email(
            to_email=to,
            to_name="Test Recipient",
            subject="TrustTrade Email Test",
            html_content="""
            <div style="font-family: Arial, sans-serif; padding: 20px;">
                <h1 style="color: #1a2942;">TrustTrade Email Test</h1>
                <p>This is a test email from TrustTrade.</p>
                <p>If you received this, the email system is working correctly!</p>
                <p style="color: #666; font-size: 12px;">Sent at: """ + datetime.now(timezone.utc).isoformat() + """</p>
            </div>
            """
        )
        
        if result:
            logger.info(f"[EMAIL TEST] SUCCESS - sent to {to}")
            print(f"[EMAIL TEST] SUCCESS - sent to {to}")
            return {"success": True, "message": f"Test email sent to {to}", "recipient": to}
        else:
            logger.warning(f"[EMAIL TEST] FAILED - could not send to {to}")
            print(f"[EMAIL TEST] FAILED - could not send to {to}")
            return {"success": False, "message": "Email send returned False", "recipient": to}
            
    except Exception as e:
        logger.error(f"[EMAIL TEST] ERROR: {str(e)}")
        print(f"[EMAIL TEST] ERROR: {str(e)}")
        return {"success": False, "error": str(e), "recipient": to}



# ============ TRADESAFE TOKEN RECOVERY (TEMPORARY ADMIN TOOL) ============

from pydantic import BaseModel

class TokenRecoveryUpdateRequest(BaseModel):
    """Request to update TradeSafe token with banking details"""
    token: str  # The TradeSafe token ID
    mobile_number: str  # South African mobile number
    bank_name: str  # Bank name (e.g., "STANDARD_BANK", "FNB", "ABSA")
    account_holder: str  # Name on the account
    account_number: str  # Bank account number
    branch_code: str  # Universal branch code
    account_type: str  # "SAVINGS" or "CHEQUE"


@router.get("/tradesafe/token-recovery/{token}")
async def get_token_recovery_details(request: Request, token: str):
    """
    ADMIN ONLY: Get TradeSafe token details for recovery.
    Returns balance, validity, banking status, and payout readiness.
    """
    from tradesafe_service import execute_graphql
    
    db = get_database()
    admin = await require_admin(request, db)
    
    logger.info(f"[TOKEN_RECOVERY] Admin {admin.email} checking token: {token}")
    
    # Query TradeSafe for full token details
    query = """
    query token($id: ID!) {
        token(id: $id) {
            id
            name
            balance
            valid
            user {
                givenName
                familyName
                email
                mobile
                idNumber
            }
            bankAccount {
                bank
                accountNumber
                branchCode
                accountType
            }
            settings {
                payout {
                    interval
                }
            }
        }
    }
    """
    
    try:
        result = await execute_graphql(query, {"id": token})
        
        if result and 'errors' in result:
            error_msg = result['errors'][0].get('message', 'Unknown error')
            logger.error(f"[TOKEN_RECOVERY] GraphQL error: {error_msg}")
            return {
                "success": False,
                "error": error_msg,
                "token": token
            }
        
        if result and 'token' in result:
            token_data = result['token']
            
            # TradeSafe returns token.balance as ZAR decimal, not cents.
            balance = _as_money(token_data.get('balance')) or 0
            has_banking = bool(token_data.get('bankAccount') and token_data['bankAccount'].get('accountNumber'))
            has_mobile = bool(token_data.get('user') and token_data['user'].get('mobile'))
            is_valid = token_data.get('valid', False)
            
            # Determine payout readiness
            payout_ready = is_valid and has_banking and has_mobile and balance > 0
            
            return {
                "success": True,
                "token": token,
                "balance": balance,
                "balance_raw": token_data.get('balance'),
                "balance_unit": "ZAR",
                "valid": is_valid,
                "complete": has_banking and has_mobile,
                "payout_ready": payout_ready,
                "has_banking_details": has_banking,
                "has_mobile": has_mobile,
                "user": token_data.get('user'),
                "bank_account": token_data.get('bankAccount'),
                "settings": token_data.get('settings'),
                "raw_response": token_data
            }
        
        return {
            "success": False,
            "error": "Token not found or invalid response",
            "token": token
        }
        
    except Exception as e:
        logger.error(f"[TOKEN_RECOVERY] Error checking token {token}: {str(e)}")
        return {
            "success": False,
            "error": str(e),
            "token": token
        }


@router.post("/tradesafe/token-recovery/update")
async def update_token_for_recovery(request: Request, data: TokenRecoveryUpdateRequest):
    """
    ADMIN ONLY: Update TradeSafe token with mobile number and banking details.
    Used to recover legacy tokens that need banking info before withdrawal.
    
    WARNING: Banking details may be irreversible. Double-check before updating.
    
    NEVER triggers automatic withdrawal - manual review required.
    """
    from tradesafe_service import execute_graphql
    
    db = get_database()
    admin = await require_admin(request, db)
    
    logger.info("=" * 60)
    logger.info("[TOKEN_RECOVERY] === UPDATE REQUEST ===")
    logger.info(f"Admin: {admin.email}")
    logger.info(f"Token: {data.token}")
    logger.info(f"Mobile: {data.mobile_number}")
    logger.info(f"Bank: {data.bank_name}")
    logger.info(f"Account Holder: {data.account_holder}")
    logger.info(f"Account: ***{data.account_number[-4:] if len(data.account_number) >= 4 else '****'}")
    logger.info(f"Branch: {data.branch_code}")
    logger.info(f"Type: {data.account_type}")
    logger.info("=" * 60)
    
    # Normalize mobile number to international format
    mobile = data.mobile_number.strip()
    if mobile.startswith('0'):
        mobile = '+27' + mobile[1:]
    elif not mobile.startswith('+'):
        mobile = '+27' + mobile
    
    # Normalize bank name
    bank_name = data.bank_name.upper().replace(" ", "_")
    
    # Map account type
    account_type_map = {
        "savings": "SAVINGS",
        "cheque": "CHEQUE",
        "checking": "CHEQUE",
        "current": "CHEQUE",
        "SAVINGS": "SAVINGS",
        "CHEQUE": "CHEQUE",
    }
    account_type = account_type_map.get(data.account_type.lower(), "SAVINGS")
    
    # Build the tokenUpdate mutation with mobile and banking
    mutation = """
    mutation tokenUpdate($id: ID!, $input: TokenInput!) {
        tokenUpdate(id: $id, input: $input) {
            id
            name
            balance
            valid
            user {
                givenName
                familyName
                email
                mobile
            }
            bankAccount {
                bank
                accountNumber
                branchCode
                accountType
            }
            settings {
                payout {
                    interval
                }
            }
        }
    }
    """
    
    variables = {
        "id": data.token,
        "input": {
            "user": {
                "mobile": mobile
            },
            "bankAccount": {
                "bank": bank_name,
                "accountNumber": data.account_number,
                "branchCode": data.branch_code,
                "accountType": account_type
            },
            "settings": {
                "payout": {
                    "interval": "WALLET" if data.token == os.environ.get("TRUSTTRADE_ORG_TOKEN_ID", "32fbUbeMWjdor4uHBJdns") else "IMMEDIATE",
                    "refund": "WALLET"
                }
            }
        }
    }
    
    logger.info(f"[TOKEN_RECOVERY] GraphQL variables: {variables}")
    
    try:
        result = await execute_graphql(mutation, variables)
        
        logger.info(f"[TOKEN_RECOVERY] GraphQL result: {result}")
        
        if result and 'errors' in result:
            errors = result['errors']
            error_msg = errors[0].get('message', 'Unknown error') if errors else 'Unknown error'
            debug_msg = errors[0].get('extensions', {}).get('debugMessage', '') if errors else ''
            validation_errors = errors[0].get('extensions', {}).get('validation', {}) if errors else {}
            
            logger.error(f"[TOKEN_RECOVERY] Update failed: {error_msg}")
            logger.error(f"[TOKEN_RECOVERY] Debug: {debug_msg}")
            logger.error(f"[TOKEN_RECOVERY] Validation: {validation_errors}")
            
            return {
                "success": False,
                "error": error_msg,
                "debug_message": debug_msg,
                "validation_errors": validation_errors,
                "token": data.token
            }
        
        if result and 'tokenUpdate' in result:
            updated = result['tokenUpdate']
            balance = _as_money(updated.get('balance')) or 0
            has_banking = bool(updated.get('bankAccount') and updated['bankAccount'].get('accountNumber'))
            has_mobile = bool(updated.get('user') and updated['user'].get('mobile'))
            is_valid = updated.get('valid', False)
            
            logger.info("[TOKEN_RECOVERY] === UPDATE SUCCESSFUL ===")
            logger.info(f"Token: {updated.get('id')}")
            logger.info(f"Balance: R{balance:.2f}")
            logger.info(f"Valid: {is_valid}")
            logger.info(f"Has Banking: {has_banking}")
            logger.info(f"Has Mobile: {has_mobile}")
            
            return {
                "success": True,
                "message": "Token updated successfully. Review details before any withdrawal.",
                "token": updated.get('id'),
                "balance": balance,
                "balance_raw": updated.get('balance'),
                "balance_unit": "ZAR",
                "valid": is_valid,
                "complete": has_banking and has_mobile,
                "user": updated.get('user'),
                "bank_account": updated.get('bankAccount'),
                "settings": updated.get('settings'),
                "raw_response": updated
            }
        
        logger.error(f"[TOKEN_RECOVERY] Unexpected response: {result}")
        return {
            "success": False,
            "error": "Unexpected response from TradeSafe",
            "token": data.token,
            "raw_response": result
        }
        
    except Exception as e:
        logger.error(f"[TOKEN_RECOVERY] Exception: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return {
            "success": False,
            "error": str(e),
            "token": data.token
        }



class TokenWithdrawRequest(BaseModel):
    """Request to withdraw funds from TradeSafe token"""
    token: str  # The TradeSafe token ID


@router.post("/tradesafe/token-withdraw")
async def withdraw_token(request: Request, data: TokenWithdrawRequest):
    """
    ADMIN ONLY: Withdraw full balance from a TradeSafe token.
    
    Request body:
    {
        "token": "TradeSafe-token-id"
    }
    
    Prerequisites (validated in service layer):
    - Token must be complete (has mobile + banking)
    - Token must have balance > 0
    
    This initiates a bank transfer. Bank settlement may take up to 2 business days.
    """
    from tradesafe_service import withdraw_token_full_balance
    from datetime import datetime, timezone
    
    db = get_database()
    admin = await require_admin(request, db)
    
    # Validate token provided
    if not data.token or not data.token.strip():
        raise HTTPException(status_code=400, detail="token required")
    
    token = data.token.strip()
    
    logger.info("=" * 60)
    logger.info("[WITHDRAW] Endpoint called by admin: %s", admin.email)
    logger.info("[WITHDRAW] Token received from frontend: %s", token)
    logger.info("[WITHDRAW] Timestamp: %s", datetime.now(timezone.utc).isoformat())
    logger.info("=" * 60)
    
    try:
        # Call the TradeSafe withdrawal service - amount logic handled in service
        result = await withdraw_token_full_balance(token)
        
        if result.get("success"):
            logger.info("=" * 60)
            logger.info("[WITHDRAW] SUCCESS")
            logger.info("[WITHDRAW] Admin: %s", admin.email)
            logger.info("[WITHDRAW] Token: %s", token)
            logger.info("[WITHDRAW] Amount: R%.2f", result.get('amount_rands', 0))
            logger.info("[WITHDRAW] Timestamp: %s", datetime.now(timezone.utc).isoformat())
            logger.info("=" * 60)
            
            return {
                "success": True,
                "message": result.get("message", "Withdrawal initiated"),
                "token": token,
                "amount_cents": result.get("amount_cents", 0),
                "amount_rands": result.get("amount_rands", 0),
                "new_balance_cents": result.get("new_balance_cents", 0),
                "new_balance_rands": result.get("new_balance_rands", 0)
            }
        else:
            logger.warning("[WITHDRAW] FAILED - %s", result.get('error'))
            logger.warning("[WITHDRAW] Debug message: %s", result.get('debug_message'))
            logger.warning("[WITHDRAW] Raw response: %s", result.get('raw_response'))
            
            # Return full error details to frontend (not via HTTPException to preserve structure)
            return {
                "success": False,
                "error": result.get("error", "Unknown error"),
                "debug_message": result.get("debug_message"),
                "validation_errors": result.get("validation_errors"),
                "raw_response": result.get("raw_response"),
                "token": token
            }
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error("[WITHDRAW] Exception: %s", str(e))
        import traceback
        logger.error(traceback.format_exc())
        return {
            "success": False,
            "error": str(e),
            "debug_message": "Python exception in withdrawal endpoint",
            "token": token
        }



# ============ PAYOUT MANAGEMENT ============

class BankingSyncRequest(BaseModel):
    """Request to sync banking details to a TradeSafe token"""
    token_id: str
    bank_name: str
    account_number: str
    branch_code: str
    account_type: str
    mobile: Optional[str] = None


@router.get("/payout-status/{transaction_id}")
async def get_payout_status(request: Request, transaction_id: str):
    """
    ADMIN ONLY: Get detailed payout status for a transaction.
    Shows TradeSafe token details, banking status, and payout readiness.
    """
    from tradesafe_service import check_payout_readiness, get_token_details
    
    db = get_database()
    admin = await require_admin(request, db)
    
    transaction = await db.transactions.find_one(
        {"transaction_id": transaction_id},
        {"_id": 0}
    )
    
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    seller_token_id = transaction.get("tradesafe_seller_token_id")
    
    # Get payout readiness
    payout_check = await check_payout_readiness(seller_token_id) if seller_token_id else {
        "ready": False,
        "issues": ["No seller token ID stored"]
    }
    
    return {
        "transaction_id": transaction_id,
        "tradesafe_id": transaction.get("tradesafe_id"),
        "tradesafe_allocation_id": transaction.get("tradesafe_allocation_id"),
        "tradesafe_seller_token_id": seller_token_id,
        "tradesafe_buyer_token_id": transaction.get("tradesafe_buyer_token_id"),
        "tradesafe_state": transaction.get("tradesafe_state"),
        "payment_status": transaction.get("payment_status"),
        "payout_status": transaction.get("payout_status", "unknown"),
        "withdrawal_status": transaction.get("withdrawal_status"),
        "withdrawal_triggered": transaction.get("withdrawal_triggered", False),
        "withdrawal_error": transaction.get("withdrawal_error"),
        "withdrawal_triggered_at": transaction.get("withdrawal_triggered_at"),
        "withdrawal_completed_at": transaction.get("withdrawal_completed_at"),
        "tradesafe_withdrawal_id": transaction.get("tradesafe_withdrawal_id"),
        "bank_reference": transaction.get("bank_reference"),
        "settlement_reference": transaction.get("settlement_reference"),
        "settlement_status": transaction.get("settlement_status"),
        "settlement_checked_at": transaction.get("settlement_checked_at"),
        "delivery_confirmed": transaction.get("delivery_confirmed", False),
        "funds_released_at": transaction.get("funds_released_at"),
        "payout_readiness": payout_check
    }


@router.post("/sync-banking-to-token")
async def sync_banking_to_token_admin(request: Request, data: BankingSyncRequest):
    """
    ADMIN ONLY: Sync banking details to a TradeSafe token.
    Used to fix tokens that are missing banking info for payout.
    """
    from tradesafe_service import sync_banking_to_token, check_payout_readiness
    
    db = get_database()
    admin = await require_admin(request, db)
    
    masked_mobile = (
        f"{data.mobile[:6]}***{data.mobile[-2:]}" if data.mobile and len(data.mobile) > 6
        else data.mobile or "not provided"
    )
    logger.info("=" * 60)
    logger.info("[BANKING_SYNC] Admin banking sync request")
    logger.info(f"[BANKING_SYNC] Admin: {admin.email}")
    logger.info(f"[BANKING_SYNC] Token: {data.token_id}")
    logger.info(f"[BANKING_SYNC] Bank: {data.bank_name}")
    logger.info(f"[BANKING_SYNC] Account: ***{data.account_number[-4:] if len(data.account_number) >= 4 else '****'}")
    logger.info(f"[BANKING_SYNC] Mobile: {masked_mobile}")
    logger.info("=" * 60)

    # Sync the banking details (mobile is included in the tokenUpdate user object)
    result = await sync_banking_to_token(
        token_id=data.token_id,
        bank_name=data.bank_name,
        account_number=data.account_number,
        branch_code=data.branch_code,
        account_type=data.account_type,
        mobile=data.mobile,
    )

    if not result.get("success"):
        return {
            "success": False,
            "error": result.get("error", "Unknown error"),
            "token_id": data.token_id,
        }

    # Check payout readiness after sync
    payout_check = await check_payout_readiness(data.token_id)

    updated_token = result.get("token") or {}
    updated_mobile = (updated_token.get("user") or {}).get("mobile")

    return {
        "success": True,
        "message": "Banking details synced successfully",
        "token_id": data.token_id,
        "mobile_on_token": updated_mobile,
        "payout_ready": payout_check.get("ready", False),
        "payout_check": payout_check,
    }


@router.get("/transactions/{transaction_id}/tradesafe-details")
async def get_transaction_tradesafe_details(request: Request, transaction_id: str):
    """
    ADMIN ONLY: Get full TradeSafe details for a transaction including token info.
    """
    from tradesafe_service import get_token_details, get_tradesafe_transaction
    
    db = get_database()
    admin = await require_admin(request, db)
    
    transaction = await db.transactions.find_one(
        {"transaction_id": transaction_id},
        {"_id": 0}
    )
    
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    result = {
        "transaction_id": transaction_id,
        "item_description": transaction.get("item_description"),
        "item_price": transaction.get("item_price"),
        "status": transaction.get("status"),
        "payment_status": transaction.get("payment_status"),
        "payout_status": transaction.get("payout_status"),
        "bank_details_attached": transaction.get("bank_details_attached", False),  # Token-level banking
        "payout_ready": transaction.get("payout_ready", False),
        "tradesafe": {
            "tradesafe_id": transaction.get("tradesafe_id"),
            "tradesafe_allocation_id": transaction.get("tradesafe_allocation_id"),
            "tradesafe_state": transaction.get("tradesafe_state"),
            "tradesafe_fee_allocation": transaction.get("tradesafe_fee_allocation")
        },
        "tokens": {
            "seller_token_id": transaction.get("tradesafe_seller_token_id"),
            "buyer_token_id": transaction.get("tradesafe_buyer_token_id")
        },
        "seller_token_details": None,
        "buyer_token_details": None,
        "tradesafe_transaction": None,
        "seller_profile_banking": None,  # Profile-level banking status
        "token_banking_status": None      # Token-level banking status
    }
    
    # Get seller's profile banking status
    seller_email = transaction.get("seller_email")
    if seller_email:
        seller_user = await db.users.find_one({"email": seller_email.lower()})
        if seller_user:
            result["seller_profile_banking"] = {
                "has_banking": seller_user.get("banking_details_completed", False),
                "bank_name": seller_user.get("banking_details", {}).get("bank_name"),
                "account_number_last4": seller_user.get("banking_details", {}).get("account_number", "")[-4:] if seller_user.get("banking_details", {}).get("account_number") else None,
                "phone": seller_user.get("phone")
            }
    
    # Get seller token details (actual TradeSafe token banking)
    seller_token_id = transaction.get("tradesafe_seller_token_id")
    if seller_token_id:
        token_details = await get_token_details(seller_token_id)
        result["seller_token_details"] = token_details
        
        if token_details:
            has_token_banking = bool(token_details.get("bankAccount") and token_details["bankAccount"].get("accountNumber"))
            has_token_mobile = bool(token_details.get("user", {}).get("mobile"))
            result["token_banking_status"] = {
                "has_banking": has_token_banking,
                "has_mobile": has_token_mobile,
                "payout_ready": has_token_banking and has_token_mobile,
                "bank_name": token_details.get("bankAccount", {}).get("bank") if token_details.get("bankAccount") else None,
                "balance": _token_balance_rands(token_details),
                "balance_raw": token_details.get("balance", 0),
                "balance_unit": "ZAR"
            }
    
    # Get buyer token details
    buyer_token_id = transaction.get("tradesafe_buyer_token_id")
    if buyer_token_id:
        result["buyer_token_details"] = await get_token_details(buyer_token_id)
    
    # Get TradeSafe transaction details
    tradesafe_id = transaction.get("tradesafe_id")
    if tradesafe_id:
        result["tradesafe_transaction"] = await get_tradesafe_transaction(tradesafe_id)
    
    return result


@router.patch("/transactions/{transaction_id}/payout-status")
async def update_payout_status(request: Request, transaction_id: str):
    """
    ADMIN ONLY: Update payout status for a transaction.
    Valid statuses: pending, awaiting_bank_payout, payout_processing, payout_completed, payout_failed
    """
    db = get_database()
    admin = await require_admin(request, db)
    
    body = await request.json()
    new_status = body.get("payout_status")
    
    valid_statuses = ["pending", "awaiting_bank_payout", "payout_processing", "payout_completed", "payout_failed"]
    if new_status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid_statuses}")
    
    transaction = await db.transactions.find_one({"transaction_id": transaction_id})


@router.post("/transactions/{transaction_id}/retry-withdrawal")
async def retry_transaction_withdrawal(request: Request, transaction_id: str):
    """
    ADMIN ONLY: Retry a failed or pending bank withdrawal for a released transaction.
    Idempotency is enforced by withdrawal_status in attempt_transaction_withdrawal.
    """
    db = get_database()
    admin = await require_admin(request, db)
    try:
        body = await request.json()
    except Exception:
        body = {}
    confirmation_reason = (body or {}).get("reason") or (body or {}).get("confirmation_reason")
    if not confirmation_reason or len(str(confirmation_reason).strip()) < 12:
        raise HTTPException(status_code=400, detail="Admin confirmation reason is required before retrying withdrawal")

    transaction = await db.transactions.find_one({"transaction_id": transaction_id}, {"_id": 0})
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")

    if transaction.get("tradesafe_state") not in ("FUNDS_RELEASED", "COMPLETE", "COMPLETED"):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot retry withdrawal while TradeSafe state is {transaction.get('tradesafe_state')!r}"
        )

    withdrawal_status = transaction.get("withdrawal_status")
    if withdrawal_status in ("in_progress", "succeeded"):
        raise HTTPException(
            status_code=400,
            detail=f"Withdrawal already {withdrawal_status}"
        )

    if not transaction.get("tradesafe_seller_token_id"):
        raise HTTPException(status_code=400, detail="Transaction has no seller token ID")

    if transaction.get("settlement_reference") or transaction.get("bank_reference"):
        raise HTTPException(status_code=400, detail="Transaction already has settlement/bank reference evidence")

    try:
        net_amount = float(transaction.get("net_amount"))
    except (TypeError, ValueError):
        net_amount = 0

    if net_amount <= 0:
        raise HTTPException(status_code=400, detail="Transaction has no valid net_amount")

    from tradesafe_service import get_token_details, get_token_statement
    token_id = transaction.get("tradesafe_seller_token_id")
    token = await get_token_details(token_id)
    token_balance = _token_balance_rands(token) or 0
    if token_balance + 0.01 < net_amount:
        raise HTTPException(status_code=400, detail=f"Token balance R{token_balance:.2f} is below expected payout R{net_amount:.2f}")

    statement = await get_token_statement(token_id, first=100, page=1)
    rows = [_normalize_token_statement_entry(token_id, entry) for entry in (statement.get("entries") or [])]
    references = [
        transaction.get("transaction_id"),
        transaction.get("deal_id"),
        transaction.get("share_code"),
        transaction.get("tradesafe_id"),
        transaction.get("tradesafe_transaction_id"),
        transaction.get("tradesafe_allocation_id"),
    ]
    matches = _matching_statement_entries(rows, net_amount, references)
    existing_acsp_withdrawal = [
        row for row in matches
        if row.get("category") == "withdrawal_debit" and str(row.get("status") or "").upper() == "ACSP"
    ]
    if existing_acsp_withdrawal:
        raise HTTPException(status_code=400, detail="Existing ACSP withdrawal evidence found in tokenStatement; retry blocked")

    from routes.webhooks import attempt_transaction_withdrawal
    from services.reconciliation_service import write_audit_record

    result = await attempt_transaction_withdrawal(db, transaction, source=f"admin:{admin.email}")

    await db.admin_actions.insert_one({
        "admin_email": admin.email,
        "admin_name": admin.name,
        "action": "retry_withdrawal",
        "transaction_id": transaction_id,
        "confirmation_reason": confirmation_reason,
        "token_balance_checked": token_balance,
        "existing_acsp_withdrawal": False,
        "result": result,
        "timestamp": datetime.now(timezone.utc).isoformat()
    })
    await write_audit_record(
        db,
        "retry_withdrawal",
        admin.email,
        transaction_id=transaction_id,
        details={
            "confirmation_reason": confirmation_reason,
            "token_balance": token_balance,
            "net_amount": net_amount,
            "result": result,
        },
    )

    if not result.get("success"):
        return {
            "success": False,
            "transaction_id": transaction_id,
            "result": result,
        }

    return {
        "success": True,
        "transaction_id": transaction_id,
        "result": result,
    }


@router.post("/transactions/{transaction_id}/resync-banking")
async def resync_banking_to_transaction(request: Request, transaction_id: str):
    """
    ADMIN ONLY: Resync seller's profile banking details to the TradeSafe token for this transaction.
    Use when profile banking exists but wasn't synced to the token at escrow creation time.
    """
    from tradesafe_service import sync_banking_to_token, check_payout_readiness
    
    db = get_database()
    admin = await require_admin(request, db)
    
    transaction = await db.transactions.find_one({"transaction_id": transaction_id}, {"_id": 0})
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    seller_token_id = transaction.get("tradesafe_seller_token_id")
    if not seller_token_id:
        raise HTTPException(status_code=400, detail="No seller token ID on this transaction")
    
    # Get seller's profile banking
    seller_email = transaction.get("seller_email")
    seller_user = await db.users.find_one({"email": seller_email.lower()}) if seller_email else None
    
    if not seller_user:
        raise HTTPException(status_code=404, detail="Seller user not found")
    
    if not seller_user.get("banking_details_completed"):
        raise HTTPException(status_code=400, detail="Seller has no banking details in profile")
    
    banking = seller_user.get("banking_details", {})
    seller_mobile = seller_user.get("phone") or transaction.get("seller_phone")
    
    if not banking.get("bank_name") or not banking.get("account_number"):
        raise HTTPException(status_code=400, detail="Seller profile banking incomplete")
    
    logger.info("=" * 60)
    logger.info(f"[RESYNC_BANKING] Admin: {admin.email}")
    logger.info(f"[RESYNC_BANKING] Transaction: {transaction_id}")
    logger.info(f"[RESYNC_BANKING] Seller Token: {seller_token_id}")
    logger.info(f"[RESYNC_BANKING] Bank: {banking.get('bank_name')}")
    logger.info(f"[RESYNC_BANKING] Mobile: {seller_mobile}")
    logger.info("=" * 60)
    
    # Sync banking to token
    sync_result = await sync_banking_to_token(
        token_id=seller_token_id,
        bank_name=banking.get("bank_name"),
        account_number=banking.get("account_number"),
        branch_code=banking.get("branch_code", ""),
        account_type=banking.get("account_type", "SAVINGS"),
        mobile=seller_mobile
    )
    
    if not sync_result.get("success"):
        logger.error(f"[RESYNC_BANKING] FAILED: {sync_result.get('error')}")
        return {
            "success": False,
            "error": sync_result.get("error"),
            "transaction_id": transaction_id,
            "seller_token_id": seller_token_id
        }
    
    # Check payout readiness
    payout_check = await check_payout_readiness(seller_token_id)
    payout_ready = payout_check.get("ready", False)
    
    # Update transaction record
    timeline = transaction.get("timeline", [])
    timeline.append({
        "status": "Banking Resynced",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "by": f"Admin: {admin.email}",
        "details": f"Banking resynced to token {seller_token_id}"
    })
    
    await db.transactions.update_one(
        {"transaction_id": transaction_id},
        {"$set": {
            "bank_details_attached": True,
            "payout_ready": payout_ready,
            "banking_sync_result": sync_result,
            "timeline": timeline
        }}
    )
    
    logger.info(f"[RESYNC_BANKING] SUCCESS - Payout ready: {payout_ready}")
    logger.info("=" * 60)
    
    return {
        "success": True,
        "message": "Banking synced to TradeSafe token",
        "transaction_id": transaction_id,
        "seller_token_id": seller_token_id,
        "payout_ready": payout_ready,
        "payout_check": payout_check
    }

# ============ FORCE SYNC TOKEN (ONE-OFF RECOVERY TOOL) ============

class ForceSyncTokenRequest(BaseModel):
    token_id: str

@router.post("/force-sync-token")
async def force_sync_token(
    body: ForceSyncTokenRequest,
    request: Request,
):
    db = get_database()
    admin = await require_admin(request, db)
    user_doc = await db.users.find_one({"tradesafe_token_id": body.token_id})
    if not user_doc:
        raise HTTPException(status_code=404, detail=f"No user found with tradesafe_token_id={body.token_id}")
    banking = user_doc.get("banking_details") or {}
    bank_name = banking.get("bank_name")
    account_number = banking.get("account_number")
    branch_code = banking.get("branch_code")
    account_type = banking.get("account_type", "savings")
    if not bank_name or not account_number:
        raise HTTPException(status_code=400, detail=f"User {user_doc.get('email')} has no banking details saved")
    from tradesafe_service import _sync_banking_to_token_impl
    name_parts = (user_doc.get("name") or "").split()
    result = await _sync_banking_to_token_impl(
        token_id=body.token_id,
        bank_name=bank_name,
        account_number=account_number,
        branch_code=branch_code,
        account_type=account_type,
        mobile=user_doc.get("phone"),
        given_name=name_parts[0] if name_parts else None,
        family_name=" ".join(name_parts[1:]) if len(name_parts) > 1 else None,
        email=user_doc.get("email"),
    )
    logger.info(f"[ADMIN] force-sync-token {body.token_id} by {admin.email}: {result}")
    return {
        "token_id": body.token_id,
        "user_email": user_doc.get("email"),
        "bank_name": bank_name,
        "account_number_last4": account_number[-4:] if len(account_number) >= 4 else "****",
        "result": result,
    }


# ============ SMART DEALS ============

def _payout_amount(txn: dict):
    if txn.get("net_amount") is not None:
        return txn.get("net_amount"), "net_amount"
    if txn.get("deal_type") == "DIGITAL_WORK" and txn.get("amount") is not None:
        return txn.get("amount"), "amount"
    if txn.get("item_price") is not None:
        return txn.get("item_price"), "item_price"
    return None, None


def _payout_recommendation(txn: dict, amount, token_balance):
    return False, "No retry - payout retries are disabled while TradeSafe support confirms payout timing and statement semantics"


def _matching_statement_entries(entries: list, amount, references: list):
    matches = []
    reference_terms = [str(ref).lower() for ref in references if ref]
    expected = float(amount) if amount is not None else None

    for entry in entries or []:
        entry_amount = entry.get("amount")
        entry_reference = str(entry.get("reference") or "")
        is_debit = str(entry.get("type") or "").upper() == "DEBIT"
        amount_matches = False
        reference_matches = False

        if expected is not None and entry_amount is not None:
            try:
                amount_matches = abs(float(entry_amount) - expected) <= 1.00
            except (TypeError, ValueError):
                amount_matches = False

        if reference_terms:
            reference_lower = entry_reference.lower()
            reference_matches = any(term in reference_lower for term in reference_terms)

        if is_debit and (amount_matches or reference_matches):
            matches.append(entry)

    return matches


def _as_money(value) -> Optional[float]:
    if value is None:
        return None
    try:
        return round(float(value), 2)
    except (TypeError, ValueError):
        return None


def _token_balance_rands(token: Optional[dict]) -> Optional[float]:
    """TradeSafe token.balance is already a ZAR decimal value."""
    return _as_money((token or {}).get("balance"))


def _parse_dt(value) -> Optional[datetime]:
    if not value:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    text = str(value).replace("Z", "+00:00")
    if " " in text and "T" not in text:
        text = text.replace(" ", "T")
    try:
        parsed = datetime.fromisoformat(text)
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def _business_hours_since(value) -> Optional[float]:
    start = _parse_dt(value)
    if not start:
        return None
    end = datetime.now(timezone.utc)
    cursor = start
    total = 0.0
    while cursor < end:
        next_hour = min(cursor + timedelta(hours=1), end)
        if cursor.weekday() < 5:
            total += (next_hour - cursor).total_seconds() / 3600
        cursor = next_hour
    return round(total, 2)


def _payout_sla_fields(txn: dict, settlement_confirmed_at=None) -> Dict[str, Any]:
    released_at = txn.get("funds_released_at") or txn.get("released_at") or txn.get("completed_at")
    withdrawal_requested_at = txn.get("withdrawal_requested_at") or txn.get("withdrawal_started_at") or txn.get("withdrawal_triggered_at")
    release_dt = _parse_dt(released_at)
    settlement_dt = _parse_dt(settlement_confirmed_at or txn.get("settlement_confirmed_at"))
    age_hours = round((datetime.now(timezone.utc) - release_dt).total_seconds() / 3600, 2) if release_dt else None
    business_age_hours = _business_hours_since(released_at)

    if settlement_dt or txn.get("withdrawal_status") == "succeeded" and txn.get("settlement_status") == "settlement_confirmed":
        status = "completed"
        monitor_level = "completed"
    elif business_age_hours is not None and business_age_hours >= 48:
        status = "critical"
        monitor_level = "critical"
    elif age_hours is not None and age_hours >= 24:
        status = "delayed"
        monitor_level = "delayed"
    elif age_hours is not None and age_hours >= 6:
        status = "on_track"
        monitor_level = "monitor"
    else:
        status = "on_track"
        monitor_level = "on_track"

    return {
        "released_at": release_dt.isoformat() if release_dt else None,
        "withdrawal_requested_at": _parse_dt(withdrawal_requested_at).isoformat() if _parse_dt(withdrawal_requested_at) else None,
        "payout_processing_started_at": _parse_dt(withdrawal_requested_at).isoformat() if _parse_dt(withdrawal_requested_at) else None,
        "expected_settlement_window": "up to 2 business days",
        "payout_sla_status": status,
        "payout_sla_monitor_level": monitor_level,
        "age_hours": age_hours,
        "business_age_hours": business_age_hours,
    }


def _statement_category(entry: dict) -> str:
    entry_type = str(entry.get("type") or "").upper()
    reference = str(entry.get("reference") or "").lower()
    amount = _as_money(entry.get("amount")) or 0

    if "payout from allocation:" in reference:
        return "seller_payout_credit"
    if "payout for allocation:" in reference:
        return "withdrawal_debit"
    if "requested funds to be withdrawn" in reference or "admin requested funds to be withdrawn" in reference:
        return "withdrawal_debit"
    if "fee for eft request" in reference or "fee for" in reference:
        return "tradesafe_fee"
    if "allocated funds to transaction:" in reference:
        return "allocation_debit"
    if "payout from transaction:" in reference or "payout for transaction:" in reference:
        return "agent_fee" if amount < 0 else "seller_payout_credit"
    if "refund" in reference:
        return "refund"
    if entry_type == "DEBIT" and amount < 0:
        return "agent_fee"
    return "unknown"


def _normalize_statement_entry(entry: dict) -> dict:
    amount = _as_money(entry.get("amount"))
    return {
        **entry,
        "amount_normalized": amount,
        "amount_unit": "ZAR",
        "category": _statement_category(entry),
    }


def _normalize_token_statement_entry(token_id: str, entry: dict) -> dict:
    row = _normalize_statement_entry(entry)
    amount = _as_money(row.get("amount_normalized")) or 0
    reference = str(row.get("reference") or "").lower()
    if (
        token_id == "32fbUbeMWjdor4uHBJdns"
        and amount < 0
        and ("payout from transaction:" in reference or "payout for transaction:" in reference)
    ):
        row["category"] = "needs_fee_setup_review"
        row["accounting_note"] = "Org token balance reflects TradeSafe statement accounting and may include historical fee movements."
    return row


async def _get_all_token_statement_entries(token_id: str, first: int = 100) -> Dict[str, Any]:
    from tradesafe_service import get_token_statement

    page = 1
    entries: List[dict] = []
    paginator = None
    while True:
        statement = await get_token_statement(token_id, first=first, page=page)
        paginator = statement.get("paginator")
        entries.extend(_normalize_token_statement_entry(token_id, entry) for entry in (statement.get("entries") or []))
        if not paginator or not paginator.get("hasMorePages"):
            break
        page += 1
        if page > 20:
            logger.warning(f"[FINANCE_LEDGER] stopping tokenStatement pagination at page={page} token={token_id}")
            break
    return {"entries": entries, "paginator": paginator}


def _statement_summary(entries: List[dict]) -> Dict[str, Any]:
    categories = {}
    statuses = {}
    totals = {
        "credits": 0.0,
        "debits": 0.0,
        "seller_payout_credits": 0.0,
        "seller_withdrawals": 0.0,
        "tradesafe_fees": 0.0,
        "agent_fees": 0.0,
        "fee_setup_review": 0.0,
        "allocation_debits": 0.0,
        "pdng_amount": 0.0,
        "acsp_amount": 0.0,
    }

    for entry in entries:
        amount = _as_money(entry.get("amount_normalized")) or 0.0
        entry_type = str(entry.get("type") or "").upper()
        status = str(entry.get("status") or "UNKNOWN").upper()
        category = entry.get("category") or "unknown"

        categories[category] = categories.get(category, 0) + 1
        statuses[status] = statuses.get(status, 0) + 1

        if entry_type == "CREDIT":
            totals["credits"] += amount
        elif entry_type == "DEBIT":
            totals["debits"] += amount
        if category == "seller_payout_credit":
            totals["seller_payout_credits"] += amount
        elif category == "withdrawal_debit":
            totals["seller_withdrawals"] += amount
        elif category == "tradesafe_fee":
            totals["tradesafe_fees"] += amount
        elif category == "agent_fee":
            totals["agent_fees"] += amount
        elif category == "needs_fee_setup_review":
            totals["fee_setup_review"] += amount
        elif category == "allocation_debit":
            totals["allocation_debits"] += amount
        if status == "PDNG":
            totals["pdng_amount"] += amount
        elif status == "ACSP":
            totals["acsp_amount"] += amount

    return {
        "totals": {key: round(value, 2) for key, value in totals.items()},
        "categories": categories,
        "statuses": statuses,
        "pdng_entries": [entry for entry in entries if str(entry.get("status") or "").upper() == "PDNG"],
        "negative_entries": [entry for entry in entries if (_as_money(entry.get("amount_normalized")) or 0) < 0],
    }


def _token_finance_analysis(token: Optional[dict], entries: List[dict]) -> Dict[str, Any]:
    balance = _token_balance_rands(token)
    summary = _statement_summary(entries)
    pending = summary["statuses"].get("PDNG", 0)
    valid = bool((token or {}).get("valid"))
    has_banking = bool(((token or {}).get("bankAccount") or {}).get("accountNumber"))

    if balance is None:
        residue_owner = "unknown"
        safe_to_withdraw = False
    elif balance < 0:
        residue_owner = "negative_balance_or_fee_adjustment"
        safe_to_withdraw = False
    elif balance == 0:
        residue_owner = "none"
        safe_to_withdraw = False
    else:
        residue_owner = "undetermined_from_statement"
        safe_to_withdraw = valid and has_banking and pending == 0

    return {
        "current_balance": balance,
        "current_balance_unit": "ZAR",
        "credits": summary["totals"]["credits"],
        "debits": summary["totals"]["debits"],
        "withdrawals": summary["totals"]["seller_withdrawals"],
        "allocation_debits": summary["totals"]["allocation_debits"],
        "tradesafe_fees": summary["totals"]["tradesafe_fees"],
        "agent_fees": summary["totals"]["agent_fees"],
        "residue_balance": balance,
        "residue_owner": residue_owner,
        "safely_withdrawable": safe_to_withdraw,
        "safe_withdrawal_note": (
            "Token has positive balance, banking, and no PDNG entries; ownership still needs finance approval."
            if safe_to_withdraw else
            "Do not withdraw without resolving owner/source, negative balance, missing banking, or pending entries."
        ),
        "summary": summary,
    }


def _match_transaction_statement(txn: dict, entries: List[dict]) -> Dict[str, Any]:
    tradesafe_id = txn.get("tradesafe_id") or txn.get("tradesafe_transaction_id") or txn.get("tradesafe_token_id")
    allocation_id = txn.get("tradesafe_allocation_id")
    expected_amount, amount_source = _payout_amount(txn)

    references = [txn.get("transaction_id"), txn.get("deal_id"), txn.get("share_code"), tradesafe_id, allocation_id]
    reference_terms = [str(ref).lower() for ref in references if ref]

    matched = []
    for entry in entries:
        reference = str(entry.get("reference") or "").lower()
        reference_match = any(term in reference for term in reference_terms)
        amount_match = False
        amount = _as_money(entry.get("amount_normalized"))
        if expected_amount is not None and amount is not None:
            amount_match = abs(abs(float(amount)) - abs(float(expected_amount))) <= 1.00
        if reference_match or (amount_match and entry.get("category") in {"seller_payout_credit", "withdrawal_debit"}):
            matched.append(entry)

    credit_rows = [entry for entry in matched if entry.get("category") == "seller_payout_credit"]
    withdrawal_rows = [entry for entry in matched if entry.get("category") == "withdrawal_debit"]
    fee_rows = [entry for entry in matched if entry.get("category") in {"tradesafe_fee", "agent_fee"}]
    allocation_rows = [entry for entry in matched if entry.get("category") == "allocation_debit"]

    final_state = "missing_statement_entry"
    if withdrawal_rows and any(str(row.get("status") or "").upper() == "PDNG" for row in withdrawal_rows):
        final_state = "pending_bank_settlement"
    elif withdrawal_rows and all(str(row.get("status") or "").upper() == "ACSP" for row in withdrawal_rows):
        final_state = "reconciled"
    elif credit_rows and not withdrawal_rows:
        final_state = "token_residue"
    elif allocation_rows and not withdrawal_rows:
        final_state = "needs_tradesafe_support"

    settlement_confirmed_at = None
    for row in withdrawal_rows:
        if str(row.get("status") or "").upper() == "ACSP":
            settlement_confirmed_at = row.get("updatedAt") or row.get("createdAt")
            break
    sla = _payout_sla_fields(txn, settlement_confirmed_at=settlement_confirmed_at)
    if final_state == "reconciled":
        sla["payout_sla_status"] = "completed"
        sla["payout_sla_monitor_level"] = "completed"

    return {
        "transaction_id": txn.get("transaction_id"),
        "deal_id": txn.get("deal_id"),
        "share_code": txn.get("share_code"),
        "tradesafe_transaction_id": tradesafe_id,
        "allocation_id": allocation_id,
        "tradesafe_reference": txn.get("tradesafe_reference"),
        "seller_token": txn.get("tradesafe_seller_token_id"),
        "expected_seller_amount": _as_money(expected_amount),
        "expected_amount_source": amount_source,
        "credit_rows": credit_rows,
        "withdrawal_rows": withdrawal_rows,
        "fee_rows": fee_rows,
        "allocation_rows": allocation_rows,
        "statement_rows": matched,
        "final_state": final_state,
        "released_at": sla["released_at"],
        "withdrawal_requested_at": sla["withdrawal_requested_at"],
        "payout_processing_started_at": sla["payout_processing_started_at"],
        "expected_settlement_window": sla["expected_settlement_window"],
        "age_hours": sla["age_hours"],
        "business_age_hours": sla["business_age_hours"],
        "payout_sla_status": sla["payout_sla_status"],
        "payout_sla_monitor_level": sla["payout_sla_monitor_level"],
    }


@router.get("/tokens/{token_id}/statement")
async def get_admin_token_statement(request: Request, token_id: str, first: int = 50, page: int = 1):
    """Read-only TradeSafe token ledger: debits, credits, PDNG/ACSP status, references, and dates."""
    db = get_database()
    await require_admin(request, db)

    from tradesafe_service import get_token_details, get_token_statement

    token = await get_token_details(token_id)
    statement = await get_token_statement(token_id, first=first, page=page)
    rows = [_normalize_token_statement_entry(token_id, entry) for entry in (statement.get("entries") or [])]

    return {
        "token_id": token_id,
        "token": {
            "name": (token or {}).get("name"),
            "email": ((token or {}).get("user") or {}).get("email"),
            "balance": _token_balance_rands(token),
            "balance_raw": (token or {}).get("balance"),
            "balance_unit": "ZAR",
            "valid": (token or {}).get("valid"),
            "bank": (((token or {}).get("bankAccount") or {}).get("bank")),
            "payout_interval": ((((token or {}).get("settings") or {}).get("payout") or {}).get("interval")),
        },
        "statement": {**statement, "entries": rows},
        "summary": _statement_summary(rows),
    }


@router.get("/token-statement/{token_id}")
async def get_admin_token_statement_alias(request: Request, token_id: str, first: int = 50, page: int = 1):
    """Canonical read-only finance statement endpoint for a TradeSafe token."""
    return await get_admin_token_statement(request, token_id, first=first, page=page)


@router.get("/finance-ledger")
async def get_admin_finance_ledger(
    request: Request,
    token_ids: Optional[str] = None,
    limit: int = 100,
):
    """
    Read-only finance ledger built from TradeSafe tokenStatement. This endpoint
    does not trigger withdrawals, retries, releases, or payout state changes.
    """
    db = get_database()
    await require_admin(request, db)

    from tradesafe_service import get_token_details

    default_tokens = [
        "32fbUbeMWjdor4uHBJdns",  # TrustTrade org token
        "32xbU6asjfrBnNHfeg57I",
        "32xFiEGGNCp46dyQtLuCH",
    ]
    requested_tokens = [item.strip() for item in (token_ids or "").split(",") if item.strip()] or default_tokens

    token_rows = []
    statement_entries_by_token: Dict[str, List[dict]] = {}
    all_entries = []

    for token_id in requested_tokens:
        token = await get_token_details(token_id)
        statement = await _get_all_token_statement_entries(token_id)
        entries = statement["entries"]
        statement_entries_by_token[token_id] = entries
        all_entries.extend({**entry, "token_id": token_id} for entry in entries)

        token_rows.append({
            "token_id": token_id,
            "name": (token or {}).get("name"),
            "email": ((token or {}).get("user") or {}).get("email"),
            "balance": _token_balance_rands(token),
            "balance_raw": (token or {}).get("balance"),
            "balance_unit": "ZAR",
            "valid": (token or {}).get("valid"),
            "bank": (((token or {}).get("bankAccount") or {}).get("bank")),
            "payout_interval": ((((token or {}).get("settings") or {}).get("payout") or {}).get("interval")),
            "analysis": _token_finance_analysis(token, entries),
        })

    org_token_id = "32fbUbeMWjdor4uHBJdns"
    org_token = next((row for row in token_rows if row["token_id"] == org_token_id), None)
    org_entries = statement_entries_by_token.get(org_token_id, [])
    org_negative_entries = [entry for entry in org_entries if (_as_money(entry.get("amount_normalized")) or 0) < 0]
    org_movement_dates = []
    for entry in org_entries:
        value = entry.get("createdAt")
        if value:
            org_movement_dates.append(str(value))
    org_analysis = {
        "token_id": org_token_id,
        "balance": (org_token or {}).get("balance"),
        "balance_unit": "ZAR",
        "negative_balance_explanation": (
            "Org token balance reflects TradeSafe statement accounting and may include historical fee movements. "
            "Negative org-token payout rows are treated as fee setup review items until TradeSafe confirms semantics."
        ),
        "negative_entries": org_negative_entries,
        "last_new_org_token_movement_timestamp": max(org_movement_dates) if org_movement_dates else None,
        "trusttrade_fee_setup_assessment": (
            "Needs TradeSafe support review. Historical negative TradeSafe org-token fee rows are not confirmed platform losses."
        ),
    }

    tx_projection = {
        "_id": 0,
        "transaction_id": 1,
        "deal_id": 1,
        "share_code": 1,
        "deal_type": 1,
        "tradesafe_id": 1,
        "tradesafe_transaction_id": 1,
        "tradesafe_token_id": 1,
        "tradesafe_reference": 1,
        "tradesafe_allocation_id": 1,
        "tradesafe_seller_token_id": 1,
        "item_price": 1,
        "amount": 1,
        "net_amount": 1,
        "seller_email": 1,
        "freelancer_email": 1,
        "payment_status": 1,
        "release_status": 1,
        "tradesafe_state": 1,
        "withdrawal_status": 1,
        "payout_status": 1,
        "funds_released_at": 1,
        "released_at": 1,
        "completed_at": 1,
        "withdrawal_requested_at": 1,
        "withdrawal_started_at": 1,
        "withdrawal_triggered_at": 1,
        "payout_processing_started_at": 1,
        "expected_settlement_window": 1,
        "payout_sla_status": 1,
        "created_at": 1,
    }
    txns = await db.transactions.find(
        {"tradesafe_seller_token_id": {"$in": requested_tokens}},
        tx_projection,
    ).sort("created_at", -1).limit(max(1, min(limit, 500))).to_list(max(1, min(limit, 500)))

    transaction_matches = [
        {
            **_match_transaction_statement(txn, statement_entries_by_token.get(txn.get("tradesafe_seller_token_id"), [])),
            "seller_email": txn.get("seller_email") or txn.get("freelancer_email"),
            "payment_status": txn.get("payment_status"),
            "release_status": txn.get("release_status"),
            "tradesafe_state": txn.get("tradesafe_state"),
            "withdrawal_status": txn.get("withdrawal_status"),
            "payout_status": txn.get("payout_status"),
        }
        for txn in txns
    ]

    summary = _statement_summary(all_entries)
    outstanding_wallet_residues = [
        {
            "token_id": row["token_id"],
            "balance": row["balance"],
            "residue_owner": row["analysis"]["residue_owner"],
            "safely_withdrawable": row["analysis"]["safely_withdrawable"],
            "note": row["analysis"]["safe_withdrawal_note"],
        }
        for row in token_rows
        if (row.get("balance") or 0) != 0
    ]

    return {
        "source_of_truth": "TradeSafe tokenStatement",
        "balance_unit": "ZAR",
        "tokens": token_rows,
        "summary": {
            "seller_payout_credits": summary["totals"]["seller_payout_credits"],
            "seller_withdrawals": summary["totals"]["seller_withdrawals"],
            "tradesafe_fees": summary["totals"]["tradesafe_fees"],
            "trusttrade_agent_platform_fee_entries": summary["totals"]["agent_fees"],
            "fee_setup_review_entries": summary["totals"].get("fee_setup_review", 0.0),
            "allocation_debits": summary["totals"]["allocation_debits"],
            "pdng_entries": summary["statuses"].get("PDNG", 0),
            "acsp_entries": summary["statuses"].get("ACSP", 0),
            "negative_balances": [row for row in token_rows if (row.get("balance") or 0) < 0],
            "outstanding_wallet_residues": outstanding_wallet_residues,
        },
        "org_token_revenue_analysis": org_analysis,
        "transaction_statement_matches": transaction_matches,
        "recent_statement_entries": sorted(
            all_entries,
            key=lambda entry: str(entry.get("createdAt") or ""),
            reverse=True,
        )[:100],
    }


@router.get("/finance-metrics")
async def get_admin_finance_metrics(request: Request):
    """Read-only production finance metrics from the latest reconciliation run."""
    db = get_database()
    await require_admin(request, db)

    from services.reconciliation_service import get_finance_metrics

    return await get_finance_metrics(db)


@router.get("/profitability")
async def get_admin_profitability(request: Request, limit: int = 500):
    """Read-only unit economics and profitability analysis."""
    db = get_database()
    await require_admin(request, db)

    from services.reconciliation_service import get_profitability_analysis

    return await get_profitability_analysis(db, limit=max(1, min(limit, 1000)))


@router.get("/finance-reconciliation-status")
async def get_admin_finance_reconciliation_status(request: Request):
    """Read-only status for reconciliation scheduler, active alerts, and recent logs."""
    db = get_database()
    await require_admin(request, db)

    latest_run = await db.finance_reconciliation_runs.find_one({}, {"_id": 0}, sort=[("completed_at", -1)])
    recent_runs = await db.finance_reconciliation_runs.find({}, {"_id": 0}).sort("completed_at", -1).limit(10).to_list(10)
    alerts = await db.finance_alerts.find({"resolved": {"$ne": True}}, {"_id": 0}).sort("created_at", -1).limit(50).to_list(50)
    recent_logs = await db.finance_reconciliation_logs.find({}, {"_id": 0}).sort("created_at", -1).limit(100).to_list(100)

    return {
        "last_successful_reconciliation_at": (latest_run or {}).get("completed_at"),
        "daily_reconciliation_status": "healthy" if latest_run else "not_started",
        "latest_run": latest_run,
        "recent_runs": recent_runs,
        "active_alerts": alerts,
        "recent_logs": recent_logs,
    }


@router.post("/finance-reconciliation/run")
async def run_admin_finance_reconciliation(request: Request, mode: str = "recent"):
    """Admin-triggered read-only reconciliation run. Does not retry or withdraw funds."""
    db = get_database()
    admin = await require_admin(request, db)

    from services.reconciliation_service import run_reconciliation, write_audit_record

    result = await run_reconciliation(db, mode=mode if mode in {"recent", "nightly"} else "recent", limit=1000 if mode == "nightly" else 150)
    await write_audit_record(db, "manual_reconciliation_run", admin.email, details={"mode": mode, "metrics": result.get("metrics")})
    return result


@router.get("/finance-alerts")
async def get_admin_finance_alerts(request: Request, active_only: bool = True, limit: int = 100):
    """Read finance-specific alerts for dashboard banners and operations review."""
    db = get_database()
    await require_admin(request, db)

    query = {"resolved": {"$ne": True}} if active_only else {}
    alerts = await db.finance_alerts.find(query, {"_id": 0}).sort("created_at", -1).limit(max(1, min(limit, 500))).to_list(max(1, min(limit, 500)))
    return {"count": len(alerts), "alerts": alerts}


@router.get("/payout-settlement-monitor")
async def get_admin_payout_settlement_monitor(request: Request, limit: int = 250):
    """
    Read-only settlement monitor for released payouts. Shows TradeSafe processed
    payout rows separately from local bank settlement confirmation.
    """
    db = get_database()
    await require_admin(request, db)

    from services.reconciliation_service import get_payout_settlement_monitor

    return await get_payout_settlement_monitor(db, limit=max(1, min(limit, 1000)))


@router.get("/finance-audit-trail")
async def get_admin_finance_audit_trail(request: Request, limit: int = 100):
    """Immutable finance audit records for retries, withdrawals, failures, and reconciliation state changes."""
    db = get_database()
    await require_admin(request, db)

    rows = await db.finance_audit_trail.find({}, {"_id": 0}).sort("created_at", -1).limit(max(1, min(limit, 500))).to_list(max(1, min(limit, 500)))
    return {"count": len(rows), "rows": rows}


@router.get("/finance-export/{report}")
async def export_admin_finance_report(request: Request, report: str, format: str = "json"):
    """Export unresolved payouts, token residues, org movements, payout aging, or pending bank settlement as JSON/CSV."""
    db = get_database()
    await require_admin(request, db)

    valid_reports = {"unresolved-payouts", "token-residues", "org-token-movements", "payout-aging", "pending-bank-settlement"}
    if report not in valid_reports:
        raise HTTPException(status_code=400, detail=f"report must be one of {sorted(valid_reports)}")

    from services.reconciliation_service import export_finance_report

    exported = await export_finance_report(db, report, fmt=format)
    if format.lower() == "csv":
        return Response(
            content=exported,
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{report}.csv"'},
        )
    return exported


@router.get("/payout-reconciliation")
async def get_payout_reconciliation(request: Request, limit: int = 100):
    """
    Read-only reconciliation view for released escrows whose bank withdrawal has
    not succeeded. Does not trigger withdrawal or mutate payout state.
    """
    db = get_database()
    await require_admin(request, db)

    from tradesafe_service import get_token_details

    query = {
        "$or": [
            {"tradesafe_state": {"$in": ["FUNDS_RELEASED", "COMPLETE", "COMPLETED"]}},
            {"release_status": "Released"},
            {"status": "COMPLETE", "deal_type": "DIGITAL_WORK"},
        ],
        "withdrawal_status": {"$ne": "succeeded"},
    }

    projection = {
        "_id": 0,
        "transaction_id": 1,
        "deal_id": 1,
        "deal_type": 1,
        "tradesafe_state": 1,
        "tradesafe_seller_token_id": 1,
        "tradesafe_allocation_id": 1,
        "item_price": 1,
        "amount": 1,
        "net_amount": 1,
        "withdrawal_status": 1,
        "withdrawal_triggered": 1,
        "withdrawal_error": 1,
        "tradesafe_withdrawal_id": 1,
        "bank_reference": 1,
        "settlement_reference": 1,
        "withdrawal_completed_at": 1,
        "settlement_status": 1,
        "settlement_checked_at": 1,
        "payout_status": 1,
        "release_status": 1,
        "funds_released_at": 1,
        "seller_email": 1,
        "freelancer_email": 1,
        "status": 1,
    }

    txns = await db.transactions.find(query, projection).sort("funds_released_at", -1).limit(limit).to_list(limit)
    token_cache = {}
    rows = []

    for txn in txns:
        token_id = txn.get("tradesafe_seller_token_id")
        token_balance = None
        token_balance_raw = None

        if token_id:
            if token_id not in token_cache:
                try:
                    token_cache[token_id] = await get_token_details(token_id)
                except Exception as exc:
                    logger.error(f"[PAYOUT_RECON] token lookup failed token={token_id}: {exc}")
                    token_cache[token_id] = None
            token = token_cache.get(token_id) or {}
            if token:
                token_balance_raw = token.get("balance")
                token_balance = _token_balance_rands(token)

        amount, amount_source = _payout_amount(txn)
        safe_to_retry, recommended_action = _payout_recommendation(txn, amount, token_balance)
        identifier = txn.get("transaction_id") or txn.get("deal_id")

        rows.append({
            "transaction_id": txn.get("transaction_id"),
            "deal_id": txn.get("deal_id"),
            "seller_email": txn.get("seller_email") or txn.get("freelancer_email"),
            "seller_token_id": token_id,
            "expected_seller_amount": round(float(amount), 2) if amount is not None else None,
            "expected_amount_source": amount_source,
            "tradesafe_state": txn.get("tradesafe_state"),
            "token_balance": token_balance,
            "token_balance_raw": token_balance_raw,
            "token_balance_unit": "ZAR",
            "withdrawal_status": txn.get("withdrawal_status"),
            "withdrawal_triggered": txn.get("withdrawal_triggered", False),
            "withdrawal_error": txn.get("withdrawal_error"),
            "tradesafe_withdrawal_id": txn.get("tradesafe_withdrawal_id"),
            "bank_reference": txn.get("bank_reference"),
            "settlement_reference": txn.get("settlement_reference"),
            "withdrawal_completed_at": txn.get("withdrawal_completed_at"),
            "settlement_status": txn.get("settlement_status"),
            "settlement_checked_at": txn.get("settlement_checked_at"),
            "payout_status": txn.get("payout_status"),
            "funds_released_at": txn.get("funds_released_at"),
            "safe_to_retry": safe_to_retry,
            "recommended_action": recommended_action.format(transaction_id=identifier),
        })

    return {
        "count": len(rows),
        "safe_to_retry_count": sum(1 for row in rows if row["safe_to_retry"]),
        "rows": rows,
    }


@router.get("/payout-settlement-trace")
async def get_payout_settlement_trace(request: Request, ids: str):
    """
    Read-only settlement trace for specific transactions/deals. It combines
    local payout fields, TradeSafe transaction state/reference, token balance,
    matching webhook payloads, and matching admin retry actions.
    """
    db = get_database()
    await require_admin(request, db)

    requested_ids = [item.strip() for item in (ids or "").split(",") if item.strip()]
    if not requested_ids:
        raise HTTPException(status_code=400, detail="Provide comma-separated ids")

    from tradesafe_service import get_token_details, get_token_statement, get_tradesafe_transaction

    txns = await db.transactions.find(
        {"$or": [
            {"transaction_id": {"$in": requested_ids}},
            {"share_code": {"$in": requested_ids}},
            {"deal_id": {"$in": requested_ids}},
        ]},
        {"_id": 0}
    ).to_list(len(requested_ids))

    rows = []
    for txn in txns:
        transaction_id = txn.get("transaction_id")
        deal_id = txn.get("deal_id")
        tradesafe_id = txn.get("tradesafe_id") or txn.get("tradesafe_transaction_id") or txn.get("tradesafe_token_id")
        seller_token_id = txn.get("tradesafe_seller_token_id")
        token = await get_token_details(seller_token_id) if seller_token_id else None
        statement = await get_token_statement(seller_token_id, first=50, page=1) if seller_token_id else {"entries": []}
        statement["entries"] = [_normalize_token_statement_entry(seller_token_id, entry) for entry in (statement.get("entries") or [])]
        ts_transaction = await get_tradesafe_transaction(tradesafe_id) if tradesafe_id else None

        webhook_terms = [
            transaction_id,
            deal_id,
            txn.get("share_code"),
            tradesafe_id,
            txn.get("tradesafe_allocation_id"),
        ]
        webhook_terms = [term for term in webhook_terms if term]
        webhook_query = {"$or": [{"transaction_id": {"$in": webhook_terms}}]}
        webhook_query["$or"].extend([
            {"payload.id": {"$in": webhook_terms}},
            {"payload.reference": {"$in": webhook_terms}},
            {"payload.data.id": {"$in": webhook_terms}},
            {"payload.data.reference": {"$in": webhook_terms}},
        ])

        webhooks = await db.webhook_events.find(
            webhook_query,
            {"_id": 0, "event_id": 1, "transaction_id": 1, "status": 1, "timestamp": 1, "payload": 1, "error": 1}
        ).sort("timestamp", -1).limit(20).to_list(20)

        admin_actions = await db.admin_actions.find(
            {"transaction_id": transaction_id},
            {"_id": 0}
        ).sort("timestamp", -1).limit(20).to_list(20)

        amount, amount_source = _payout_amount(txn)
        references = [
            transaction_id,
            deal_id,
            txn.get("share_code"),
            tradesafe_id,
            txn.get("tradesafe_allocation_id"),
            (ts_transaction or {}).get("reference"),
        ]
        matching_statement_entries = _matching_statement_entries(statement.get("entries") or [], amount, references)
        token_balance = _token_balance_rands(token)

        rows.append({
            "transaction_id": transaction_id,
            "share_code": txn.get("share_code"),
            "deal_id": deal_id,
            "seller_email": txn.get("seller_email") or txn.get("freelancer_email"),
            "seller_token_id": seller_token_id,
            "expected_seller_amount": round(float(amount), 2) if amount is not None else None,
            "expected_amount_source": amount_source,
            "token_balance": token_balance,
            "token_balance_unit": "ZAR",
            "tradesafe_state": txn.get("tradesafe_state"),
            "tradesafe_transaction_state": (ts_transaction or {}).get("state"),
            "tradesafe_transaction_reference": (ts_transaction or {}).get("reference"),
            "tradesafe_transaction_id": tradesafe_id,
            "tradesafe_allocation_id": txn.get("tradesafe_allocation_id"),
            "withdrawal_status": txn.get("withdrawal_status"),
            "withdrawal_triggered": txn.get("withdrawal_triggered", False),
            "withdrawal_error": txn.get("withdrawal_error"),
            "payout_status": txn.get("payout_status"),
            "tradesafe_withdrawal_id": txn.get("tradesafe_withdrawal_id"),
            "bank_reference": txn.get("bank_reference"),
            "settlement_reference": txn.get("settlement_reference"),
            "withdrawal_completed_at": txn.get("withdrawal_completed_at"),
            "settlement_status": txn.get("settlement_status"),
            "settlement_checked_at": txn.get("settlement_checked_at"),
            "token_statement": statement,
            "matching_statement_entries": matching_statement_entries,
            "matching_webhooks": webhooks,
            "matching_admin_actions": admin_actions,
        })

    return {"count": len(rows), "rows": rows}


@router.get("/payout-token-statements")
async def get_payout_token_statements(request: Request, token_ids: str, first: int = 50, page: int = 1):
    """Read-only statement lookup for multiple seller tokens used during reconciliation."""
    db = get_database()
    await require_admin(request, db)

    requested_tokens = [item.strip() for item in (token_ids or "").split(",") if item.strip()]
    if not requested_tokens:
        raise HTTPException(status_code=400, detail="Provide comma-separated token_ids")

    from tradesafe_service import get_token_details, get_token_statement

    rows = []
    for token_id in requested_tokens:
        token = await get_token_details(token_id)
        statement = await get_token_statement(token_id, first=first, page=page)
        rows = [_normalize_token_statement_entry(token_id, entry) for entry in (statement.get("entries") or [])]
        rows.append({
            "token_id": token_id,
            "email": ((token or {}).get("user") or {}).get("email"),
            "name": (token or {}).get("name"),
            "balance": _token_balance_rands(token),
            "balance_raw": (token or {}).get("balance"),
            "balance_unit": "ZAR",
            "bank": (((token or {}).get("bankAccount") or {}).get("bank")),
            "payout_interval": ((((token or {}).get("settings") or {}).get("payout") or {}).get("interval")),
            "statement": {**statement, "entries": rows},
            "summary": _statement_summary(rows),
        })

    return {"count": len(rows), "rows": rows}

@router.post("/smart-deals/tradesafe/{tradesafe_id}/release")
async def admin_release_transaction(tradesafe_id: str, request: Request):
    """
    Force-release escrow funds for a Smart Deal by its TradeSafe transaction ID
    (the value stored in deal.tradesafe_token_id / deal.tradesafe_transaction_id).
    Calls allocationStartDelivery then allocationCompleteDelivery in sequence.
    """
    db = get_database()
    await require_admin(request, db)

    deal = await db.transactions.find_one({"tradesafe_token_id": tradesafe_id, "deal_type": "DIGITAL_WORK"})
    if not deal:
        raise HTTPException(status_code=404, detail=f"Smart deal with tradesafe_id={tradesafe_id!r} not found")

    allocation_id = deal.get("tradesafe_allocation_id")
    if not allocation_id:
        raise HTTPException(status_code=400, detail="Deal has no tradesafe_allocation_id — cannot release")

    from tradesafe_service import start_delivery, accept_delivery

    seller_token_id = deal.get("tradesafe_seller_token_id")
    deal_amount = deal.get("amount")

    # Step 1: ensure allocation is in DELIVERY_REQUESTED state.
    # This may have already been called; TradeSafe will reject gracefully if so.
    sd_result = await start_delivery(allocation_id)
    logger.info(f"[ADMIN_RELEASE] start_delivery allocation={allocation_id}: {sd_result}")

    # Step 2: accept delivery and request seller payout processing.
    payout_result = await accept_delivery(
        allocation_id,
        seller_token_id=seller_token_id,
        amount=float(deal_amount) if deal_amount else None,
    )
    logger.info(f"[ADMIN_RELEASE] accept_delivery allocation={allocation_id}: {payout_result}")

    if not payout_result:
        raise HTTPException(status_code=502, detail="TradeSafe allocationCompleteDelivery failed — check logs")

    now = datetime.now(timezone.utc)
    await db.transactions.update_one(
        {"deal_id": deal["deal_id"]},
        {"$set": {"status": "COMPLETE", "completed_at": now, "updated_at": now, "payout_failed": False}},
    )

    logger.info(f"[ADMIN_RELEASE] Deal {deal['deal_id']} released via admin by tradesafe_id={tradesafe_id}")
    return {
        "success": True,
        "deal_id": deal["deal_id"],
        "tradesafe_id": tradesafe_id,
        "allocation_id": allocation_id,
        "allocation_state": (payout_result or {}).get("state"),
    }


@router.get("/tokens/balances")
async def get_token_balances(request: Request):
    """
    Fetch all TradeSafe tokens and their current balances.
    Returns tokens with balance > 0 first so we can identify stuck funds.
    """
    db = get_database()
    await require_admin(request, db)

    from tradesafe_service import get_all_tokens

    tokens = await get_all_tokens()

    enriched = []
    for t in tokens:
        balance_rands = _as_money(t.get("balance")) or 0
        user = t.get("user") or {}
        bank = t.get("bankAccount")
        enriched.append({
            "token_id": t.get("id"),
            "name": t.get("name"),
            "email": user.get("email"),
            "mobile": user.get("mobile"),
            "balance": balance_rands,
            "balance_raw": t.get("balance"),
            "balance_unit": "ZAR",
            "has_balance": balance_rands > 0,
            "valid": t.get("valid"),
            "has_banking": bool(bank and bank.get("accountNumber")),
            "bank": bank.get("bank") if bank else None,
            "payout_interval": ((t.get("settings") or {}).get("payout") or {}).get("interval"),
        })

    enriched.sort(key=lambda x: x["balance"], reverse=True)

    with_balance = [t for t in enriched if t["has_balance"]]
    logger.info(f"[ADMIN] token balances: {len(enriched)} total, {len(with_balance)} with balance > R0")

    return {
        "total_tokens": len(enriched),
        "tokens_with_balance": len(with_balance),
        "total_stuck_rands": round(sum(t["balance"] for t in with_balance), 2),
        "tokens": enriched,
    }


@router.get("/payout-readiness")
async def get_admin_payout_readiness(request: Request):
    """
    Read-only seller-token payout readiness view. This verifies fast-payout
    configuration without triggering withdrawals or changing balances.
    """
    db = get_database()
    await require_admin(request, db)

    from tradesafe_service import get_all_tokens

    org_token_id = os.environ.get("TRUSTTRADE_ORG_TOKEN_ID", "32fbUbeMWjdor4uHBJdns")
    tokens = await get_all_tokens()
    seller_token_ids = [token.get("id") for token in tokens if token.get("id") and token.get("id") != org_token_id]

    linked_transactions = await db.transactions.find(
        {"tradesafe_seller_token_id": {"$in": seller_token_ids}},
        {
            "_id": 0,
            "transaction_id": 1,
            "deal_id": 1,
            "seller_email": 1,
            "freelancer_email": 1,
            "tradesafe_seller_token_id": 1,
        },
    ).to_list(2000)
    users = await db.users.find(
        {"tradesafe_token_id": {"$in": seller_token_ids}},
        {"_id": 0, "email": 1, "tradesafe_token_id": 1},
    ).to_list(2000)

    tx_by_token: Dict[str, List[dict]] = {}
    for txn in linked_transactions:
        tx_by_token.setdefault(txn.get("tradesafe_seller_token_id"), []).append(txn)

    user_by_token = {user.get("tradesafe_token_id"): user for user in users}
    rows = []
    for token in tokens:
        token_id = token.get("id")
        if not token_id or token_id == org_token_id:
            continue

        token_user = token.get("user") or {}
        bank = token.get("bankAccount") or {}
        payout = ((token.get("settings") or {}).get("payout") or {})
        payout_interval = payout.get("interval")
        linked = tx_by_token.get(token_id, [])
        seller_email = (
            token_user.get("email")
            or (user_by_token.get(token_id) or {}).get("email")
            or next((txn.get("seller_email") or txn.get("freelancer_email") for txn in linked if txn.get("seller_email") or txn.get("freelancer_email")), None)
        )
        has_banking = bool(bank.get("accountNumber"))
        has_mobile = bool(token_user.get("mobile"))
        token_valid = bool(token.get("valid"))
        issues = []
        if payout_interval != "IMMEDIATE":
            issues.append("Seller token payout interval is not IMMEDIATE")
        if not has_banking:
            issues.append("Bank details missing")
        if not has_mobile:
            issues.append("Mobile number missing")
        if not token_valid:
            issues.append("Token is not valid")

        rows.append({
            "seller_token_id": token_id,
            "seller_email": seller_email,
            "payout_interval": payout_interval,
            "refund_interval": payout.get("refund") or "WALLET target",
            "bank_details_present": has_banking,
            "mobile_present": has_mobile,
            "token_valid": token_valid,
            "ready_for_fast_payout": not issues,
            "issues": issues,
            "linked_transaction_count": len(linked),
            "linked_transactions": [
                txn.get("transaction_id") or txn.get("deal_id")
                for txn in linked[:10]
            ],
        })

    org_token = next((token for token in tokens if token.get("id") == org_token_id), None) or {}
    rows.sort(key=lambda row: (not row["ready_for_fast_payout"], row.get("seller_email") or row["seller_token_id"]))

    return {
        "count": len(rows),
        "ready_count": sum(1 for row in rows if row["ready_for_fast_payout"]),
        "not_ready_count": sum(1 for row in rows if not row["ready_for_fast_payout"]),
        "seller_token_target": {"payout_interval": "IMMEDIATE", "refund": "WALLET"},
        "org_token_target": {
            "token_id": org_token_id,
            "payout_interval": "WALLET",
            "refund": "WALLET",
            "current_payout_interval": (((org_token.get("settings") or {}).get("payout") or {}).get("interval")),
        },
        "rows": rows,
    }


@router.post("/smart-deals/{deal_id}/force-fund")
async def force_fund_smart_deal(deal_id: str, request: Request):
    db = get_database()
    await require_admin(request, db)
    await db.transactions.update_one(
        {"deal_id": deal_id},
        {"$set": {"status": "FUNDED", "funded_at": datetime.now(timezone.utc)}}
    )
    return {"success": True}


@router.post("/smart-deals/{deal_id}/release-funds")
async def admin_release_smart_deal_funds(deal_id: str, request: Request):
    """
    Force-release escrow funds for a Smart Deal by its internal deal_id (e.g. SD-XXXXXXXX).
    Calls allocationStartDelivery (idempotent) then allocationCompleteDelivery to release funds.
    Also accepts an optional body {"tradesafe_transaction_id": "..."} to backfill the field
    on deals created before it was stored.
    """
    db = get_database()
    await require_admin(request, db)

    deal = await db.transactions.find_one({"deal_id": deal_id, "deal_type": "DIGITAL_WORK"})
    if not deal:
        raise HTTPException(status_code=404, detail=f"Smart deal {deal_id!r} not found")

    # Allow admin to backfill tradesafe_transaction_id for older deals
    try:
        body = await request.json()
    except Exception:
        body = {}
    backfill_tx_id = body.get("tradesafe_transaction_id") if body else None
    if backfill_tx_id and not deal.get("tradesafe_transaction_id"):
        await db.transactions.update_one(
            {"deal_id": deal_id},
            {"$set": {
                "tradesafe_transaction_id": backfill_tx_id,
                "tradesafe_token_id": backfill_tx_id,
            }},
        )
        deal["tradesafe_transaction_id"] = backfill_tx_id
        logger.info(f"[ADMIN_RELEASE] Backfilled tradesafe_transaction_id={backfill_tx_id} on {deal_id}")

    allocation_id = deal.get("tradesafe_allocation_id")
    if not allocation_id:
        raise HTTPException(
            status_code=400,
            detail="Deal has no tradesafe_allocation_id — run initiate_payment first or backfill manually",
        )

    from tradesafe_service import start_delivery, accept_delivery

    seller_token_id = deal.get("tradesafe_seller_token_id")
    deal_amount = deal.get("amount")

    # Step 1: move allocation to DELIVERY_REQUESTED (idempotent — safe if already called)
    sd_result = await start_delivery(allocation_id)
    logger.info(f"[ADMIN_RELEASE] start_delivery {deal_id} allocation={allocation_id}: {sd_result}")

    # Step 2: accept delivery and request seller payout processing.
    payout_result = await accept_delivery(
        allocation_id,
        seller_token_id=seller_token_id,
        amount=float(deal_amount) if deal_amount else None,
    )
    logger.info(f"[ADMIN_RELEASE] accept_delivery {deal_id} allocation={allocation_id}: {payout_result}")

    if not payout_result:
        raise HTTPException(
            status_code=502,
            detail="TradeSafe allocationCompleteDelivery failed — check server logs for TradeSafe error details",
        )

    now = datetime.now(timezone.utc)
    await db.transactions.update_one(
        {"deal_id": deal_id},
        {"$set": {"status": "COMPLETE", "completed_at": now, "updated_at": now, "payout_failed": False}},
    )

    logger.info(f"[ADMIN_RELEASE] {deal_id} funds released successfully")
    return {
        "success": True,
        "deal_id": deal_id,
        "tradesafe_transaction_id": deal.get("tradesafe_transaction_id") or deal.get("tradesafe_token_id"),
        "allocation_id": allocation_id,
        "allocation_state": (payout_result or {}).get("state"),
        "seller_token_id": seller_token_id,
    }


# ============ TOKEN MANAGEMENT ============

@router.post("/tokens/{token_id}/withdraw")
async def admin_withdraw_token(token_id: str, request: Request):
    """Manually trigger a withdrawal from a TradeSafe token wallet to its linked bank account."""
    db = get_database()
    await require_admin(request, db)

    body = await request.json()
    amount = body.get("amount")
    if not amount or float(amount) <= 0:
        raise HTTPException(status_code=400, detail="amount must be a positive number")

    from tradesafe_service import withdraw_token_funds
    success = await withdraw_token_funds(token_id, float(amount))

    if not success:
        raise HTTPException(status_code=502, detail="TradeSafe withdrawal failed — check logs")

    logger.info(f"[ADMIN] withdrawal R{amount} from token {token_id} succeeded")
    return {"success": True, "token_id": token_id, "amount": float(amount)}


@router.post("/tokens/{token_id}/payout-interval")
async def set_token_payout_interval(token_id: str, request: Request):
    """Update the payout interval on a TradeSafe token (e.g. IMMEDIATE → WALLET)."""
    db = get_database()
    await require_admin(request, db)

    body = await request.json()
    interval = (body.get("interval") or "WALLET").upper()
    valid = {"IMMEDIATE", "WALLET", "ACCOUNT", "DAILY", "WEEKLY", "BIMONTHLY", "MONTHLY"}
    if interval not in valid:
        raise HTTPException(status_code=400, detail=f"Invalid interval. Must be one of: {sorted(valid)}")

    from tradesafe_service import update_token_payout
    result = await update_token_payout(token_id, interval)

    if not result.get("success"):
        raise HTTPException(status_code=502, detail=result.get("error", "TradeSafe tokenUpdate failed"))

    logger.info(f"[ADMIN] payout interval for token {token_id} set to {interval}")
    return result
