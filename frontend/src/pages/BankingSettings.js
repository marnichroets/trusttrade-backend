import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import api from '../utils/api';
import { toast } from 'sonner';
import { CreditCard, Building2, User, Hash, ShieldCheck, AlertCircle, ArrowLeft, CheckCircle, Lock, Mail } from 'lucide-react';

// South African banks
const SA_BANKS = [
  { name: "ABSA Bank", code: "632005" },
  { name: "African Bank", code: "430000" },
  { name: "Bidvest Bank", code: "462005" },
  { name: "Capitec Bank", code: "470010" },
  { name: "Discovery Bank", code: "679000" },
  { name: "First National Bank (FNB)", code: "250655" },
  { name: "Investec Bank", code: "580105" },
  { name: "Nedbank", code: "198765" },
  { name: "Standard Bank", code: "051001" },
  { name: "TymeBank", code: "678910" },
  { name: "Other", code: "" }
];

function BankingSettings() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [bankingStatus, setBankingStatus] = useState(null);
  const [savedBankingDetails, setSavedBankingDetails] = useState(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [bankingDetails, setBankingDetails] = useState({
    bank_name: '',
    account_holder: '',
    account_number: '',
    branch_code: '',
    account_type: 'savings',
    id_number: ''
  });
  const navigate = useNavigate();

  useEffect(() => {
    fetchUserData();
  }, []);

  const fetchUserData = async () => {
    try {
      const userRes = await api.get('/auth/me');
      setUser(userRes.data);
      
      // Fetch banking status
      const statusRes = await api.get('/users/banking-details/status');
      setBankingStatus(statusRes.data);
      
      // If banking details exist, get the saved details
      if (statusRes.data.banking_details_completed) {
        // The user object should have banking_details from /auth/me
        if (userRes.data.banking_details) {
          setSavedBankingDetails(userRes.data.banking_details);
        }
      }
      
      // Pre-fill account holder with user name
      setBankingDetails(prev => ({
        ...prev,
        account_holder: userRes.data.name
      }));
    } catch (error) {
      console.error('Failed to fetch data:', error);
      if (error.response?.status === 401) {
        navigate('/');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleBankSelect = (bankName) => {
    const bank = SA_BANKS.find(b => b.name === bankName);
    setBankingDetails(prev => ({
      ...prev,
      bank_name: bankName,
      branch_code: bank?.code || prev.branch_code
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validation
    if (!bankingDetails.bank_name || !bankingDetails.account_number || !bankingDetails.branch_code) {
      toast.error('Please fill in all required fields');
      return;
    }

    if (bankingDetails.account_number.length < 8) {
      toast.error('Please enter a valid account number');
      return;
    }

    // Show confirmation step
    setShowConfirmation(true);
  };

  const handleConfirmSubmit = async () => {
    setSaving(true);
    try {
      // Send to new banking details endpoint
      console.log('[BANKING] Submitting banking details...');
      const response = await api.post('/users/banking-details', bankingDetails);
      console.log('[BANKING] Response:', response.data);
      
      toast.success('Banking details saved securely');
      
      // Update local state with saved details
      setSavedBankingDetails({
        bank_name: bankingDetails.bank_name,
        account_holder: bankingDetails.account_holder,
        account_number: bankingDetails.account_number.slice(-4),
        branch_code: bankingDetails.branch_code,
        account_type: bankingDetails.account_type,
        updated_at: new Date().toISOString()
      });
      setBankingStatus({ banking_details_completed: true });
      setShowConfirmation(false);
    } catch (error) {
      console.error('[BANKING] Failed to save banking details:', error);
      toast.error(error.response?.data?.detail || 'Failed to save banking details');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  // If banking details are saved, show the read-only view with details
  if (bankingStatus?.banking_details_completed && savedBankingDetails) {
    return (
      <DashboardLayout user={user}>
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Banking Details</h1>
              <p className="text-slate-600 dark:text-slate-400">Your payout account</p>
            </div>
          </div>

          {/* Success Status */}
          <Card className="p-6 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-green-100 dark:bg-green-800 rounded-full flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <h3 className="font-semibold text-green-800 dark:text-green-200">Banking Details Verified</h3>
                <p className="text-sm text-green-600 dark:text-green-400">Your payout account is set up</p>
              </div>
            </div>
          </Card>

          {/* Saved Banking Details - Read Only */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-primary" />
              Saved Banking Details
            </h3>
            
            <div className="space-y-4 bg-slate-50 dark:bg-slate-800 rounded-lg p-6">
              <div className="flex justify-between items-center py-2 border-b border-slate-200 dark:border-slate-700">
                <span className="text-slate-600 dark:text-slate-400 flex items-center gap-2">
                  <Building2 className="w-4 h-4" />
                  Bank Name
                </span>
                <span className="font-semibold text-slate-900 dark:text-white">{savedBankingDetails.bank_name}</span>
              </div>
              
              <div className="flex justify-between items-center py-2 border-b border-slate-200 dark:border-slate-700">
                <span className="text-slate-600 dark:text-slate-400 flex items-center gap-2">
                  <User className="w-4 h-4" />
                  Account Holder
                </span>
                <span className="font-semibold text-slate-900 dark:text-white">{savedBankingDetails.account_holder}</span>
              </div>
              
              <div className="flex justify-between items-center py-2 border-b border-slate-200 dark:border-slate-700">
                <span className="text-slate-600 dark:text-slate-400 flex items-center gap-2">
                  <CreditCard className="w-4 h-4" />
                  Account Number
                </span>
                <span className="font-semibold text-slate-900 dark:text-white font-mono">
                  ••••••{savedBankingDetails.account_number}
                </span>
              </div>
              
              <div className="flex justify-between items-center py-2 border-b border-slate-200 dark:border-slate-700">
                <span className="text-slate-600 dark:text-slate-400 flex items-center gap-2">
                  <Hash className="w-4 h-4" />
                  Branch Code
                </span>
                <span className="font-semibold text-slate-900 dark:text-white">{savedBankingDetails.branch_code}</span>
              </div>
              
              <div className="flex justify-between items-center py-2">
                <span className="text-slate-600 dark:text-slate-400">Account Type</span>
                <span className="font-semibold text-slate-900 dark:text-white capitalize">{savedBankingDetails.account_type}</span>
              </div>
            </div>

            {/* Last Updated */}
            {savedBankingDetails.updated_at && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-4">
                Last updated: {new Date(savedBankingDetails.updated_at).toLocaleDateString('en-ZA', { 
                  year: 'numeric', month: 'long', day: 'numeric' 
                })}
              </p>
            )}
          </Card>

          {/* Change Details Notice */}
          <Card className="p-4 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800">
            <div className="flex gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-amber-800 dark:text-amber-200 font-medium">Need to change your banking details?</p>
                <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                  For security reasons, banking details cannot be changed directly. Please contact our support team.
                </p>
                <a 
                  href="mailto:support@trusttradesa.co.za?subject=Banking%20Details%20Change%20Request" 
                  className="inline-flex items-center gap-2 mt-3 text-sm font-medium text-amber-800 dark:text-amber-200 hover:underline"
                >
                  <Mail className="w-4 h-4" />
                  Contact Support
                </a>
              </div>
            </div>
          </Card>

          {/* Security Note */}
          <div className="flex items-start gap-3 p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
            <Lock className="w-5 h-5 text-slate-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Your full banking details are encrypted and stored securely with our payment processor. Only the last 4 digits of your account number are displayed for your security.
            </p>
          </div>

          <Button onClick={() => navigate('/dashboard')} className="w-full bg-[#1a2942] hover:bg-[#243751]">
            Back to Dashboard
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  // If already submitted but no details fetched, show simple success state
  if (bankingStatus?.banking_details_completed) {
    return (
      <DashboardLayout user={user}>
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Banking Details</h1>
              <p className="text-slate-600 dark:text-slate-400">Your payout account</p>
            </div>
          </div>

          <Card className="p-8 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-10 h-10 text-green-600" />
            </div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">Banking Details Verified</h2>
            <p className="text-slate-600 dark:text-slate-400 mb-6">
              Your banking details are securely saved. Payouts will be sent to your verified account.
            </p>
            <div className="flex items-center justify-center gap-2 text-sm text-slate-500 mb-6">
              <Lock className="w-4 h-4" />
              <span>Details stored securely with our payment processor</span>
            </div>
            <Button onClick={() => navigate('/dashboard')} className="bg-[#1a2942] hover:bg-[#243751]">
              Back to Dashboard
            </Button>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  // Confirmation step
  if (showConfirmation) {
    return (
      <DashboardLayout user={user}>
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => setShowConfirmation(false)}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Confirm Banking Details</h1>
              <p className="text-slate-600">Please verify your information</p>
            </div>
          </div>

          <Card className="p-6">
            <div className="flex items-center gap-3 mb-6">
              <AlertCircle className="w-6 h-6 text-amber-500" />
              <p className="text-sm text-slate-600">Please verify all details are correct before submitting. Incorrect details may delay your payouts.</p>
            </div>

            <div className="space-y-4 bg-slate-50 rounded-lg p-6 mb-6">
              <div className="flex justify-between py-2 border-b border-slate-200">
                <span className="text-slate-600">Bank Name</span>
                <span className="font-semibold text-slate-900">{bankingDetails.bank_name}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-200">
                <span className="text-slate-600">Account Holder</span>
                <span className="font-semibold text-slate-900">{bankingDetails.account_holder}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-200">
                <span className="text-slate-600">Account Number</span>
                <span className="font-semibold text-slate-900 font-mono">{bankingDetails.account_number}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-200">
                <span className="text-slate-600">Branch Code</span>
                <span className="font-semibold text-slate-900">{bankingDetails.branch_code}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-slate-600">Account Type</span>
                <span className="font-semibold text-slate-900 capitalize">{bankingDetails.account_type}</span>
              </div>
            </div>

            <div className="flex gap-3">
              <Button 
                variant="outline" 
                onClick={() => setShowConfirmation(false)}
                className="flex-1"
                disabled={saving}
              >
                Edit Details
              </Button>
              <Button 
                onClick={handleConfirmSubmit}
                className="flex-1 bg-green-600 hover:bg-green-700"
                disabled={saving}
              >
                {saving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Saving...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Confirm & Submit
                  </>
                )}
              </Button>
            </div>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout user={user}>
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Banking Details</h1>
            <p className="text-slate-600 dark:text-slate-400">Add your bank account to receive payouts</p>
          </div>
        </div>

        {/* Security Info Card */}
        <Card className="p-4 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
          <div className="flex gap-3">
            <ShieldCheck className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-800 dark:text-blue-200">
              <p className="font-medium mb-1">Secure & Private</p>
              <p>Your banking details are sent directly to our secure payment processor. TrustTrade does not store your bank account number or sensitive details.</p>
            </div>
          </div>
        </Card>

        {/* Banking Form */}
        <Card className="p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Bank Selection */}
            <div className="space-y-2">
              <Label htmlFor="bank_name" className="flex items-center gap-2">
                <Building2 className="w-4 h-4" />
                Bank Name *
              </Label>
              <select
                id="bank_name"
                value={bankingDetails.bank_name}
                onChange={(e) => handleBankSelect(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#1a2942]"
                required
              >
                <option value="">Select your bank</option>
                {SA_BANKS.map((bank) => (
                  <option key={bank.name} value={bank.name}>{bank.name}</option>
                ))}
              </select>
            </div>

            {/* Account Holder */}
            <div className="space-y-2">
              <Label htmlFor="account_holder" className="flex items-center gap-2">
                <User className="w-4 h-4" />
                Account Holder Name *
              </Label>
              <Input
                id="account_holder"
                value={bankingDetails.account_holder}
                onChange={(e) => setBankingDetails(prev => ({ ...prev, account_holder: e.target.value }))}
                placeholder="Full name as it appears on account"
                required
                className="border-slate-200 dark:border-slate-700 focus:ring-[#1a2942]"
              />
            </div>

            {/* Account Number */}
            <div className="space-y-2">
              <Label htmlFor="account_number" className="flex items-center gap-2">
                <CreditCard className="w-4 h-4" />
                Account Number *
              </Label>
              <Input
                id="account_number"
                type="text"
                inputMode="numeric"
                value={bankingDetails.account_number}
                onChange={(e) => setBankingDetails(prev => ({ ...prev, account_number: e.target.value.replace(/\D/g, '') }))}
                placeholder="Your bank account number"
                required
                className="border-slate-200 dark:border-slate-700 focus:ring-[#1a2942]"
              />
            </div>

            {/* Branch Code */}
            <div className="space-y-2">
              <Label htmlFor="branch_code" className="flex items-center gap-2">
                <Hash className="w-4 h-4" />
                Branch Code *
              </Label>
              <Input
                id="branch_code"
                value={bankingDetails.branch_code}
                onChange={(e) => setBankingDetails(prev => ({ ...prev, branch_code: e.target.value }))}
                placeholder="6-digit branch code"
                required
                className="border-slate-200 dark:border-slate-700 focus:ring-[#1a2942]"
              />
              {bankingDetails.bank_name && bankingDetails.bank_name !== 'Other' && (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Universal branch code auto-filled for {bankingDetails.bank_name}
                </p>
              )}
            </div>

            {/* Account Type */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                Account Type *
              </Label>
              <div className="grid grid-cols-2 gap-3">
                <label className={`flex items-center gap-2 p-3 border rounded-lg cursor-pointer transition-colors ${
                  bankingDetails.account_type === 'savings' 
                    ? 'border-[#1a2942] bg-[#1a2942]/5 dark:bg-[#1a2942]/20' 
                    : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
                }`}>
                  <input
                    type="radio"
                    name="account_type"
                    value="savings"
                    checked={bankingDetails.account_type === 'savings'}
                    onChange={(e) => setBankingDetails(prev => ({ ...prev, account_type: e.target.value }))}
                    className="text-[#1a2942]"
                  />
                  <span className="text-sm font-medium text-slate-900 dark:text-white">Savings</span>
                </label>
                <label className={`flex items-center gap-2 p-3 border rounded-lg cursor-pointer transition-colors ${
                  bankingDetails.account_type === 'current' 
                    ? 'border-[#1a2942] bg-[#1a2942]/5 dark:bg-[#1a2942]/20' 
                    : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
                }`}>
                  <input
                    type="radio"
                    name="account_type"
                    value="current"
                    checked={bankingDetails.account_type === 'current'}
                    onChange={(e) => setBankingDetails(prev => ({ ...prev, account_type: e.target.value }))}
                    className="text-[#1a2942]"
                  />
                  <span className="text-sm font-medium text-slate-900 dark:text-white">Current/Cheque</span>
                </label>
              </div>
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              disabled={saving}
              className="w-full h-12 bg-[#1a2942] hover:bg-[#243751] text-white font-semibold"
            >
              {saving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  Saving Securely...
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4 mr-2" />
                  Save Banking Details
                </>
              )}
            </Button>
          </form>
        </Card>

        {/* Security Note */}
        <div className="flex items-start gap-3 p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
          <Lock className="w-5 h-5 text-slate-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Your banking details are encrypted and sent directly to our secure payment processor for payouts. TrustTrade never stores your full account number.
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
}

export default BankingSettings;
