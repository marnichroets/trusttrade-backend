import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Checkbox } from '../components/ui/checkbox';
import axios from 'axios';
import { toast } from 'sonner';
import { ArrowLeft, FileText, User, Mail, Calendar, Package } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function TransactionDetail() {
  const [user, setUser] = useState(null);
  const [transaction, setTransaction] = useState(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const navigate = useNavigate();
  const { transactionId } = useParams();

  useEffect(() => {
    fetchData();
  }, [transactionId]);

  const fetchData = async () => {
    try {
      const [userRes, transactionRes] = await Promise.all([
        axios.get(`${API}/auth/me`, { withCredentials: true }),
        axios.get(`${API}/transactions/${transactionId}`, { withCredentials: true })
      ]);

      setUser(userRes.data);
      setTransaction(transactionRes.data);
    } catch (error) {
      console.error('Failed to fetch transaction:', error);
      toast.error('Transaction not found');
      navigate('/transactions');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmDelivery = async () => {
    if (!confirm('Are you sure you want to confirm delivery and release the funds to the seller?')) {
      return;
    }

    setConfirming(true);
    try {
      await axios.patch(
        `${API}/transactions/${transactionId}/delivery`,
        { delivery_confirmed: true },
        { withCredentials: true }
      );

      toast.success('Delivery confirmed and funds released!');
      fetchData(); // Refresh data
    } catch (error) {
      console.error('Failed to confirm delivery:', error);
      toast.error(error.response?.data?.detail || 'Failed to confirm delivery');
    } finally {
      setConfirming(false);
    }
  };

  const getStatusBadge = (status) => {
    const variants = {
      'Pending': 'bg-yellow-100 text-yellow-800',
      'Paid': 'bg-green-100 text-green-800',
      'Released': 'bg-green-100 text-green-800'
    };
    return variants[status] || 'bg-slate-100 text-slate-600';
  };

  const getReleaseStatusBadge = (status) => {
    const variants = {
      'Not Released': 'bg-slate-100 text-slate-600',
      'Released': 'bg-green-100 text-green-800'
    };
    return variants[status] || 'bg-slate-100 text-slate-600';
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!transaction) {
    return null;
  }

  const isBuyer = user?.user_id === transaction.buyer_user_id || user?.email === transaction.buyer_email;
  const canConfirmDelivery = isBuyer && !transaction.delivery_confirmed && transaction.payment_status !== 'Released';

  return (
    <DashboardLayout user={user}>
      <div className="max-w-4xl mx-auto space-y-6">
        <Button
          variant="ghost"
          onClick={() => navigate('/transactions')}
          data-testid="back-to-transactions-btn"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Transactions
        </Button>

        <div>
          <h1 className="text-3xl font-bold text-slate-900" data-testid="transaction-detail-title">Transaction Details</h1>
          <p className="text-slate-600 mt-2 font-mono text-sm">{transaction.transaction_id}</p>
        </div>

        {/* Status Overview */}
        <Card className="p-6">
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <p className="text-sm text-slate-600 mb-2">Payment Status</p>
              <Badge className={`${getStatusBadge(transaction.payment_status)} text-base px-3 py-1`} data-testid="payment-status">
                {transaction.payment_status}
              </Badge>
            </div>
            <div>
              <p className="text-sm text-slate-600 mb-2">Release Status</p>
              <Badge className={`${getReleaseStatusBadge(transaction.release_status)} text-base px-3 py-1`} data-testid="release-status">
                {transaction.release_status}
              </Badge>
            </div>
          </div>
        </Card>

        {/* Buyer & Seller Info */}
        <div className="grid md:grid-cols-2 gap-6">
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <User className="w-5 h-5 text-primary" />
              Buyer Information
            </h3>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-slate-500 mb-1">Name</p>
                <p className="text-sm font-medium text-slate-900" data-testid="buyer-name">{transaction.buyer_name}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Email</p>
                <p className="text-sm text-slate-700 flex items-center gap-2">
                  <Mail className="w-4 h-4 text-slate-400" />
                  <span data-testid="buyer-email">{transaction.buyer_email}</span>
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <User className="w-5 h-5 text-primary" />
              Seller Information
            </h3>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-slate-500 mb-1">Name</p>
                <p className="text-sm font-medium text-slate-900" data-testid="seller-name">{transaction.seller_name}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Email</p>
                <p className="text-sm text-slate-700 flex items-center gap-2">
                  <Mail className="w-4 h-4 text-slate-400" />
                  <span data-testid="seller-email">{transaction.seller_email}</span>
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* Item Details */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <Package className="w-5 h-5 text-primary" />
            Item Details
          </h3>
          <div className="space-y-3">
            <div>
              <p className="text-xs text-slate-500 mb-1">Description</p>
              <p className="text-sm text-slate-700 whitespace-pre-wrap" data-testid="item-description">{transaction.item_description}</p>
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <Calendar className="w-4 h-4" />
              <span>Created on {new Date(transaction.created_at).toLocaleString()}</span>
            </div>
          </div>
        </Card>

        {/* Price Summary */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Price Summary</h3>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">Item Price:</span>
              <span className="font-mono font-medium text-slate-900" data-testid="item-price">R {transaction.item_price.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">TrustTrade Fee (2%):</span>
              <span className="font-mono font-medium text-slate-900" data-testid="fee">R {transaction.trusttrade_fee.toFixed(2)}</span>
            </div>
            <div className="border-t border-slate-200 pt-3 flex justify-between">
              <span className="font-semibold text-slate-900">Total:</span>
              <span className="font-mono font-bold text-primary text-xl" data-testid="total">R {transaction.total.toFixed(2)}</span>
            </div>
          </div>
        </Card>

        {/* Delivery Confirmation */}
        {canConfirmDelivery && (
          <Card className="p-6 bg-blue-50 border-blue-200">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Confirm Delivery</h3>
            <p className="text-sm text-slate-600 mb-4">
              Have you received the item/service and are satisfied? Confirming delivery will release the funds to the seller.
            </p>
            <Button
              onClick={handleConfirmDelivery}
              disabled={confirming}
              data-testid="confirm-delivery-btn"
              className="w-full md:w-auto"
            >
              {confirming ? 'Processing...' : 'Confirm Delivery & Release Funds'}
            </Button>
          </Card>
        )}

        {transaction.delivery_confirmed && (
          <Card className="p-6 bg-green-50 border-green-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <p className="font-semibold text-green-900">Delivery Confirmed</p>
                <p className="text-sm text-green-700">Funds have been released to the seller</p>
              </div>
            </div>
          </Card>
        )}

        {/* Raise Dispute */}
        {!transaction.delivery_confirmed && (
          <Card className="p-6">
            <p className="text-sm text-slate-600 mb-3">Having issues with this transaction?</p>
            <Button
              variant="outline"
              onClick={() => navigate('/disputes', { state: { transactionId: transaction.transaction_id } })}
              data-testid="raise-dispute-btn"
            >
              <FileText className="w-4 h-4 mr-2" />
              Raise a Dispute
            </Button>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}

export default TransactionDetail;