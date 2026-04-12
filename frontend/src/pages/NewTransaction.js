import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import PhotoUploader from '../components/PhotoUploader';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Card } from '../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Checkbox } from '../components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '../components/ui/radio-group';
import api from '../utils/api';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRight, User, Camera, Shield, Lock, CheckCircle, Truck, Banknote, Zap, AlertTriangle } from 'lucide-react';

function parseErrorMessage(error) {
  const detail = error.response?.data?.detail;
  if (!detail) return 'An error occurred';
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail.map(e => e.msg || e.message || JSON.stringify(e)).join(', ');
  }
  if (typeof detail === 'object') {
    return detail.msg || detail.message || JSON.stringify(detail);
  }
  return 'An error occurred';
}

const ITEM_CATEGORIES = [
  { value: 'electronics', label: 'Electronics' },
  { value: 'vehicles', label: 'Vehicles' },
  { value: 'furniture', label: 'Furniture' },
  { value: 'clothing', label: 'Clothing & Accessories' },
  { value: 'sports', label: 'Sports & Outdoor' },
  { value: 'services', label: 'Services' },
  { value: 'other', label: 'Other' }
];

function NewTransaction() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);
  const [role, setRole] = useState('seller');
  const [photos, setPhotos] = useState([]);
  const [formData, setFormData] = useState({
    buyer_name: '',
    buyer_email: '',
    seller_name: '',
    seller_email: '',
    item_description: '',
    item_category: '',
    item_condition: '',
    known_issues: '',
    item_price: '',
    fee_allocation: 'SELLER_AGENT',
    delivery_method: 'courier'
  });
  const [confirmations, setConfirmations] = useState({
    buyer_details: false,
    seller_details: false,
    item_accuracy: false
  });
  const navigate = useNavigate();

  useEffect(() => {
    fetchUser();
  }, []);

  useEffect(() => {
    if (user) {
      if (role === 'buyer') {
        setFormData(prev => ({ ...prev, buyer_name: user.name, buyer_email: user.email }));
      } else {
        setFormData(prev => ({ ...prev, seller_name: user.name, seller_email: user.email }));
      }
    }
  }, [role, user]);

  const fetchUser = async () => {
    try {
      const response = await api.get('/auth/me');
      setUser(response.data);
    } catch (error) {
      console.error('Failed to fetch user:', error);
      navigate('/');
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const itemPrice = parseFloat(formData.item_price) || 0;
  const trusttradeFee = Math.max(itemPrice * 0.015, 5); // 1.5% with R5 minimum
  
  let sellerPayout = itemPrice;
  if (formData.fee_allocation === 'SELLER_AGENT') {
    sellerPayout = itemPrice - trusttradeFee;
  } else if (formData.fee_allocation === 'SPLIT_AGENT') {
    sellerPayout = itemPrice - (trusttradeFee / 2);
  }

  const canProceedStep1 = role && (
    role === 'buyer' 
      ? (formData.seller_name && formData.seller_email) 
      : (formData.buyer_name && formData.buyer_email)
  );

  const canProceedStep2 = formData.item_description && formData.item_category && 
                          formData.item_condition && itemPrice >= 100 && itemPrice <= 10000;

  const canProceedStep3 = photos.length >= 1;

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!confirmations.buyer_details || !confirmations.seller_details || !confirmations.item_accuracy) {
      toast.error('Please tick all confirmation checkboxes');
      return;
    }

    setLoading(true);
    try {
      const transactionResponse = await api.post('/transactions', {
        creator_role: role,
        buyer_name: role === 'buyer' ? user.name : formData.buyer_name,
        buyer_email: role === 'buyer' ? user.email : formData.buyer_email,
        seller_name: role === 'seller' ? user.name : formData.seller_name,
        seller_email: role === 'seller' ? user.email : formData.seller_email,
        item_description: formData.item_description,
        item_category: formData.item_category,
        item_condition: formData.item_condition,
        known_issues: formData.known_issues || 'None',
        item_price: itemPrice,
        fee_allocation: formData.fee_allocation,
        delivery_method: formData.delivery_method,
        buyer_details_confirmed: confirmations.buyer_details,
        seller_details_confirmed: confirmations.seller_details,
        item_accuracy_confirmed: confirmations.item_accuracy
      });

      const transactionId = transactionResponse.data.transaction_id;
      const photoFilenames = photos.map(p => p.filename);
      await api.patch(`/transactions/${transactionId}/photos`, photoFilenames, { headers: { 'Content-Type': 'application/json' } });

      toast.success('Transaction created! Share the link with the other party.');
      navigate(`/transactions/${transactionId}`);
    } catch (error) {
      console.error('Failed to create transaction:', error);
      toast.error(parseErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-3 border-slate-900 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <DashboardLayout user={user}>
      <div className="max-w-2xl mx-auto">
        <Button variant="ghost" onClick={() => step > 1 ? setStep(step - 1) : navigate('/dashboard')} className="mb-4 text-sm h-8" data-testid="back-btn">
          <ArrowLeft className="w-4 h-4 mr-1" />
          {step > 1 ? 'Back' : 'Dashboard'}
        </Button>

        {/* Progress Steps */}
        <div className="flex items-center justify-between mb-6">
          {['Parties', 'Item Details', 'Photos', 'Confirm'].map((label, idx) => (
            <div key={label} className="flex items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                step > idx + 1 ? 'bg-emerald-600 text-white' :
                step === idx + 1 ? 'bg-blue-600 text-white' : 
                'bg-slate-100 text-slate-400'
              }`}>
                {step > idx + 1 ? <CheckCircle className="w-4 h-4" /> : idx + 1}
              </div>
              <span className={`hidden sm:block ml-2 text-sm ${step === idx + 1 ? 'font-medium text-slate-900' : 'text-slate-400'}`}>
                {label}
              </span>
              {idx < 3 && <div className="w-8 sm:w-12 h-0.5 bg-slate-200 mx-2" />}
            </div>
          ))}
        </div>

        <form onSubmit={handleSubmit}>
          {/* Step 1: Role & Other Party */}
          {step === 1 && (
            <div className="space-y-4">
              <Card className="p-5">
                <h2 className="text-lg font-semibold text-slate-900 mb-1">Who are you in this transaction?</h2>
                <p className="text-sm text-slate-500 mb-4">Select your role. We'll auto-fill your details.</p>
                
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <button
                    type="button"
                    onClick={() => setRole('seller')}
                    className={`p-4 rounded-lg border-2 text-left transition-all ${
                      role === 'seller' ? 'border-blue-600 bg-blue-50' : 'border-slate-200 hover:border-slate-300'
                    }`}
                    data-testid="role-seller"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Banknote className="w-4 h-4 text-emerald-600" />
                      <span className="font-medium text-slate-900">I'm the Seller</span>
                    </div>
                    <p className="text-xs text-slate-500">I'm selling an item and want to get paid securely</p>
                  </button>
                  
                  <button
                    type="button"
                    onClick={() => setRole('buyer')}
                    className={`p-4 rounded-lg border-2 text-left transition-all ${
                      role === 'buyer' ? 'border-blue-600 bg-blue-50' : 'border-slate-200 hover:border-slate-300'
                    }`}
                    data-testid="role-buyer"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Shield className="w-4 h-4 text-blue-600" />
                      <span className="font-medium text-slate-900">I'm the Buyer</span>
                    </div>
                    <p className="text-xs text-slate-500">I'm buying and want my payment protected</p>
                  </button>
                </div>

                <div className="bg-slate-50 rounded-lg p-3 mb-4">
                  <div className="flex items-center gap-2 mb-1">
                    <User className="w-4 h-4 text-slate-600" />
                    <span className="text-sm font-medium text-slate-700">Your Details</span>
                  </div>
                  <p className="text-sm text-slate-600">{user.name} • {user.email}</p>
                </div>

                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-slate-900">{role === 'buyer' ? 'Seller' : 'Buyer'} Details</h3>
                  <div>
                    <Label className="text-xs text-slate-600">{role === 'buyer' ? 'Seller' : 'Buyer'} Name</Label>
                    <Input
                      name={role === 'buyer' ? 'seller_name' : 'buyer_name'}
                      value={role === 'buyer' ? formData.seller_name : formData.buyer_name}
                      onChange={handleChange}
                      placeholder="Full name"
                      className="h-10 mt-1"
                      data-testid="other-name-input"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-slate-600">{role === 'buyer' ? 'Seller' : 'Buyer'} Email or Phone</Label>
                    <Input
                      name={role === 'buyer' ? 'seller_email' : 'buyer_email'}
                      value={role === 'buyer' ? formData.seller_email : formData.buyer_email}
                      onChange={handleChange}
                      placeholder="email@example.com or +27..."
                      className="h-10 mt-1"
                      data-testid="other-email-input"
                    />
                    <p className="text-[11px] text-slate-400 mt-1">They'll receive a secure link to join</p>
                  </div>
                </div>
              </Card>

              <Button
                type="button"
                onClick={() => setStep(2)}
                disabled={!canProceedStep1}
                className="w-full h-11 bg-blue-600 hover:bg-blue-700"
              >
                Continue <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          )}

          {/* Step 2: Item Details */}
          {step === 2 && (
            <div className="space-y-4">
              <Card className="p-5">
                <h2 className="text-lg font-semibold text-slate-900 mb-4">What's being sold?</h2>
                
                <div className="space-y-4">
                  <div>
                    <Label className="text-xs text-slate-600">Item Description</Label>
                    <Textarea
                      name="item_description"
                      value={formData.item_description}
                      onChange={handleChange}
                      placeholder="Describe the item in detail..."
                      className="mt-1"
                      rows={3}
                      data-testid="item-description-input"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-slate-600">Category</Label>
                      <Select value={formData.item_category} onValueChange={(v) => setFormData(p => ({ ...p, item_category: v }))}>
                        <SelectTrigger className="mt-1 h-10" data-testid="item-category-select">
                          <SelectValue placeholder="Select..." />
                        </SelectTrigger>
                        <SelectContent>
                          {ITEM_CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs text-slate-600">Condition</Label>
                      <Select value={formData.item_condition} onValueChange={(v) => setFormData(p => ({ ...p, item_condition: v }))}>
                        <SelectTrigger className="mt-1 h-10" data-testid="item-condition-select">
                          <SelectValue placeholder="Select..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="New">New</SelectItem>
                          <SelectItem value="Used">Used</SelectItem>
                          <SelectItem value="Used - Minor Defects">Used - Minor Defects</SelectItem>
                          <SelectItem value="Used - Major Defects">Used - Major Defects</SelectItem>
                          <SelectItem value="Sold As-Is">Sold As-Is</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs text-slate-600">Known Issues (optional)</Label>
                    <Input
                      name="known_issues"
                      value={formData.known_issues}
                      onChange={handleChange}
                      placeholder="None — leave blank if no issues"
                      className="h-10 mt-1"
                    />
                  </div>

                  <div>
                    <Label className="text-xs text-slate-600">Price (R)</Label>
                    <Input
                      name="item_price"
                      type="number"
                      min="100"
                      max="10000"
                      step="0.01"
                      value={formData.item_price}
                      onChange={handleChange}
                      placeholder="0.00"
                      className="h-10 mt-1 font-mono"
                      data-testid="item-price-input"
                    />
                    <p className="text-[11px] text-slate-400 mt-1">Min R100 • Max R10,000 (beta)</p>
                  </div>
                </div>
              </Card>

              {/* Delivery Method */}
              <Card className="p-5">
                <h3 className="text-sm font-semibold text-slate-900 mb-3">Delivery Method</h3>
                <div className="space-y-2">
                  {[
                    { value: 'courier', icon: Truck, label: 'Courier / Physical Delivery', desc: '3-day auto-release' },
                    { value: 'bank_deposit', icon: Banknote, label: 'Bank Deposit / Cash', desc: '2-day auto-release' },
                    { value: 'digital', icon: Zap, label: 'Digital / Instant', desc: 'Immediate release' },
                  ].map(opt => (
                    <label
                      key={opt.value}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        formData.delivery_method === opt.value ? 'border-blue-600 bg-blue-50' : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="delivery_method"
                        value={opt.value}
                        checked={formData.delivery_method === opt.value}
                        onChange={handleChange}
                        className="sr-only"
                      />
                      <opt.icon className={`w-4 h-4 ${formData.delivery_method === opt.value ? 'text-blue-600' : 'text-slate-400'}`} />
                      <div className="flex-1">
                        <span className="text-sm font-medium text-slate-900">{opt.label}</span>
                        <span className="text-xs text-slate-500 ml-2">{opt.desc}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </Card>

              {/* Fee Allocation */}
              <Card className="p-5">
                <h3 className="text-sm font-semibold text-slate-900 mb-1">Who pays the TrustTrade fee?</h3>
                <p className="text-xs text-slate-500 mb-3">1.5% fee (min R5) covers escrow protection</p>
                
                <RadioGroup value={formData.fee_allocation} onValueChange={(v) => setFormData(p => ({ ...p, fee_allocation: v }))}>
                  <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer ${formData.fee_allocation === 'SELLER_AGENT' ? 'border-blue-600 bg-blue-50' : 'border-slate-200'}`}>
                    <RadioGroupItem value="SELLER_AGENT" data-testid="fee-seller-agent" />
                    <div className="flex-1">
                      <span className="text-sm font-medium text-slate-900">Seller pays</span>
                      <span className="ml-2 text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">Recommended</span>
                    </div>
                  </label>
                  <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer ${formData.fee_allocation === 'BUYER_AGENT' ? 'border-blue-600 bg-blue-50' : 'border-slate-200'}`}>
                    <RadioGroupItem value="BUYER_AGENT" data-testid="fee-buyer-agent" />
                    <span className="text-sm font-medium text-slate-900">Buyer pays</span>
                  </label>
                  <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer ${formData.fee_allocation === 'SPLIT_AGENT' ? 'border-blue-600 bg-blue-50' : 'border-slate-200'}`}>
                    <RadioGroupItem value="SPLIT_AGENT" data-testid="fee-split-agent" />
                    <span className="text-sm font-medium text-slate-900">Split 50/50</span>
                  </label>
                </RadioGroup>
              </Card>

              {/* Price Summary - Sticky */}
              {itemPrice >= 100 && (
                <div className="bg-slate-900 text-white rounded-lg p-4">
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-slate-400">Item Price</span>
                    <span className="font-mono">R {itemPrice.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-slate-400">TrustTrade Fee (1.5%, min R5)</span>
                    <span className="font-mono">R {trusttradeFee.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-slate-700">
                    <span className="font-medium">Seller Receives</span>
                    <span className="font-mono font-bold text-emerald-400">R {sellerPayout.toFixed(2)}</span>
                  </div>
                </div>
              )}

              <Button
                type="button"
                onClick={() => setStep(3)}
                disabled={!canProceedStep2}
                className="w-full h-11 bg-blue-600 hover:bg-blue-700"
              >
                Continue <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          )}

          {/* Step 3: Photos */}
          {step === 3 && (
            <div className="space-y-4">
              <Card className="p-5">
                <div className="flex items-center gap-2 mb-1">
                  <Camera className="w-5 h-5 text-blue-600" />
                  <h2 className="text-lg font-semibold text-slate-900">Add Photos</h2>
                </div>
                <p className="text-sm text-slate-500 mb-4">Upload 1-5 clear photos. Good photos build trust and prevent disputes.</p>
                
                <PhotoUploader photos={photos} setPhotos={setPhotos} minPhotos={1} maxPhotos={5} required={true} />
              </Card>

              <Button
                type="button"
                onClick={() => setStep(4)}
                disabled={!canProceedStep3}
                className="w-full h-11 bg-blue-600 hover:bg-blue-700"
              >
                Continue <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          )}

          {/* Step 4: Confirm */}
          {step === 4 && (
            <div className="space-y-4">
              {/* Summary Card */}
              <Card className="p-5">
                <h2 className="text-lg font-semibold text-slate-900 mb-4">Review & Confirm</h2>
                
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between py-2 border-b border-slate-100">
                    <span className="text-slate-500">You are</span>
                    <span className="font-medium text-slate-900 capitalize">{role}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-slate-100">
                    <span className="text-slate-500">{role === 'buyer' ? 'Seller' : 'Buyer'}</span>
                    <span className="font-medium text-slate-900">
                      {role === 'buyer' ? formData.seller_name : formData.buyer_name}
                    </span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-slate-100">
                    <span className="text-slate-500">Item</span>
                    <span className="font-medium text-slate-900 truncate max-w-[200px]">{formData.item_description}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-slate-100">
                    <span className="text-slate-500">Price</span>
                    <span className="font-mono font-medium text-slate-900">R {itemPrice.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-slate-100">
                    <span className="text-slate-500">Seller Receives</span>
                    <span className="font-mono font-bold text-emerald-600">R {sellerPayout.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-slate-500">Photos</span>
                    <span className="font-medium text-slate-900">{photos.length} uploaded</span>
                  </div>
                </div>
              </Card>

              {/* Escrow Protection Notice */}
              <div className="bg-blue-50 rounded-lg p-4 flex items-start gap-3">
                <Shield className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-blue-900">Protected by TrustTrade Escrow</p>
                  <p className="text-xs text-blue-700 mt-0.5">
                    Funds held securely until buyer confirms receipt. Bank payout within 1-2 business days.
                  </p>
                </div>
              </div>

              {/* Confirmations */}
              <Card className="p-5">
                <h3 className="text-sm font-semibold text-slate-900 mb-3">Please confirm:</h3>
                <div className="space-y-3">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <Checkbox 
                      checked={confirmations.buyer_details}
                      onCheckedChange={(c) => setConfirmations(p => ({ ...p, buyer_details: c }))}
                      className="mt-0.5"
                      data-testid="confirm-buyer-details"
                    />
                    <span className="text-sm text-slate-700">Buyer details are accurate</span>
                  </label>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <Checkbox 
                      checked={confirmations.seller_details}
                      onCheckedChange={(c) => setConfirmations(p => ({ ...p, seller_details: c }))}
                      className="mt-0.5"
                      data-testid="confirm-seller-details"
                    />
                    <span className="text-sm text-slate-700">Seller details are accurate</span>
                  </label>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <Checkbox 
                      checked={confirmations.item_accuracy}
                      onCheckedChange={(c) => setConfirmations(p => ({ ...p, item_accuracy: c }))}
                      className="mt-0.5"
                      data-testid="confirm-item-accuracy"
                    />
                    <span className="text-sm text-slate-700">Item details are accurate and complete</span>
                  </label>
                </div>
              </Card>

              <Button
                type="submit"
                disabled={loading || !confirmations.buyer_details || !confirmations.seller_details || !confirmations.item_accuracy}
                className="w-full h-11 bg-emerald-600 hover:bg-emerald-700"
                data-testid="create-transaction-btn"
              >
                {loading ? 'Creating...' : 'Create Secure Transaction'}
              </Button>
            </div>
          )}
        </form>
      </div>
    </DashboardLayout>
  );
}

export default NewTransaction;
