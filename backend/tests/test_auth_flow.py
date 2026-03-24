"""
TrustTrade Auth Flow Tests
Tests for authentication endpoints and session management
"""

import pytest
import requests
import os
from datetime import datetime, timezone, timedelta

# Get backend URL from environment
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test session token created via mongosh
TEST_SESSION_TOKEN = "test_session_1774375385316"
TEST_USER_ID = "test-user-1774375385316"
TEST_USER_EMAIL = "test.user.1774375385316@example.com"


class TestHealthEndpoint:
    """Health check endpoint tests"""
    
    def test_health_returns_200(self):
        """Test /api/health returns 200 with version info"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert "version" in data
        print(f"✅ Health check passed - version: {data['version']}")


class TestAuthMeEndpoint:
    """Tests for /api/auth/me endpoint"""
    
    def test_auth_me_without_token_returns_401(self):
        """Test /api/auth/me returns 401 without authentication"""
        response = requests.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 401
        data = response.json()
        assert "detail" in data
        print("✅ /api/auth/me returns 401 for unauthenticated requests")
    
    def test_auth_me_with_invalid_token_returns_401(self):
        """Test /api/auth/me returns 401 with invalid token"""
        response = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": "Bearer invalid_token_12345"}
        )
        assert response.status_code == 401
        print("✅ /api/auth/me returns 401 for invalid token")
    
    def test_auth_me_with_valid_bearer_token(self):
        """Test /api/auth/me accepts Bearer token in Authorization header"""
        response = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {TEST_SESSION_TOKEN}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify user data structure
        assert "user_id" in data
        assert "email" in data
        assert "name" in data
        assert data["user_id"] == TEST_USER_ID
        assert data["email"] == TEST_USER_EMAIL
        print(f"✅ /api/auth/me returns user data with Bearer token: {data['email']}")


class TestAuthSessionEndpoint:
    """Tests for /api/auth/session endpoint"""
    
    def test_session_endpoint_requires_session_id(self):
        """Test /api/auth/session requires session_id in body"""
        response = requests.post(
            f"{BASE_URL}/api/auth/session",
            json={}
        )
        # Should return 422 (validation error) for missing session_id
        assert response.status_code == 422
        print("✅ /api/auth/session returns 422 for missing session_id")
    
    def test_session_endpoint_rejects_invalid_session(self):
        """Test /api/auth/session rejects invalid Emergent session_id"""
        response = requests.post(
            f"{BASE_URL}/api/auth/session",
            json={"session_id": "invalid_session_12345"}
        )
        # Should return 401 or 500 for invalid session
        assert response.status_code in [401, 500]
        print(f"✅ /api/auth/session rejects invalid session_id (status: {response.status_code})")


class TestAuthLogoutEndpoint:
    """Tests for /api/auth/logout endpoint"""
    
    def test_logout_endpoint_exists(self):
        """Test /api/auth/logout endpoint exists"""
        response = requests.post(f"{BASE_URL}/api/auth/logout")
        # Should return 200 even without session (graceful logout)
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        print("✅ /api/auth/logout endpoint works")


class TestProtectedEndpoints:
    """Tests for protected endpoints requiring authentication"""
    
    def test_transactions_requires_auth(self):
        """Test /api/transactions requires authentication"""
        response = requests.get(f"{BASE_URL}/api/transactions")
        assert response.status_code == 401
        print("✅ /api/transactions requires authentication")
    
    def test_wallet_requires_auth(self):
        """Test /api/wallet requires authentication"""
        response = requests.get(f"{BASE_URL}/api/wallet")
        assert response.status_code == 401
        print("✅ /api/wallet requires authentication")
    
    def test_disputes_requires_auth(self):
        """Test /api/disputes requires authentication"""
        response = requests.get(f"{BASE_URL}/api/disputes")
        assert response.status_code == 401
        print("✅ /api/disputes requires authentication")
    
    def test_phone_status_requires_auth(self):
        """Test /api/auth/phone/status requires authentication"""
        response = requests.get(f"{BASE_URL}/api/auth/phone/status")
        assert response.status_code == 401
        print("✅ /api/auth/phone/status requires authentication")


class TestAuthenticatedEndpoints:
    """Tests for endpoints with valid authentication"""
    
    @pytest.fixture
    def auth_headers(self):
        """Fixture providing authentication headers"""
        return {"Authorization": f"Bearer {TEST_SESSION_TOKEN}"}
    
    def test_transactions_with_auth(self, auth_headers):
        """Test /api/transactions works with valid auth"""
        response = requests.get(
            f"{BASE_URL}/api/transactions",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ /api/transactions returns data with auth ({len(data)} transactions)")
    
    def test_wallet_with_auth(self, auth_headers):
        """Test /api/wallet works with valid auth"""
        response = requests.get(
            f"{BASE_URL}/api/wallet",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert "balance" in data
        print(f"✅ /api/wallet returns data with auth (balance: {data['balance']})")
    
    def test_phone_status_with_auth(self, auth_headers):
        """Test /api/auth/phone/status works with valid auth"""
        response = requests.get(
            f"{BASE_URL}/api/auth/phone/status",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert "phone_verified" in data
        print(f"✅ /api/auth/phone/status returns data with auth")


class TestPublicEndpoints:
    """Tests for public endpoints that don't require auth"""
    
    def test_platform_settings(self):
        """Test /api/platform/settings is public"""
        response = requests.get(f"{BASE_URL}/api/platform/settings")
        assert response.status_code == 200
        data = response.json()
        assert "minimum_transaction" in data
        print(f"✅ /api/platform/settings is public (min: R{data['minimum_transaction']})")
    
    def test_public_stats(self):
        """Test /api/public/stats is public"""
        response = requests.get(f"{BASE_URL}/api/public/stats")
        assert response.status_code == 200
        data = response.json()
        assert "total_transactions" in data
        print(f"✅ /api/public/stats is public ({data['total_transactions']} transactions)")
    
    def test_terms(self):
        """Test /api/terms is public"""
        response = requests.get(f"{BASE_URL}/api/terms")
        assert response.status_code == 200
        print("✅ /api/terms is public")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
