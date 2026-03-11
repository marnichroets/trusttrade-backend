"""
Tests for User Profile and Live Activity Board features.
- GET /api/users/{user_id}/profile - User profile with trust metrics
- GET /api/platform/stats - Platform-wide statistics
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Use the test session created earlier
TEST_SESSION_TOKEN = "test_session_1773246174209"
TEST_USER_ID = "test-user-1773246174209"


@pytest.fixture(scope="module")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="module")
def auth_headers():
    """Authentication headers for protected endpoints"""
    return {"Authorization": f"Bearer {TEST_SESSION_TOKEN}"}


class TestUserProfile:
    """User Profile endpoint tests"""
    
    def test_get_user_profile_authenticated(self, api_client, auth_headers):
        """Test getting user profile with valid authentication"""
        response = api_client.get(
            f"{BASE_URL}/api/users/{TEST_USER_ID}/profile",
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Verify required fields exist
        assert "user_id" in data
        assert "name" in data
        assert "email" in data
        assert "trust_score" in data
        assert "total_trades" in data
        assert "successful_trades" in data
        assert "average_rating" in data
        assert "valid_disputes_count" in data
        assert "badges" in data
        assert "verified" in data
        assert "suspended" in data
        assert "created_at" in data
        
        # Verify values match what was seeded
        assert data["user_id"] == TEST_USER_ID
        assert data["name"] == "Profile Test User"
        assert data["verified"] is True
        assert data["suspended"] is False
    
    def test_trust_score_calculation(self, api_client, auth_headers):
        """Test that trust score is calculated correctly"""
        response = api_client.get(
            f"{BASE_URL}/api/users/{TEST_USER_ID}/profile",
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Trust score formula:
        # - Transaction history: up to 40 pts (4 pts per successful trade, max 10 trades)
        # - User ratings: up to 30 pts (6 pts per star)
        # - Dispute record: up to 20 pts (starts at 20, -5 per valid dispute)
        # - Verification: 10 pts
        
        successful_trades = data.get("successful_trades", 0)
        average_rating = data.get("average_rating", 0.0)
        valid_disputes = data.get("valid_disputes_count", 0)
        is_verified = data.get("verified", False)
        
        expected_trade_score = min(40, successful_trades * 4)
        expected_rating_score = int(average_rating * 6)
        expected_dispute_score = max(0, 20 - valid_disputes * 5)
        expected_verification_score = 10 if is_verified else 0
        
        expected_total = expected_trade_score + expected_rating_score + expected_dispute_score + expected_verification_score
        
        # Trust score should be calculated based on formula
        assert data["trust_score"] == expected_total, f"Expected {expected_total}, got {data['trust_score']}"
    
    def test_profile_requires_authentication(self, api_client):
        """Test that profile endpoint requires authentication"""
        response = api_client.get(
            f"{BASE_URL}/api/users/{TEST_USER_ID}/profile"
        )
        
        assert response.status_code == 401
        assert "Not authenticated" in response.json().get("detail", "")
    
    def test_profile_not_found_for_invalid_user(self, api_client, auth_headers):
        """Test 404 for non-existent user"""
        response = api_client.get(
            f"{BASE_URL}/api/users/non-existent-user-xyz/profile",
            headers=auth_headers
        )
        
        assert response.status_code == 404
        assert "User not found" in response.json().get("detail", "")
    
    def test_profile_has_trust_metrics(self, api_client, auth_headers):
        """Verify profile includes all trust-related metrics"""
        response = api_client.get(
            f"{BASE_URL}/api/users/{TEST_USER_ID}/profile",
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Check trust-related fields have correct types
        assert isinstance(data["trust_score"], int)
        assert isinstance(data["total_trades"], int)
        assert isinstance(data["successful_trades"], int)
        assert isinstance(data["average_rating"], (int, float))
        assert isinstance(data["valid_disputes_count"], int)
        assert isinstance(data["badges"], list)
        assert isinstance(data["verified"], bool)


class TestPlatformStats:
    """Platform Statistics endpoint tests"""
    
    def test_get_platform_stats_authenticated(self, api_client, auth_headers):
        """Test getting platform stats with valid authentication"""
        response = api_client.get(
            f"{BASE_URL}/api/platform/stats",
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Verify all expected fields exist
        assert "total_users" in data
        assert "total_transactions" in data
        assert "completed_transactions" in data
        assert "success_rate" in data
        assert "completed_today" in data
        assert "total_secured" in data
        assert "total_escrow_value" in data
        assert "active_transactions" in data
        assert "pending_confirmations" in data
        assert "pending_disputes" in data
        assert "verified_users" in data
        assert "fraud_cases_today" in data
        
        # Verify data types
        assert isinstance(data["total_users"], int)
        assert isinstance(data["total_transactions"], int)
        assert isinstance(data["completed_transactions"], int)
        assert isinstance(data["success_rate"], (int, float))
        assert isinstance(data["total_secured"], (int, float))
        assert isinstance(data["total_escrow_value"], (int, float))
    
    def test_platform_stats_values_logical(self, api_client, auth_headers):
        """Test that platform stats values are logically consistent"""
        response = api_client.get(
            f"{BASE_URL}/api/platform/stats",
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Completed transactions should be <= total transactions
        assert data["completed_transactions"] <= data["total_transactions"]
        
        # Active transactions = total - completed
        assert data["active_transactions"] == data["total_transactions"] - data["completed_transactions"]
        
        # Success rate should be between 0 and 100
        assert 0 <= data["success_rate"] <= 100
        
        # Counts should be non-negative
        assert data["total_users"] >= 0
        assert data["pending_disputes"] >= 0
        assert data["verified_users"] >= 0
    
    def test_platform_stats_requires_authentication(self, api_client):
        """Test that platform stats endpoint requires authentication"""
        response = api_client.get(f"{BASE_URL}/api/platform/stats")
        
        assert response.status_code == 401
        assert "Not authenticated" in response.json().get("detail", "")


class TestNavigation:
    """Test API endpoints support new navigation routes"""
    
    def test_auth_me_returns_user_id(self, api_client, auth_headers):
        """Verify /api/auth/me returns user_id needed for profile route"""
        response = api_client.get(
            f"{BASE_URL}/api/auth/me",
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "user_id" in data  # User ID needed for /profile/:userId route


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
