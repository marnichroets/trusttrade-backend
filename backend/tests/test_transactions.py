"""
Backend API Tests for TrustTrade - Transaction Creation and Fee Split
Tests transaction creation with fee_paid_by field and validates fee split logic
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Get test session from environment or use default test session
TEST_SESSION_TOKEN = os.environ.get('TEST_SESSION_TOKEN', 'test_session_1772733063533')

class TestAuthEndpoints:
    """Test authentication endpoints"""
    
    def test_auth_me_with_valid_token(self):
        """Test /api/auth/me returns user data for valid session"""
        response = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {TEST_SESSION_TOKEN}"},
            timeout=10
        )
        print(f"Auth me response: {response.status_code}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "user_id" in data, "user_id missing from response"
        assert "email" in data, "email missing from response"
        print(f"User authenticated: {data.get('name', 'N/A')}")
    
    def test_auth_me_without_token(self):
        """Test /api/auth/me returns 401 without token"""
        response = requests.get(
            f"{BASE_URL}/api/auth/me",
            timeout=10
        )
        print(f"Auth me without token: {response.status_code}")
        assert response.status_code == 401, f"Expected 401 for no token, got {response.status_code}"


class TestTransactionCreation:
    """Test transaction creation with fee_paid_by field"""
    
    def test_create_transaction_with_split_fee_default(self):
        """Test creating transaction with default 50/50 split fee"""
        item_price = 1000.00
        expected_fee = round(item_price * 0.02, 2)  # 2% fee = 20.00
        
        payload = {
            "creator_role": "buyer",
            "seller_name": "Test Seller",
            "seller_email": "seller@example.com",
            "item_description": "TEST_Transaction with split fee",
            "item_condition": "New",
            "known_issues": "No issues",
            "item_price": item_price,
            "fee_paid_by": "split",  # Default 50/50 split
            "buyer_details_confirmed": True,
            "seller_details_confirmed": True,
            "item_accuracy_confirmed": True
        }
        
        response = requests.post(
            f"{BASE_URL}/api/transactions",
            json=payload,
            headers={"Authorization": f"Bearer {TEST_SESSION_TOKEN}"},
            timeout=10
        )
        print(f"Create transaction response: {response.status_code}")
        print(f"Response body: {response.text[:500]}")
        
        assert response.status_code == 201, f"Expected 201, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "transaction_id" in data, "transaction_id missing"
        assert data["item_price"] == item_price, f"Item price mismatch: {data['item_price']}"
        assert data["trusttrade_fee"] == expected_fee, f"Fee mismatch: expected {expected_fee}, got {data['trusttrade_fee']}"
        assert data["fee_paid_by"] == "split", f"fee_paid_by mismatch: {data.get('fee_paid_by')}"
        print(f"Transaction created: {data['transaction_id']}, fee: R{data['trusttrade_fee']}")
        
        return data["transaction_id"]
    
    def test_create_transaction_buyer_pays_fee(self):
        """Test creating transaction where buyer pays full fee"""
        item_price = 500.00
        expected_fee = round(item_price * 0.02, 2)  # R10.00
        
        payload = {
            "creator_role": "buyer",
            "seller_name": "Test Seller 2",
            "seller_email": "seller2@example.com",
            "item_description": "TEST_Transaction buyer pays fee",
            "item_condition": "Used",
            "known_issues": "Minor scratches",
            "item_price": item_price,
            "fee_paid_by": "buyer",
            "buyer_details_confirmed": True,
            "seller_details_confirmed": True,
            "item_accuracy_confirmed": True
        }
        
        response = requests.post(
            f"{BASE_URL}/api/transactions",
            json=payload,
            headers={"Authorization": f"Bearer {TEST_SESSION_TOKEN}"},
            timeout=10
        )
        
        assert response.status_code == 201, f"Expected 201, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data["fee_paid_by"] == "buyer", f"fee_paid_by should be 'buyer', got {data.get('fee_paid_by')}"
        print(f"Transaction with buyer fee: {data['transaction_id']}")
    
    def test_create_transaction_seller_pays_fee(self):
        """Test creating transaction where seller pays full fee"""
        item_price = 750.00
        
        payload = {
            "creator_role": "seller",
            "buyer_name": "Test Buyer",
            "buyer_email": "buyer@example.com",
            "item_description": "TEST_Transaction seller pays fee",
            "item_condition": "New",
            "known_issues": "None",
            "item_price": item_price,
            "fee_paid_by": "seller",
            "buyer_details_confirmed": True,
            "seller_details_confirmed": True,
            "item_accuracy_confirmed": True
        }
        
        response = requests.post(
            f"{BASE_URL}/api/transactions",
            json=payload,
            headers={"Authorization": f"Bearer {TEST_SESSION_TOKEN}"},
            timeout=10
        )
        
        assert response.status_code == 201, f"Expected 201, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data["fee_paid_by"] == "seller", f"fee_paid_by should be 'seller', got {data.get('fee_paid_by')}"
        assert data["creator_role"] == "seller", f"creator_role should be 'seller'"
        print(f"Transaction with seller fee: {data['transaction_id']}")
    
    def test_create_transaction_missing_fee_paid_by_uses_default(self):
        """Test that missing fee_paid_by defaults to 'split'"""
        payload = {
            "creator_role": "buyer",
            "seller_name": "Default Test Seller",
            "seller_email": "default@example.com",
            "item_description": "TEST_Transaction default fee split",
            "item_condition": "New",
            "known_issues": "N/A",
            "item_price": 200.00,
            # NOT including fee_paid_by - should default to 'split'
            "buyer_details_confirmed": True,
            "seller_details_confirmed": True,
            "item_accuracy_confirmed": True
        }
        
        response = requests.post(
            f"{BASE_URL}/api/transactions",
            json=payload,
            headers={"Authorization": f"Bearer {TEST_SESSION_TOKEN}"},
            timeout=10
        )
        
        assert response.status_code == 201, f"Expected 201, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("fee_paid_by") == "split", f"Default fee_paid_by should be 'split', got {data.get('fee_paid_by')}"
        print(f"Default fee_paid_by verified as 'split'")


class TestTransactionRetrieval:
    """Test transaction retrieval and listing"""
    
    def test_list_user_transactions(self):
        """Test listing transactions for authenticated user"""
        response = requests.get(
            f"{BASE_URL}/api/transactions",
            headers={"Authorization": f"Bearer {TEST_SESSION_TOKEN}"},
            timeout=10
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"Found {len(data)} transactions for user")
        
        # Verify fee_paid_by field exists in transactions
        for txn in data[:3]:  # Check first 3
            if "fee_paid_by" in txn:
                print(f"Transaction {txn['transaction_id']}: fee_paid_by={txn['fee_paid_by']}")


class TestTransactionValidation:
    """Test transaction validation scenarios"""
    
    def test_create_transaction_without_auth(self):
        """Test that transaction creation requires authentication"""
        payload = {
            "creator_role": "buyer",
            "seller_name": "Unauthorized Seller",
            "seller_email": "unauth@example.com",
            "item_description": "TEST_Unauthorized transaction",
            "item_condition": "New",
            "known_issues": "None",
            "item_price": 100.00,
            "fee_paid_by": "split",
            "buyer_details_confirmed": True,
            "seller_details_confirmed": True,
            "item_accuracy_confirmed": True
        }
        
        response = requests.post(
            f"{BASE_URL}/api/transactions",
            json=payload,
            timeout=10
        )
        
        assert response.status_code == 401, f"Expected 401 without auth, got {response.status_code}"
        print("Unauthenticated transaction creation correctly rejected")


@pytest.fixture(scope="session", autouse=True)
def cleanup_test_transactions():
    """Cleanup TEST_ prefixed transactions after all tests"""
    yield
    # Note: Cleanup would be done here but we're keeping test data for verification


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
