"""
TrustTrade Backend Refactoring Tests
Tests to verify that the refactored modular backend works correctly.
The monolithic server.py has been refactored into:
- core/ (config, database, security)
- models/ (user, transaction, dispute, common)
- routes/ (auth, transactions, tradesafe, share, disputes, users, admin, monitoring, webhooks)
- main.py as the entry point with server.py as a thin wrapper
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


class TestHealthAndRoot:
    """Test health check and root API endpoints"""
    
    def test_health_endpoint_returns_200(self):
        """Health check endpoint should return 200 with version 2.0.0"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert data["status"] == "healthy"
        assert data["service"] == "TrustTrade API"
        assert data["version"] == "2.0.0", f"Expected version 2.0.0, got {data.get('version')}"
        print(f"✅ Health endpoint: {data}")
    
    def test_root_api_endpoint_returns_200(self):
        """Root API endpoint should return 200 with version 2.0.0"""
        response = requests.get(f"{BASE_URL}/api")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert data["message"] == "TrustTrade API"
        assert data["version"] == "2.0.0", f"Expected version 2.0.0, got {data.get('version')}"
        assert data["docs"] == "/docs"
        print(f"✅ Root API endpoint: {data}")


class TestPlatformSettings:
    """Test platform settings endpoint"""
    
    def test_platform_settings_returns_200(self):
        """Platform settings should return correct configuration"""
        response = requests.get(f"{BASE_URL}/api/platform/settings")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert data["minimum_transaction"] == 500.0
        assert data["payout_threshold"] == 500.0
        assert data["platform_fee_percent"] == 2.0
        assert data["currency"] == "ZAR"
        assert data["currency_symbol"] == "R"
        assert "payment_methods" in data
        assert isinstance(data["payment_methods"], list)
        print(f"✅ Platform settings: {data}")


class TestPublicStats:
    """Test public statistics endpoint"""
    
    def test_public_stats_returns_200(self):
        """Public stats should return platform statistics"""
        response = requests.get(f"{BASE_URL}/api/public/stats")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "total_transactions" in data
        assert "completed_transactions" in data
        assert "success_rate" in data
        assert data["platform"] == "TrustTrade South Africa"
        assert isinstance(data["total_transactions"], int)
        print(f"✅ Public stats: {data}")


class TestTermsEndpoint:
    """Test terms and conditions endpoint"""
    
    def test_terms_returns_200(self):
        """Terms endpoint should return terms content"""
        response = requests.get(f"{BASE_URL}/api/terms")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "content" in data
        assert "TrustTrade Terms" in data["content"]
        assert "escrow" in data["content"].lower()
        print(f"✅ Terms endpoint returns content (length: {len(data['content'])} chars)")


class TestAuthEndpoints:
    """Test authentication endpoints require auth"""
    
    def test_auth_me_returns_401_without_auth(self):
        """Auth me endpoint should return 401 for unauthenticated requests"""
        response = requests.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        
        data = response.json()
        assert "detail" in data
        assert "authenticated" in data["detail"].lower() or "not" in data["detail"].lower()
        print(f"✅ Auth me returns 401: {data}")
    
    def test_phone_status_returns_401_without_auth(self):
        """Phone status endpoint should return 401 for unauthenticated requests"""
        response = requests.get(f"{BASE_URL}/api/auth/phone/status")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print(f"✅ Phone status returns 401")


class TestTransactionEndpoints:
    """Test transaction endpoints require auth"""
    
    def test_transactions_list_returns_401_without_auth(self):
        """Transactions list should return 401 for unauthenticated requests"""
        response = requests.get(f"{BASE_URL}/api/transactions")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        
        data = response.json()
        assert "detail" in data
        print(f"✅ Transactions list returns 401: {data}")
    
    def test_create_transaction_returns_401_or_422_without_auth(self):
        """Create transaction should return 401 (no auth) or 422 (validation) for unauthenticated requests"""
        response = requests.post(f"{BASE_URL}/api/transactions", json={
            "item_description": "Test item",
            "item_price": 1000,
            "creator_role": "buyer",
            "seller_email": "test@example.com"
        })
        # 401 = not authenticated, 422 = validation error (auth check happens after validation)
        assert response.status_code in [401, 422], f"Expected 401 or 422, got {response.status_code}"
        print(f"✅ Create transaction returns {response.status_code}")


class TestShareEndpoints:
    """Test share link endpoints"""
    
    def test_share_code_not_found_returns_404(self):
        """Share code endpoint should return 404 for non-existent code"""
        response = requests.get(f"{BASE_URL}/api/share/TT-999999")
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        
        data = response.json()
        assert "detail" in data
        assert "not found" in data["detail"].lower()
        print(f"✅ Share code not found returns 404: {data}")
    
    def test_share_join_returns_401_without_auth(self):
        """Share join endpoint should return 401 for unauthenticated requests"""
        response = requests.post(f"{BASE_URL}/api/share/TT-123456/join")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print(f"✅ Share join returns 401")


class TestUserEndpoints:
    """Test user endpoints require auth"""
    
    def test_user_profile_returns_401_without_auth(self):
        """User profile endpoint should return 401 for unauthenticated requests"""
        # Note: The endpoint is /api/users/{user_id}/profile, not /api/users/me
        response = requests.get(f"{BASE_URL}/api/users/test_user_123/profile")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print(f"✅ User profile returns 401")
    
    def test_wallet_returns_401_without_auth(self):
        """Wallet endpoint should return 401 for unauthenticated requests"""
        response = requests.get(f"{BASE_URL}/api/wallet")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print(f"✅ Wallet returns 401")
    
    def test_verification_status_returns_401_without_auth(self):
        """Verification status endpoint should return 401 for unauthenticated requests"""
        response = requests.get(f"{BASE_URL}/api/verification/status")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print(f"✅ Verification status returns 401")


class TestDisputeEndpoints:
    """Test dispute endpoints require auth"""
    
    def test_disputes_list_returns_401_without_auth(self):
        """Disputes list should return 401 for unauthenticated requests"""
        response = requests.get(f"{BASE_URL}/api/disputes")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print(f"✅ Disputes list returns 401")


class TestAdminEndpoints:
    """Test admin endpoints require auth"""
    
    def test_admin_users_returns_401_or_403_without_auth(self):
        """Admin users endpoint should return 401/403 for unauthenticated requests"""
        response = requests.get(f"{BASE_URL}/api/admin/users")
        assert response.status_code in [401, 403], f"Expected 401 or 403, got {response.status_code}"
        print(f"✅ Admin users returns {response.status_code}")
    
    def test_admin_monitoring_returns_401_or_403_without_auth(self):
        """Admin monitoring endpoint should return 401/403 for unauthenticated requests"""
        response = requests.get(f"{BASE_URL}/api/admin/monitoring/dashboard")
        assert response.status_code in [401, 403], f"Expected 401 or 403, got {response.status_code}"
        print(f"✅ Admin monitoring returns {response.status_code}")


class TestTradeSafeEndpoints:
    """Test TradeSafe integration endpoints"""
    
    def test_tradesafe_fee_breakdown_returns_200(self):
        """TradeSafe fee breakdown endpoint should return fee calculation"""
        response = requests.get(f"{BASE_URL}/api/tradesafe/fee-breakdown?amount=1000&fee_allocation=split")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        # Check for expected fee breakdown fields
        assert "buyer_total" in data or "seller_receives" in data or "fee_allocation" in data
        print(f"✅ TradeSafe fee breakdown returns 200: {data}")
    
    def test_tradesafe_fee_breakdown_validates_minimum(self):
        """TradeSafe fee breakdown should validate minimum amount"""
        response = requests.get(f"{BASE_URL}/api/tradesafe/fee-breakdown?amount=100")
        # Should return 400 for amount below minimum (R500)
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print(f"✅ TradeSafe fee breakdown validates minimum amount")


class TestAPIVersionConsistency:
    """Test that API version is consistent across endpoints"""
    
    def test_version_consistency(self):
        """All version-returning endpoints should return 2.0.0"""
        endpoints = ["/api/health", "/api"]
        
        for endpoint in endpoints:
            response = requests.get(f"{BASE_URL}{endpoint}")
            assert response.status_code == 200
            data = response.json()
            assert data.get("version") == "2.0.0", f"Endpoint {endpoint} returned version {data.get('version')}"
        
        print(f"✅ All endpoints return version 2.0.0")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
