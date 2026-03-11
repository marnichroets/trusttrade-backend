"""
Tests for TrustTrade Share Link System
- Transaction creation generates share_code (TT-XXXXXX format)
- GET /api/share/{share_code} returns transaction preview without auth
- POST /api/share/{share_code}/join links user to transaction (requires auth)
"""

import pytest
import requests
import os
import re
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from iteration_4
BUYER_SESSION = "test_session_1772734257395"
BUYER_EMAIL = "test.buyer.1772734257395@example.com"
SELLER_SESSION = "seller_session_1772734257617"
SELLER_EMAIL = "test.seller.1772734257617@example.com"
ADMIN_SESSION = "admin_session_1772734257395"


class TestShareCodeGeneration:
    """Tests for share_code generation on transaction creation"""

    def test_new_transaction_has_share_code(self):
        """New transaction should have share_code in TT-XXXXXX format"""
        # Create a new transaction
        timestamp = int(time.time() * 1000)
        response = requests.post(
            f"{BASE_URL}/api/transactions",
            json={
                "creator_role": "buyer",
                "seller_name": f"Share Test Seller {timestamp}",
                "seller_email": f"share.seller.{timestamp}@example.com",
                "item_description": f"TEST_Share_Code_Item_{timestamp}",
                "item_condition": "New",
                "known_issues": "None",
                "item_price": 300.0,
                "fee_paid_by": "split",
                "buyer_details_confirmed": True,
                "seller_details_confirmed": True,
                "item_accuracy_confirmed": True
            },
            headers={"Authorization": f"Bearer {BUYER_SESSION}"},
            timeout=10
        )
        
        assert response.status_code == 201, f"Expected 201, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "share_code" in data, "Transaction should have share_code field"
        assert data["share_code"] is not None, "share_code should not be None"
        
        # Validate TT-XXXXXX format
        share_code = data["share_code"]
        assert share_code.startswith("TT-"), f"share_code should start with 'TT-', got: {share_code}"
        assert re.match(r'^TT-\d{6}$', share_code), f"share_code should be TT-XXXXXX format, got: {share_code}"
        
        print(f"✅ Transaction created with share_code: {share_code}")
        
        # Store for other tests
        pytest.share_code = share_code
        pytest.transaction_id = data["transaction_id"]

    def test_share_code_uniqueness(self):
        """Each transaction should have unique share_code"""
        timestamp = int(time.time() * 1000)
        share_codes = []
        
        for i in range(3):
            response = requests.post(
                f"{BASE_URL}/api/transactions",
                json={
                    "creator_role": "buyer",
                    "seller_name": f"Uniqueness Test Seller {timestamp}_{i}",
                    "seller_email": f"unique.seller.{timestamp}.{i}@example.com",
                    "item_description": f"TEST_Unique_Code_Item_{timestamp}_{i}",
                    "item_condition": "Used",
                    "known_issues": "Testing uniqueness",
                    "item_price": 100.0 + i,
                    "fee_paid_by": "buyer",
                    "buyer_details_confirmed": True,
                    "seller_details_confirmed": True,
                    "item_accuracy_confirmed": True
                },
                headers={"Authorization": f"Bearer {BUYER_SESSION}"},
                timeout=10
            )
            
            assert response.status_code == 201, f"Transaction {i} creation failed"
            share_codes.append(response.json()["share_code"])
        
        # Check all share codes are unique
        assert len(share_codes) == len(set(share_codes)), "Share codes should be unique"
        print(f"✅ All 3 share codes are unique: {share_codes}")


class TestSharePreviewEndpoint:
    """Tests for GET /api/share/{share_code} - no auth required"""

    def test_get_share_preview_without_auth(self):
        """Should get transaction preview without authentication"""
        # First create a transaction to get share_code
        timestamp = int(time.time() * 1000)
        create_response = requests.post(
            f"{BASE_URL}/api/transactions",
            json={
                "creator_role": "buyer",
                "seller_name": f"Preview Test Seller {timestamp}",
                "seller_email": f"preview.seller.{timestamp}@example.com",
                "item_description": f"TEST_Preview_Item_{timestamp}",
                "item_condition": "Like New",
                "known_issues": "Minor wear",
                "item_price": 450.0,
                "fee_paid_by": "seller",
                "buyer_details_confirmed": True,
                "seller_details_confirmed": True,
                "item_accuracy_confirmed": True
            },
            headers={"Authorization": f"Bearer {BUYER_SESSION}"},
            timeout=10
        )
        
        assert create_response.status_code == 201
        share_code = create_response.json()["share_code"]
        
        # Get preview WITHOUT auth
        preview_response = requests.get(
            f"{BASE_URL}/api/share/{share_code}",
            timeout=10
        )
        
        assert preview_response.status_code == 200, f"Expected 200, got {preview_response.status_code}: {preview_response.text}"
        
        preview = preview_response.json()
        
        # Validate preview fields
        assert "share_code" in preview, "Preview should have share_code"
        assert "transaction_id" in preview, "Preview should have transaction_id"
        assert "item_description" in preview, "Preview should have item_description"
        assert "item_price" in preview, "Preview should have item_price"
        assert "trusttrade_fee" in preview, "Preview should have trusttrade_fee"
        assert "total" in preview, "Preview should have total"
        assert "fee_paid_by" in preview, "Preview should have fee_paid_by"
        assert "payment_status" in preview, "Preview should have payment_status"
        assert "buyer_name" in preview, "Preview should have buyer_name"
        assert "seller_name" in preview, "Preview should have seller_name"
        
        # Verify values
        assert preview["share_code"] == share_code
        assert preview["item_price"] == 450.0
        assert preview["fee_paid_by"] == "seller"
        
        print(f"✅ Preview available without auth for {share_code}")
        print(f"   Preview data: item={preview['item_description']}, price=R{preview['item_price']}")

    def test_share_preview_not_found(self):
        """Should return 404 for non-existent share_code"""
        response = requests.get(
            f"{BASE_URL}/api/share/TT-000000",
            timeout=10
        )
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        assert "not found" in response.json()["detail"].lower()
        print("✅ Returns 404 for invalid share_code")


class TestJoinTransactionEndpoint:
    """Tests for POST /api/share/{share_code}/join - requires auth"""

    def test_join_without_auth_fails(self):
        """Joining without authentication should fail with 401"""
        response = requests.post(
            f"{BASE_URL}/api/share/TT-123456/join",
            timeout=10
        )
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✅ Join without auth returns 401")

    def test_join_with_matching_email(self):
        """User with matching email can join transaction"""
        timestamp = int(time.time() * 1000)
        
        # Create transaction with seller email matching test seller
        create_response = requests.post(
            f"{BASE_URL}/api/transactions",
            json={
                "creator_role": "buyer",
                "seller_name": "Test Seller",
                "seller_email": SELLER_EMAIL,  # Match seller test user
                "item_description": f"TEST_Join_Item_{timestamp}",
                "item_condition": "New",
                "known_issues": "None",
                "item_price": 600.0,
                "fee_paid_by": "split",
                "buyer_details_confirmed": True,
                "seller_details_confirmed": True,
                "item_accuracy_confirmed": True
            },
            headers={"Authorization": f"Bearer {BUYER_SESSION}"},
            timeout=10
        )
        
        assert create_response.status_code == 201
        share_code = create_response.json()["share_code"]
        transaction_id = create_response.json()["transaction_id"]
        
        # Seller joins via share link
        join_response = requests.post(
            f"{BASE_URL}/api/share/{share_code}/join",
            headers={"Authorization": f"Bearer {SELLER_SESSION}"},
            timeout=10
        )
        
        assert join_response.status_code == 200, f"Expected 200, got {join_response.status_code}: {join_response.text}"
        
        join_data = join_response.json()
        assert join_data["transaction_id"] == transaction_id
        assert join_data["role"] == "seller"  # Matched as seller
        assert "message" in join_data
        
        print(f"✅ Seller joined via share link. Role: {join_data['role']}")

    def test_join_with_non_matching_email_fails(self):
        """User with non-matching email cannot join"""
        timestamp = int(time.time() * 1000)
        
        # Create transaction with unrelated emails
        create_response = requests.post(
            f"{BASE_URL}/api/transactions",
            json={
                "creator_role": "buyer",
                "seller_name": "Random Seller",
                "seller_email": f"random.seller.{timestamp}@example.com",
                "item_description": f"TEST_NonMatch_Item_{timestamp}",
                "item_condition": "Used",
                "known_issues": "None",
                "item_price": 200.0,
                "fee_paid_by": "split",
                "buyer_details_confirmed": True,
                "seller_details_confirmed": True,
                "item_accuracy_confirmed": True
            },
            headers={"Authorization": f"Bearer {BUYER_SESSION}"},
            timeout=10
        )
        
        assert create_response.status_code == 201
        share_code = create_response.json()["share_code"]
        
        # Try to join as seller (whose email doesn't match)
        join_response = requests.post(
            f"{BASE_URL}/api/share/{share_code}/join",
            headers={"Authorization": f"Bearer {SELLER_SESSION}"},
            timeout=10
        )
        
        assert join_response.status_code == 403, f"Expected 403, got {join_response.status_code}"
        assert "email doesn't match" in join_response.json()["detail"].lower()
        print("✅ Non-matching email correctly rejected with 403")

    def test_join_already_linked_user(self):
        """Already linked user should get 'Already joined' message"""
        timestamp = int(time.time() * 1000)
        
        # Create transaction
        create_response = requests.post(
            f"{BASE_URL}/api/transactions",
            json={
                "creator_role": "buyer",
                "seller_name": "Already Linked Seller",
                "seller_email": SELLER_EMAIL,
                "item_description": f"TEST_AlreadyLinked_Item_{timestamp}",
                "item_condition": "New",
                "known_issues": "None",
                "item_price": 350.0,
                "fee_paid_by": "buyer",
                "buyer_details_confirmed": True,
                "seller_details_confirmed": True,
                "item_accuracy_confirmed": True
            },
            headers={"Authorization": f"Bearer {BUYER_SESSION}"},
            timeout=10
        )
        
        assert create_response.status_code == 201
        share_code = create_response.json()["share_code"]
        
        # First join
        first_join = requests.post(
            f"{BASE_URL}/api/share/{share_code}/join",
            headers={"Authorization": f"Bearer {SELLER_SESSION}"},
            timeout=10
        )
        assert first_join.status_code == 200
        
        # Second join - should say already joined
        second_join = requests.post(
            f"{BASE_URL}/api/share/{share_code}/join",
            headers={"Authorization": f"Bearer {SELLER_SESSION}"},
            timeout=10
        )
        assert second_join.status_code == 200
        assert "already joined" in second_join.json()["message"].lower()
        print("✅ Already linked user gets 'Already joined' response")


class TestExistingTransactionShareCode:
    """Tests for share_code on existing transactions"""

    def test_existing_transaction_gets_share_code_on_fetch(self):
        """Existing transactions without share_code should get one when fetched"""
        # Get an existing transaction that we know exists (from previous tests)
        list_response = requests.get(
            f"{BASE_URL}/api/transactions",
            headers={"Authorization": f"Bearer {BUYER_SESSION}"},
            timeout=10
        )
        
        assert list_response.status_code == 200
        transactions = list_response.json()
        
        # Find a transaction without share_code
        old_txn = None
        for txn in transactions:
            if txn.get("share_code") is None:
                old_txn = txn
                break
        
        if old_txn:
            # Fetch it directly to trigger share_code generation
            detail_response = requests.get(
                f"{BASE_URL}/api/transactions/{old_txn['transaction_id']}",
                headers={"Authorization": f"Bearer {BUYER_SESSION}"},
                timeout=10
            )
            
            assert detail_response.status_code == 200
            updated_txn = detail_response.json()
            
            assert updated_txn.get("share_code") is not None, "Old transaction should now have share_code"
            assert re.match(r'^TT-\d{6}$', updated_txn["share_code"]), "Generated share_code should be in TT-XXXXXX format"
            print(f"✅ Old transaction {old_txn['transaction_id']} now has share_code: {updated_txn['share_code']}")
        else:
            print("ℹ️ All transactions already have share_code - skipping test")


class TestSellerCreatedTransaction:
    """Tests for transactions created by seller (creator_role = seller)"""

    def test_seller_created_transaction_share_code(self):
        """Seller-created transaction should also have share_code"""
        timestamp = int(time.time() * 1000)
        
        response = requests.post(
            f"{BASE_URL}/api/transactions",
            json={
                "creator_role": "seller",
                "buyer_name": f"Share Test Buyer {timestamp}",
                "buyer_email": BUYER_EMAIL,
                "item_description": f"TEST_Seller_Created_Item_{timestamp}",
                "item_condition": "Refurbished",
                "known_issues": "Replaced battery",
                "item_price": 800.0,
                "fee_paid_by": "split",
                "buyer_details_confirmed": True,
                "seller_details_confirmed": True,
                "item_accuracy_confirmed": True
            },
            headers={"Authorization": f"Bearer {SELLER_SESSION}"},
            timeout=10
        )
        
        assert response.status_code == 201
        data = response.json()
        
        assert data.get("share_code") is not None
        assert re.match(r'^TT-\d{6}$', data["share_code"])
        assert data["payment_status"] == "Pending Buyer Confirmation"  # Different for seller-created
        
        print(f"✅ Seller-created transaction has share_code: {data['share_code']}")
        
        # Store for buyer join test
        pytest.seller_created_share_code = data["share_code"]
        pytest.seller_created_txn_id = data["transaction_id"]

    def test_buyer_can_join_seller_created_transaction(self):
        """Buyer can join a seller-created transaction via share link"""
        # Use the transaction created above
        share_code = getattr(pytest, 'seller_created_share_code', None)
        
        if not share_code:
            pytest.skip("No seller-created transaction available")
        
        join_response = requests.post(
            f"{BASE_URL}/api/share/{share_code}/join",
            headers={"Authorization": f"Bearer {BUYER_SESSION}"},
            timeout=10
        )
        
        assert join_response.status_code == 200, f"Expected 200, got {join_response.status_code}: {join_response.text}"
        
        join_data = join_response.json()
        assert join_data["role"] == "buyer"  # Matched as buyer
        print(f"✅ Buyer joined seller-created transaction. Role: {join_data['role']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
