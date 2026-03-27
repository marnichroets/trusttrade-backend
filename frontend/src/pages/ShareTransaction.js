import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import api, { API_URL } from '../utils/api';
import axios from 'axios';
import { toast } from 'sonner';
import { ShieldCheck, Package, User, ArrowRight, Copy, CheckCircle, Loader2, Clock } from 'lucide-react';

function ShareTransaction() {
  const [transaction, setTransaction] = useState(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [user, setUser] = useState(null);
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  const { shareCode } = useParams();

  useEffect(() => {
    fetchData();
  }, [shareCode]);

  const fetchData = async () => {
    try {
      // Try to get user (may not be logged in)
      try {
        const userRes = await api.get('/auth/me');
        setUser(userRes.data);
      } catch (e) {
        // Not logged in
        setUser(null);
      }

      // Get transaction preview (public endpoint - use raw axios)
      const txnRes = await axios.get(`${API_URL}/share/${shareCode}`);
      setTransaction(txnRes.data);
    } catch (error) {
      console.error('Failed to fetch transaction:', error);
      setError(error.response?.data?.detail || 'Transaction not found');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = () => {
    // Store the share code to redirect back after login
    sessionStorage.setItem('pendingShareCode', shareCode);
    const redirectUrl = window.location.origin;
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  const handleJoinTransaction = async () => {
    if (!user) {
      handleLogin();
      return;
    }

    setJoining(true);
    try {
      const response = await api.post(`/share/${shareCode}/join`, {});
      
      toast.success('Successfully joined transaction!');
      navigate(`/transactions/${response.data.transaction_id}`);
    } catch (error) {
      console.error('Failed to join transaction:', error);
      toast.error(error.response?.data?.detail || 'Failed to join transaction');
    } finally {
      setJoining(false);
    }
  };

  const getStatusColor = (status) => {
    const colors = {
      'Pending Seller Confirmation': 'bg-orange-100 text-orange-800',
      'Pending Buyer Confirmation': 'bg-orange-100 text-orange-800',
      'Ready for Payment': 'bg-blue-100 text-blue-800',
      'Paid': 'bg-green-100 text-green-800',
      'Released': 'bg-green-100 text-green-800'
    };
    return colors[status] || 'bg-slate-100 text-slate-600';
  };

  const getFeePayerLabel = (feePayer) => {
    switch(feePayer) {
      case 'buyer': return 'Buyer pays fee';
      case 'seller': return 'Seller pays fee';
      case 'split': return 'Fee split 50/50';
      default: return 'Fee split 50/50';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-white">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-primary animate-spin mx-auto mb-4" />
          <p className="text-slate-600">Loading transaction...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-white">
        <Card className="p-8 max-w-md text-center">
          <ShieldCheck className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Transaction Not Found</h1>
          <p className="text-slate-600 mb-6">{error}</p>
          <Button onClick={() => navigate('/')}>Go to Homepage</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-white">
      {/* Header */}
      <nav className="border-b border-slate-200 bg-white/80 backdrop-blur-md">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <img 
                src="/trusttrade-logo.png" 
                alt="TrustTrade" 
                className="h-12 object-contain"
              />
            </div>
            {user ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-600">{user.name}</span>
                {user.picture && (
                  <img src={user.picture} alt={user.name} className="w-8 h-8 rounded-full" />
                )}
              </div>
            ) : (
              <Button variant="outline" size="sm" onClick={handleLogin}>
                Sign In
              </Button>
            )}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 bg-green-100 text-green-800 px-4 py-2 rounded-full text-sm font-medium mb-4">
            <ShieldCheck className="w-4 h-4" />
            This transaction is protected by TrustTrade escrow.
          </div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">You've Been Invited to a Transaction</h1>
          <p className="text-slate-600">Review the details below and join to participate</p>
          <div className="mt-3 inline-flex items-center gap-2 text-slate-500 text-sm">
            <Clock className="w-4 h-4" />
            Funds released daily at 10:00 & 15:00
          </div>
        </div>

        <Card className="p-6 mb-6">
          <div className="flex items-center justify-between mb-6">
            <Badge className={getStatusColor(transaction.payment_status)}>
              {transaction.payment_status}
            </Badge>
            <span className="text-sm text-slate-500 font-mono">{transaction.share_code}</span>
          </div>

          <div className="space-y-6">
            {/* Item Details */}
            <div>
              <div className="flex items-center gap-2 text-sm text-slate-500 mb-2">
                <Package className="w-4 h-4" />
                Item Description
              </div>
              <p className="text-slate-900 font-medium">{transaction.item_description}</p>
              {transaction.item_condition && (
                <Badge className="mt-2 bg-slate-100 text-slate-700">{transaction.item_condition}</Badge>
              )}
            </div>

            {/* Parties */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-50 rounded-lg p-4">
                <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
                  <User className="w-4 h-4" />
                  Buyer
                </div>
                <p className="font-medium text-slate-900">{transaction.buyer_name}</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-4">
                <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
                  <User className="w-4 h-4" />
                  Seller
                </div>
                <p className="font-medium text-slate-900">{transaction.seller_name}</p>
              </div>
            </div>

            {/* Price Summary */}
            <div className="bg-primary/5 rounded-lg p-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Item Price:</span>
                  <span className="font-mono font-medium">R {transaction.item_price.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">TrustTrade Fee (2%):</span>
                  <span className="font-mono font-medium">R {transaction.trusttrade_fee.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Fee Paid By:</span>
                  <Badge className="bg-blue-100 text-blue-800">{getFeePayerLabel(transaction.fee_paid_by)}</Badge>
                </div>
                <div className="border-t border-slate-200 pt-2 mt-2 flex justify-between">
                  <span className="font-semibold">Total:</span>
                  <span className="font-mono font-bold text-primary text-xl">R {transaction.total.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Action Button */}
        <div className="text-center">
          {user ? (
            <Button 
              size="lg" 
              onClick={handleJoinTransaction} 
              disabled={joining}
              className="px-8"
              data-testid="join-transaction-btn"
            >
              {joining ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Joining...
                </>
              ) : (
                <>
                  Join Transaction
                  <ArrowRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          ) : (
            <div className="space-y-4">
              <Button 
                size="lg" 
                onClick={handleLogin}
                className="px-8"
                data-testid="sign-in-to-join-btn"
              >
                Sign In to Join
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
              <p className="text-sm text-slate-500">
                You need to sign in with your email to participate in this transaction
              </p>
            </div>
          )}
        </div>

        {/* Trust Info */}
        <div className="mt-12 text-center">
          <div className="inline-flex items-center gap-6 text-sm text-slate-500">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500" />
              Secure Escrow
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500" />
              Buyer Protection
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500" />
              2% Fee Only
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ShareTransaction;
