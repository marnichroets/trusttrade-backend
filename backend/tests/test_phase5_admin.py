"""
Phase 5 Admin Dashboard and Services Tests
Tests admin API endpoints, email service, and SMS service configuration
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://trust-trade-pay.preview.emergentagent.com').rstrip('/')

# Admin credentials
ADMIN_EMAIL = "marnichr@gmail.com"
ADMIN_PASSWORD = "Admin@123"


class TestAdminAuthentication:
    """Test admin login and authentication"""
    
    @pytest.fixture(scope="class")
    def admin_session(self):
        """Login as admin and return session with token"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        # Login as admin
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        
        if response.status_code == 200:
            data = response.json()
            token = data.get("session_token") or data.get("token")
            if token:
                session.headers.update({"Authorization": f"Bearer {token}"})
                session.cookies.set("session_token", token)
        
        return session
    
    def test_admin_login(self, admin_session):
        """Test admin can login successfully"""
        response = admin_session.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 200
        data = response.json()
        assert data.get("email") == ADMIN_EMAIL
        assert data.get("is_admin") == True
        print(f"✅ Admin login successful: {data.get('name')}")


class TestAdminStats:
    """Test admin statistics endpoints"""
    
    @pytest.fixture(scope="class")
    def admin_session(self):
        """Login as admin and return session with token"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        
        if response.status_code == 200:
            data = response.json()
            token = data.get("session_token") or data.get("token")
            if token:
                session.headers.update({"Authorization": f"Bearer {token}"})
                session.cookies.set("session_token", token)
        
        return session
    
    def test_admin_stats_endpoint(self, admin_session):
        """Test /api/admin/stats returns required fields"""
        response = admin_session.get(f"{BASE_URL}/api/admin/stats")
        assert response.status_code == 200
        
        data = response.json()
        
        # Verify required fields exist
        assert "total_users" in data, "Missing total_users"
        assert "total_transactions" in data, "Missing total_transactions"
        assert "pending_disputes" in data, "Missing pending_disputes"
        assert "pending_verifications" in data, "Missing pending_verifications"
        assert "total_volume" in data, "Missing total_volume"
        
        print(f"✅ Admin stats: Users={data['total_users']}, Transactions={data['total_transactions']}, Disputes={data['pending_disputes']}, Verifications={data['pending_verifications']}")
    
    def test_admin_users_list(self, admin_session):
        """Test /api/admin/users returns user list"""
        response = admin_session.get(f"{BASE_URL}/api/admin/users")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        
        if len(data) > 0:
            user = data[0]
            assert "user_id" in user or "email" in user
            print(f"✅ Admin users list: {len(data)} users found")
        else:
            print("⚠️ No users found in admin users list")
    
    def test_admin_transactions_list(self, admin_session):
        """Test /api/admin/transactions returns transaction list"""
        response = admin_session.get(f"{BASE_URL}/api/admin/transactions")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        
        if len(data) > 0:
            txn = data[0]
            assert "transaction_id" in txn or "share_code" in txn
            print(f"✅ Admin transactions list: {len(data)} transactions found")
        else:
            print("⚠️ No transactions found in admin transactions list")
    
    def test_admin_disputes_list(self, admin_session):
        """Test /api/admin/disputes returns dispute list"""
        response = admin_session.get(f"{BASE_URL}/api/admin/disputes")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ Admin disputes list: {len(data)} disputes found")


class TestEmailServiceConfiguration:
    """Test email service (Postmark) configuration"""
    
    @pytest.fixture(scope="class")
    def admin_session(self):
        """Login as admin and return session with token"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        
        if response.status_code == 200:
            data = response.json()
            token = data.get("session_token") or data.get("token")
            if token:
                session.headers.update({"Authorization": f"Bearer {token}"})
                session.cookies.set("session_token", token)
        
        return session
    
    def test_email_test_endpoint_exists(self, admin_session):
        """Test that email test endpoint exists and is accessible"""
        # Note: We don't actually send an email, just verify the endpoint exists
        response = admin_session.get(f"{BASE_URL}/api/admin/test-email?to=test@example.com")
        
        # Should return 200 (success) or 500 (if email fails but endpoint exists)
        # Should NOT return 404 (endpoint not found)
        assert response.status_code != 404, "Email test endpoint not found"
        
        if response.status_code == 200:
            data = response.json()
            if data.get("success"):
                print("✅ Email service is configured and working")
            else:
                print(f"⚠️ Email service configured but send failed: {data.get('message', data.get('error'))}")
        else:
            print(f"⚠️ Email test returned status {response.status_code}")


class TestSMSServiceConfiguration:
    """Test SMS service configuration"""
    
    def test_sms_service_env_vars(self):
        """Verify SMS service environment variables are set in backend"""
        # Read backend .env file
        env_path = "/app/backend/.env"
        
        try:
            with open(env_path, 'r') as f:
                env_content = f.read()
            
            has_api_key = "SMS_MESSENGER_API_KEY" in env_content
            has_email = "SMS_MESSENGER_EMAIL" in env_content
            
            assert has_api_key, "SMS_MESSENGER_API_KEY not found in backend .env"
            assert has_email, "SMS_MESSENGER_EMAIL not found in backend .env"
            
            print("✅ SMS service environment variables are configured")
        except FileNotFoundError:
            pytest.skip("Backend .env file not accessible")


class TestAdminNavigation:
    """Test admin navigation endpoints"""
    
    @pytest.fixture(scope="class")
    def admin_session(self):
        """Login as admin and return session with token"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        
        if response.status_code == 200:
            data = response.json()
            token = data.get("session_token") or data.get("token")
            if token:
                session.headers.update({"Authorization": f"Bearer {token}"})
                session.cookies.set("session_token", token)
        
        return session
    
    def test_escrow_details_endpoint(self, admin_session):
        """Test /api/admin/escrow-details endpoint"""
        response = admin_session.get(f"{BASE_URL}/api/admin/escrow-details")
        assert response.status_code == 200
        
        data = response.json()
        assert "total_in_escrow" in data or "transactions_count" in data
        print(f"✅ Escrow details endpoint working")
    
    def test_flagged_users_endpoint(self, admin_session):
        """Test /api/admin/flagged-users endpoint"""
        response = admin_session.get(f"{BASE_URL}/api/admin/flagged-users")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ Flagged users endpoint working: {len(data)} flagged users")
    
    def test_pending_auto_releases_endpoint(self, admin_session):
        """Test /api/admin/pending-auto-releases endpoint"""
        response = admin_session.get(f"{BASE_URL}/api/admin/pending-auto-releases")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ Pending auto-releases endpoint working: {len(data)} pending")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
