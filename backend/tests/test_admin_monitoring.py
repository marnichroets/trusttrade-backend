"""
Admin Monitoring Dashboard API Tests
Tests for the real-time admin monitoring dashboard endpoints:
- Dashboard metrics
- Webhook events
- Email logs
- Admin actions
- Retry webhook
- Resend email
- Update transaction status
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Admin session token created for testing
ADMIN_SESSION_TOKEN = "test_admin_monitoring_1774365768355"


class TestMonitoringAuthProtection:
    """Test that all monitoring endpoints require admin authentication"""
    
    def test_dashboard_requires_auth(self):
        """Dashboard endpoint should return 403 without auth"""
        response = requests.get(f"{BASE_URL}/api/admin/monitoring/dashboard")
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"
        data = response.json()
        assert "detail" in data
        print("✅ Dashboard endpoint requires auth (403)")
    
    def test_webhook_events_requires_auth(self):
        """Webhook events endpoint should return 403 without auth"""
        response = requests.get(f"{BASE_URL}/api/admin/monitoring/webhook-events")
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"
        print("✅ Webhook events endpoint requires auth (403)")
    
    def test_email_logs_requires_auth(self):
        """Email logs endpoint should return 403 without auth"""
        response = requests.get(f"{BASE_URL}/api/admin/monitoring/email-logs")
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"
        print("✅ Email logs endpoint requires auth (403)")
    
    def test_admin_actions_requires_auth(self):
        """Admin actions endpoint should return 403 without auth"""
        response = requests.get(f"{BASE_URL}/api/admin/monitoring/actions")
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"
        print("✅ Admin actions endpoint requires auth (403)")
    
    def test_retry_webhook_requires_auth(self):
        """Retry webhook endpoint should return 403 without auth"""
        response = requests.post(f"{BASE_URL}/api/admin/monitoring/retry-webhook/test-event-id")
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"
        print("✅ Retry webhook endpoint requires auth (403)")
    
    def test_resend_email_requires_auth(self):
        """Resend email endpoint should return 403 without auth"""
        response = requests.post(f"{BASE_URL}/api/admin/monitoring/resend-email/test-txn/payment_secured_buyer")
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"
        print("✅ Resend email endpoint requires auth (403)")
    
    def test_update_status_requires_auth(self):
        """Update transaction status endpoint should return 403 without auth"""
        response = requests.post(
            f"{BASE_URL}/api/admin/monitoring/update-transaction-status/test-txn",
            json={"new_state": "COMPLETED"}
        )
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"
        print("✅ Update status endpoint requires auth (403)")


class TestMonitoringDashboard:
    """Test dashboard endpoint with admin authentication"""
    
    @pytest.fixture
    def admin_headers(self):
        return {
            "Authorization": f"Bearer {ADMIN_SESSION_TOKEN}",
            "Content-Type": "application/json"
        }
    
    def test_dashboard_returns_metrics(self, admin_headers):
        """Dashboard should return comprehensive metrics"""
        response = requests.get(
            f"{BASE_URL}/api/admin/monitoring/dashboard",
            headers=admin_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Check health status
        assert "health_status" in data
        assert data["health_status"] in ["healthy", "warning", "critical"]
        
        # Check metrics structure
        assert "metrics" in data
        metrics = data["metrics"]
        
        # Transaction metrics
        assert "transactions" in metrics
        assert "total_active" in metrics["transactions"]
        assert "awaiting_payment" in metrics["transactions"]
        assert "payments_secured_24h" in metrics["transactions"]
        
        # Webhook metrics
        assert "webhooks" in metrics
        assert "total_24h" in metrics["webhooks"]
        assert "processed" in metrics["webhooks"]
        assert "failed" in metrics["webhooks"]
        assert "duplicates" in metrics["webhooks"]
        assert "success_rate" in metrics["webhooks"]
        
        # Email metrics
        assert "emails" in metrics
        assert "sent_24h" in metrics["emails"]
        assert "failed_24h" in metrics["emails"]
        assert "success_rate" in metrics["emails"]
        
        # Disputes metrics
        assert "disputes" in metrics
        assert "active" in metrics["disputes"]
        
        # Other fields
        assert "stuck_transactions" in data
        assert "payment_stuck" in data
        assert "alerts" in data
        assert "timestamp" in data
        
        print(f"✅ Dashboard returns metrics - health: {data['health_status']}")
        print(f"   Active transactions: {metrics['transactions']['total_active']}")
        print(f"   Webhook success rate: {metrics['webhooks']['success_rate']}%")
        print(f"   Email success rate: {metrics['emails']['success_rate']}%")


class TestWebhookEvents:
    """Test webhook events endpoint"""
    
    @pytest.fixture
    def admin_headers(self):
        return {
            "Authorization": f"Bearer {ADMIN_SESSION_TOKEN}",
            "Content-Type": "application/json"
        }
    
    def test_webhook_events_returns_list(self, admin_headers):
        """Webhook events should return a list of events"""
        response = requests.get(
            f"{BASE_URL}/api/admin/monitoring/webhook-events?limit=100",
            headers=admin_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "events" in data
        assert "count" in data
        assert isinstance(data["events"], list)
        
        print(f"✅ Webhook events endpoint returns {data['count']} events")
    
    def test_webhook_events_with_status_filter(self, admin_headers):
        """Webhook events should support status filter"""
        response = requests.get(
            f"{BASE_URL}/api/admin/monitoring/webhook-events?status=processed",
            headers=admin_headers
        )
        assert response.status_code == 200
        
        data = response.json()
        # All returned events should have status=processed (if any)
        for event in data["events"]:
            assert event.get("status") == "processed"
        
        print(f"✅ Webhook events filter by status works - {data['count']} processed events")


class TestEmailLogs:
    """Test email logs endpoint"""
    
    @pytest.fixture
    def admin_headers(self):
        return {
            "Authorization": f"Bearer {ADMIN_SESSION_TOKEN}",
            "Content-Type": "application/json"
        }
    
    def test_email_logs_returns_list(self, admin_headers):
        """Email logs should return a list of logs"""
        response = requests.get(
            f"{BASE_URL}/api/admin/monitoring/email-logs?limit=100",
            headers=admin_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "logs" in data
        assert "count" in data
        assert isinstance(data["logs"], list)
        
        print(f"✅ Email logs endpoint returns {data['count']} logs")
    
    def test_email_logs_with_success_filter(self, admin_headers):
        """Email logs should support success filter"""
        response = requests.get(
            f"{BASE_URL}/api/admin/monitoring/email-logs?success=true",
            headers=admin_headers
        )
        assert response.status_code == 200
        
        data = response.json()
        # All returned logs should have success=true (if any)
        for log in data["logs"]:
            assert log.get("success") == True
        
        print(f"✅ Email logs filter by success works - {data['count']} successful emails")


class TestAdminActions:
    """Test admin actions endpoint"""
    
    @pytest.fixture
    def admin_headers(self):
        return {
            "Authorization": f"Bearer {ADMIN_SESSION_TOKEN}",
            "Content-Type": "application/json"
        }
    
    def test_admin_actions_returns_list(self, admin_headers):
        """Admin actions should return a list of actions"""
        response = requests.get(
            f"{BASE_URL}/api/admin/monitoring/actions?limit=50",
            headers=admin_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "actions" in data
        assert "count" in data
        assert isinstance(data["actions"], list)
        
        print(f"✅ Admin actions endpoint returns {data['count']} actions")


class TestRetryWebhook:
    """Test retry webhook endpoint"""
    
    @pytest.fixture
    def admin_headers(self):
        return {
            "Authorization": f"Bearer {ADMIN_SESSION_TOKEN}",
            "Content-Type": "application/json"
        }
    
    def test_retry_webhook_nonexistent_event(self, admin_headers):
        """Retry webhook should return 404 for non-existent event"""
        response = requests.post(
            f"{BASE_URL}/api/admin/monitoring/retry-webhook/nonexistent-event-id",
            headers=admin_headers
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✅ Retry webhook returns 404 for non-existent event")


class TestResendEmail:
    """Test resend email endpoint"""
    
    @pytest.fixture
    def admin_headers(self):
        return {
            "Authorization": f"Bearer {ADMIN_SESSION_TOKEN}",
            "Content-Type": "application/json"
        }
    
    def test_resend_email_nonexistent_transaction(self, admin_headers):
        """Resend email should return 404 for non-existent transaction"""
        response = requests.post(
            f"{BASE_URL}/api/admin/monitoring/resend-email/nonexistent-txn/payment_secured_buyer",
            headers=admin_headers
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✅ Resend email returns 404 for non-existent transaction")


class TestUpdateTransactionStatus:
    """Test update transaction status endpoint"""
    
    @pytest.fixture
    def admin_headers(self):
        return {
            "Authorization": f"Bearer {ADMIN_SESSION_TOKEN}",
            "Content-Type": "application/json"
        }
    
    def test_update_status_nonexistent_transaction(self, admin_headers):
        """Update status should return 404 for non-existent transaction"""
        response = requests.post(
            f"{BASE_URL}/api/admin/monitoring/update-transaction-status/nonexistent-txn",
            headers=admin_headers,
            json={"new_state": "COMPLETED", "reason": "Test"}
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✅ Update status returns 404 for non-existent transaction")
    
    def test_update_status_invalid_state(self, admin_headers):
        """Update status should return 400 for invalid state"""
        # First get a real transaction ID
        response = requests.get(
            f"{BASE_URL}/api/admin/transactions",
            headers=admin_headers
        )
        if response.status_code == 200:
            transactions = response.json()
            if transactions and len(transactions) > 0:
                txn_id = transactions[0].get("transaction_id")
                
                # Try to update with invalid state
                response = requests.post(
                    f"{BASE_URL}/api/admin/monitoring/update-transaction-status/{txn_id}",
                    headers=admin_headers,
                    json={"new_state": "INVALID_STATE", "reason": "Test"}
                )
                assert response.status_code == 400, f"Expected 400, got {response.status_code}"
                print("✅ Update status returns 400 for invalid state")
                return
        
        # If no transactions, skip this test
        pytest.skip("No transactions available to test invalid state")
    
    def test_update_status_missing_state(self, admin_headers):
        """Update status should return 400 when new_state is missing"""
        response = requests.post(
            f"{BASE_URL}/api/admin/monitoring/update-transaction-status/test-txn",
            headers=admin_headers,
            json={"reason": "Test without state"}
        )
        # Should be 400 for missing state or 404 for non-existent transaction
        assert response.status_code in [400, 404], f"Expected 400 or 404, got {response.status_code}"
        print("✅ Update status validates required fields")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
