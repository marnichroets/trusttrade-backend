#!/usr/bin/env python3

import requests
import sys
import json
from datetime import datetime, timedelta
import time

class TrustTradeAPITester:
    def __init__(self):
        self.base_url = "https://trust-trade-pay.preview.emergentagent.com/api"
        # Use provided test sessions for regression testing
        self.session_token = "test_session_1771949530337"
        self.admin_session_token = "admin_session_1771949548223"
        self.user_id = "test-user-1771949530337"
        self.test_user_email = "testuser@example.com"
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []

    def log_test_result(self, name, success, message="", expected=None, actual=None):
        """Log test result for detailed reporting"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {name}: {message}")
        else:
            print(f"❌ {name}: {message}")
            if expected is not None:
                print(f"   Expected: {expected}")
            if actual is not None:
                print(f"   Actual: {actual}")
        
        self.test_results.append({
            "name": name,
            "success": success,
            "message": message,
            "expected": expected,
            "actual": actual
        })

    def create_test_session_via_mongo(self):
        """Create test user and session using MongoDB directly"""
        import subprocess
        import os
        
        timestamp = int(datetime.now().timestamp())
        user_id = f"test-user-{timestamp}"
        session_token = f"test_session_{timestamp}"
        test_email = f"test.user.{timestamp}@example.com"
        admin_email = "marnichr@gmail.com"
        
        # Create regular test user
        mongo_script = f'''
use('test_database');
var userId = '{user_id}';
var sessionToken = '{session_token}';
var testEmail = '{test_email}';
db.users.insertOne({{
  user_id: userId,
  email: testEmail,
  name: 'Test User {timestamp}',
  picture: 'https://via.placeholder.com/150',
  role: 'buyer',
  is_admin: false,
  created_at: new Date().toISOString()
}});
db.user_sessions.insertOne({{
  user_id: userId,
  session_token: sessionToken,
  expires_at: new Date(Date.now() + 7*24*60*60*1000).toISOString(),
  created_at: new Date().toISOString()
}});
print('Session token: ' + sessionToken);
print('User ID: ' + userId);
        '''
        
        try:
            result = subprocess.run(['mongosh', '--eval', mongo_script], 
                                  capture_output=True, text=True, timeout=30)
            
            if result.returncode == 0:
                self.session_token = session_token
                self.user_id = user_id
                self.test_user_email = test_email
                self.log_test_result("Create Test User Session", True, f"Created user {user_id}")
                return True
            else:
                self.log_test_result("Create Test User Session", False, f"MongoDB error: {result.stderr}")
                return False
                
        except Exception as e:
            self.log_test_result("Create Test User Session", False, f"Exception: {str(e)}")
            return False

    def create_admin_session_via_mongo(self):
        """Create admin user session for admin testing"""
        import subprocess
        
        timestamp = int(datetime.now().timestamp())
        admin_user_id = f"admin-user-{timestamp}"
        admin_session_token = f"admin_session_{timestamp}"
        admin_email = "marnichr@gmail.com"
        
        mongo_script = f'''
use('test_database');
var adminUserId = '{admin_user_id}';
var adminSessionToken = '{admin_session_token}';
var adminEmail = '{admin_email}';
db.users.insertOne({{
  user_id: adminUserId,
  email: adminEmail,
  name: 'Admin User',
  picture: 'https://via.placeholder.com/150',
  role: 'admin',
  is_admin: true,
  created_at: new Date().toISOString()
}});
db.user_sessions.insertOne({{
  user_id: adminUserId,
  session_token: adminSessionToken,
  expires_at: new Date(Date.now() + 7*24*60*60*1000).toISOString(),
  created_at: new Date().toISOString()
}});
print('Admin Session token: ' + adminSessionToken);
print('Admin User ID: ' + adminUserId);
        '''
        
        try:
            result = subprocess.run(['mongosh', '--eval', mongo_script], 
                                  capture_output=True, text=True, timeout=30)
            
            if result.returncode == 0:
                return admin_session_token, admin_user_id
            else:
                print(f"Failed to create admin session: {result.stderr}")
                return None, None
                
        except Exception as e:
            print(f"Exception creating admin session: {str(e)}")
            return None, None

    def test_request(self, method, endpoint, expected_status, data=None, token=None, test_name=None):
        """Make API request and validate response"""
        url = f"{self.base_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        
        # Use provided token or default session token
        auth_token = token or self.session_token
        if auth_token:
            headers['Authorization'] = f'Bearer {auth_token}'

        test_name = test_name or f"{method} {endpoint}"
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=30)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=30)
            elif method == 'PATCH':
                response = requests.patch(url, json=data, headers=headers, timeout=30)
            else:
                self.log_test_result(test_name, False, f"Unsupported method: {method}")
                return None

            success = response.status_code == expected_status
            if success:
                try:
                    response_data = response.json()
                    self.log_test_result(test_name, True, f"Status: {response.status_code}")
                    return response_data
                except:
                    # Some endpoints may not return JSON
                    self.log_test_result(test_name, True, f"Status: {response.status_code} (no JSON)")
                    return {}
            else:
                try:
                    error_msg = response.json().get('detail', 'Unknown error')
                except:
                    error_msg = response.text
                self.log_test_result(test_name, False, 
                                   f"Status mismatch", 
                                   expected_status, 
                                   f"{response.status_code}: {error_msg}")
                return None

        except Exception as e:
            self.log_test_result(test_name, False, f"Request failed: {str(e)}")
            return None

    def test_auth_endpoints(self):
        """Test authentication endpoints"""
        print("\n🔐 Testing Authentication Endpoints...")
        
        # Test /auth/me with valid token
        user_data = self.test_request('GET', 'auth/me', 200, test_name="Get Current User")
        
        if user_data:
            # Validate user data structure
            required_fields = ['user_id', 'email', 'name', 'role', 'is_admin']
            missing_fields = [field for field in required_fields if field not in user_data]
            
            if not missing_fields:
                self.log_test_result("User Data Structure", True, "All required fields present")
            else:
                self.log_test_result("User Data Structure", False, f"Missing fields: {missing_fields}")

        # Test /auth/me without token
        self.test_request('GET', 'auth/me', 401, token="", test_name="Get User Without Token")

        # Test logout
        self.test_request('POST', 'auth/logout', 200, test_name="Logout")

    def test_transaction_endpoints(self):
        """Test transaction-related endpoints"""
        print("\n💰 Testing Transaction Endpoints...")
        
        # Test creating transaction
        transaction_data = {
            "seller_name": "Test Seller",
            "seller_email": "seller@example.com",
            "item_description": "Test Item for API Testing",
            "item_price": 100.00
        }
        
        created_transaction = self.test_request('POST', 'transactions', 201, 
                                              data=transaction_data, 
                                              test_name="Create Transaction")
        
        transaction_id = None
        if created_transaction:
            transaction_id = created_transaction.get('transaction_id')
            
            # Validate transaction data
            expected_fee = round(100.00 * 0.02, 2)  # 2% fee
            expected_total = round(100.00 + expected_fee, 2)
            
            if created_transaction.get('trusttrade_fee') == expected_fee:
                self.log_test_result("Fee Calculation", True, f"Correct 2% fee: R{expected_fee}")
            else:
                self.log_test_result("Fee Calculation", False, 
                                   f"Fee calculation incorrect", 
                                   f"R{expected_fee}", 
                                   f"R{created_transaction.get('trusttrade_fee')}")
            
            if created_transaction.get('total') == expected_total:
                self.log_test_result("Total Calculation", True, f"Correct total: R{expected_total}")
            else:
                self.log_test_result("Total Calculation", False, 
                                   f"Total calculation incorrect",
                                   f"R{expected_total}",
                                   f"R{created_transaction.get('total')}")

        # Test listing transactions
        transactions_list = self.test_request('GET', 'transactions', 200, test_name="List Transactions")
        
        if transactions_list and isinstance(transactions_list, list):
            self.log_test_result("Transactions List Format", True, f"Returned {len(transactions_list)} transactions")
        else:
            self.log_test_result("Transactions List Format", False, "Invalid response format")

        # Test getting specific transaction
        if transaction_id:
            transaction_detail = self.test_request('GET', f'transactions/{transaction_id}', 200, 
                                                 test_name="Get Transaction Detail")
            
            if transaction_detail and transaction_detail.get('transaction_id') == transaction_id:
                self.log_test_result("Transaction Detail", True, "Transaction details retrieved correctly")
            else:
                self.log_test_result("Transaction Detail", False, "Transaction detail mismatch")

            # Test confirm delivery (buyer action)
            delivery_confirmation = self.test_request('PATCH', f'transactions/{transaction_id}/delivery', 
                                                    200, 
                                                    data={"delivery_confirmed": True},
                                                    test_name="Confirm Delivery")
            
            if delivery_confirmation:
                if delivery_confirmation.get('delivery_confirmed') and delivery_confirmation.get('release_status') == 'Released':
                    self.log_test_result("Delivery Confirmation", True, "Funds released successfully")
                else:
                    self.log_test_result("Delivery Confirmation", False, "Delivery confirmation failed")

        return transaction_id

    def test_dispute_endpoints(self, transaction_id):
        """Test dispute-related endpoints"""
        print("\n⚖️  Testing Dispute Endpoints...")
        
        if not transaction_id:
            self.log_test_result("Dispute Tests", False, "No transaction ID available for dispute testing")
            return None

        # Create dispute
        dispute_data = {
            "transaction_id": transaction_id,
            "description": "Test dispute for API testing - item not as described"
        }
        
        created_dispute = self.test_request('POST', 'disputes', 201, 
                                          data=dispute_data, 
                                          test_name="Create Dispute")
        
        dispute_id = None
        if created_dispute:
            dispute_id = created_dispute.get('dispute_id')
            
            # Validate dispute data
            if created_dispute.get('status') == 'Pending':
                self.log_test_result("Dispute Status", True, "Dispute created with Pending status")
            else:
                self.log_test_result("Dispute Status", False, 
                                   "Incorrect initial dispute status",
                                   "Pending",
                                   created_dispute.get('status'))

        # Test listing disputes
        disputes_list = self.test_request('GET', 'disputes', 200, test_name="List Disputes")
        
        if disputes_list and isinstance(disputes_list, list):
            self.log_test_result("Disputes List", True, f"Retrieved {len(disputes_list)} disputes")
        else:
            self.log_test_result("Disputes List", False, "Invalid disputes list response")

        return dispute_id

    def test_admin_endpoints(self):
        """Test admin-only endpoints"""
        print("\n👑 Testing Admin Endpoints...")
        
        # Create admin session
        admin_token, admin_user_id = self.create_admin_session_via_mongo()
        
        if not admin_token:
            self.log_test_result("Admin Session Creation", False, "Could not create admin session")
            return

        # Test admin stats
        admin_stats = self.test_request('GET', 'admin/stats', 200, 
                                      token=admin_token,
                                      test_name="Admin Stats")
        
        if admin_stats:
            required_stats = ['total_users', 'total_transactions', 'pending_transactions', 'pending_disputes']
            missing_stats = [stat for stat in required_stats if stat not in admin_stats]
            
            if not missing_stats:
                self.log_test_result("Admin Stats Structure", True, "All required stats present")
            else:
                self.log_test_result("Admin Stats Structure", False, f"Missing stats: {missing_stats}")

        # Test admin users list
        admin_users = self.test_request('GET', 'admin/users', 200, 
                                       token=admin_token,
                                       test_name="Admin Users List")
        
        if admin_users and isinstance(admin_users, list):
            self.log_test_result("Admin Users List", True, f"Retrieved {len(admin_users)} users")
        else:
            self.log_test_result("Admin Users List", False, "Invalid users list response")

        # Test admin transactions list
        admin_transactions = self.test_request('GET', 'admin/transactions', 200, 
                                             token=admin_token,
                                             test_name="Admin Transactions List")
        
        if admin_transactions and isinstance(admin_transactions, list):
            self.log_test_result("Admin Transactions List", True, f"Retrieved {len(admin_transactions)} transactions")
        else:
            self.log_test_result("Admin Transactions List", False, "Invalid admin transactions response")

        # Test admin disputes list
        admin_disputes = self.test_request('GET', 'admin/disputes', 200, 
                                         token=admin_token,
                                         test_name="Admin Disputes List")
        
        if admin_disputes and isinstance(admin_disputes, list):
            self.log_test_result("Admin Disputes List", True, f"Retrieved {len(admin_disputes)} disputes")
        else:
            self.log_test_result("Admin Disputes List", False, "Invalid admin disputes response")

        # Test non-admin access to admin endpoints (should fail)
        self.test_request('GET', 'admin/stats', 403, 
                         token=self.session_token,  # regular user token
                         test_name="Non-Admin Access Block")

    def test_privacy_rules(self):
        """Test privacy and access control"""
        print("\n🔒 Testing Privacy Rules...")
        
        # Create second user to test privacy
        timestamp = int(datetime.now().timestamp()) + 1
        user2_id = f"test-user2-{timestamp}"
        session2_token = f"test_session2_{timestamp}"
        test2_email = f"test.user2.{timestamp}@example.com"
        
        import subprocess
        
        mongo_script = f'''
use('test_database');
var user2Id = '{user2_id}';
var session2Token = '{session2_token}';
var test2Email = '{test2_email}';
db.users.insertOne({{
  user_id: user2Id,
  email: test2Email,
  name: 'Test User 2',
  picture: 'https://via.placeholder.com/150',
  role: 'buyer',
  is_admin: false,
  created_at: new Date().toISOString()
}});
db.user_sessions.insertOne({{
  user_id: user2Id,
  session_token: session2Token,
  expires_at: new Date(Date.now() + 7*24*60*60*1000).toISOString(),
  created_at: new Date().toISOString()
}});
        '''
        
        try:
            result = subprocess.run(['mongosh', '--eval', mongo_script], 
                                  capture_output=True, text=True, timeout=30)
            
            if result.returncode == 0:
                # Test that user2 can only see their own transactions
                user2_transactions = self.test_request('GET', 'transactions', 200, 
                                                     token=session2_token,
                                                     test_name="User2 Transactions Privacy")
                
                if user2_transactions and isinstance(user2_transactions, list):
                    # User2 should have no transactions initially
                    if len(user2_transactions) == 0:
                        self.log_test_result("Transaction Privacy", True, "User2 sees no transactions (correct)")
                    else:
                        self.log_test_result("Transaction Privacy", False, 
                                           f"User2 should see 0 transactions",
                                           0,
                                           len(user2_transactions))

        except Exception as e:
            self.log_test_result("Privacy Test Setup", False, f"Failed to create user2: {str(e)}")

    def cleanup_test_data(self):
        """Clean up test data from MongoDB"""
        import subprocess
        
        cleanup_script = '''
use('test_database');
db.users.deleteMany({email: /test\.user/});
db.user_sessions.deleteMany({session_token: /test_session/});
db.transactions.deleteMany({buyer_email: /test\.user/});
db.disputes.deleteMany({raised_by_user_id: /test-user/});
print('Cleanup completed');
        '''
        
        try:
            subprocess.run(['mongosh', '--eval', cleanup_script], 
                         capture_output=True, text=True, timeout=30)
            print("\n🧹 Test data cleaned up")
        except Exception as e:
            print(f"\n⚠️  Failed to cleanup test data: {str(e)}")

    def test_regression_fixes(self):
        """Test specific fixes from previous iteration"""
        print("\n🔧 Testing Regression Fixes...")
        
        # Fix 1: Auth endpoint should return 401 for invalid tokens
        invalid_response = self.test_request('GET', 'auth/me', 401, token="invalid_token_123", 
                                          test_name="Fix 1: Invalid Token Returns 401")
        
        # Fix 2: Transaction creation returns 201 status code  
        transaction_data = {
            "seller_name": "Regression Test Seller",
            "seller_email": "regression@example.com", 
            "item_description": "Regression test item",
            "item_price": 25.00
        }
        created_transaction = self.test_request('POST', 'transactions', 201, 
                                              data=transaction_data,
                                              test_name="Fix 2: Transaction Creation Returns 201")
        
        # Fix 3: Admin disputes endpoint returns proper array format
        admin_disputes = self.test_request('GET', 'admin/disputes', 200,
                                         token=self.admin_session_token, 
                                         test_name="Fix 3: Admin Disputes Returns Array")
        
        if admin_disputes and isinstance(admin_disputes, list):
            self.log_test_result("Fix 3: Admin Disputes Array Format", True, 
                               f"Returns proper array with {len(admin_disputes)} disputes")
        else:
            self.log_test_result("Fix 3: Admin Disputes Array Format", False, 
                               "Does not return proper array format")

    def run_all_tests(self):
        """Run comprehensive test suite"""
        print("🚀 Starting TrustTrade API Regression Test Suite...")
        print(f"🌐 Backend URL: {self.base_url}")
        print(f"🔑 Using provided test sessions for regression testing")
        
        start_time = datetime.now()

        # First test the regression fixes
        self.test_regression_fixes()
        
        # Run all test categories
        self.test_auth_endpoints()
        transaction_id = self.test_transaction_endpoints()
        dispute_id = self.test_dispute_endpoints(transaction_id)
        self.test_admin_endpoints() 
        self.test_privacy_rules()

        # Print summary
        end_time = datetime.now()
        duration = (end_time - start_time).total_seconds()
        
        print(f"\n📊 Test Summary:")
        print(f"   Tests Run: {self.tests_run}")
        print(f"   Tests Passed: {self.tests_passed}")
        print(f"   Tests Failed: {self.tests_run - self.tests_passed}")
        print(f"   Success Rate: {(self.tests_passed/self.tests_run*100):.1f}%")
        print(f"   Duration: {duration:.2f} seconds")
        
        # Return appropriate exit code
        return 0 if self.tests_passed == self.tests_run else 1

if __name__ == "__main__":
    tester = TrustTradeAPITester()
    sys.exit(tester.run_all_tests())