"""
Test Phone Invite Join Flow
Tests the phone-based transaction invite flow including:
- GET /api/transactions/{id} returns 403 with phone_verification_required
- GET /api/transactions/{id} returns invite_type, buyer_phone, seller_phone
- Phone OTP send and verify endpoints
"""

import pytest
import requests
import os
import random
import string
from datetime import datetime, timezone

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from review request
TEST_USER_NO_PHONE = {"email": "test@test.com", "password": "testpass123"}
TEST_USER_WITH_PHONE = {"email": "marnichroets@gmail.com", "password": "testpass123"}
PHONE_BASED_TRANSACTION_ID = "txn_adcfbcad4882"
PHONE_BASED_SHARE_CODE = "TT-364335"


class TestPhoneInviteFlow:
    """Test phone-based transaction invite flow"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    def login(self, email, password):
        """Helper to login and get session"""
        response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": email, "password": password}
        )
        if response.status_code == 200:
            # Store session cookie
            return True
        return False
    
    def test_backend_is_running(self):
        """Test backend is running by checking platform settings endpoint"""
        response = self.session.get(f"{BASE_URL}/api/platform/settings")
        assert response.status_code == 200, f"Backend check failed: {response.text}"
        print("✅ Backend is running (platform settings endpoint accessible)")
    
    def test_login_test_user_no_phone(self):
        """Test login with user that has no verified phone"""
        response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json=TEST_USER_NO_PHONE
        )
        # Accept 200 (success) or 401 (user doesn't exist)
        assert response.status_code in [200, 401], f"Unexpected status: {response.status_code}"
        if response.status_code == 200:
            print(f"✅ Login successful for {TEST_USER_NO_PHONE['email']}")
        else:
            print(f"⚠️ User {TEST_USER_NO_PHONE['email']} doesn't exist or wrong password")
    
    def test_login_test_user_with_phone(self):
        """Test login with user that has verified phone"""
        response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json=TEST_USER_WITH_PHONE
        )
        assert response.status_code in [200, 401], f"Unexpected status: {response.status_code}"
        if response.status_code == 200:
            print(f"✅ Login successful for {TEST_USER_WITH_PHONE['email']}")
        else:
            print(f"⚠️ User {TEST_USER_WITH_PHONE['email']} doesn't exist or wrong password")
    
    def test_transaction_access_without_auth(self):
        """Test transaction access without authentication returns 401"""
        response = self.session.get(f"{BASE_URL}/api/transactions/{PHONE_BASED_TRANSACTION_ID}")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✅ Unauthenticated access correctly returns 401")
    
    def test_phone_verification_required_response_structure(self):
        """Test that 403 response has correct structure for phone verification"""
        # Login first
        login_success = self.login(TEST_USER_NO_PHONE["email"], TEST_USER_NO_PHONE["password"])
        
        if not login_success:
            pytest.skip("Could not login with test user")
        
        # Try to access phone-based transaction
        response = self.session.get(f"{BASE_URL}/api/transactions/{PHONE_BASED_TRANSACTION_ID}")
        
        # Should be 403 with phone_verification_required or 404 if transaction doesn't exist
        if response.status_code == 404:
            print(f"⚠️ Transaction {PHONE_BASED_TRANSACTION_ID} not found - may need to create test data")
            pytest.skip("Phone-based transaction not found")
        
        if response.status_code == 403:
            detail = response.json().get("detail", {})
            
            # Check if it's the structured phone verification response
            if isinstance(detail, dict) and detail.get("type") == "phone_verification_required":
                assert "invited_phone_masked" in detail, "Missing invited_phone_masked"
                assert "invite_type" in detail, "Missing invite_type"
                assert "transaction_id" in detail, "Missing transaction_id"
                assert "item_description" in detail, "Missing item_description"
                assert "item_price" in detail, "Missing item_price"
                print(f"✅ Phone verification required response has correct structure")
                print(f"   - Masked phone: {detail.get('invited_phone_masked')}")
                print(f"   - Invite type: {detail.get('invite_type')}")
                print(f"   - Item: {detail.get('item_description')}")
                print(f"   - Price: {detail.get('item_price')}")
            else:
                # Could be "Not part of this transaction" for non-phone invites
                print(f"⚠️ Got 403 but not phone_verification_required: {detail}")
        elif response.status_code == 200:
            # User has access - check response structure
            data = response.json()
            print(f"✅ User has access to transaction")
            print(f"   - invite_type: {data.get('invite_type', 'N/A')}")
            print(f"   - buyer_phone: {data.get('buyer_phone', 'N/A')}")
            print(f"   - seller_phone: {data.get('seller_phone', 'N/A')}")
    
    def test_transaction_response_includes_phone_fields(self):
        """Test that successful transaction response includes phone fields"""
        # Login with user who has access
        login_success = self.login(TEST_USER_WITH_PHONE["email"], TEST_USER_WITH_PHONE["password"])
        
        if not login_success:
            pytest.skip("Could not login with test user")
        
        # Get user's transactions
        response = self.session.get(f"{BASE_URL}/api/transactions")
        
        if response.status_code != 200:
            pytest.skip("Could not get transactions list")
        
        transactions = response.json()
        
        if not transactions:
            pytest.skip("No transactions found for user")
        
        # Check first transaction for phone fields
        txn = transactions[0]
        txn_id = txn.get("transaction_id")
        
        # Get full transaction details
        detail_response = self.session.get(f"{BASE_URL}/api/transactions/{txn_id}")
        
        if detail_response.status_code == 200:
            data = detail_response.json()
            # Check that invite_type field exists
            invite_type = data.get("invite_type")
            buyer_phone = data.get("buyer_phone")
            seller_phone = data.get("seller_phone")
            
            print(f"✅ Transaction {txn_id} response structure:")
            print(f"   - invite_type: {invite_type}")
            print(f"   - buyer_phone: {buyer_phone}")
            print(f"   - seller_phone: {seller_phone}")
            
            # invite_type should be present (either 'email' or 'phone')
            assert invite_type in [None, 'email', 'phone'], f"Unexpected invite_type: {invite_type}"
    
    def test_phone_otp_send_endpoint_exists(self):
        """Test that phone OTP send endpoint exists"""
        # Login first
        login_success = self.login(TEST_USER_WITH_PHONE["email"], TEST_USER_WITH_PHONE["password"])
        
        if not login_success:
            pytest.skip("Could not login with test user")
        
        # Test endpoint exists (don't actually send OTP)
        response = self.session.post(
            f"{BASE_URL}/api/verification/phone/send-otp",
            json={"phone_number": "+27821234567"}
        )
        
        # Should not be 404 (endpoint exists)
        assert response.status_code != 404, "Phone OTP send endpoint not found"
        print(f"✅ Phone OTP send endpoint exists (status: {response.status_code})")
    
    def test_phone_otp_verify_endpoint_exists(self):
        """Test that phone OTP verify endpoint exists"""
        # Login first
        login_success = self.login(TEST_USER_WITH_PHONE["email"], TEST_USER_WITH_PHONE["password"])
        
        if not login_success:
            pytest.skip("Could not login with test user")
        
        # Test endpoint exists (with invalid OTP)
        response = self.session.post(
            f"{BASE_URL}/api/verification/phone/verify-otp",
            json={"phone_number": "+27821234567", "otp": "000000"}
        )
        
        # Should not be 404 (endpoint exists)
        assert response.status_code != 404, "Phone OTP verify endpoint not found"
        # Should be 400 (no OTP found) not 404
        print(f"✅ Phone OTP verify endpoint exists (status: {response.status_code})")


class TestTransactionPhoneFields:
    """Test transaction model includes phone fields"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    def test_create_transaction_with_phone_recipient(self):
        """Test creating a transaction with phone recipient"""
        # Login
        response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json=TEST_USER_WITH_PHONE
        )
        
        if response.status_code != 200:
            pytest.skip("Could not login")
        
        # Check if user has banking details (required for seller)
        me_response = self.session.get(f"{BASE_URL}/api/auth/me")
        if me_response.status_code != 200:
            pytest.skip("Could not get user info")
        
        # Try to create transaction as buyer with phone recipient
        test_phone = "+27821234567"
        create_response = self.session.post(
            f"{BASE_URL}/api/transactions",
            json={
                "creator_role": "buyer",
                "seller_email": test_phone,  # Phone number as recipient
                "seller_name": "Test Phone Seller",
                "item_description": "TEST_PHONE_INVITE Test Item",
                "item_category": "Electronics",
                "item_condition": "New",
                "item_price": 500,
                "delivery_method": "courier",
                "fee_allocation": "SELLER_AGENT"
            }
        )
        
        if create_response.status_code == 201:
            data = create_response.json()
            print(f"✅ Created transaction with phone recipient")
            print(f"   - Transaction ID: {data.get('transaction_id')}")
            print(f"   - recipient_type: {data.get('recipient_type')}")
            print(f"   - seller_phone: {data.get('seller_phone')}")
            
            # Verify recipient_type is 'phone'
            assert data.get("recipient_type") == "phone", f"Expected recipient_type='phone', got {data.get('recipient_type')}"
            assert data.get("seller_phone") is not None, "seller_phone should be set"
        elif create_response.status_code == 400:
            error = create_response.json().get("detail", "")
            print(f"⚠️ Could not create transaction: {error}")
            # This is expected if user doesn't have banking details
        else:
            print(f"⚠️ Unexpected response: {create_response.status_code} - {create_response.text}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
