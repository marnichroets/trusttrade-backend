import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import axios from 'axios';
import { toast } from 'sonner';
import { CreditCard, Building2, User, Hash, ShieldCheck, AlertCircle, ArrowLeft } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

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
      const [userRes, bankingRes] = await Promise.all([
        axios.get(`${API}/auth/me`, { withCredentials: true }),
        axios.get(`${API}/banking-details`, { withCredentials: true }).catch(() => ({ data: {} }))
      ]);

      setUser(userRes.data);
      
      if (bankingRes.data && Object.keys(bankingRes.data).length > 0) {
        setBankingDetails({
          bank_name: bankingRes.data.bank_name || '',
          account_holder: bankingRes.data.account_holder || userRes.data.name,
          account_number: '', // Don't pre-fill for security
          branch_code: bankingRes.data.branch_code || '',
          account_type: bankingRes.data.account_type || 'savings'
        });
      } else {
        // Pre-fill account holder with user name
        setBankingDetails(prev => ({
          ...prev,
          account_holder: userRes.data.name
        }));
      }
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
      await axios.post(`${API}/banking-details`, bankingDetails, { withCredentials: true });
      toast.success('Banking details saved successfully');
      navigate('/dashboard');
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

  return (
    <DashboardLayout user={user}>
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Banking Details</h1>
            <p className="text-slate-600">Add your bank account to receive payouts</p>
          </div>
        </div>

        {/* Info Card */}
        <Card className="p-4 bg-blue-50 border-blue-200">
          <div className="flex gap-3">
            <ShieldCheck className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-800">
              <p className="font-medium mb-1">Secure Payouts via TradeSafe</p>
              <p>Your banking details are securely stored and used only for releasing funds from completed transactions. Payouts are processed automatically when your wallet balance reaches R500.</p>
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
                className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                required
                data-testid="bank-name-select"
              >
                <option value="">Select your bank</option>
                {SA_BANKS.map(bank => (
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
                type="text"
                value={bankingDetails.account_holder}
                onChange={(e) => setBankingDetails(prev => ({ ...prev, account_holder: e.target.value }))}
                placeholder="Name as it appears on your bank account"
                required
                data-testid="account-holder-input"
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
                value={bankingDetails.account_number}
                onChange={(e) => setBankingDetails(prev => ({ ...prev, account_number: e.target.value.replace(/\D/g, '') }))}
                placeholder="Enter your account number"
                required
                maxLength={16}
                data-testid="account-number-input"
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
                type="text"
                value={bankingDetails.branch_code}
                onChange={(e) => setBankingDetails(prev => ({ ...prev, branch_code: e.target.value.replace(/\D/g, '') }))}
                placeholder="6-digit branch code"
                required
                maxLength={6}
                data-testid="branch-code-input"
              />
              <p className="text-xs text-slate-500">
                Universal branch codes are auto-filled for major banks
              </p>
            </div>

            {/* Account Type */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                Account Type *
              </Label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="account_type"
                    value="savings"
                    checked={bankingDetails.account_type === 'savings'}
                    onChange={(e) => setBankingDetails(prev => ({ ...prev, account_type: e.target.value }))}
                    className="w-4 h-4 text-primary"
                  />
                  <span>Savings</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="account_type"
                    value="checking"
                    checked={bankingDetails.account_type === 'checking'}
                    onChange={(e) => setBankingDetails(prev => ({ ...prev, account_type: e.target.value }))}
                    className="w-4 h-4 text-primary"
                  />
                  <span>Current/Cheque</span>
                </label>
              </div>
            </div>

            {/* Warning */}
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex gap-3">
                <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0" />
                <div className="text-sm text-yellow-800">
                  <p className="font-medium">Important</p>
                  <p>Please ensure your banking details are correct. Incorrect details may result in failed or delayed payouts.</p>
                </div>
              </div>
            </div>

            {/* Submit */}
            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate('/dashboard')}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={saving}
                className="flex-1"
                data-testid="save-banking-btn"
              >
                {saving ? 'Saving...' : 'Save Banking Details'}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </DashboardLayout>
  );
}

export default BankingSettings;
