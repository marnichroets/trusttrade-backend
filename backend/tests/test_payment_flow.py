"""
Backend API Tests for TrustTrade - Payment Flow and Confirm Delivery
Tests:
- New confirm-payment endpoint (admin only)
- Confirm delivery requires payment_status = 'Paid' 
- Seller confirm flow updates payment_status to 'Ready for Payment'
- Fee payer badge visibility
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
BUYER_SESSION = 'test_session_1772734257395'
ADMIN_SESSION = 'admin_session_1772734257395'
SELLER_SESSION = 'seller_session_1772734257617'

class TestAuthValidation:
    """Validate auth tokens work correctly"""
    
    def test_buyer_auth(self):
        """Verify buyer session is valid"""
        response = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {BUYER_SESSION}"},
            timeout=10
        )
        print(f"Buyer auth response: {response.status_code}")
        assert response.status_code == 200, f"Buyer auth failed: {response.text}"
        data = response.json()
        assert data.get("is_admin") == False, "Buyer should not be admin"
        print(f"Buyer authenticated: {data.get('name')}")
    
    def test_admin_auth(self):
        """Verify admin session is valid"""
        response = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {ADMIN_SESSION}"},
            timeout=10
        )
        print(f"Admin auth response: {response.status_code}")
        assert response.status_code == 200, f"Admin auth failed: {response.text}"
        data = response.json()
        assert data.get("is_admin") == True, "Admin should have is_admin=True"
        print(f"Admin authenticated: {data.get('name')}")
    
    def test_seller_auth(self):
        """Verify seller session is valid"""
        response = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {SELLER_SESSION}"},
            timeout=10
        )
        print(f"Seller auth response: {response.status_code}")
        assert response.status_code == 200, f"Seller auth failed: {response.text}"
        print(f"Seller authenticated: {response.json().get('name')}")


class TestPaymentFlow:
    """Test complete payment flow: Create -> Seller Confirm -> Admin Payment Confirm -> Buyer Confirm Delivery"""
    
    @pytest.fixture(scope="class")
    def transaction_id(self):
        """Create a transaction for payment flow testing"""
        # Get seller email for the transaction
        seller_response = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {SELLER_SESSION}"},
            timeout=10
        )
        seller_email = seller_response.json().get("email")
        
        payload = {
            "creator_role": "buyer",
            "seller_name": "Test Seller for Payment Flow",
            "seller_email": seller_email,
            "item_description": "TEST_Payment_Flow_Item",
            "item_condition": "New",
            "known_issues": "None",
            "item_price": 1000.00,
            "fee_paid_by": "buyer",  # Test fee payer visibility
            "buyer_details_confirmed": True,
            "seller_details_confirmed": True,
            "item_accuracy_confirmed": True
        }
        
        response = requests.post(
            f"{BASE_URL}/api/transactions",
            json=payload,
            headers={"Authorization": f"Bearer {BUYER_SESSION}"},
            timeout=10
        )
        
        assert response.status_code == 201, f"Transaction creation failed: {response.text}"
        txn_id = response.json()["transaction_id"]
        print(f"Created transaction: {txn_id}")
        return txn_id
    
    def test_01_initial_payment_status(self, transaction_id):
        """Test initial payment_status is 'Pending Seller Confirmation'"""
        response = requests.get(
            f"{BASE_URL}/api/transactions/{transaction_id}",
            headers={"Authorization": f"Bearer {BUYER_SESSION}"},
            timeout=10
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["payment_status"] == "Pending Seller Confirmation", \
            f"Initial status should be 'Pending Seller Confirmation', got {data['payment_status']}"
        print(f"Initial payment_status: {data['payment_status']}")
    
    def test_02_fee_paid_by_visible(self, transaction_id):
        """Test fee_paid_by field is visible in response (for both buyer and seller)"""
        # Check as buyer
        buyer_response = requests.get(
            f"{BASE_URL}/api/transactions/{transaction_id}",
            headers={"Authorization": f"Bearer {BUYER_SESSION}"},
            timeout=10
        )
        assert buyer_response.status_code == 200
        assert buyer_response.json().get("fee_paid_by") == "buyer", \
            "fee_paid_by should be 'buyer'"
        print(f"Fee paid by (buyer view): {buyer_response.json().get('fee_paid_by')}")
        
        # Check as seller
        seller_response = requests.get(
            f"{BASE_URL}/api/transactions/{transaction_id}",
            headers={"Authorization": f"Bearer {SELLER_SESSION}"},
            timeout=10
        )
        assert seller_response.status_code == 200
        assert seller_response.json().get("fee_paid_by") == "buyer", \
            "fee_paid_by should be visible to seller too"
        print(f"Fee paid by (seller view): {seller_response.json().get('fee_paid_by')}")
    
    def test_03_confirm_delivery_blocked_before_payment(self, transaction_id):
        """Test buyer CANNOT confirm delivery when payment_status is not 'Paid'"""
        # Try to confirm delivery before payment
        response = requests.patch(
            f"{BASE_URL}/api/transactions/{transaction_id}/delivery",
            json={"delivery_confirmed": True},
            headers={"Authorization": f"Bearer {BUYER_SESSION}"},
            timeout=10
        )
        
        print(f"Confirm delivery before payment: {response.status_code}")
        assert response.status_code == 400, \
            f"Should return 400 when payment not made, got {response.status_code}"
        assert "payment" in response.json().get("detail", "").lower(), \
            "Error should mention payment requirement"
        print(f"Correctly blocked: {response.json().get('detail')}")
    
    def test_04_seller_confirms_transaction(self, transaction_id):
        """Test seller confirms transaction - status changes to 'Ready for Payment'"""
        response = requests.post(
            f"{BASE_URL}/api/transactions/{transaction_id}/seller-confirm",
            json={"confirmed": True},
            headers={"Authorization": f"Bearer {SELLER_SESSION}"},
            timeout=10
        )
        
        print(f"Seller confirm response: {response.status_code}")
        assert response.status_code == 200, f"Seller confirm failed: {response.text}"
        
        # Verify payment_status changed
        txn_response = requests.get(
            f"{BASE_URL}/api/transactions/{transaction_id}",
            headers={"Authorization": f"Bearer {BUYER_SESSION}"},
            timeout=10
        )
        
        data = txn_response.json()
        assert data["payment_status"] == "Ready for Payment", \
            f"After seller confirm, status should be 'Ready for Payment', got {data['payment_status']}"
        assert data["seller_confirmed"] == True
        print(f"Seller confirmed, payment_status: {data['payment_status']}")
    
    def test_05_confirm_delivery_still_blocked(self, transaction_id):
        """Test delivery confirmation still blocked when status is 'Ready for Payment'"""
        response = requests.patch(
            f"{BASE_URL}/api/transactions/{transaction_id}/delivery",
            json={"delivery_confirmed": True},
            headers={"Authorization": f"Bearer {BUYER_SESSION}"},
            timeout=10
        )
        
        print(f"Confirm delivery at Ready for Payment: {response.status_code}")
        assert response.status_code == 400, \
            f"Should still be blocked at 'Ready for Payment', got {response.status_code}"
        print(f"Correctly blocked: {response.json().get('detail')}")
    
    def test_06_non_admin_cannot_confirm_payment(self, transaction_id):
        """Test that non-admin cannot use confirm-payment endpoint"""
        response = requests.post(
            f"{BASE_URL}/api/transactions/{transaction_id}/confirm-payment",
            json={"confirmed": True},
            headers={"Authorization": f"Bearer {BUYER_SESSION}"},  # Regular user
            timeout=10
        )
        
        print(f"Non-admin confirm payment: {response.status_code}")
        assert response.status_code == 403, \
            f"Non-admin should get 403, got {response.status_code}"
        print(f"Non-admin correctly blocked from confirm-payment")
    
    def test_07_admin_confirms_payment(self, transaction_id):
        """Test admin can confirm payment - status changes to 'Paid'"""
        response = requests.post(
            f"{BASE_URL}/api/transactions/{transaction_id}/confirm-payment",
            json={"confirmed": True},
            headers={"Authorization": f"Bearer {ADMIN_SESSION}"},
            timeout=10
        )
        
        print(f"Admin confirm payment response: {response.status_code}")
        assert response.status_code == 200, f"Admin confirm payment failed: {response.text}"
        
        # Verify payment_status changed to 'Paid'
        txn_response = requests.get(
            f"{BASE_URL}/api/transactions/{transaction_id}",
            headers={"Authorization": f"Bearer {BUYER_SESSION}"},
            timeout=10
        )
        
        data = txn_response.json()
        assert data["payment_status"] == "Paid", \
            f"After admin confirm, status should be 'Paid', got {data['payment_status']}"
        print(f"Admin confirmed payment, status: {data['payment_status']}")
    
    def test_08_buyer_can_confirm_delivery_after_payment(self, transaction_id):
        """Test buyer CAN confirm delivery when payment_status is 'Paid'"""
        response = requests.patch(
            f"{BASE_URL}/api/transactions/{transaction_id}/delivery",
            json={"delivery_confirmed": True},
            headers={"Authorization": f"Bearer {BUYER_SESSION}"},
            timeout=10
        )
        
        print(f"Confirm delivery after payment: {response.status_code}")
        assert response.status_code == 200, \
            f"Should allow delivery confirmation when paid, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data["delivery_confirmed"] == True
        assert data["release_status"] == "Released"
        assert data["payment_status"] == "Released"
        print(f"Delivery confirmed, funds released!")


class TestConfirmPaymentEdgeCases:
    """Test edge cases for confirm-payment endpoint"""
    
    def test_confirm_payment_before_seller_confirm(self):
        """Test payment cannot be confirmed before seller confirms"""
        # Create a new transaction
        payload = {
            "creator_role": "buyer",
            "seller_name": "Edge Case Seller",
            "seller_email": "edge@example.com",
            "item_description": "TEST_Edge_Case_Transaction",
            "item_condition": "New",
            "known_issues": "None",
            "item_price": 500.00,
            "fee_paid_by": "split",
            "buyer_details_confirmed": True,
            "seller_details_confirmed": True,
            "item_accuracy_confirmed": True
        }
        
        create_response = requests.post(
            f"{BASE_URL}/api/transactions",
            json=payload,
            headers={"Authorization": f"Bearer {BUYER_SESSION}"},
            timeout=10
        )
        
        txn_id = create_response.json()["transaction_id"]
        print(f"Created edge case transaction: {txn_id}")
        
        # Try to confirm payment before seller confirms
        response = requests.post(
            f"{BASE_URL}/api/transactions/{txn_id}/confirm-payment",
            json={"confirmed": True},
            headers={"Authorization": f"Bearer {ADMIN_SESSION}"},
            timeout=10
        )
        
        print(f"Confirm payment before seller: {response.status_code}")
        assert response.status_code == 400, \
            f"Should return 400 when seller hasn't confirmed, got {response.status_code}"
        print(f"Correctly blocked: {response.json().get('detail')}")
    
    def test_confirm_payment_nonexistent_transaction(self):
        """Test confirm-payment returns 404 for non-existent transaction"""
        response = requests.post(
            f"{BASE_URL}/api/transactions/txn_nonexistent123/confirm-payment",
            json={"confirmed": True},
            headers={"Authorization": f"Bearer {ADMIN_SESSION}"},
            timeout=10
        )
        
        print(f"Confirm payment non-existent: {response.status_code}")
        assert response.status_code == 404, \
            f"Should return 404 for non-existent transaction, got {response.status_code}"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
