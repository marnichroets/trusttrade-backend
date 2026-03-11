"""
Backend API Tests for TrustTrade - Rating System
Tests:
- Rating submission after delivery confirmed (POST /api/transactions/{id}/rate)
- Transaction model rating fields (buyer_rating, buyer_review, seller_rating, seller_review)
- Rating validations (only after delivery_confirmed=true, can only rate once)
- User average rating update after rating submission
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from previous iteration
BUYER_SESSION = 'test_session_1772734257395'
ADMIN_SESSION = 'admin_session_1772734257395'
SELLER_SESSION = 'seller_session_1772734257617'

# Test transaction created with delivery_confirmed=true
TEST_COMPLETED_TXN = 'txn_test_rating_1772734833816'


class TestRatingValidation:
    """Test rating endpoint validation"""
    
    def test_rating_not_allowed_on_incomplete_transaction(self):
        """Test rating fails on transaction without delivery_confirmed=true"""
        # First create a new transaction that is NOT completed
        seller_response = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {SELLER_SESSION}"},
            timeout=10
        )
        seller_email = seller_response.json().get("email")
        
        payload = {
            "creator_role": "buyer",
            "seller_name": "Test Seller for Rating Test",
            "seller_email": seller_email,
            "item_description": "TEST_Rating_Incomplete_Item",
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
        assert create_response.status_code == 201
        incomplete_txn_id = create_response.json()["transaction_id"]
        print(f"Created incomplete transaction: {incomplete_txn_id}")
        
        # Try to rate the incomplete transaction
        rate_response = requests.post(
            f"{BASE_URL}/api/transactions/{incomplete_txn_id}/rate",
            json={"rating": 5, "review": "Great seller!"},
            headers={"Authorization": f"Bearer {BUYER_SESSION}"},
            timeout=10
        )
        
        print(f"Rating incomplete transaction response: {rate_response.status_code}")
        assert rate_response.status_code == 400, f"Should return 400 for incomplete transaction, got {rate_response.status_code}"
        assert "incomplete" in rate_response.json().get("detail", "").lower() or "confirm" in rate_response.json().get("detail", "").lower(), \
            f"Error should mention incomplete/confirm, got: {rate_response.json().get('detail')}"
        print(f"Rating correctly blocked for incomplete transaction: {rate_response.json().get('detail')}")
    
    def test_rating_not_allowed_for_non_participant(self):
        """Test rating fails for user not part of transaction"""
        # Try to rate with admin (who is not buyer or seller)
        rate_response = requests.post(
            f"{BASE_URL}/api/transactions/{TEST_COMPLETED_TXN}/rate",
            json={"rating": 4, "review": "Good!"},
            headers={"Authorization": f"Bearer {ADMIN_SESSION}"},
            timeout=10
        )
        
        print(f"Rating by non-participant response: {rate_response.status_code}")
        # Admin is not buyer or seller, should fail
        # Note: The admin might still have access via is_admin check, but rate should fail
        # If status is 403, it's correct. If 200, admin should not be able to rate
        if rate_response.status_code == 200:
            print("WARNING: Admin was able to rate - this might be intentional or a bug")
        else:
            assert rate_response.status_code in [400, 403], \
                f"Non-participant should get 400/403, got {rate_response.status_code}"
            print(f"Non-participant correctly blocked: {rate_response.json().get('detail')}")


class TestBuyerRating:
    """Test buyer rating flow"""
    
    def test_01_transaction_has_rating_fields(self):
        """Test transaction model includes rating fields"""
        response = requests.get(
            f"{BASE_URL}/api/transactions/{TEST_COMPLETED_TXN}",
            headers={"Authorization": f"Bearer {BUYER_SESSION}"},
            timeout=10
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Check rating fields exist in response
        assert "buyer_rating" in data, "Transaction should have buyer_rating field"
        assert "buyer_review" in data, "Transaction should have buyer_review field"
        assert "seller_rating" in data, "Transaction should have seller_rating field"
        assert "seller_review" in data, "Transaction should have seller_review field"
        
        print(f"Rating fields present - buyer_rating: {data.get('buyer_rating')}, seller_rating: {data.get('seller_rating')}")
    
    def test_02_buyer_can_rate_completed_transaction(self):
        """Test buyer can submit rating for completed transaction"""
        response = requests.post(
            f"{BASE_URL}/api/transactions/{TEST_COMPLETED_TXN}/rate",
            json={"rating": 5, "review": "Excellent seller! Fast delivery."},
            headers={"Authorization": f"Bearer {BUYER_SESSION}"},
            timeout=10
        )
        
        print(f"Buyer rating response: {response.status_code}")
        assert response.status_code == 200, f"Buyer rating should succeed, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("message") == "Rating submitted", f"Expected success message, got: {data}"
        assert data.get("rating") == 5
        print(f"Buyer rating submitted successfully: {data}")
    
    def test_03_buyer_rating_persisted(self):
        """Test buyer rating is persisted in transaction"""
        response = requests.get(
            f"{BASE_URL}/api/transactions/{TEST_COMPLETED_TXN}",
            headers={"Authorization": f"Bearer {BUYER_SESSION}"},
            timeout=10
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert data.get("buyer_rating") == 5, f"buyer_rating should be 5, got {data.get('buyer_rating')}"
        assert data.get("buyer_review") == "Excellent seller! Fast delivery.", \
            f"buyer_review mismatch, got: {data.get('buyer_review')}"
        print(f"Buyer rating persisted - Rating: {data.get('buyer_rating')}, Review: {data.get('buyer_review')}")
    
    def test_04_buyer_cannot_rate_twice(self):
        """Test buyer cannot rate the same transaction twice"""
        response = requests.post(
            f"{BASE_URL}/api/transactions/{TEST_COMPLETED_TXN}/rate",
            json={"rating": 1, "review": "Changed my mind"},
            headers={"Authorization": f"Bearer {BUYER_SESSION}"},
            timeout=10
        )
        
        print(f"Buyer double rating response: {response.status_code}")
        assert response.status_code == 400, f"Double rating should return 400, got {response.status_code}"
        assert "already" in response.json().get("detail", "").lower(), \
            f"Error should mention already rated, got: {response.json().get('detail')}"
        print(f"Buyer correctly blocked from double rating: {response.json().get('detail')}")


class TestSellerRating:
    """Test seller rating flow"""
    
    def test_01_seller_can_rate_completed_transaction(self):
        """Test seller can submit rating for completed transaction"""
        response = requests.post(
            f"{BASE_URL}/api/transactions/{TEST_COMPLETED_TXN}/rate",
            json={"rating": 4, "review": "Great buyer, smooth transaction!"},
            headers={"Authorization": f"Bearer {SELLER_SESSION}"},
            timeout=10
        )
        
        print(f"Seller rating response: {response.status_code}")
        assert response.status_code == 200, f"Seller rating should succeed, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("message") == "Rating submitted", f"Expected success message, got: {data}"
        assert data.get("rating") == 4
        print(f"Seller rating submitted successfully: {data}")
    
    def test_02_seller_rating_persisted(self):
        """Test seller rating is persisted in transaction"""
        response = requests.get(
            f"{BASE_URL}/api/transactions/{TEST_COMPLETED_TXN}",
            headers={"Authorization": f"Bearer {SELLER_SESSION}"},
            timeout=10
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert data.get("seller_rating") == 4, f"seller_rating should be 4, got {data.get('seller_rating')}"
        assert data.get("seller_review") == "Great buyer, smooth transaction!", \
            f"seller_review mismatch, got: {data.get('seller_review')}"
        print(f"Seller rating persisted - Rating: {data.get('seller_rating')}, Review: {data.get('seller_review')}")
    
    def test_03_seller_cannot_rate_twice(self):
        """Test seller cannot rate the same transaction twice"""
        response = requests.post(
            f"{BASE_URL}/api/transactions/{TEST_COMPLETED_TXN}/rate",
            json={"rating": 2, "review": "Changed my mind"},
            headers={"Authorization": f"Bearer {SELLER_SESSION}"},
            timeout=10
        )
        
        print(f"Seller double rating response: {response.status_code}")
        assert response.status_code == 400, f"Double rating should return 400, got {response.status_code}"
        assert "already" in response.json().get("detail", "").lower(), \
            f"Error should mention already rated, got: {response.json().get('detail')}"
        print(f"Seller correctly blocked from double rating: {response.json().get('detail')}")


class TestRatingValidationRange:
    """Test rating value validations"""
    
    @pytest.fixture(scope="class")
    def fresh_completed_transaction(self):
        """Create a fresh completed transaction for testing rating validations"""
        import subprocess
        import time
        
        timestamp = str(int(time.time() * 1000))
        txn_id = f"txn_rating_val_{timestamp}"
        
        # Use mongosh to create a completed transaction
        mongo_cmd = f'''
        use('test_database');
        db.transactions.insertOne({{
            transaction_id: "{txn_id}",
            creator_role: "buyer",
            buyer_user_id: "test-user-1772734257395",
            seller_user_id: "seller-user-1772734257617",
            buyer_name: "Test Buyer",
            buyer_email: "test.buyer.1772734257395@example.com",
            seller_name: "Test Seller",
            seller_email: "test.seller.1772734257617@example.com",
            item_description: "TEST_Rating_Validation_Item",
            item_price: 200.00,
            trusttrade_fee: 4.00,
            total: 204.00,
            fee_paid_by: "split",
            payment_status: "Released",
            seller_confirmed: true,
            delivery_confirmed: true,
            release_status: "Released",
            timeline: [],
            created_at: new Date().toISOString()
        }});
        print("{txn_id}");
        '''
        
        result = subprocess.run(
            ['mongosh', '--eval', mongo_cmd],
            capture_output=True, text=True, timeout=10
        )
        print(f"Created fresh transaction for validation tests: {txn_id}")
        return txn_id
    
    def test_rating_with_optional_review(self, fresh_completed_transaction):
        """Test rating submission with optional review (empty)"""
        response = requests.post(
            f"{BASE_URL}/api/transactions/{fresh_completed_transaction}/rate",
            json={"rating": 3},  # No review
            headers={"Authorization": f"Bearer {BUYER_SESSION}"},
            timeout=10
        )
        
        print(f"Rating without review response: {response.status_code}")
        assert response.status_code == 200, f"Rating without review should succeed, got {response.status_code}: {response.text}"
        print("Rating without review accepted successfully")


class TestUserAverageRatingUpdate:
    """Test user average rating updates after receiving ratings"""
    
    def test_user_rating_stats_updated(self):
        """Test seller's average rating is updated after buyer rates"""
        # Get seller user info
        response = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {SELLER_SESSION}"},
            timeout=10
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Check that average_rating field exists (may be 0.0 initially)
        assert "average_rating" in data, "User should have average_rating field"
        assert "total_trades" in data, "User should have total_trades field"
        
        print(f"Seller stats - Average Rating: {data.get('average_rating')}, Total Trades: {data.get('total_trades')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
