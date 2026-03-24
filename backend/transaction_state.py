"""
TrustTrade Transaction State Machine
Defines valid states and transitions for production reliability.
"""

from enum import Enum
from typing import Dict, List, Optional, Set
from datetime import datetime, timezone, timedelta
import logging

logger = logging.getLogger(__name__)

class TransactionState(str, Enum):
    """Transaction states with strict transition rules"""
    CREATED = "CREATED"
    PENDING_CONFIRMATION = "PENDING_CONFIRMATION"
    AWAITING_PAYMENT = "AWAITING_PAYMENT"
    PAYMENT_SECURED = "PAYMENT_SECURED"
    DELIVERY_IN_PROGRESS = "DELIVERY_IN_PROGRESS"
    DELIVERED = "DELIVERED"
    COMPLETED = "COMPLETED"
    DISPUTED = "DISPUTED"
    CANCELLED = "CANCELLED"
    REFUNDED = "REFUNDED"


# Valid state transitions
VALID_TRANSITIONS: Dict[TransactionState, Set[TransactionState]] = {
    TransactionState.CREATED: {
        TransactionState.PENDING_CONFIRMATION,
        TransactionState.AWAITING_PAYMENT,
        TransactionState.CANCELLED
    },
    TransactionState.PENDING_CONFIRMATION: {
        TransactionState.AWAITING_PAYMENT,
        TransactionState.CANCELLED
    },
    TransactionState.AWAITING_PAYMENT: {
        TransactionState.PAYMENT_SECURED,
        TransactionState.CANCELLED
    },
    TransactionState.PAYMENT_SECURED: {
        TransactionState.DELIVERY_IN_PROGRESS,
        TransactionState.DISPUTED,
        TransactionState.REFUNDED
    },
    TransactionState.DELIVERY_IN_PROGRESS: {
        TransactionState.DELIVERED,
        TransactionState.DISPUTED,
        TransactionState.REFUNDED
    },
    TransactionState.DELIVERED: {
        TransactionState.COMPLETED,
        TransactionState.DISPUTED
    },
    TransactionState.COMPLETED: set(),  # Terminal state
    TransactionState.DISPUTED: {
        TransactionState.PAYMENT_SECURED,  # Dispute resolved, back to escrow
        TransactionState.REFUNDED,
        TransactionState.COMPLETED
    },
    TransactionState.CANCELLED: set(),  # Terminal state
    TransactionState.REFUNDED: set(),  # Terminal state
}


# Auto-release times based on delivery method (in hours)
AUTO_RELEASE_HOURS: Dict[str, int] = {
    "meet_in_person": 24,
    "collection": 24,
    "courier": 72,  # 3 days
    "postnet": 120,  # 5 days
    "digital": 24,
    "other": 72
}


def is_valid_transition(from_state: str, to_state: str) -> bool:
    """Check if a state transition is valid"""
    try:
        from_enum = TransactionState(from_state)
        to_enum = TransactionState(to_state)
        return to_enum in VALID_TRANSITIONS.get(from_enum, set())
    except ValueError:
        return False


def get_auto_release_hours(delivery_method: str) -> int:
    """Get auto-release hours based on delivery method"""
    return AUTO_RELEASE_HOURS.get(delivery_method, 72)


def calculate_auto_release_time(delivery_confirmed_at: datetime, delivery_method: str) -> datetime:
    """Calculate when funds should auto-release"""
    hours = get_auto_release_hours(delivery_method)
    return delivery_confirmed_at + timedelta(hours=hours)


def get_ui_status(state: str) -> Dict:
    """Get UI-friendly status info for a transaction state"""
    status_map = {
        TransactionState.CREATED.value: {
            "label": "Transaction Created",
            "description": "Waiting for both parties to confirm",
            "color": "#6c757d",
            "icon": "FileText",
            "step": 1
        },
        TransactionState.PENDING_CONFIRMATION.value: {
            "label": "Pending Confirmation",
            "description": "Waiting for other party to confirm",
            "color": "#f39c12",
            "icon": "Clock",
            "step": 1
        },
        TransactionState.AWAITING_PAYMENT.value: {
            "label": "Awaiting Payment",
            "description": "Buyer needs to complete payment",
            "color": "#f39c12",
            "icon": "CreditCard",
            "step": 2
        },
        TransactionState.PAYMENT_SECURED.value: {
            "label": "Payment Secured",
            "description": "Funds safely held in TrustTrade escrow",
            "color": "#2ecc71",
            "icon": "Shield",
            "step": 3
        },
        TransactionState.DELIVERY_IN_PROGRESS.value: {
            "label": "Delivery in Progress",
            "description": "Seller has dispatched the item",
            "color": "#3498db",
            "icon": "Truck",
            "step": 4
        },
        TransactionState.DELIVERED.value: {
            "label": "Delivered",
            "description": "Buyer confirmed receipt",
            "color": "#2ecc71",
            "icon": "Package",
            "step": 5
        },
        TransactionState.COMPLETED.value: {
            "label": "Completed",
            "description": "Transaction complete, funds released",
            "color": "#2ecc71",
            "icon": "CheckCircle",
            "step": 6
        },
        TransactionState.DISPUTED.value: {
            "label": "Disputed",
            "description": "Transaction under review",
            "color": "#e74c3c",
            "icon": "AlertTriangle",
            "step": None
        },
        TransactionState.CANCELLED.value: {
            "label": "Cancelled",
            "description": "Transaction was cancelled",
            "color": "#6c757d",
            "icon": "XCircle",
            "step": None
        },
        TransactionState.REFUNDED.value: {
            "label": "Refunded",
            "description": "Funds returned to buyer",
            "color": "#e74c3c",
            "icon": "RotateCcw",
            "step": None
        }
    }
    return status_map.get(state, status_map[TransactionState.CREATED.value])


def map_tradesafe_state(ts_state: str) -> str:
    """Map TradeSafe state to TrustTrade state"""
    mapping = {
        "CREATED": TransactionState.AWAITING_PAYMENT.value,
        "PENDING": TransactionState.AWAITING_PAYMENT.value,
        "FUNDS_RECEIVED": TransactionState.PAYMENT_SECURED.value,
        "INITIATED": TransactionState.DELIVERY_IN_PROGRESS.value,
        "SENT": TransactionState.DELIVERY_IN_PROGRESS.value,
        "DELIVERED": TransactionState.DELIVERED.value,
        "FUNDS_RELEASED": TransactionState.COMPLETED.value,
        "REFUNDED": TransactionState.REFUNDED.value,
        "CANCELLED": TransactionState.CANCELLED.value
    }
    return mapping.get(ts_state, TransactionState.CREATED.value)
