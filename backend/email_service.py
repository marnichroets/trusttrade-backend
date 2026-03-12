"""
Brevo Email Service for TrustTrade
Handles all transactional email notifications
"""
import os
import json
import logging
import requests
from typing import List, Optional, Dict, Any
from datetime import datetime
from pydantic import BaseModel, EmailStr

logger = logging.getLogger(__name__)

# Configuration
BREVO_API_KEY = os.environ.get("BREVO_API_KEY", "")
BREVO_API_URL = "https://api.brevo.com/v3/smtp/email"
SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "noreply@trusttradesa.co.za")
SENDER_NAME = os.environ.get("SENDER_NAME", "TrustTrade")

class EmailRecipient(BaseModel):
    email: str
    name: Optional[str] = None

class BrevoEmailService:
    """Service for sending transactional emails via Brevo API"""
    
    def __init__(self):
        self.api_key = BREVO_API_KEY
        self.sender_email = SENDER_EMAIL
        self.sender_name = SENDER_NAME
        self.headers = {
            "accept": "application/json",
            "api-key": self.api_key,
            "content-type": "application/json"
        }
    
    def is_configured(self) -> bool:
        """Check if Brevo is properly configured"""
        return bool(self.api_key)
    
    def send_email(
        self,
        to_email: str,
        to_name: str,
        subject: str,
        html_content: str,
        tags: List[str] = None,
        transaction_id: str = None
    ) -> Dict[str, Any]:
        """
        Send a transactional email via Brevo
        
        Args:
            to_email: Recipient email address
            to_name: Recipient name
            subject: Email subject
            html_content: HTML body content
            tags: Optional tags for tracking
            transaction_id: Optional transaction ID for reference
            
        Returns:
            Dictionary with success status and message_id or error
        """
        if not self.is_configured():
            logger.warning("Brevo not configured - email not sent")
            return {
                "success": False,
                "error": "Brevo not configured",
                "mocked": True
            }
        
        payload = {
            "sender": {
                "email": self.sender_email,
                "name": self.sender_name
            },
            "to": [
                {"email": to_email, "name": to_name or ""}
            ],
            "subject": subject,
            "htmlContent": html_content
        }
        
        if tags:
            payload["tags"] = tags
        
        try:
            response = requests.post(
                BREVO_API_URL,
                headers=self.headers,
                data=json.dumps(payload),
                timeout=10
            )
            
            if response.status_code == 201:
                result = response.json()
                logger.info(f"Email sent successfully to {to_email}", extra={
                    "message_id": result.get("messageId"),
                    "transaction_id": transaction_id
                })
                return {
                    "success": True,
                    "message_id": result.get("messageId"),
                    "transaction_id": transaction_id
                }
            else:
                error_data = response.json() if response.text else {}
                logger.error(f"Brevo API error: {response.status_code} - {error_data}")
                return {
                    "success": False,
                    "error": error_data.get("message", f"HTTP {response.status_code}"),
                    "http_status": response.status_code
                }
                
        except requests.exceptions.Timeout:
            logger.error("Brevo API timeout")
            return {"success": False, "error": "Request timeout"}
        except requests.exceptions.RequestException as e:
            logger.error(f"Brevo API request failed: {str(e)}")
            return {"success": False, "error": str(e)}
    
    # === Transaction Email Templates ===
    
    def send_transaction_created(
        self,
        recipient_email: str,
        recipient_name: str,
        transaction_id: str,
        share_code: str,
        role: str,  # "buyer" or "seller"
        other_party_name: str,
        item_description: str,
        amount: float,
        fee: float,
        total: float
    ) -> Dict[str, Any]:
        """Send notification when a new transaction is created"""
        
        share_link = f"https://www.trusttradesa.co.za/t/{share_code}"
        
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
                .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                .header {{ background: #2563eb; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }}
                .content {{ background: #f8fafc; padding: 20px; border-radius: 0 0 8px 8px; }}
                .details {{ background: white; padding: 15px; border-radius: 8px; margin: 15px 0; }}
                .amount {{ font-size: 24px; color: #2563eb; font-weight: bold; }}
                .button {{ display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 15px 0; }}
                .footer {{ text-align: center; font-size: 12px; color: #666; margin-top: 20px; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>New Transaction Created</h1>
                </div>
                <div class="content">
                    <p>Dear {recipient_name},</p>
                    <p>A new escrow transaction has been created on TrustTrade where you are the <strong>{role}</strong>.</p>
                    
                    <div class="details">
                        <p><strong>Transaction Reference:</strong> {share_code}</p>
                        <p><strong>{'Seller' if role == 'buyer' else 'Buyer'}:</strong> {other_party_name}</p>
                        <p><strong>Item:</strong> {item_description}</p>
                        <p><strong>Amount:</strong> R {amount:,.2f}</p>
                        <p><strong>TrustTrade Fee (2%):</strong> R {fee:,.2f}</p>
                        <p class="amount">Total: R {total:,.2f}</p>
                    </div>
                    
                    <p>Your funds will be held securely in escrow until the transaction is completed.</p>
                    
                    <center>
                        <a href="{share_link}" class="button">View Transaction</a>
                    </center>
                    
                    <p style="font-size: 12px; color: #666;">
                        Share this link with the other party: {share_link}
                    </p>
                </div>
                <div class="footer">
                    <p>This transaction is protected by TrustTrade Escrow.</p>
                    <p>&copy; {datetime.now().year} TrustTrade South Africa</p>
                </div>
            </div>
        </body>
        </html>
        """
        
        return self.send_email(
            to_email=recipient_email,
            to_name=recipient_name,
            subject=f"New Transaction Created - {share_code}",
            html_content=html_content,
            tags=["transaction", "created", role],
            transaction_id=transaction_id
        )
    
    def send_payment_received(
        self,
        recipient_email: str,
        recipient_name: str,
        transaction_id: str,
        share_code: str,
        role: str,
        amount: float,
        item_description: str
    ) -> Dict[str, Any]:
        """Send notification when payment is received in escrow"""
        
        if role == "buyer":
            message = "Your payment has been received and is now held securely in escrow. The seller has been notified to deliver the item."
            next_step = "Wait for the seller to deliver the item, then confirm delivery to release the funds."
        else:
            message = "The buyer's payment has been received and is held in escrow. Please proceed to deliver the item to the buyer."
            next_step = "Deliver the item to the buyer. Funds will be released once delivery is confirmed."
        
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
                .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                .header {{ background: #16a34a; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }}
                .content {{ background: #f8fafc; padding: 20px; border-radius: 0 0 8px 8px; }}
                .amount {{ font-size: 24px; color: #16a34a; font-weight: bold; text-align: center; padding: 20px; }}
                .next-step {{ background: #fef3c7; padding: 15px; border-radius: 8px; border-left: 4px solid #f59e0b; }}
                .button {{ display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 15px 0; }}
                .footer {{ text-align: center; font-size: 12px; color: #666; margin-top: 20px; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>✓ Payment Received</h1>
                </div>
                <div class="content">
                    <p>Dear {recipient_name},</p>
                    <p>{message}</p>
                    
                    <div class="amount">
                        R {amount:,.2f}
                    </div>
                    
                    <p><strong>Item:</strong> {item_description}</p>
                    <p><strong>Reference:</strong> {share_code}</p>
                    
                    <div class="next-step">
                        <strong>Next Step:</strong><br/>
                        {next_step}
                    </div>
                    
                    <center>
                        <a href="https://www.trusttradesa.co.za/t/{share_code}" class="button">View Transaction</a>
                    </center>
                </div>
                <div class="footer">
                    <p>This transaction is protected by TrustTrade Escrow.</p>
                    <p>&copy; {datetime.now().year} TrustTrade South Africa</p>
                </div>
            </div>
        </body>
        </html>
        """
        
        return self.send_email(
            to_email=recipient_email,
            to_name=recipient_name,
            subject=f"Payment Received - {share_code}",
            html_content=html_content,
            tags=["transaction", "payment", role],
            transaction_id=transaction_id
        )
    
    def send_delivery_confirmed(
        self,
        recipient_email: str,
        recipient_name: str,
        transaction_id: str,
        share_code: str,
        role: str,
        amount: float,
        item_description: str
    ) -> Dict[str, Any]:
        """Send notification when delivery is confirmed"""
        
        if role == "seller":
            message = "Great news! The buyer has confirmed delivery. Funds will be released to your account shortly."
        else:
            message = "You have confirmed delivery. The funds have been released to the seller."
        
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
                .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                .header {{ background: #16a34a; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }}
                .content {{ background: #f8fafc; padding: 20px; border-radius: 0 0 8px 8px; }}
                .success {{ background: #dcfce7; padding: 20px; border-radius: 8px; text-align: center; }}
                .footer {{ text-align: center; font-size: 12px; color: #666; margin-top: 20px; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>✓ Delivery Confirmed</h1>
                </div>
                <div class="content">
                    <p>Dear {recipient_name},</p>
                    
                    <div class="success">
                        <h2 style="color: #16a34a; margin: 0;">{message}</h2>
                    </div>
                    
                    <p><strong>Item:</strong> {item_description}</p>
                    <p><strong>Amount:</strong> R {amount:,.2f}</p>
                    <p><strong>Reference:</strong> {share_code}</p>
                    
                    <p>Please take a moment to rate your transaction experience.</p>
                    
                    <center>
                        <a href="https://www.trusttradesa.co.za/t/{share_code}" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Rate Transaction</a>
                    </center>
                </div>
                <div class="footer">
                    <p>Thank you for using TrustTrade!</p>
                    <p>&copy; {datetime.now().year} TrustTrade South Africa</p>
                </div>
            </div>
        </body>
        </html>
        """
        
        return self.send_email(
            to_email=recipient_email,
            to_name=recipient_name,
            subject=f"Delivery Confirmed - {share_code}",
            html_content=html_content,
            tags=["transaction", "delivery", role],
            transaction_id=transaction_id
        )
    
    def send_funds_released(
        self,
        recipient_email: str,
        recipient_name: str,
        transaction_id: str,
        share_code: str,
        amount: float,
        item_description: str
    ) -> Dict[str, Any]:
        """Send notification when funds are released to seller"""
        
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
                .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                .header {{ background: #16a34a; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }}
                .content {{ background: #f8fafc; padding: 20px; border-radius: 0 0 8px 8px; }}
                .amount {{ font-size: 32px; color: #16a34a; font-weight: bold; text-align: center; padding: 20px; background: #dcfce7; border-radius: 8px; }}
                .footer {{ text-align: center; font-size: 12px; color: #666; margin-top: 20px; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>💰 Funds Released!</h1>
                </div>
                <div class="content">
                    <p>Dear {recipient_name},</p>
                    <p>Great news! The escrow funds for your transaction have been released.</p>
                    
                    <div class="amount">
                        R {amount:,.2f}
                    </div>
                    
                    <p><strong>Item:</strong> {item_description}</p>
                    <p><strong>Reference:</strong> {share_code}</p>
                    
                    <p>The funds will be transferred to your designated account within 1-2 business days.</p>
                    
                    <p>Thank you for using TrustTrade for your secure transaction!</p>
                </div>
                <div class="footer">
                    <p>&copy; {datetime.now().year} TrustTrade South Africa</p>
                </div>
            </div>
        </body>
        </html>
        """
        
        return self.send_email(
            to_email=recipient_email,
            to_name=recipient_name,
            subject=f"Funds Released - {share_code}",
            html_content=html_content,
            tags=["transaction", "funds_released"],
            transaction_id=transaction_id
        )
    
    def send_dispute_notification(
        self,
        recipient_email: str,
        recipient_name: str,
        transaction_id: str,
        share_code: str,
        dispute_type: str,
        description: str
    ) -> Dict[str, Any]:
        """Send notification when a dispute is raised"""
        
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
                .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                .header {{ background: #dc2626; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }}
                .content {{ background: #f8fafc; padding: 20px; border-radius: 0 0 8px 8px; }}
                .alert {{ background: #fef2f2; padding: 15px; border-radius: 8px; border-left: 4px solid #dc2626; }}
                .button {{ display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 15px 0; }}
                .footer {{ text-align: center; font-size: 12px; color: #666; margin-top: 20px; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>⚠️ Dispute Raised</h1>
                </div>
                <div class="content">
                    <p>Dear {recipient_name},</p>
                    <p>A dispute has been raised for your transaction.</p>
                    
                    <div class="alert">
                        <p><strong>Transaction:</strong> {share_code}</p>
                        <p><strong>Dispute Type:</strong> {dispute_type}</p>
                        <p><strong>Description:</strong> {description}</p>
                    </div>
                    
                    <p>Our team will review this dispute and contact both parties. Funds will remain in escrow until the dispute is resolved.</p>
                    
                    <center>
                        <a href="https://www.trusttradesa.co.za/t/{share_code}" class="button">View Details</a>
                    </center>
                    
                    <p>If you have any additional information or evidence, please upload it through the transaction page.</p>
                </div>
                <div class="footer">
                    <p>&copy; {datetime.now().year} TrustTrade South Africa</p>
                </div>
            </div>
        </body>
        </html>
        """
        
        return self.send_email(
            to_email=recipient_email,
            to_name=recipient_name,
            subject=f"Dispute Raised - {share_code}",
            html_content=html_content,
            tags=["transaction", "dispute"],
            transaction_id=transaction_id
        )


# Create singleton instance
email_service = BrevoEmailService()
