import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Card } from '../components/ui/card';
import axios from 'axios';
import { toast } from 'sonner';
import { ArrowLeft, Calculator } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function NewTransaction() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    seller_name: '',
    seller_email: '',
    item_description: '',
    item_price: ''
  });
  const navigate = useNavigate();

  useEffect(() => {
    fetchUser();
  }, []);

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

  const itemPrice = parseFloat(formData.item_price) || 0;
  const fee = (itemPrice * 0.02).toFixed(2);
  const total = (itemPrice * 1.02).toFixed(2);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.seller_name || !formData.seller_email || !formData.item_description || !formData.item_price) {
      toast.error('Please fill in all fields');
      return;
    }

    if (itemPrice <= 0) {
      toast.error('Item price must be greater than 0');
      return;
    }

    setLoading(true);

    try {
      await axios.post(
        `${API}/transactions`,
        {
          seller_name: formData.seller_name,
          seller_email: formData.seller_email,
          item_description: formData.item_description,
          item_price: itemPrice
        },
        { withCredentials: true }
      );

      toast.success('Transaction created successfully');
      navigate('/transactions');
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
      <div className="max-w-3xl mx-auto">
        <Button
          variant="ghost"
          onClick={() => navigate('/dashboard')}
          data-testid="back-to-dashboard-btn"
          className="mb-6"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Dashboard
        </Button>

        <div className="mb-6">
          <h1 className="text-3xl font-bold text-slate-900">New Transaction</h1>
          <p className="text-slate-600 mt-2">Create a secure escrow transaction</p>
        </div>

        <Card className="p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Buyer Info */}
            <div>
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Buyer Information</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label>Buyer Name</Label>
                  <Input
                    value={user.name}
                    disabled
                    className="bg-slate-50"
                    data-testid="buyer-name-input"
                  />
                </div>
                <div>
                  <Label>Buyer Email</Label>
                  <Input
                    value={user.email}
                    disabled
                    className="bg-slate-50"
                    data-testid="buyer-email-input"
                  />
                </div>
              </div>
            </div>

            {/* Seller Info */}
            <div>
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Seller Information</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="seller_name">Seller Name *</Label>
                  <Input
                    id="seller_name"
                    name="seller_name"
                    value={formData.seller_name}
                    onChange={handleChange}
                    placeholder="Enter seller name"
                    required
                    data-testid="seller-name-input"
                  />
                </div>
                <div>
                  <Label htmlFor="seller_email">Seller Email *</Label>
                  <Input
                    id="seller_email"
                    name="seller_email"
                    type="email"
                    value={formData.seller_email}
                    onChange={handleChange}
                    placeholder="seller@example.com"
                    required
                    data-testid="seller-email-input"
                  />
                </div>
              </div>
            </div>

            {/* Item Details */}
            <div>
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Item Details</h3>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="item_description">Item Description *</Label>
                  <Textarea
                    id="item_description"
                    name="item_description"
                    value={formData.item_description}
                    onChange={handleChange}
                    placeholder="Describe the item or service..."
                    rows={4}
                    required
                    data-testid="item-description-input"
                  />
                </div>
                <div>
                  <Label htmlFor="item_price">Item Price (R) *</Label>
                  <Input
                    id="item_price"
                    name="item_price"
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={formData.item_price}
                    onChange={handleChange}
                    placeholder="0.00"
                    required
                    data-testid="item-price-input"
                  />
                </div>
              </div>
            </div>

            {/* Price Calculator */}
            {itemPrice > 0 && (
              <div className="bg-slate-50 rounded-lg p-6 border border-slate-200">
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
                  <div className="border-t border-slate-300 pt-3 flex justify-between">
                    <span className="font-semibold text-slate-900">Total:</span>
                    <span className="font-mono font-bold text-primary text-lg" data-testid="calc-total">R {total}</span>
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate('/dashboard')}
                data-testid="cancel-btn"
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={loading || itemPrice <= 0}
                data-testid="create-transaction-btn"
                className="flex-1"
              >
                {loading ? 'Creating...' : 'Create Transaction'}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </DashboardLayout>
  );
}

export default NewTransaction;