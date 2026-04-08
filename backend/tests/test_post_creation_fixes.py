"""
Tests for TrustTrade Post-Creation Bug Fixes
Issue 1: Share link resolution - Frontend /t/:shareCode route should fetch from /api/share/{shareCode}
Issue 2: Email validation - email_service.py validates email before sending (skips empty/invalid emails)
Issue 3: Seller 'Confirm Fee Agreement' UI - TransactionDetail.js shows fee breakdown and confirm button
"""

import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials - created fresh for this test run
BUYER_SESSION = "buyer_session_1775483294494"
BUYER_EMAIL = "test.buyer.1775483294494@example.com"
SELLER_SESSION = "seller_session_1775483294494"
SELLER_EMAIL = "test.seller.1775483294494@example.com"


class TestShareLinkResolution:
    """
    Issue 1 FIX: Share link resolution
    Frontend /t/:shareCode route should fetch from /api/share/{shareCode} correctly
    (was incorrectly calling /share/ without /api prefix)
    """

    def test_share_endpoint_accessible_without_auth(self):
        """GET /api/share/{share_code} should be accessible without authentication"""
        # First create a transaction to get a share code
        timestamp = int(time.time() * 1000)
        create_response = requests.post(
            f"{BASE_URL}/api/transactions",
            json={
                "creator_role": "buyer",
                "seller_name": f"Share Link Test Seller {timestamp}",
                "seller_email": f"share.test.{timestamp}@example.com",
                "item_description": f"TEST_ShareLink_Item_{timestamp}",
                "item_condition": "New",
                "known_issues": "None",
                "item_price": 500.0,
                "fee_allocation": "SPLIT_AGENT",
                "delivery_method": "courier",
                "buyer_details_confirmed": True,
                "seller_details_confirmed": True,
                "item_accuracy_confirmed": True
            },
            headers={"Authorization": f"Bearer {BUYER_SESSION}"},
            timeout=15
        )
        
        assert create_response.status_code == 201, f"Transaction creation failed: {create_response.text}"
        share_code = create_response.json()["share_code"]
        
        # Test the share endpoint WITHOUT auth (this is what the frontend calls)
        share_response = requests.get(
            f"{BASE_URL}/api/share/{share_code}",
            timeout=10
        )
        
        assert share_response.status_code == 200, f"Share endpoint failed: {share_response.status_code} - {share_response.text}"
        
        data = share_response.json()
        assert "share_code" in data, "Response should contain share_code"
        assert "item_description" in data, "Response should contain item_description"
        assert "item_price" in data, "Response should contain item_price"
        assert "trusttrade_fee" in data, "Response should contain trusttrade_fee"
        assert "total" in data, "Response should contain total"
        assert "buyer_name" in data, "Response should contain buyer_name"
        assert "seller_name" in data, "Response should contain seller_name"
        assert "payment_status" in data, "Response should contain payment_status"
        
        print(f"✅ Share endpoint /api/share/{share_code} returns correct preview data")
        print(f"   Item: {data['item_description']}, Price: R{data['item_price']}")
        
        # Store for later tests
        pytest.test_share_code = share_code
        pytest.test_transaction_id = create_response.json()["transaction_id"]

    def test_share_endpoint_returns_404_for_invalid_code(self):
        """GET /api/share/{invalid_code} should return 404"""
        response = requests.get(
            f"{BASE_URL}/api/share/TT-INVALID",
            timeout=10
        )
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        assert "not found" in response.json()["detail"].lower()
        print("✅ Share endpoint returns 404 for invalid share code")

    def test_share_preview_contains_fee_info(self):
        """Share preview should contain fee information for display"""
        share_code = getattr(pytest, 'test_share_code', None)
        if not share_code:
            pytest.skip("No share code available from previous test")
        
        response = requests.get(
            f"{BASE_URL}/api/share/{share_code}",
            timeout=10
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify fee fields are present
        assert "trusttrade_fee" in data, "Should have trusttrade_fee"
        assert "total" in data, "Should have total"
        assert "fee_paid_by" in data, "Should have fee_paid_by"
        
        # Verify fee calculation (2% of item_price)
        expected_fee = round(data["item_price"] * 0.02, 2)
        assert abs(data["trusttrade_fee"] - expected_fee) < 0.01, f"Fee should be 2% of price"
        
        print(f"✅ Share preview contains fee info: fee=R{data['trusttrade_fee']}, total=R{data['total']}")


class TestEmailValidation:
    """
    Issue 2 FIX: Email validation
    email_service.py now validates email before sending (skips empty/invalid emails for phone-based invites)
    """

    def test_transaction_creation_with_phone_invite(self):
        """Transaction with phone number instead of email should not fail on email send"""
        timestamp = int(time.time() * 1000)
        
        # Create transaction with phone number as seller contact (simulating phone invite)
        response = requests.post(
            f"{BASE_URL}/api/transactions",
            json={
                "creator_role": "buyer",
                "seller_name": f"Phone Invite Seller {timestamp}",
                "seller_email": "+27821234567",  # Phone number instead of email
                "item_description": f"TEST_PhoneInvite_Item_{timestamp}",
                "item_condition": "New",
                "known_issues": "None",
                "item_price": 750.0,
                "fee_allocation": "BUYER_AGENT",
                "delivery_method": "courier",
                "buyer_details_confirmed": True,
                "seller_details_confirmed": True,
                "item_accuracy_confirmed": True
            },
            headers={"Authorization": f"Bearer {BUYER_SESSION}"},
            timeout=15
        )
        
        # Should succeed - email service should skip invalid email gracefully
        assert response.status_code == 201, f"Transaction creation should succeed even with phone invite: {response.text}"
        
        data = response.json()
        assert data.get("share_code") is not None, "Should have share code"
        assert data.get("recipient_type") == "phone", "Should detect phone recipient type"
        
        print(f"✅ Transaction created with phone invite - email validation skipped gracefully")
        print(f"   Share code: {data['share_code']}, Recipient type: {data.get('recipient_type')}")

    def test_transaction_creation_with_valid_email(self):
        """Transaction with valid email should work normally"""
        timestamp = int(time.time() * 1000)
        
        response = requests.post(
            f"{BASE_URL}/api/transactions",
            json={
                "creator_role": "buyer",
                "seller_name": f"Email Invite Seller {timestamp}",
                "seller_email": f"valid.seller.{timestamp}@example.com",
                "item_description": f"TEST_EmailInvite_Item_{timestamp}",
                "item_condition": "Used",
                "known_issues": "Minor scratches",
                "item_price": 600.0,
                "fee_allocation": "SELLER_AGENT",
                "delivery_method": "courier",
                "buyer_details_confirmed": True,
                "seller_details_confirmed": True,
                "item_accuracy_confirmed": True
            },
            headers={"Authorization": f"Bearer {BUYER_SESSION}"},
            timeout=15
        )
        
        assert response.status_code == 201, f"Transaction creation failed: {response.text}"
        
        data = response.json()
        assert data.get("recipient_type") == "email", "Should detect email recipient type"
        
        print(f"✅ Transaction created with valid email - normal flow works")


class TestSellerConfirmFeeAgreement:
    """
    Issue 3 FIX: Seller 'Confirm Fee Agreement' UI
    TransactionDetail.js now shows fee breakdown and explicit 'Confirm Fee Agreement' button for sellers
    Backend endpoint /api/transactions/{id}/seller-confirm should work correctly
    """

    def test_seller_confirm_endpoint_exists(self):
        """POST /api/transactions/{id}/seller-confirm should exist and require auth"""
        # Test without auth
        response = requests.post(
            f"{BASE_URL}/api/transactions/fake-id/seller-confirm",
            json={"confirmed": True},
            timeout=10
        )
        
        assert response.status_code == 401, f"Should require auth, got {response.status_code}"
        print("✅ Seller confirm endpoint requires authentication")

    def test_seller_confirm_full_flow(self):
        """Full flow: Create transaction -> Seller confirms fee agreement -> Status changes"""
        timestamp = int(time.time() * 1000)
        
        # Step 1: Buyer creates transaction with seller email
        create_response = requests.post(
            f"{BASE_URL}/api/transactions",
            json={
                "creator_role": "buyer",
                "seller_name": "Test Seller",
                "seller_email": SELLER_EMAIL,  # Use our test seller
                "item_description": f"TEST_SellerConfirm_Item_{timestamp}",
                "item_condition": "New",
                "known_issues": "None",
                "item_price": 1000.0,
                "fee_allocation": "SELLER_AGENT",
                "delivery_method": "courier",
                "buyer_details_confirmed": True,
                "seller_details_confirmed": True,
                "item_accuracy_confirmed": True
            },
            headers={"Authorization": f"Bearer {BUYER_SESSION}"},
            timeout=15
        )
        
        assert create_response.status_code == 201, f"Transaction creation failed: {create_response.text}"
        
        txn_data = create_response.json()
        transaction_id = txn_data["transaction_id"]
        share_code = txn_data["share_code"]
        
        # Verify initial status is "Pending Seller Confirmation"
        assert txn_data["payment_status"] == "Pending Seller Confirmation", \
            f"Initial status should be 'Pending Seller Confirmation', got: {txn_data['payment_status']}"
        
        print(f"✅ Step 1: Transaction created with status 'Pending Seller Confirmation'")
        print(f"   Transaction ID: {transaction_id}, Share Code: {share_code}")
        
        # Step 2: Seller joins via share link
        join_response = requests.post(
            f"{BASE_URL}/api/share/{share_code}/join",
            headers={"Authorization": f"Bearer {SELLER_SESSION}"},
            timeout=10
        )
        
        assert join_response.status_code == 200, f"Seller join failed: {join_response.text}"
        assert join_response.json()["role"] == "seller"
        
        print(f"✅ Step 2: Seller joined transaction via share link")
        
        # Step 3: Seller confirms fee agreement
        confirm_response = requests.post(
            f"{BASE_URL}/api/transactions/{transaction_id}/seller-confirm",
            json={"confirmed": True},
            headers={"Authorization": f"Bearer {SELLER_SESSION}"},
            timeout=15
        )
        
        assert confirm_response.status_code == 200, f"Seller confirm failed: {confirm_response.text}"
        
        confirm_data = confirm_response.json()
        assert "message" in confirm_data, "Should have message"
        assert confirm_data.get("status") == "Ready for Payment", \
            f"Status should be 'Ready for Payment', got: {confirm_data.get('status')}"
        
        print(f"✅ Step 3: Seller confirmed fee agreement")
        print(f"   Response: {confirm_data}")
        
        # Step 4: Verify transaction status changed
        get_response = requests.get(
            f"{BASE_URL}/api/transactions/{transaction_id}",
            headers={"Authorization": f"Bearer {SELLER_SESSION}"},
            timeout=10
        )
        
        assert get_response.status_code == 200
        updated_txn = get_response.json()
        
        assert updated_txn["seller_confirmed"] == True, "seller_confirmed should be True"
        assert updated_txn["payment_status"] == "Ready for Payment", \
            f"Status should be 'Ready for Payment', got: {updated_txn['payment_status']}"
        
        print(f"✅ Step 4: Transaction status verified as 'Ready for Payment'")
        print(f"   Full flow complete: PENDING -> CONFIRMED (Ready for Payment)")
        
        # Store for later tests
        pytest.confirmed_transaction_id = transaction_id

    def test_non_seller_cannot_confirm(self):
        """Only seller can confirm fee agreement"""
        transaction_id = getattr(pytest, 'confirmed_transaction_id', None)
        if not transaction_id:
            pytest.skip("No confirmed transaction available")
        
        # Buyer tries to confirm (should fail)
        response = requests.post(
            f"{BASE_URL}/api/transactions/{transaction_id}/seller-confirm",
            json={"confirmed": True},
            headers={"Authorization": f"Bearer {BUYER_SESSION}"},
            timeout=10
        )
        
        # Should fail - buyer is not the seller
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"
        print("✅ Non-seller correctly rejected from confirming")

    def test_already_confirmed_transaction(self):
        """Already confirmed transaction should return appropriate message"""
        transaction_id = getattr(pytest, 'confirmed_transaction_id', None)
        if not transaction_id:
            pytest.skip("No confirmed transaction available")
        
        # Try to confirm again
        response = requests.post(
            f"{BASE_URL}/api/transactions/{transaction_id}/seller-confirm",
            json={"confirmed": True},
            headers={"Authorization": f"Bearer {SELLER_SESSION}"},
            timeout=10
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert response.json().get("already_confirmed") == True or "already confirmed" in response.json().get("message", "").lower()
        print("✅ Already confirmed transaction returns appropriate message")


class TestMinimumTransactionAmount:
    """Test minimum transaction amount validation (R500)"""

    def test_transaction_below_minimum_fails(self):
        """Transaction below R500 should fail"""
        timestamp = int(time.time() * 1000)
        
        response = requests.post(
            f"{BASE_URL}/api/transactions",
            json={
                "creator_role": "buyer",
                "seller_name": f"Min Amount Seller {timestamp}",
                "seller_email": f"min.seller.{timestamp}@example.com",
                "item_description": f"TEST_MinAmount_Item_{timestamp}",
                "item_condition": "New",
                "known_issues": "None",
                "item_price": 100.0,  # Below R500 minimum
                "fee_allocation": "SPLIT_AGENT",
                "delivery_method": "courier",
                "buyer_details_confirmed": True,
                "seller_details_confirmed": True,
                "item_accuracy_confirmed": True
            },
            headers={"Authorization": f"Bearer {BUYER_SESSION}"},
            timeout=10
        )
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        assert "minimum" in response.json()["detail"].lower() or "500" in response.json()["detail"]
        print("✅ Transaction below R500 minimum correctly rejected")

    def test_transaction_at_minimum_succeeds(self):
        """Transaction at exactly R500 should succeed"""
        timestamp = int(time.time() * 1000)
        
        response = requests.post(
            f"{BASE_URL}/api/transactions",
            json={
                "creator_role": "buyer",
                "seller_name": f"Exact Min Seller {timestamp}",
                "seller_email": f"exact.min.{timestamp}@example.com",
                "item_description": f"TEST_ExactMin_Item_{timestamp}",
                "item_condition": "New",
                "known_issues": "None",
                "item_price": 500.0,  # Exactly R500 minimum
                "fee_allocation": "SPLIT_AGENT",
                "delivery_method": "courier",
                "buyer_details_confirmed": True,
                "seller_details_confirmed": True,
                "item_accuracy_confirmed": True
            },
            headers={"Authorization": f"Bearer {BUYER_SESSION}"},
            timeout=15
        )
        
        assert response.status_code == 201, f"Transaction at minimum should succeed: {response.text}"
        print("✅ Transaction at exactly R500 minimum succeeds")


class TestFeeCalculation:
    """Test 2% TrustTrade fee calculation"""

    def test_fee_calculation_correct(self):
        """TrustTrade fee should be 2% of item price"""
        timestamp = int(time.time() * 1000)
        item_price = 1500.0
        expected_fee = item_price * 0.02  # 2% = R30
        expected_total = item_price + expected_fee  # R1530
        
        response = requests.post(
            f"{BASE_URL}/api/transactions",
            json={
                "creator_role": "buyer",
                "seller_name": f"Fee Calc Seller {timestamp}",
                "seller_email": f"fee.calc.{timestamp}@example.com",
                "item_description": f"TEST_FeeCalc_Item_{timestamp}",
                "item_condition": "New",
                "known_issues": "None",
                "item_price": item_price,
                "fee_allocation": "SPLIT_AGENT",
                "delivery_method": "courier",
                "buyer_details_confirmed": True,
                "seller_details_confirmed": True,
                "item_accuracy_confirmed": True
            },
            headers={"Authorization": f"Bearer {BUYER_SESSION}"},
            timeout=15
        )
        
        assert response.status_code == 201
        data = response.json()
        
        assert data["item_price"] == item_price
        assert abs(data["trusttrade_fee"] - expected_fee) < 0.01, f"Fee should be R{expected_fee}, got R{data['trusttrade_fee']}"
        assert abs(data["total"] - expected_total) < 0.01, f"Total should be R{expected_total}, got R{data['total']}"
        
        print(f"✅ Fee calculation correct: price=R{item_price}, fee=R{data['trusttrade_fee']}, total=R{data['total']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
