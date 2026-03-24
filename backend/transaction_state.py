"""
TrustTrade Transaction State Machine
Defines valid states and transitions for production reliability.
Enforces strict state transitions to prevent invalid state changes.
"""

from enum import Enum
from typing import Dict, Set, Optional
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


# Valid state transitions - enforced strictly
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
    """
    Check if a state transition is valid according to the state machine.
    
    Args:
        from_state: Current state (string)
        to_state: Target state (string)
    
    Returns:
        True if transition is valid, False otherwise
    """
    try:
        from_enum = TransactionState(from_state)
        to_enum = TransactionState(to_state)
        
        valid = to_enum in VALID_TRANSITIONS.get(from_enum, set())
        
        if not valid:
            logger.warning(f"Invalid state transition attempted: {from_state} -> {to_state}")
        
        return valid
    except ValueError as e:
        logger.warning(f"Invalid state value: {e}")
        return False


def is_terminal_state(state: str) -> bool:
    """Check if a state is terminal (no further transitions allowed)"""
    try:
        state_enum = TransactionState(state)
        return len(VALID_TRANSITIONS.get(state_enum, set())) == 0
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
            "step": 1,
            "is_active": True
        },
        TransactionState.PENDING_CONFIRMATION.value: {
            "label": "Pending Confirmation",
            "description": "Waiting for other party to confirm",
            "color": "#f39c12",
            "icon": "Clock",
            "step": 1,
            "is_active": True
        },
        TransactionState.AWAITING_PAYMENT.value: {
            "label": "Awaiting Payment",
            "description": "Buyer needs to complete payment",
            "color": "#f39c12",
            "icon": "CreditCard",
            "step": 2,
            "is_active": True
        },
        TransactionState.PAYMENT_SECURED.value: {
            "label": "Payment Secured",
            "description": "Funds safely held in TrustTrade escrow",
            "color": "#2ecc71",
            "icon": "Shield",
            "step": 3,
            "is_active": True
        },
        TransactionState.DELIVERY_IN_PROGRESS.value: {
            "label": "Delivery in Progress",
            "description": "Seller has dispatched the item",
            "color": "#3498db",
            "icon": "Truck",
            "step": 4,
            "is_active": True
        },
        TransactionState.DELIVERED.value: {
            "label": "Delivered",
            "description": "Buyer confirmed receipt",
            "color": "#2ecc71",
            "icon": "Package",
            "step": 5,
            "is_active": True
        },
        TransactionState.COMPLETED.value: {
            "label": "Completed",
            "description": "Transaction complete, funds released",
            "color": "#2ecc71",
            "icon": "CheckCircle",
            "step": 6,
            "is_active": False
        },
        TransactionState.DISPUTED.value: {
            "label": "Disputed",
            "description": "Transaction under review",
            "color": "#e74c3c",
            "icon": "AlertTriangle",
            "step": None,
            "is_active": True
        },
        TransactionState.CANCELLED.value: {
            "label": "Cancelled",
            "description": "Transaction was cancelled",
            "color": "#6c757d",
            "icon": "XCircle",
            "step": None,
            "is_active": False
        },
        TransactionState.REFUNDED.value: {
            "label": "Refunded",
            "description": "Funds returned to buyer",
            "color": "#e74c3c",
            "icon": "RotateCcw",
            "step": None,
            "is_active": False
        }
    }
    return status_map.get(state, status_map[TransactionState.CREATED.value])


def map_tradesafe_state(ts_state: str) -> str:
    """
    Map TradeSafe state to TrustTrade state.
    
    TradeSafe states: CREATED, PENDING, FUNDS_RECEIVED, INITIATED, SENT, DELIVERED, FUNDS_RELEASED, REFUNDED, CANCELLED
    """
    if not ts_state:
        return TransactionState.CREATED.value
    
    ts_state = ts_state.upper()
    
    mapping = {
        # Payment states
        "CREATED": TransactionState.AWAITING_PAYMENT.value,
        "PENDING": TransactionState.AWAITING_PAYMENT.value,
        "FUNDS_RECEIVED": TransactionState.PAYMENT_SECURED.value,
        
        # Delivery states
        "INITIATED": TransactionState.DELIVERY_IN_PROGRESS.value,
        "SENT": TransactionState.DELIVERY_IN_PROGRESS.value,
        "DELIVERED": TransactionState.DELIVERED.value,
        
        # Completion states
        "FUNDS_RELEASED": TransactionState.COMPLETED.value,
        "COMPLETED": TransactionState.COMPLETED.value,
        
        # Terminal states
        "REFUNDED": TransactionState.REFUNDED.value,
        "CANCELLED": TransactionState.CANCELLED.value,
        "DISPUTED": TransactionState.DISPUTED.value
    }
    
    return mapping.get(ts_state, TransactionState.CREATED.value)


def get_state_order() -> list:
    """Get the normal flow order of states for timeline display"""
    return [
        TransactionState.CREATED.value,
        TransactionState.PENDING_CONFIRMATION.value,
        TransactionState.AWAITING_PAYMENT.value,
        TransactionState.PAYMENT_SECURED.value,
        TransactionState.DELIVERY_IN_PROGRESS.value,
        TransactionState.DELIVERED.value,
        TransactionState.COMPLETED.value
    ]


def get_state_index(state: str) -> int:
    """Get the index of a state in the normal flow order"""
    order = get_state_order()
    try:
        return order.index(state)
    except ValueError:
        return -1


def is_state_before(state1: str, state2: str) -> bool:
    """Check if state1 comes before state2 in the normal flow"""
    idx1 = get_state_index(state1)
    idx2 = get_state_index(state2)
    
    if idx1 < 0 or idx2 < 0:
        return False
    
    return idx1 < idx2
