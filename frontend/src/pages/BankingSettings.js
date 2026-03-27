import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import api from '../utils/api';
import { toast } from 'sonner';
import { CreditCard, Building2, User, Hash, ShieldCheck, AlertCircle, ArrowLeft, CheckCircle, Lock } from 'lucide-react';

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
  const [bankingDetailsAdded, setBankingDetailsAdded] = useState(false);
  const [bankingDetails, setBankingDetails] = useState({
    bank_name: '',
    account_holder: '',
    account_number: '',
    branch_code: '',
    account_type: 'savings'
  });
  const navigate = useNavigate();

  useEffect(() => {
    fetchUserData();
  }, []);

  const fetchUserData = async () => {
    try {
      const userRes = await api.get('/auth/me');
      setUser(userRes.data);
      setBankingDetailsAdded(userRes.data.banking_details_added || false);
      
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

    setSaving(true);
    try {
      // Send to TradeSafe API - banking details are NOT stored in TrustTrade database
      await api.post('/tradesafe/banking-details', bankingDetails);
      toast.success('Banking details saved securely');
      setBankingDetailsAdded(true);
      
      // Redirect to dashboard after short delay
      setTimeout(() => {
        navigate('/dashboard');
      }, 1500);
    } catch (error) {
      console.error('Failed to save banking details:', error);
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

  // If already added banking details, show success state
  if (bankingDetailsAdded) {
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
