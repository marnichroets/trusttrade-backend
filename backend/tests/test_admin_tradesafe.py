"""
Test Admin Dashboard and TradeSafe Delivery Endpoints
Tests for iteration 12 - Admin pages and TradeSafe happy path
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test session token for admin user
ADMIN_SESSION = "test_admin_session_1774272405889"


class TestAdminEndpoints:
    """Admin dashboard API tests"""
    
    def test_admin_stats_requires_auth(self):
        """Admin stats endpoint requires authentication"""
        response = requests.get(f"{BASE_URL}/api/admin/stats")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
    
    def test_admin_stats_with_auth(self):
        """Admin stats endpoint returns data with auth"""
        response = requests.get(
            f"{BASE_URL}/api/admin/stats",
            cookies={"session_token": ADMIN_SESSION}
        )
        assert response.status_code == 200
        data = response.json()
        assert "total_users" in data
        assert "total_transactions" in data
        assert "pending_disputes" in data
        assert "total_volume" in data
        assert isinstance(data["total_users"], int)
        assert isinstance(data["total_transactions"], int)
    
    def test_admin_transactions_list(self):
        """Admin transactions endpoint returns list"""
        response = requests.get(
            f"{BASE_URL}/api/admin/transactions",
            cookies={"session_token": ADMIN_SESSION}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        if len(data) > 0:
            txn = data[0]
            assert "transaction_id" in txn
            assert "buyer_name" in txn
            assert "seller_name" in txn
            assert "item_price" in txn
            assert "payment_status" in txn
    
    def test_admin_users_list(self):
        """Admin users endpoint returns list"""
        response = requests.get(
            f"{BASE_URL}/api/admin/users",
            cookies={"session_token": ADMIN_SESSION}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        if len(data) > 0:
            user = data[0]
            assert "user_id" in user
            assert "email" in user
            assert "name" in user
    
    def test_admin_disputes_list(self):
        """Admin disputes endpoint returns list"""
        response = requests.get(
            f"{BASE_URL}/api/admin/disputes",
            cookies={"session_token": ADMIN_SESSION}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
    
    def test_admin_transaction_detail(self):
        """Admin transaction detail endpoint returns full data"""
        # First get a transaction ID
        list_response = requests.get(
            f"{BASE_URL}/api/admin/transactions",
            cookies={"session_token": ADMIN_SESSION}
        )
        transactions = list_response.json()
        if len(transactions) == 0:
            pytest.skip("No transactions to test")
        
        txn_id = transactions[0]["transaction_id"]
        response = requests.get(
            f"{BASE_URL}/api/admin/transaction/{txn_id}",
            cookies={"session_token": ADMIN_SESSION}
        )
        assert response.status_code == 200
        data = response.json()
        assert "transaction" in data
        assert "buyer" in data
        assert "seller" in data
        assert data["transaction"]["transaction_id"] == txn_id
    
    def test_admin_user_detail(self):
        """Admin user detail endpoint returns user with transactions"""
        # First get a user ID
        list_response = requests.get(
            f"{BASE_URL}/api/admin/users",
            cookies={"session_token": ADMIN_SESSION}
        )
        users = list_response.json()
        if len(users) == 0:
            pytest.skip("No users to test")
        
        user_id = users[0]["user_id"]
        response = requests.get(
            f"{BASE_URL}/api/admin/user/{user_id}",
            cookies={"session_token": ADMIN_SESSION}
        )
        assert response.status_code == 200
        data = response.json()
        assert "user" in data
        assert "buyer_transactions" in data
        assert "seller_transactions" in data
        assert data["user"]["user_id"] == user_id
    
    def test_admin_dispute_detail(self):
        """Admin dispute detail endpoint returns dispute with context"""
        # First get a dispute ID
        list_response = requests.get(
            f"{BASE_URL}/api/admin/disputes",
            cookies={"session_token": ADMIN_SESSION}
        )
        disputes = list_response.json()
        if len(disputes) == 0:
            pytest.skip("No disputes to test")
        
        dispute_id = disputes[0]["dispute_id"]
        response = requests.get(
            f"{BASE_URL}/api/admin/dispute/{dispute_id}",
            cookies={"session_token": ADMIN_SESSION}
        )
        assert response.status_code == 200
        data = response.json()
        assert "dispute" in data
        assert "transaction" in data
        assert "buyer" in data


class TestTradeSafeDeliveryEndpoints:
    """TradeSafe delivery flow endpoint tests"""
    
    def test_start_delivery_requires_auth(self):
        """Start delivery endpoint requires authentication"""
        response = requests.post(f"{BASE_URL}/api/tradesafe/start-delivery/txn_test123")
        assert response.status_code == 401
        data = response.json()
        assert "detail" in data
        assert "Not authenticated" in data["detail"]
    
    def test_accept_delivery_requires_auth(self):
        """Accept delivery endpoint requires authentication"""
        response = requests.post(f"{BASE_URL}/api/tradesafe/accept-delivery/txn_test123")
        assert response.status_code == 401
        data = response.json()
        assert "detail" in data
        assert "Not authenticated" in data["detail"]
    
    def test_start_delivery_not_found(self):
        """Start delivery returns 404 for non-existent transaction"""
        response = requests.post(
            f"{BASE_URL}/api/tradesafe/start-delivery/txn_nonexistent",
            cookies={"session_token": ADMIN_SESSION}
        )
        assert response.status_code == 404
        data = response.json()
        assert "detail" in data
        assert "not found" in data["detail"].lower()
    
    def test_accept_delivery_not_found(self):
        """Accept delivery returns 404 for non-existent transaction"""
        response = requests.post(
            f"{BASE_URL}/api/tradesafe/accept-delivery/txn_nonexistent",
            cookies={"session_token": ADMIN_SESSION}
        )
        assert response.status_code == 404
        data = response.json()
        assert "detail" in data
        assert "not found" in data["detail"].lower()
    
    def test_start_delivery_wrong_state(self):
        """Start delivery returns 400 when transaction not in FUNDS_RECEIVED state"""
        # Get a transaction that's not in FUNDS_RECEIVED state
        list_response = requests.get(
            f"{BASE_URL}/api/admin/transactions",
            cookies={"session_token": ADMIN_SESSION}
        )
        transactions = list_response.json()
        
        # Find a transaction not in FUNDS_RECEIVED state
        txn = None
        for t in transactions:
            if t.get("tradesafe_state") != "FUNDS_RECEIVED":
                txn = t
                break
        
        if not txn:
            pytest.skip("No transaction in wrong state to test")
        
        response = requests.post(
            f"{BASE_URL}/api/tradesafe/start-delivery/{txn['transaction_id']}",
            cookies={"session_token": ADMIN_SESSION}
        )
        assert response.status_code == 400
        data = response.json()
        assert "detail" in data
        # Should indicate wrong state
        assert "payment" in data["detail"].lower() or "delivery" in data["detail"].lower()
    
    def test_accept_delivery_wrong_state(self):
        """Accept delivery returns 400 when transaction not in INITIATED state"""
        # Get a transaction that's not in INITIATED state
        list_response = requests.get(
            f"{BASE_URL}/api/admin/transactions",
            cookies={"session_token": ADMIN_SESSION}
        )
        transactions = list_response.json()
        
        # Find a transaction not in INITIATED state
        txn = None
        for t in transactions:
            if t.get("tradesafe_state") not in ["INITIATED", "SENT", "DELIVERED"]:
                txn = t
                break
        
        if not txn:
            pytest.skip("No transaction in wrong state to test")
        
        response = requests.post(
            f"{BASE_URL}/api/tradesafe/accept-delivery/{txn['transaction_id']}",
            cookies={"session_token": ADMIN_SESSION}
        )
        assert response.status_code == 400
        data = response.json()
        assert "detail" in data


class TestStaticFileServing:
    """Static file serving tests"""
    
    def test_uploads_photos_endpoint(self):
        """Photos endpoint returns 200 (even for non-existent files)"""
        response = requests.get(f"{BASE_URL}/uploads/photos/test.jpg")
        # Should return 200 (directory listing) or 404 for specific file
        assert response.status_code in [200, 404]
    
    def test_uploads_verification_endpoint(self):
        """Verification endpoint returns 200 (even for non-existent files)"""
        response = requests.get(f"{BASE_URL}/uploads/verification/test.jpg")
        # Should return 200 (directory listing) or 404 for specific file
        assert response.status_code in [200, 404]


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
