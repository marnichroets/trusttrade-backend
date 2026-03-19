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
import axios from 'axios';
import { toast } from 'sonner';
import { ArrowLeft, Calculator, UserCircle } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function NewTransaction() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [role, setRole] = useState('buyer');
  const [photos, setPhotos] = useState([]);
  const [formData, setFormData] = useState({
    buyer_name: '',
    buyer_email: '',
    seller_name: '',
    seller_email: '',
    item_description: '',
    item_condition: '',
    known_issues: '',
    item_price: '',
    fee_paid_by: 'split',  // Default to 50/50 split
    delivery_method: 'courier'  // Default delivery method
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
        setFormData(prev => ({
          ...prev,
          buyer_name: user.name,
          buyer_email: user.email
        }));
      } else {
        setFormData(prev => ({
          ...prev,
          seller_name: user.name,
          seller_email: user.email
        }));
      }
    }
  }, [role, user]);

  const fetchUser = async () => {
    try {
      const response = await axios.get(`${API}/auth/me`, { withCredentials: true });
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

  const handleConfirmationChange = (field, value) => {
    setConfirmations(prev => ({ ...prev, [field]: value }));
  };

  const itemPrice = parseFloat(formData.item_price) || 0;
  const fee = (itemPrice * 0.02).toFixed(2);
  const feeAmount = parseFloat(fee);
  
  let buyerTotal = itemPrice;
  let sellerTotal = itemPrice;
  
  if (formData.fee_paid_by === 'buyer') {
    buyerTotal = itemPrice + feeAmount;
  } else if (formData.fee_paid_by === 'seller') {
    sellerTotal = itemPrice - feeAmount;
  } else if (formData.fee_paid_by === 'split') {
    buyerTotal = itemPrice + (feeAmount / 2);
    sellerTotal = itemPrice - (feeAmount / 2);
  }
  
  const total = (itemPrice + feeAmount).toFixed(2);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!role) {
      toast.error('Please select your role');
      return;
    }

    if (role === 'buyer') {
      if (!formData.seller_name || !formData.seller_email) {
        toast.error('Please fill in seller details');
        return;
      }
    } else {
      if (!formData.buyer_name || !formData.buyer_email) {
        toast.error('Please fill in buyer details');
        return;
      }
    }

    if (!formData.item_description || !formData.item_condition || !formData.known_issues || !formData.item_price) {
      toast.error('Please fill in all item details');
      return;
    }

    if (itemPrice <= 0) {
      toast.error('Item price must be greater than 0');
      return;
    }

    // Minimum transaction amount R500
    if (itemPrice < 500) {
      toast.error('Minimum transaction amount is R500');
      return;
    }

    // Maximum transaction amount R500,000
    if (itemPrice > 500000) {
      toast.error('Maximum transaction amount is R500,000. Contact support for larger transactions.');
      return;
    }

    if (photos.length < 1) {
      toast.error('Please upload at least 1 photo');
      return;
    }

    if (!confirmations.buyer_details || !confirmations.seller_details || !confirmations.item_accuracy) {
      toast.error('Please confirm all checkboxes');
      return;
    }

    setLoading(true);

    try {
      const transactionResponse = await axios.post(
        `${API}/transactions`,
        {
          creator_role: role,
          buyer_name: role === 'buyer' ? user.name : formData.buyer_name,
          buyer_email: role === 'buyer' ? user.email : formData.buyer_email,
          seller_name: role === 'seller' ? user.name : formData.seller_name,
          seller_email: role === 'seller' ? user.email : formData.seller_email,
          item_description: formData.item_description,
          item_condition: formData.item_condition,
          known_issues: formData.known_issues,
          item_price: itemPrice,
          fee_paid_by: formData.fee_paid_by,
          delivery_method: formData.delivery_method,
          buyer_details_confirmed: confirmations.buyer_details,
          seller_details_confirmed: confirmations.seller_details,
          item_accuracy_confirmed: confirmations.item_accuracy
        },
        { withCredentials: true }
      );

      const transactionId = transactionResponse.data.transaction_id;

      const photoFilenames = photos.map(p => p.filename);
      await axios.patch(
        `${API}/transactions/${transactionId}/photos`,
        photoFilenames,
        { withCredentials: true, headers: { 'Content-Type': 'application/json' } }
      );

      toast.success('Transaction created successfully!');
      navigate(`/transactions/${transactionId}`);
    } catch (error) {
      console.error('Failed to create transaction:', error);
      toast.error(error.response?.data?.detail || 'Failed to create transaction');
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <DashboardLayout user={user}>
      <div className="max-w-4xl mx-auto">
        <Button variant="ghost" onClick={() => navigate('/dashboard')} data-testid="back-to-dashboard-btn" className="mb-6">
          <ArrowLeft className="w-4 h-4 mr-2" />Back to Dashboard
        </Button>

        <div className="mb-6">
          <h1 className="text-3xl font-bold text-slate-900">New Transaction</h1>
          <p className="text-slate-600 mt-2">Create a secure escrow transaction</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Your Role in This Transaction</h3>
            <p className="text-sm text-slate-600 mb-4">Select your role. Your account details will automatically populate.</p>
            <RadioGroup value={role} onValueChange={setRole}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="buyer" id="buyer" data-testid="role-buyer" />
                <Label htmlFor="buyer" className="cursor-pointer">I am the Buyer</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="seller" id="seller" data-testid="role-seller" />
                <Label htmlFor="seller" className="cursor-pointer">I am the Seller</Label>
              </div>
            </RadioGroup>
          </Card>

          <Card className="p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <UserCircle className="w-5 h-5 text-primary" />Your Details
            </h3>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <Label>Your Name</Label>
                <Input value={user.name} disabled className="bg-slate-50" data-testid="your-name-input" />
              </div>
              <div>
                <Label>Your Email</Label>
                <Input value={user.email} disabled className="bg-slate-50" data-testid="your-email-input" />
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-2">Recipient Info</h3>
            <p className="text-sm text-slate-500 mb-4">
              Enter the recipient's email or phone number. They will receive a secure link to claim payment. No signup required for first-time users.
            </p>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="other_name">{role === 'buyer' ? 'Seller' : 'Buyer'} Name *</Label>
                <Input id="other_name" name={role === 'buyer' ? 'seller_name' : 'buyer_name'} value={role === 'buyer' ? formData.seller_name : formData.buyer_name} onChange={handleChange} placeholder="Enter name" required data-testid="other-name-input" />
              </div>
              <div>
                <Label htmlFor="other_email">{role === 'buyer' ? 'Seller' : 'Buyer'} Email or Phone Number *</Label>
                <Input id="other_email" name={role === 'buyer' ? 'seller_email' : 'buyer_email'} type="text" value={role === 'buyer' ? formData.seller_email : formData.buyer_email} onChange={handleChange} placeholder="email@example.com or +27..." required data-testid="other-email-input" />
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Payment / Delivery Method</h3>
            <div className="space-y-3">
              <label className={`flex items-start gap-3 p-4 border rounded-lg cursor-pointer transition-colors ${formData.delivery_method === 'courier' ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300'}`}>
                <input
                  type="radio"
                  name="delivery_method"
                  value="courier"
                  checked={formData.delivery_method === 'courier'}
                  onChange={(e) => setFormData(prev => ({ ...prev, delivery_method: e.target.value }))}
                  className="mt-1"
                />
                <div>
                  <p className="font-medium text-slate-900">Courier / Physical Delivery</p>
                  <p className="text-sm text-slate-500">3-day auto-release after delivery confirmation</p>
                </div>
              </label>
              
              <label className={`flex items-start gap-3 p-4 border rounded-lg cursor-pointer transition-colors ${formData.delivery_method === 'bank_deposit' ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300'}`}>
                <input
                  type="radio"
                  name="delivery_method"
                  value="bank_deposit"
                  checked={formData.delivery_method === 'bank_deposit'}
                  onChange={(e) => setFormData(prev => ({ ...prev, delivery_method: e.target.value }))}
                  className="mt-1"
                />
                <div>
                  <p className="font-medium text-slate-900">Bank Deposit / Cash Collection</p>
                  <p className="text-sm text-slate-500">2-day auto-release after payment confirmation</p>
                </div>
              </label>
              
              <label className={`flex items-start gap-3 p-4 border rounded-lg cursor-pointer transition-colors ${formData.delivery_method === 'digital' ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300'}`}>
                <input
                  type="radio"
                  name="delivery_method"
                  value="digital"
                  checked={formData.delivery_method === 'digital'}
                  onChange={(e) => setFormData(prev => ({ ...prev, delivery_method: e.target.value }))}
                  className="mt-1"
                />
                <div>
                  <p className="font-medium text-slate-900">Digital Delivery / Link</p>
                  <p className="text-sm text-slate-500">Immediate auto-release after confirmation</p>
                </div>
              </label>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Item Details</h3>
            <div className="space-y-4">
              <div>
                <Label htmlFor="item_description">Item Description *</Label>
                <Textarea id="item_description" name="item_description" value={formData.item_description} onChange={handleChange} placeholder="Describe the item or service..." rows={4} required data-testid="item-description-input" />
              </div>
              <div>
                <Label htmlFor="item_condition">Item Condition *</Label>
                <Select value={formData.item_condition} onValueChange={(value) => setFormData(prev => ({ ...prev, item_condition: value }))}>
                  <SelectTrigger id="item_condition" data-testid="item-condition-select">
                    <SelectValue placeholder="Select condition" />
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
              <div>
                <Label htmlFor="known_issues">Known Issues / Defects *</Label>
                <Textarea id="known_issues" name="known_issues" value={formData.known_issues} onChange={handleChange} placeholder="Describe scratches, faults, missing parts, or confirm no issues..." rows={3} required data-testid="known-issues-input" />
              </div>
              <div>
                <Label htmlFor="item_price">Item Price (R) *</Label>
                <Input id="item_price" name="item_price" type="number" step="0.01" min="500" value={formData.item_price} onChange={handleChange} placeholder="500.00" required data-testid="item-price-input" />
                <p className="text-xs text-slate-500 mt-1">Minimum transaction amount: R500</p>
              </div>
              <div>
                <Label htmlFor="fee_paid_by">Who Pays the Transaction Fee? *</Label>
                <Select value={formData.fee_paid_by} onValueChange={(value) => setFormData(prev => ({ ...prev, fee_paid_by: value }))}>
                  <SelectTrigger id="fee_paid_by" data-testid="fee-split-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="split">Split 50/50 (Recommended)</SelectItem>
                    <SelectItem value="buyer">Buyer Pays Fee</SelectItem>
                    <SelectItem value="seller">Seller Pays Fee</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-amber-600 mt-2 font-medium">
                  ⚠️ Escrow fee option must be agreed by both parties before payment.
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Upload Item Photos *</h3>
            <p className="text-sm text-slate-600 mb-4">Minimum 1 photo, Maximum 5 photos</p>
            <PhotoUploader photos={photos} setPhotos={setPhotos} minPhotos={1} maxPhotos={5} required={true} />
          </Card>

          {itemPrice > 0 && (
            <Card className="p-6 bg-slate-50 border-slate-200">
              <div className="flex items-center gap-2 mb-4">
                <Calculator className="w-5 h-5 text-primary" />
                <h3 className="text-lg font-semibold text-slate-900">Price Breakdown</h3>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Item Price:</span>
                  <span className="font-mono font-medium text-slate-900" data-testid="calc-item-price">R {itemPrice.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">TrustTrade Fee (2%):</span>
                  <span className="font-mono font-medium text-slate-900" data-testid="calc-fee">R {fee}</span>
                </div>
                <div className="border-t border-slate-300 pt-3 space-y-2">
                  <div className="flex justify-between">
                    <span className="font-medium text-slate-700">Buyer Pays:</span>
                    <span className="font-mono font-bold text-primary">R {buyerTotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium text-slate-700">Seller Receives:</span>
                    <span className="font-mono font-bold text-green-600">R {sellerTotal.toFixed(2)}</span>
                  </div>
                  {formData.fee_paid_by === 'split' && (
                    <p className="text-xs text-slate-500 mt-2">Fee split 50/50: Each pays R {(feeAmount / 2).toFixed(2)}</p>
                  )}
                </div>
              </div>
            </Card>
          )}

          <Card className="p-6 bg-blue-50 border-blue-200">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Agreement Confirmation</h3>
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <Checkbox id="buyer-details" checked={confirmations.buyer_details} onCheckedChange={(checked) => handleConfirmationChange('buyer_details', checked)} data-testid="confirm-buyer-details" />
                <label htmlFor="buyer-details" className="text-sm text-slate-700 cursor-pointer">I confirm buyer details are accurate</label>
              </div>
              <div className="flex items-start gap-3">
                <Checkbox id="seller-details" checked={confirmations.seller_details} onCheckedChange={(checked) => handleConfirmationChange('seller_details', checked)} data-testid="confirm-seller-details" />
                <label htmlFor="seller-details" className="text-sm text-slate-700 cursor-pointer">I confirm seller details are accurate</label>
              </div>
              <div className="flex items-start gap-3">
                <Checkbox id="item-accuracy" checked={confirmations.item_accuracy} onCheckedChange={(checked) => handleConfirmationChange('item_accuracy', checked)} data-testid="confirm-item-accuracy" />
                <label htmlFor="item-accuracy" className="text-sm text-slate-700 cursor-pointer">I confirm all item details are accurate and understand false claims may result in account suspension</label>
              </div>
            </div>
          </Card>

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => navigate('/dashboard')} data-testid="cancel-btn" className="flex-1">Cancel</Button>
            <Button type="submit" disabled={loading || itemPrice <= 0 || photos.length < 1} data-testid="create-transaction-btn" className="flex-1">{loading ? 'Creating...' : 'Create Transaction'}</Button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
}

export default NewTransaction;