import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminNavbar, Breadcrumbs } from '../components/AdminNavbar';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import api from '../utils/api';
import { toast } from 'sonner';
import { AlertTriangle, Search, Save, Loader2, CheckCircle, XCircle, Info } from 'lucide-react';

const COLORS = {
  primary: '#3b82f6',
  green: '#10b981',
  background: '#ffffff',
  section: '#f8fafc',
  text: '#1e293b',
  subtext: '#64748b',
  border: '#e2e8f0',
  error: '#ef4444',
  warning: '#f59e0b'
};

// South African banks
const SA_BANKS = [
  { value: 'ABSA', label: 'ABSA Bank' },
  { value: 'CAPITEC', label: 'Capitec Bank' },
  { value: 'FNB', label: 'First National Bank (FNB)' },
  { value: 'INVESTEC', label: 'Investec' },
  { value: 'NEDBANK', label: 'Nedbank' },
  { value: 'STANDARD_BANK', label: 'Standard Bank' },
  { value: 'AFRICAN_BANK', label: 'African Bank' },
  { value: 'BIDVEST', label: 'Bidvest Bank' },
  { value: 'DISCOVERY', label: 'Discovery Bank' },
  { value: 'TYME', label: 'TymeBank' },
];

function AdminTokenRecovery() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [updating, setUpdating] = useState(false);
  
  // Form state
  const [token, setToken] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountHolder, setAccountHolder] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [branchCode, setBranchCode] = useState('');
  const [accountType, setAccountType] = useState('SAVINGS');
  
  // Result state
  const [checkResult, setCheckResult] = useState(null);
  const [updateResult, setUpdateResult] = useState(null);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const res = await api.get('/auth/me');
      if (!res.data.is_admin) {
        toast.error('Admin access required');
        navigate('/dashboard');
        return;
      }
      setUser(res.data);
    } catch (error) {
      navigate('/login');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout', {});
      localStorage.removeItem('session_token');
      navigate('/');
    } catch (error) {
      localStorage.removeItem('session_token');
      navigate('/');
    }
  };

  const handleCheckToken = async () => {
    if (!token.trim()) {
      toast.error('Please enter a token ID');
      return;
    }
    
    setChecking(true);
    setCheckResult(null);
    setUpdateResult(null);
    
    try {
      const res = await api.get(`/admin/tradesafe/token-recovery/${token.trim()}`);
      setCheckResult(res.data);
      
      if (res.data.success) {
        toast.success('Token details retrieved');
        // Pre-fill mobile if exists
        if (res.data.user?.mobile) {
          setMobileNumber(res.data.user.mobile);
        }
      } else {
        toast.error(res.data.error || 'Failed to check token');
      }
    } catch (error) {
      const msg = error.response?.data?.detail || error.message;
      toast.error(`Error: ${msg}`);
      setCheckResult({ success: false, error: msg });
    } finally {
      setChecking(false);
    }
  };

  const handleUpdateToken = async () => {
    if (!token.trim()) {
      toast.error('Please enter a token ID');
      return;
    }
    if (!mobileNumber.trim()) {
      toast.error('Please enter a mobile number');
      return;
    }
    if (!bankName) {
      toast.error('Please select a bank');
      return;
    }
    if (!accountNumber.trim()) {
      toast.error('Please enter an account number');
      return;
    }
    if (!branchCode.trim()) {
      toast.error('Please enter a branch code');
      return;
    }
    
    // Confirmation dialog
    const confirmed = window.confirm(
      'WARNING: Banking details may be irreversible.\n\n' +
      'Are you sure you want to update this token?\n\n' +
      `Token: ${token}\n` +
      `Mobile: ${mobileNumber}\n` +
      `Bank: ${bankName}\n` +
      `Account: ${accountNumber}\n\n` +
      'Click OK to proceed.'
    );
    
    if (!confirmed) return;
    
    setUpdating(true);
    setUpdateResult(null);
    
    try {
      const res = await api.post('/admin/tradesafe/token-recovery/update', {
        token: token.trim(),
        mobile_number: mobileNumber.trim(),
        bank_name: bankName,
        account_holder: accountHolder.trim() || 'Account Holder',
        account_number: accountNumber.trim(),
        branch_code: branchCode.trim(),
        account_type: accountType
      });
      
      setUpdateResult(res.data);
      
      if (res.data.success) {
        toast.success('Token updated successfully!');
        // Refresh check result
        setCheckResult(res.data);
      } else {
        toast.error(res.data.error || 'Failed to update token');
      }
    } catch (error) {
      const msg = error.response?.data?.detail || error.message;
      toast.error(`Error: ${msg}`);
      setUpdateResult({ success: false, error: msg });
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: COLORS.section }}>
        <div className="w-12 h-12 border-4 rounded-full animate-spin" style={{ borderColor: COLORS.primary, borderTopColor: 'transparent' }}></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: COLORS.section }}>
      <AdminNavbar user={user} onLogout={handleLogout} />
      
      <div className="max-w-4xl mx-auto px-4 py-6">
        <Breadcrumbs items={[
          { label: 'Admin', href: '/admin' },
          { label: 'TradeSafe Token Recovery' }
        ]} />
        
        <div className="mb-6">
          <h1 className="text-2xl font-bold" style={{ color: COLORS.text }}>TradeSafe Token Recovery</h1>
          <p style={{ color: COLORS.subtext }}>Admin tool to update legacy tokens with banking details</p>
        </div>
        
        {/* Warning Banner */}
        <Card className="p-4 mb-6 border-l-4" style={{ borderLeftColor: COLORS.warning, backgroundColor: '#fffbeb' }}>
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 mt-0.5" style={{ color: COLORS.warning }} />
            <div>
              <p className="font-semibold" style={{ color: COLORS.text }}>Important Safety Notice</p>
              <ul className="mt-1 text-sm space-y-1" style={{ color: COLORS.subtext }}>
                <li>• Banking details may be irreversible once submitted to TradeSafe</li>
                <li>• Double-check all details before updating</li>
                <li>• This tool does NOT trigger automatic withdrawals</li>
                <li>• Always verify token balance and validity before proceeding</li>
              </ul>
            </div>
          </div>
        </Card>
        
        {/* Token Input */}
        <Card className="p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4" style={{ color: COLORS.text }}>Step 1: Check Token</h2>
          <div className="flex gap-3">
            <div className="flex-1">
              <Label htmlFor="token">TradeSafe Token ID</Label>
              <Input
                id="token"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Enter existing token ID..."
                className="mt-1"
              />
            </div>
            <div className="flex items-end">
              <Button onClick={handleCheckToken} disabled={checking}>
                {checking ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Search className="w-4 h-4 mr-2" />
                )}
                Check Token
              </Button>
            </div>
          </div>
        </Card>
        
        {/* Check Result */}
        {checkResult && (
          <Card className="p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2" style={{ color: COLORS.text }}>
              Token Status
              {checkResult.success ? (
                <CheckCircle className="w-5 h-5" style={{ color: COLORS.green }} />
              ) : (
                <XCircle className="w-5 h-5" style={{ color: COLORS.error }} />
              )}
            </h2>
            
            {checkResult.success ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-3 rounded-lg" style={{ backgroundColor: COLORS.section }}>
                    <p className="text-xs" style={{ color: COLORS.subtext }}>Balance</p>
                    <p className="text-xl font-bold" style={{ color: COLORS.primary }}>
                      R {checkResult.balance_rands?.toFixed(2) || '0.00'}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg" style={{ backgroundColor: COLORS.section }}>
                    <p className="text-xs" style={{ color: COLORS.subtext }}>Valid</p>
                    <p className="text-xl font-bold" style={{ color: checkResult.valid ? COLORS.green : COLORS.error }}>
                      {checkResult.valid ? 'Yes' : 'No'}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg" style={{ backgroundColor: COLORS.section }}>
                    <p className="text-xs" style={{ color: COLORS.subtext }}>Complete</p>
                    <p className="text-xl font-bold" style={{ color: checkResult.complete ? COLORS.green : COLORS.warning }}>
                      {checkResult.complete ? 'Yes' : 'No'}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg" style={{ backgroundColor: COLORS.section }}>
                    <p className="text-xs" style={{ color: COLORS.subtext }}>Payout Ready</p>
                    <p className="text-xl font-bold" style={{ color: checkResult.payout_ready ? COLORS.green : COLORS.error }}>
                      {checkResult.payout_ready ? 'Yes' : 'No'}
                    </p>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="font-medium" style={{ color: COLORS.text }}>User Details</p>
                    <div className="mt-1 p-3 rounded" style={{ backgroundColor: COLORS.section }}>
                      {checkResult.user ? (
                        <>
                          <p>Name: {checkResult.user.givenName} {checkResult.user.familyName}</p>
                          <p>Email: {checkResult.user.email || 'N/A'}</p>
                          <p>Mobile: {checkResult.user.mobile || 'NOT SET'}</p>
                        </>
                      ) : (
                        <p style={{ color: COLORS.subtext }}>No user details</p>
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="font-medium" style={{ color: COLORS.text }}>Banking Details</p>
                    <div className="mt-1 p-3 rounded" style={{ backgroundColor: COLORS.section }}>
                      {checkResult.bank_account ? (
                        <>
                          <p>Bank: {checkResult.bank_account.bank || 'N/A'}</p>
                          <p>Account: ***{checkResult.bank_account.accountNumber?.slice(-4) || 'N/A'}</p>
                          <p>Branch: {checkResult.bank_account.branchCode || 'N/A'}</p>
                          <p>Type: {checkResult.bank_account.accountType || 'N/A'}</p>
                        </>
                      ) : (
                        <p style={{ color: COLORS.warning }}>NO BANKING DETAILS</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded" style={{ backgroundColor: '#fef2f2' }}>
                <p style={{ color: COLORS.error }}>{checkResult.error}</p>
              </div>
            )}
          </Card>
        )}
        
        {/* Update Form */}
        <Card className="p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4" style={{ color: COLORS.text }}>Step 2: Update Token Details</h2>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="mobile">Mobile Number (South African)</Label>
              <Input
                id="mobile"
                value={mobileNumber}
                onChange={(e) => setMobileNumber(e.target.value)}
                placeholder="0821234567 or +27821234567"
                className="mt-1"
              />
              <p className="text-xs mt-1" style={{ color: COLORS.subtext }}>
                Will be converted to +27 format automatically
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="bank">Bank</Label>
                <Select value={bankName} onValueChange={setBankName}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select bank..." />
                  </SelectTrigger>
                  <SelectContent>
                    {SA_BANKS.map(bank => (
                      <SelectItem key={bank.value} value={bank.value}>
                        {bank.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label htmlFor="accountType">Account Type</Label>
                <Select value={accountType} onValueChange={setAccountType}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SAVINGS">Savings</SelectItem>
                    <SelectItem value="CHEQUE">Cheque / Current</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div>
              <Label htmlFor="accountHolder">Account Holder Name</Label>
              <Input
                id="accountHolder"
                value={accountHolder}
                onChange={(e) => setAccountHolder(e.target.value)}
                placeholder="Name as it appears on bank account"
                className="mt-1"
              />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="accountNumber">Account Number</Label>
                <Input
                  id="accountNumber"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  placeholder="Bank account number"
                  className="mt-1"
                />
              </div>
              
              <div>
                <Label htmlFor="branchCode">Branch Code (Universal)</Label>
                <Input
                  id="branchCode"
                  value={branchCode}
                  onChange={(e) => setBranchCode(e.target.value)}
                  placeholder="e.g., 051001 for Standard Bank"
                  className="mt-1"
                />
              </div>
            </div>
            
            <div className="pt-4">
              <Button 
                onClick={handleUpdateToken} 
                disabled={updating || !token}
                className="w-full"
                style={{ backgroundColor: COLORS.warning }}
              >
                {updating ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Update Token (Review Carefully First)
              </Button>
            </div>
          </div>
        </Card>
        
        {/* Update Result */}
        {updateResult && (
          <Card className="p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2" style={{ color: COLORS.text }}>
              Update Result
              {updateResult.success ? (
                <CheckCircle className="w-5 h-5" style={{ color: COLORS.green }} />
              ) : (
                <XCircle className="w-5 h-5" style={{ color: COLORS.error }} />
              )}
            </h2>
            
            {updateResult.success ? (
              <div className="p-4 rounded" style={{ backgroundColor: '#f0fdf4' }}>
                <p className="font-medium" style={{ color: COLORS.green }}>{updateResult.message}</p>
                <div className="mt-3 text-sm space-y-1">
                  <p>Token: {updateResult.token}</p>
                  <p>Balance: R {updateResult.balance_rands?.toFixed(2)}</p>
                  <p>Valid: {updateResult.valid ? 'Yes' : 'No'}</p>
                  <p>Complete: {updateResult.complete ? 'Yes' : 'No'}</p>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded" style={{ backgroundColor: '#fef2f2' }}>
                <p className="font-medium" style={{ color: COLORS.error }}>Update Failed</p>
                <p className="mt-1">{updateResult.error}</p>
                {updateResult.debug_message && (
                  <p className="mt-2 text-sm">Debug: {updateResult.debug_message}</p>
                )}
                {updateResult.validation_errors && Object.keys(updateResult.validation_errors).length > 0 && (
                  <div className="mt-2">
                    <p className="text-sm font-medium">Validation Errors:</p>
                    <pre className="text-xs mt-1 p-2 bg-white rounded overflow-auto">
                      {JSON.stringify(updateResult.validation_errors, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </Card>
        )}
        
        {/* Info Section */}
        <Card className="p-4" style={{ backgroundColor: COLORS.section }}>
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 mt-0.5" style={{ color: COLORS.primary }} />
            <div className="text-sm" style={{ color: COLORS.subtext }}>
              <p className="font-medium" style={{ color: COLORS.text }}>How to use this tool:</p>
              <ol className="mt-2 space-y-1 list-decimal list-inside">
                <li>Enter the TradeSafe token ID and click "Check Token"</li>
                <li>Review the current balance, validity, and banking status</li>
                <li>Fill in the mobile number and banking details</li>
                <li>Double-check all information carefully</li>
                <li>Click "Update Token" to submit the changes</li>
                <li>Verify the update was successful before any withdrawal</li>
              </ol>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

export default AdminTokenRecovery;
