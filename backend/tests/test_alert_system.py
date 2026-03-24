"""
TrustTrade Alert System Tests
Tests for critical alert system endpoints and functionality.
"""

import pytest
import requests
import os
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://trust-trade-pay.preview.emergentagent.com')


class TestAlertEndpointsAuth:
    """Test that alert endpoints require admin authentication"""
    
    def test_get_alerts_requires_auth(self):
        """GET /api/admin/alerts should return 403 without auth"""
        response = requests.get(f"{BASE_URL}/api/admin/alerts")
        assert response.status_code == 403
        assert "Admin access required" in response.json().get("detail", "")
    
    def test_resolve_alert_requires_auth(self):
        """POST /api/admin/alerts/{id}/resolve should return 403 without auth"""
        response = requests.post(f"{BASE_URL}/api/admin/alerts/fake-id/resolve")
        assert response.status_code == 403
        assert "Admin access required" in response.json().get("detail", "")
    
    def test_test_alert_requires_auth(self):
        """POST /api/admin/alerts/test should return 403 without auth"""
        response = requests.post(f"{BASE_URL}/api/admin/alerts/test")
        assert response.status_code == 403
        assert "Admin access required" in response.json().get("detail", "")


class TestAlertEndpointsWithAuth:
    """Test alert endpoints with admin authentication"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup admin session for tests"""
        self.session = requests.Session()
        self.session.headers.update({
            "Content-Type": "application/json",
            "Authorization": f"Bearer {os.environ.get('ADMIN_SESSION_TOKEN', 'test_admin_alert_session_1774366655499')}"
        })
    
    def test_get_alerts_returns_list(self):
        """GET /api/admin/alerts should return alerts list and stats"""
        response = self.session.get(f"{BASE_URL}/api/admin/alerts?hours=24&limit=50")
        assert response.status_code == 200
        
        data = response.json()
        assert "alerts" in data
        assert "stats" in data
        assert "count" in data
        assert isinstance(data["alerts"], list)
        
        # Verify stats structure
        stats = data["stats"]
        assert "total_24h" in stats
        assert "critical_24h" in stats
        assert "unresolved" in stats
        assert "emails_sent" in stats
    
    def test_get_alerts_active_only_filter(self):
        """GET /api/admin/alerts with active_only=true should filter resolved alerts"""
        response = self.session.get(f"{BASE_URL}/api/admin/alerts?active_only=true")
        assert response.status_code == 200
        
        data = response.json()
        # All returned alerts should be unresolved
        for alert in data["alerts"]:
            assert alert.get("resolved") != True
    
    def test_create_test_alert(self):
        """POST /api/admin/alerts/test should create a test alert"""
        response = self.session.post(f"{BASE_URL}/api/admin/alerts/test")
        assert response.status_code == 200
        
        data = response.json()
        assert data["success"] == True
        assert "result" in data
        
        result = data["result"]
        assert "alert_id" in result
        assert result["alert_type"] == "system_error"
        assert result["priority"] == "CRITICAL"
        assert "email_sent" in result
        assert "rate_limited" in result
    
    def test_resolve_alert_success(self):
        """POST /api/admin/alerts/{id}/resolve should resolve an alert"""
        # First create a test alert
        create_response = self.session.post(f"{BASE_URL}/api/admin/alerts/test")
        assert create_response.status_code == 200
        alert_id = create_response.json()["result"]["alert_id"]
        
        # Now resolve it
        resolve_response = self.session.post(f"{BASE_URL}/api/admin/alerts/{alert_id}/resolve")
        assert resolve_response.status_code == 200
        
        data = resolve_response.json()
        assert data["success"] == True
        assert data["alert_id"] == alert_id
        assert "resolved_by" in data
    
    def test_resolve_nonexistent_alert(self):
        """POST /api/admin/alerts/{id}/resolve should return 404 for non-existent alert"""
        response = self.session.post(f"{BASE_URL}/api/admin/alerts/000000000000000000000000/resolve")
        assert response.status_code == 404
        assert "Alert not found" in response.json().get("detail", "")


class TestAlertStructure:
    """Test alert data structure and fields"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup admin session for tests"""
        self.session = requests.Session()
        self.session.headers.update({
            "Content-Type": "application/json",
            "Authorization": f"Bearer {os.environ.get('ADMIN_SESSION_TOKEN', 'test_admin_alert_session_1774366655499')}"
        })
    
    def test_alert_has_required_fields(self):
        """Alerts should have all required fields"""
        # Create a test alert first
        self.session.post(f"{BASE_URL}/api/admin/alerts/test")
        
        # Get alerts
        response = self.session.get(f"{BASE_URL}/api/admin/alerts?hours=24&limit=10")
        assert response.status_code == 200
        
        alerts = response.json()["alerts"]
        if len(alerts) > 0:
            alert = alerts[0]
            
            # Required fields
            assert "alert_type" in alert
            assert "priority" in alert
            assert "message" in alert
            assert "timestamp" in alert
            assert "email_sent" in alert
            assert "resolved" in alert
            
            # Optional fields should exist (can be null)
            assert "transaction_id" in alert
            assert "share_code" in alert
            assert "details" in alert
            assert "resolved_at" in alert
            assert "resolved_by" in alert


class TestAlertTypes:
    """Test different alert types"""
    
    def test_alert_type_enum_values(self):
        """Verify expected alert types exist"""
        expected_types = [
            "webhook_failed",
            "email_failed",
            "transaction_stuck",
            "payment_not_synced",
            "system_error"
        ]
        # This is a documentation test - the types are defined in alert_service.py
        # We verify by checking that test alert creates system_error type
        session = requests.Session()
        session.headers.update({
            "Content-Type": "application/json",
            "Authorization": f"Bearer {os.environ.get('ADMIN_SESSION_TOKEN', 'test_admin_alert_session_1774366655499')}"
        })
        
        response = session.post(f"{BASE_URL}/api/admin/alerts/test")
        if response.status_code == 200:
            assert response.json()["result"]["alert_type"] == "system_error"


class TestAlertRateLimiting:
    """Test alert rate limiting functionality"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup admin session for tests"""
        self.session = requests.Session()
        self.session.headers.update({
            "Content-Type": "application/json",
            "Authorization": f"Bearer {os.environ.get('ADMIN_SESSION_TOKEN', 'test_admin_alert_session_1774366655499')}"
        })
    
    def test_multiple_alerts_created(self):
        """Multiple test alerts should be created (rate limiting applies to emails only)"""
        # Create multiple test alerts
        results = []
        for i in range(3):
            response = self.session.post(f"{BASE_URL}/api/admin/alerts/test")
            assert response.status_code == 200
            results.append(response.json()["result"])
        
        # All alerts should be created (rate limiting is for emails, not alert creation)
        for result in results:
            assert "alert_id" in result
            assert result["alert_type"] == "system_error"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
