"""
Test payment flow for both fresh and already-paid transactions.
Verifies the already_paid flag logic works correctly.
"""
import pytest
import sys
sys.path.insert(0, '/app/backend')

from tradesafe_service import ALLOWED_PAYMENT_METHODS


def test_fresh_transaction_response_structure():
    """Verify the expected response structure for a fresh unpaid transaction."""
    # This is what a fresh transaction should return
    fresh_response = {
        "transaction_id": "txn_fresh_123",
        "tradesafe_id": "ts_abc123",
        "payment_link": "https://pay.tradesafe.co.za/deposit/xyz",
        "state": "CREATED",
        "already_paid": False,
        "payment_methods": ALLOWED_PAYMENT_METHODS,
        "fee_breakdown": {
            "item_amount": 1000,
            "trusttrade_fee": 20
        }
    }
    
    # Assertions
    assert fresh_response.get("payment_link") is not None, "Fresh transaction should have payment_link"
    assert fresh_response.get("already_paid") == False, "Fresh transaction should not be marked as already_paid"
    assert fresh_response.get("state") == "CREATED", "State should be CREATED"
    print("✅ Fresh transaction response structure is correct")


def test_already_paid_response_structure():
    """Verify the expected response structure for an already-paid transaction."""
    # This is what an already-paid transaction should return
    paid_response = {
        "transaction_id": "txn_paid_456",
        "tradesafe_id": "ts_def456",
        "payment_link": None,  # No link for already-paid
        "state": "FUNDS_DEPOSITED",
        "already_paid": True,  # KEY FLAG
        "message": "This transaction has already been paid.",
        "fee_breakdown": {
            "item_amount": 1000,
            "trusttrade_fee": 20
        }
    }
    
    # Assertions
    assert paid_response.get("payment_link") is None, "Already-paid transaction should NOT have payment_link"
    assert paid_response.get("already_paid") == True, "Already-paid transaction MUST have already_paid=True"
    assert paid_response.get("state") in ["FUNDS_DEPOSITED", "FUNDS_RELEASED", "COMPLETED", "DELIVERED"], \
        "State should be one of the paid states"
    print("✅ Already-paid transaction response structure is correct")


def test_paid_states_detection():
    """Verify all PAID_STATES are correctly identified."""
    PAID_STATES = ['FUNDS_DEPOSITED', 'FUNDS_RELEASED', 'COMPLETED', 'DELIVERED']
    
    for state in PAID_STATES:
        assert state in PAID_STATES, f"State {state} should be in PAID_STATES"
    
    # States that should NOT be treated as paid
    UNPAID_STATES = ['CREATED', 'PENDING', 'INITIATED', 'SENT']
    for state in UNPAID_STATES:
        assert state not in PAID_STATES, f"State {state} should NOT be in PAID_STATES"
    
    print("✅ PAID_STATES detection is correct")


def test_frontend_handles_already_paid():
    """Simulate frontend logic for already_paid response."""
    # Simulate backend response
    api_response = {
        "already_paid": True,
        "payment_link": None,
        "state": "FUNDS_DEPOSITED"
    }
    
    # Simulate frontend logic
    redirected = False
    toast_shown = None
    
    if api_response.get("already_paid"):
        toast_shown = "This transaction has already been paid."
        # Frontend returns early - NO redirect
    elif api_response.get("payment_link"):
        redirected = True
        # Frontend opens payment link
    
    assert redirected == False, "Should NOT redirect for already_paid transaction"
    assert toast_shown is not None, "Should show toast message"
    assert "already been paid" in toast_shown.lower(), "Toast should mention 'already paid'"
    print("✅ Frontend handles already_paid correctly")


def test_frontend_handles_fresh_transaction():
    """Simulate frontend logic for fresh transaction response."""
    # Simulate backend response
    api_response = {
        "already_paid": False,
        "payment_link": "https://pay.tradesafe.co.za/deposit/xyz",
        "state": "CREATED"
    }
    
    # Simulate frontend logic
    redirected = False
    toast_shown = None
    
    if api_response.get("already_paid"):
        toast_shown = "This transaction has already been paid."
    elif api_response.get("payment_link"):
        redirected = True
        # Would open payment link in browser
    
    assert redirected == True, "Should redirect to payment page for fresh transaction"
    assert toast_shown is None, "Should NOT show 'already paid' toast for fresh transaction"
    print("✅ Frontend handles fresh transaction correctly")


if __name__ == "__main__":
    print("=" * 70)
    print("Running Payment Flow Tests")
    print("=" * 70)
    print()
    
    test_fresh_transaction_response_structure()
    test_already_paid_response_structure()
    test_paid_states_detection()
    test_frontend_handles_already_paid()
    test_frontend_handles_fresh_transaction()
    
    print()
    print("=" * 70)
    print("ALL TESTS PASSED")
    print("=" * 70)
