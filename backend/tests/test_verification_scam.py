"""
Backend API tests for:
1. Identity Verification endpoints (ID upload, selfie, phone OTP)
2. Scam Detection system (risk assessment, flagged users/transactions)
3. Trust Score breakdown metrics
"""

import pytest
import requests
import os
import io

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://trust-trade-pay.preview.emergentagent.com').rstrip('/')

# Test credentials from seed data
TEST_SESSION = "test_verify_session_1773247640709"
ADMIN_SESSION = "test_admin_session_1773247640709"
TEST_USER_ID = "test-verify-user-1773247640709"
RISKY_USER_ID = "test-risky-user-1773247640709"


class TestVerificationStatus:
    """Test GET /api/verification/status endpoint"""
    
    def test_verification_status_returns_200(self):
        """Verification status endpoint returns 200 for authenticated user"""
        response = requests.get(
            f"{BASE_URL}/api/verification/status",
            headers={"Authorization": f"Bearer {TEST_SESSION}"}
        )
        print(f"GET /api/verification/status - Status: {response.status_code}")
        assert response.status_code == 200
        
        data = response.json()
        print(f"Response: {data}")
        
        # Verify response structure
        assert "id_verified" in data
        assert "selfie_verified" in data
        assert "phone_verified" in data
        assert "fully_verified" in data
        
        # Initial state should be all false
        assert data["id_verified"] == False
        assert data["selfie_verified"] == False
        assert data["phone_verified"] == False
        assert data["fully_verified"] == False
        
        print("✅ GET /api/verification/status - returns correct structure")
    
    def test_verification_status_requires_auth(self):
        """Verification status requires authentication"""
        response = requests.get(f"{BASE_URL}/api/verification/status")
        print(f"GET /api/verification/status (no auth) - Status: {response.status_code}")
        assert response.status_code == 401
        print("✅ GET /api/verification/status - requires auth")


class TestIdUpload:
    """Test POST /api/verification/id endpoint"""
    
    def test_id_upload_success(self):
        """ID upload succeeds with valid image file"""
        # Create a simple test image file
        test_image = io.BytesIO(b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82')
        
        files = {'file': ('test_id.png', test_image, 'image/png')}
        response = requests.post(
            f"{BASE_URL}/api/verification/id",
            headers={"Authorization": f"Bearer {TEST_SESSION}"},
            files=files
        )
        print(f"POST /api/verification/id - Status: {response.status_code}")
        print(f"Response: {response.json() if response.status_code < 500 else response.text}")
        
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert "ID" in data["message"] or "uploaded" in data["message"].lower()
        print("✅ POST /api/verification/id - upload successful")
    
    def test_id_upload_requires_auth(self):
        """ID upload requires authentication"""
        test_image = io.BytesIO(b'test image data')
        files = {'file': ('test_id.png', test_image, 'image/png')}
        
        response = requests.post(
            f"{BASE_URL}/api/verification/id",
            files=files
        )
        print(f"POST /api/verification/id (no auth) - Status: {response.status_code}")
        assert response.status_code == 401
        print("✅ POST /api/verification/id - requires auth")


class TestSelfieUpload:
    """Test POST /api/verification/selfie endpoint"""
    
    def test_selfie_upload_success(self):
        """Selfie upload succeeds with valid image file"""
        # Create a simple test image file
        test_image = io.BytesIO(b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82')
        
        files = {'file': ('selfie.png', test_image, 'image/png')}
        response = requests.post(
            f"{BASE_URL}/api/verification/selfie",
            headers={"Authorization": f"Bearer {TEST_SESSION}"},
            files=files
        )
        print(f"POST /api/verification/selfie - Status: {response.status_code}")
        print(f"Response: {response.json() if response.status_code < 500 else response.text}")
        
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert "selfie" in data["message"].lower() or "uploaded" in data["message"].lower()
        print("✅ POST /api/verification/selfie - upload successful")
    
    def test_selfie_upload_requires_auth(self):
        """Selfie upload requires authentication"""
        test_image = io.BytesIO(b'test image data')
        files = {'file': ('selfie.png', test_image, 'image/png')}
        
        response = requests.post(
            f"{BASE_URL}/api/verification/selfie",
            files=files
        )
        print(f"POST /api/verification/selfie (no auth) - Status: {response.status_code}")
        assert response.status_code == 401
        print("✅ POST /api/verification/selfie - requires auth")


class TestPhoneOtp:
    """Test phone OTP send and verify endpoints"""
    
    def test_send_otp_success(self):
        """OTP send succeeds with valid phone number"""
        response = requests.post(
            f"{BASE_URL}/api/verification/phone/send-otp",
            headers={"Authorization": f"Bearer {TEST_SESSION}"},
            json={"phone_number": "812345678"}
        )
        print(f"POST /api/verification/phone/send-otp - Status: {response.status_code}")
        print(f"Response: {response.json() if response.status_code < 500 else response.text}")
        
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert "OTP" in data["message"] or "sent" in data["message"].lower()
        print("✅ POST /api/verification/phone/send-otp - OTP sent (MOCKED)")
    
    def test_send_otp_invalid_phone(self):
        """OTP send fails with invalid phone number"""
        response = requests.post(
            f"{BASE_URL}/api/verification/phone/send-otp",
            headers={"Authorization": f"Bearer {TEST_SESSION}"},
            json={"phone_number": "123"}  # Too short
        )
        print(f"POST /api/verification/phone/send-otp (invalid) - Status: {response.status_code}")
        assert response.status_code == 400
        print("✅ POST /api/verification/phone/send-otp - rejects invalid phone")
    
    def test_send_otp_requires_auth(self):
        """OTP send requires authentication"""
        response = requests.post(
            f"{BASE_URL}/api/verification/phone/send-otp",
            json={"phone_number": "812345678"}
        )
        print(f"POST /api/verification/phone/send-otp (no auth) - Status: {response.status_code}")
        assert response.status_code == 401
        print("✅ POST /api/verification/phone/send-otp - requires auth")
    
    def test_verify_otp_wrong_code(self):
        """OTP verify fails with wrong code"""
        response = requests.post(
            f"{BASE_URL}/api/verification/phone/verify-otp",
            headers={"Authorization": f"Bearer {TEST_SESSION}"},
            json={"phone_number": "812345678", "otp": "000000"}
        )
        print(f"POST /api/verification/phone/verify-otp (wrong) - Status: {response.status_code}")
        assert response.status_code == 400
        print("✅ POST /api/verification/phone/verify-otp - rejects wrong OTP")
    
    def test_verify_otp_requires_auth(self):
        """OTP verify requires authentication"""
        response = requests.post(
            f"{BASE_URL}/api/verification/phone/verify-otp",
            json={"phone_number": "812345678", "otp": "123456"}
        )
        print(f"POST /api/verification/phone/verify-otp (no auth) - Status: {response.status_code}")
        assert response.status_code == 401
        print("✅ POST /api/verification/phone/verify-otp - requires auth")


class TestScamDetectionFlaggedUsers:
    """Test GET /api/admin/flagged-users endpoint"""
    
    def test_flagged_users_admin_success(self):
        """Admin can access flagged users list"""
        response = requests.get(
            f"{BASE_URL}/api/admin/flagged-users",
            headers={"Authorization": f"Bearer {ADMIN_SESSION}"}
        )
        print(f"GET /api/admin/flagged-users - Status: {response.status_code}")
        
        assert response.status_code == 200
        data = response.json()
        print(f"Flagged users count: {len(data)}")
        
        # Should return a list
        assert isinstance(data, list)
        
        # If there are flagged users, verify structure
        if len(data) > 0:
            user = data[0]
            print(f"Sample flagged user: {user}")
            assert "user_id" in user
            assert "risk_level" in user
            assert "risk_score" in user
            assert "flags" in user
        
        print("✅ GET /api/admin/flagged-users - admin access successful")
    
    def test_flagged_users_non_admin_forbidden(self):
        """Non-admin cannot access flagged users"""
        response = requests.get(
            f"{BASE_URL}/api/admin/flagged-users",
            headers={"Authorization": f"Bearer {TEST_SESSION}"}
        )
        print(f"GET /api/admin/flagged-users (non-admin) - Status: {response.status_code}")
        assert response.status_code == 403
        print("✅ GET /api/admin/flagged-users - non-admin forbidden")
    
    def test_flagged_users_no_auth(self):
        """Unauthenticated request forbidden"""
        response = requests.get(f"{BASE_URL}/api/admin/flagged-users")
        print(f"GET /api/admin/flagged-users (no auth) - Status: {response.status_code}")
        assert response.status_code in [401, 403]
        print("✅ GET /api/admin/flagged-users - no auth forbidden")


class TestScamDetectionFlaggedTransactions:
    """Test GET /api/admin/flagged-transactions endpoint"""
    
    def test_flagged_transactions_admin_success(self):
        """Admin can access flagged transactions list"""
        response = requests.get(
            f"{BASE_URL}/api/admin/flagged-transactions",
            headers={"Authorization": f"Bearer {ADMIN_SESSION}"}
        )
        print(f"GET /api/admin/flagged-transactions - Status: {response.status_code}")
        
        assert response.status_code == 200
        data = response.json()
        print(f"Flagged transactions count: {len(data)}")
        
        # Should return a list
        assert isinstance(data, list)
        
        # If there are flagged transactions, verify structure
        if len(data) > 0:
            txn = data[0]
            print(f"Sample flagged transaction: {txn.get('transaction_id')}, risk_level: {txn.get('risk_level')}")
            assert "transaction_id" in txn
            assert "risk_level" in txn
            assert txn["risk_level"] in ["medium", "high"]
        
        print("✅ GET /api/admin/flagged-transactions - admin access successful")
    
    def test_flagged_transactions_non_admin_forbidden(self):
        """Non-admin cannot access flagged transactions"""
        response = requests.get(
            f"{BASE_URL}/api/admin/flagged-transactions",
            headers={"Authorization": f"Bearer {TEST_SESSION}"}
        )
        print(f"GET /api/admin/flagged-transactions (non-admin) - Status: {response.status_code}")
        assert response.status_code == 403
        print("✅ GET /api/admin/flagged-transactions - non-admin forbidden")


class TestRiskAssessmentInTransaction:
    """Test that risk assessment runs during transaction creation"""
    
    def test_transaction_includes_risk_level(self):
        """Creating a transaction includes risk assessment"""
        # Create a transaction
        response = requests.post(
            f"{BASE_URL}/api/transactions",
            headers={"Authorization": f"Bearer {TEST_SESSION}"},
            json={
                "creator_role": "buyer",
                "seller_name": "Test Seller",
                "seller_email": "testseller@example.com",
                "item_description": "Test Item for Risk Assessment",
                "item_condition": "New",
                "known_issues": "None",
                "item_price": 1000,
                "fee_paid_by": "split",
                "buyer_details_confirmed": True,
                "seller_details_confirmed": False,
                "item_accuracy_confirmed": True
            }
        )
        print(f"POST /api/transactions - Status: {response.status_code}")
        
        assert response.status_code == 201
        data = response.json()
        
        # Verify risk fields are present
        assert "risk_level" in data
        assert "risk_flags" in data
        assert data["risk_level"] in ["low", "medium", "high"]
        assert isinstance(data["risk_flags"], list)
        
        print(f"Transaction risk_level: {data['risk_level']}, risk_flags: {data['risk_flags']}")
        print("✅ Transaction includes risk assessment")
        
        return data["transaction_id"]


class TestUserRiskAssessment:
    """Test GET /api/risk/user/{user_id} endpoint"""
    
    def test_user_risk_self_access(self):
        """User can see their own risk assessment"""
        response = requests.get(
            f"{BASE_URL}/api/risk/user/{TEST_USER_ID}",
            headers={"Authorization": f"Bearer {TEST_SESSION}"}
        )
        print(f"GET /api/risk/user/{TEST_USER_ID} - Status: {response.status_code}")
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify response structure
        assert "risk_level" in data
        assert "risk_score" in data
        assert "flags" in data
        assert "warnings" in data
        
        print(f"User risk assessment: level={data['risk_level']}, score={data['risk_score']}")
        print("✅ User can view own risk assessment")
    
    def test_admin_can_view_any_user_risk(self):
        """Admin can view any user's risk assessment"""
        response = requests.get(
            f"{BASE_URL}/api/risk/user/{RISKY_USER_ID}",
            headers={"Authorization": f"Bearer {ADMIN_SESSION}"}
        )
        print(f"GET /api/risk/user/{RISKY_USER_ID} (admin) - Status: {response.status_code}")
        
        assert response.status_code == 200
        data = response.json()
        
        print(f"Risky user assessment: level={data['risk_level']}, score={data['risk_score']}")
        print(f"Flags: {data['flags']}, Warnings: {data['warnings']}")
        
        # User with 3 valid disputes should have high risk
        assert data["risk_score"] > 0 or data["risk_level"] in ["medium", "high"]
        print("✅ Admin can view other user's risk assessment")
    
    def test_non_admin_cannot_view_other_user_risk(self):
        """Non-admin cannot view other user's risk assessment"""
        response = requests.get(
            f"{BASE_URL}/api/risk/user/{RISKY_USER_ID}",
            headers={"Authorization": f"Bearer {TEST_SESSION}"}
        )
        print(f"GET /api/risk/user/{RISKY_USER_ID} (non-admin) - Status: {response.status_code}")
        assert response.status_code == 403
        print("✅ Non-admin cannot view other user's risk assessment")


class TestUserProfile:
    """Test user profile endpoint includes trust score data"""
    
    def test_user_profile_includes_trust_metrics(self):
        """User profile includes trust score breakdown metrics"""
        response = requests.get(
            f"{BASE_URL}/api/users/{TEST_USER_ID}/profile",
            headers={"Authorization": f"Bearer {TEST_SESSION}"}
        )
        print(f"GET /api/users/{TEST_USER_ID}/profile - Status: {response.status_code}")
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify trust metrics are included
        assert "trust_score" in data
        assert "total_trades" in data
        assert "successful_trades" in data
        assert "average_rating" in data
        assert "valid_disputes_count" in data
        assert "verified" in data
        
        print(f"Trust Score: {data['trust_score']}")
        print(f"Total Trades: {data['total_trades']}")
        print(f"Successful Trades: {data['successful_trades']}")
        print(f"Average Rating: {data['average_rating']}")
        print(f"Valid Disputes: {data['valid_disputes_count']}")
        print(f"Verified: {data['verified']}")
        print("✅ User profile includes all trust score breakdown metrics")


# Run tests
if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
