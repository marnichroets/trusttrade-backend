"""
TrustTrade Alert Service - Critical Alert System
Sends email alerts for critical production issues with rate limiting.
"""

import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, List
from motor.motor_asyncio import AsyncIOMotorDatabase
from enum import Enum

logger = logging.getLogger(__name__)

# Logo URL for emails
EMAIL_LOGO_URL = "https://customer-assets.emergentagent.com/job_trust-trade-pay/artifacts/g0wqdpup_TrustTrade%20Logo.png"


class AlertPriority(str, Enum):
    """Alert priority levels"""
    CRITICAL = "CRITICAL"  # Immediate email alert
    WARNING = "WARNING"    # Dashboard only


class AlertType(str, Enum):
    """Alert types for categorization"""
    WEBHOOK_FAILED = "webhook_failed"
    EMAIL_FAILED = "email_failed"
    TRANSACTION_STUCK = "transaction_stuck"
    PAYMENT_NOT_SYNCED = "payment_not_synced"
    SYSTEM_ERROR = "system_error"


# Alert type configurations
ALERT_CONFIG = {
    AlertType.WEBHOOK_FAILED: {
        "priority": AlertPriority.CRITICAL,
        "subject": "Failed Webhook Processing",
        "rate_limit_minutes": 10,
    },
    AlertType.EMAIL_FAILED: {
        "priority": AlertPriority.CRITICAL,
        "subject": "Failed Email Delivery",
        "rate_limit_minutes": 10,
    },
    AlertType.TRANSACTION_STUCK: {
        "priority": AlertPriority.CRITICAL,
        "subject": "Stuck Transaction Detected",
        "rate_limit_minutes": 10,
    },
    AlertType.PAYMENT_NOT_SYNCED: {
        "priority": AlertPriority.CRITICAL,
        "subject": "Payment Not Synced to State",
        "rate_limit_minutes": 5,
    },
    AlertType.SYSTEM_ERROR: {
        "priority": AlertPriority.CRITICAL,
        "subject": "System Error",
        "rate_limit_minutes": 5,
    },
}


async def should_send_alert(
    db: AsyncIOMotorDatabase,
    alert_type: str,
    transaction_id: Optional[str] = None,
    rate_limit_minutes: int = 10
) -> bool:
    """
    Check if we should send an alert (rate limiting).
    Returns True if no recent alert exists for this type/transaction.
    """
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=rate_limit_minutes)).isoformat()
    
    query = {
        "alert_type": alert_type,
        "timestamp": {"$gte": cutoff},
        "email_sent": True
    }
    
    if transaction_id:
        query["transaction_id"] = transaction_id
    
    recent_alert = await db.alerts.find_one(query)
    return recent_alert is None


async def create_alert(
    db: AsyncIOMotorDatabase,
    alert_type: str,
    message: str,
    transaction_id: Optional[str] = None,
    share_code: Optional[str] = None,
    details: Optional[Dict] = None,
    priority: str = AlertPriority.CRITICAL.value
) -> Dict[str, Any]:
    """
    Create and store an alert in the database.
    Returns the created alert document.
    """
    alert_doc = {
        "alert_type": alert_type,
        "priority": priority,
        "message": message,
        "transaction_id": transaction_id,
        "share_code": share_code,
        "details": details or {},
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "email_sent": False,
        "resolved": False,
        "resolved_at": None,
        "resolved_by": None
    }
    
    result = await db.alerts.insert_one(alert_doc)
    alert_doc["_id"] = str(result.inserted_id)
    
    logger.info(f"Alert created: {alert_type} - {message}")
    
    return alert_doc


async def send_alert_email(
    db: AsyncIOMotorDatabase,
    alert_doc: Dict,
    admin_email: str
) -> bool:
    """
    Send alert email via Postmark.
    Returns True if email was sent successfully.
    """
    import email_service
    
    alert_type = alert_doc.get("alert_type", "Unknown")
    config = ALERT_CONFIG.get(AlertType(alert_type) if alert_type in [e.value for e in AlertType] else AlertType.SYSTEM_ERROR, {})
    subject = config.get("subject", "System Alert")
    
    # Build email body
    html_body = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 20px;">
            <tr>
                <td align="center">
                    <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                        <!-- Header with Logo -->
                        <tr>
                            <td style="background-color: #1a2942; padding: 20px; text-align: center;">
                                <img src="{EMAIL_LOGO_URL}" alt="TrustTrade" style="height: 40px; max-width: 200px;">
                            </td>
                        </tr>
                        
                        <!-- Alert Banner -->
                        <tr>
                            <td style="background-color: #dc2626; padding: 15px; text-align: center;">
                                <span style="color: #ffffff; font-size: 18px; font-weight: bold;">
                                    &#x1F6A8; CRITICAL ALERT
                                </span>
                            </td>
                        </tr>
                        
                        <!-- Content -->
                        <tr>
                            <td style="padding: 30px;">
                                <h2 style="color: #1a2942; margin: 0 0 20px 0; font-size: 20px;">
                                    {subject}
                                </h2>
                                
                                <table width="100%" style="background-color: #fef2f2; border-radius: 6px; padding: 15px; margin-bottom: 20px;">
                                    <tr>
                                        <td style="padding: 15px;">
                                            <p style="color: #991b1b; margin: 0; font-size: 14px;">
                                                <strong>Issue Detected:</strong><br>
                                                {alert_doc.get('message', 'Unknown issue')}
                                            </p>
                                        </td>
                                    </tr>
                                </table>
                                
                                <table width="100%" style="background-color: #f8fafc; border-radius: 6px; margin-bottom: 20px;">
                                    <tr>
                                        <td style="padding: 15px;">
                                            <p style="color: #64748b; margin: 0 0 10px 0; font-size: 14px;">
                                                <strong>Type:</strong> {alert_type.replace('_', ' ').title()}
                                            </p>
                                            {f'<p style="color: #64748b; margin: 0 0 10px 0; font-size: 14px;"><strong>Transaction:</strong> {alert_doc.get("share_code") or alert_doc.get("transaction_id") or "N/A"}</p>' if alert_doc.get('transaction_id') else ''}
                                            <p style="color: #64748b; margin: 0; font-size: 14px;">
                                                <strong>Time:</strong> {alert_doc.get('timestamp', 'Unknown')}
                                            </p>
                                        </td>
                                    </tr>
                                </table>
                                
                                <p style="color: #475569; font-size: 14px; line-height: 1.6; margin-bottom: 20px;">
                                    <strong>Action Required:</strong> Please review this issue in the admin dashboard immediately.
                                </p>
                                
                                <table width="100%" cellpadding="0" cellspacing="0">
                                    <tr>
                                        <td align="center">
                                            <a href="https://trust-trade-pay.preview.emergentagent.com/admin/monitoring" 
                                               style="display: inline-block; background-color: #2ecc71; color: #ffffff; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 14px;">
                                                Open Admin Dashboard
                                            </a>
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                        
                        <!-- Footer -->
                        <tr>
                            <td style="background-color: #f8fafc; padding: 20px; text-align: center; border-top: 1px solid #e2e8f0;">
                                <p style="color: #94a3b8; font-size: 12px; margin: 0;">
                                    This is an automated alert from TrustTrade.<br>
                                    Do not reply to this email.
                                </p>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </body>
    </html>
    """
    
    try:
        await email_service.send_email(
            to_email=admin_email,
            subject=f"🚨 TrustTrade Alert: {subject}",
            html_body=html_body
        )
        
        # Mark email as sent
        await db.alerts.update_one(
            {"_id": alert_doc.get("_id")},
            {"$set": {"email_sent": True, "email_sent_at": datetime.now(timezone.utc).isoformat()}}
        )
        
        logger.info(f"Alert email sent to {admin_email}: {alert_type}")
        return True
        
    except Exception as e:
        logger.error(f"Failed to send alert email: {e}")
        await db.alerts.update_one(
            {"_id": alert_doc.get("_id")},
            {"$set": {"email_error": str(e)}}
        )
        return False


async def trigger_alert(
    db: AsyncIOMotorDatabase,
    alert_type: AlertType,
    message: str,
    admin_email: str,
    transaction_id: Optional[str] = None,
    share_code: Optional[str] = None,
    details: Optional[Dict] = None
) -> Dict[str, Any]:
    """
    Main function to trigger an alert.
    Handles rate limiting, creates alert record, and sends email if needed.
    
    Returns the alert document with status.
    """
    config = ALERT_CONFIG.get(alert_type, {})
    priority = config.get("priority", AlertPriority.CRITICAL)
    rate_limit = config.get("rate_limit_minutes", 10)
    
    # Check rate limiting
    should_email = await should_send_alert(db, alert_type.value, transaction_id, rate_limit)
    
    # Create alert record
    alert_doc = await create_alert(
        db=db,
        alert_type=alert_type.value,
        message=message,
        transaction_id=transaction_id,
        share_code=share_code,
        details=details,
        priority=priority.value
    )
    
    # Send email if CRITICAL and not rate-limited
    email_sent = False
    if priority == AlertPriority.CRITICAL and should_email and admin_email:
        email_sent = await send_alert_email(db, alert_doc, admin_email)
    elif not should_email:
        logger.info(f"Alert rate-limited: {alert_type.value} for {transaction_id}")
        await db.alerts.update_one(
            {"_id": alert_doc.get("_id")},
            {"$set": {"rate_limited": True}}
        )
    
    return {
        "alert_id": str(alert_doc.get("_id")),
        "alert_type": alert_type.value,
        "priority": priority.value,
        "email_sent": email_sent,
        "rate_limited": not should_email
    }


async def get_active_alerts(db: AsyncIOMotorDatabase, limit: int = 50) -> List[Dict]:
    """Get active (unresolved) alerts for dashboard display"""
    cursor = db.alerts.find(
        {"resolved": {"$ne": True}}
    ).sort("timestamp", -1).limit(limit)
    
    alerts = []
    async for alert in cursor:
        alert["alert_id"] = str(alert.pop("_id"))  # Convert ObjectId to string
        alerts.append(alert)
    
    return alerts


async def get_all_alerts(db: AsyncIOMotorDatabase, hours: int = 24, limit: int = 100) -> List[Dict]:
    """Get all alerts from the last X hours"""
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
    
    cursor = db.alerts.find(
        {"timestamp": {"$gte": cutoff}}
    ).sort("timestamp", -1).limit(limit)
    
    alerts = []
    async for alert in cursor:
        alert["alert_id"] = str(alert.pop("_id"))  # Convert ObjectId to string
        alerts.append(alert)
    
    return alerts


async def resolve_alert(
    db: AsyncIOMotorDatabase,
    alert_id: str,
    resolved_by: str
) -> bool:
    """Mark an alert as resolved"""
    from bson import ObjectId
    
    result = await db.alerts.update_one(
        {"_id": ObjectId(alert_id)},
        {"$set": {
            "resolved": True,
            "resolved_at": datetime.now(timezone.utc).isoformat(),
            "resolved_by": resolved_by
        }}
    )
    
    return result.modified_count > 0


async def get_alert_stats(db: AsyncIOMotorDatabase, hours: int = 24) -> Dict:
    """Get alert statistics for dashboard"""
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
    
    total = await db.alerts.count_documents({"timestamp": {"$gte": cutoff}})
    critical = await db.alerts.count_documents({"timestamp": {"$gte": cutoff}, "priority": "CRITICAL"})
    unresolved = await db.alerts.count_documents({"timestamp": {"$gte": cutoff}, "resolved": {"$ne": True}})
    emails_sent = await db.alerts.count_documents({"timestamp": {"$gte": cutoff}, "email_sent": True})
    
    return {
        "total_24h": total,
        "critical_24h": critical,
        "unresolved": unresolved,
        "emails_sent": emails_sent
    }
