import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import axios from 'axios';
import { Plus, FileText, AlertCircle, TrendingUp, ShieldCheck, Wallet, Users, Lock, Eye, EyeOff } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Helper to format currency with security (rounded for users)
const formatSecureAmount = (amount, isAdmin = false) => {
  if (isAdmin) {
    return `R ${amount.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  
  // Round to nearest thousand for security
  if (amount >= 1000000) {
    return `R ${(amount / 1000000).toFixed(1)}M+`;
  } else if (amount >= 1000) {
    return `R ${Math.floor(amount / 1000)}k+`;
  } else {
    return `R ${Math.floor(amount / 100) * 100}+`;
  }
};

function Dashboard() {
  const [user, setUser] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [disputes, setDisputes] = useState([]);
  const [platformStats, setPlatformStats] = useState(null);
  const [adminData, setAdminData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showExactValues, setShowExactValues] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const [userRes, transactionsRes, disputesRes, statsRes] = await Promise.all([
        axios.get(`${API}/auth/me`, { withCredentials: true }),
        axios.get(`${API}/transactions`, { withCredentials: true }),
        axios.get(`${API}/disputes`, { withCredentials: true }),
        axios.get(`${API}/platform/stats`, { withCredentials: true })
      ]);

      setUser(userRes.data);
      setTransactions(transactionsRes.data);
      setDisputes(disputesRes.data);
      setPlatformStats(statsRes.data);

      // Fetch admin-only data if user is admin
      if (userRes.data.is_admin) {
        try {
          const [adminStatsRes, escrowDetailsRes] = await Promise.all([
            axios.get(`${API}/admin/stats`, { withCredentials: true }),
            axios.get(`${API}/admin/escrow-details`, { withCredentials: true }).catch(() => ({ data: null }))
          ]);
          setAdminData({
            ...adminStatsRes.data,
            escrowDetails: escrowDetailsRes.data
          });
        } catch (e) {
          console.log('Admin data fetch failed:', e);
        }
      }
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
      navigate('/');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const pendingTransactions = transactions.filter(t => 
    t.payment_status !== 'Released' && t.payment_status !== 'Cancelled'
  );
  const activeTransactions = transactions.filter(t => 
    t.payment_status !== 'Released' && t.payment_status !== 'Cancelled' && t.payment_status !== 'Refunded'
  );
  const pendingConfirmations = transactions.filter(t => 
    !t.seller_confirmed || t.payment_status === 'Ready for Payment'
  );
  const pendingDisputes = disputes.filter(d => d.status === 'Pending');
  const recentTransactions = transactions.slice(0, 5);

  // Calculate total escrow value
  const totalEscrowValue = transactions
    .filter(t => t.payment_status === 'Paid' || t.release_status === 'Not Released')
    .reduce((sum, t) => sum + (t.total || 0), 0);

  const getStatusBadge = (status) => {
    const variants = {
      'Pending': 'bg-yellow-100 text-yellow-800',
      'Pending Seller Confirmation': 'bg-orange-100 text-orange-800',
      'Ready for Payment': 'bg-blue-100 text-blue-800',
      'Paid': 'bg-green-100 text-green-800',
      'Released': 'bg-green-100 text-green-800',
      'Not Released': 'bg-slate-100 text-slate-600'
    };
    return variants[status] || 'bg-slate-100 text-slate-600';
  };

  return (
    <DashboardLayout user={user}>
      <div className="space-y-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-slate-900" data-testid="dashboard-title">Dashboard</h1>
            <p className="text-slate-600 mt-2">Welcome back, {user?.name}</p>
          </div>
          {user?.is_admin && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowExactValues(!showExactValues)}
              className="flex items-center gap-2"
            >
              {showExactValues ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              {showExactValues ? 'Hide Exact Values' : 'Show Exact Values'}
            </Button>
          )}
        </div>

        {/* Platform Stats - User View */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="p-4 hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-primary" />
              </div>
            </div>
            <p className="text-2xl font-bold text-slate-900" data-testid="active-transactions">
              {platformStats?.active_transactions || activeTransactions.length}
            </p>
            <p className="text-sm text-slate-500">Active Transactions</p>
          </Card>

          <Card className="p-4 hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-orange-600" />
              </div>
            </div>
            <p className="text-2xl font-bold text-slate-900" data-testid="pending-confirmations">
              {platformStats?.pending_confirmations || pendingConfirmations.length}
            </p>
            <p className="text-sm text-slate-500">Pending Confirmations</p>
          </Card>

          <Card className="p-4 hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <ShieldCheck className="w-5 h-5 text-blue-600" />
              </div>
            </div>
            <p className="text-2xl font-bold text-slate-900" data-testid="verified-users">
              {platformStats?.verified_users || 0}
            </p>
            <p className="text-sm text-slate-500">Verified Users</p>
          </Card>

          <Card className="p-4 hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <Wallet className="w-5 h-5 text-green-600" />
              </div>
            </div>
            <p className="text-2xl font-bold text-green-600" data-testid="total-escrow">
              {formatSecureAmount(platformStats?.total_escrow_value || totalEscrowValue, user?.is_admin && showExactValues)}
            </p>
            <p className="text-sm text-slate-500 flex items-center gap-1">
              Total Escrow Value
              {!user?.is_admin && <Lock className="w-3 h-3" />}
            </p>
          </Card>
        </div>

        {/* Admin-Only Section */}
        {user?.is_admin && (
          <Card className="p-6 bg-slate-50 border-slate-200">
            <div className="flex items-center gap-2 mb-4">
              <Lock className="w-5 h-5 text-slate-600" />
              <h2 className="text-lg font-semibold text-slate-900">Admin View</h2>
              <Badge className="bg-slate-200 text-slate-700">Confidential</Badge>
            </div>

            <div className="grid md:grid-cols-3 gap-4 mb-6">
              <div className="bg-white rounded-lg p-4">
                <p className="text-sm text-slate-500 mb-1">Total Escrow Value (All Time)</p>
                <p className="text-xl font-bold text-slate-900">
                  {formatSecureAmount(platformStats?.total_escrow_value || 0, false)}
                </p>
              </div>
              <div className="bg-white rounded-lg p-4">
                <p className="text-sm text-slate-500 mb-1">Total Users</p>
                <p className="text-xl font-bold text-slate-900">{platformStats?.total_users || 0}</p>
              </div>
              <div className="bg-white rounded-lg p-4">
                <p className="text-sm text-slate-500 mb-1">Open Disputes</p>
                <p className="text-xl font-bold text-red-600">{platformStats?.pending_disputes || pendingDisputes.length}</p>
              </div>
            </div>

            {/* Escrow Details per Transaction */}
            {showExactValues && transactions.filter(t => t.payment_status === 'Paid').length > 0 && (
              <div className="bg-white rounded-lg p-4">
                <h3 className="font-medium text-slate-900 mb-3 flex items-center gap-2">
                  <Wallet className="w-4 h-4" />
                  Funds Currently in Escrow
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left border-b border-slate-200">
                        <th className="pb-2 font-medium text-slate-600">Transaction</th>
                        <th className="pb-2 font-medium text-slate-600">Buyer</th>
                        <th className="pb-2 font-medium text-slate-600">Seller</th>
                        <th className="pb-2 font-medium text-slate-600 text-right">Amount in Escrow</th>
                        <th className="pb-2 font-medium text-slate-600 text-right">Payable to Seller</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transactions
                        .filter(t => t.payment_status === 'Paid')
                        .map((t) => {
                          const payableToSeller = t.fee_paid_by === 'seller' 
                            ? t.item_price - t.trusttrade_fee 
                            : t.fee_paid_by === 'split'
                            ? t.item_price - (t.trusttrade_fee / 2)
                            : t.item_price;
                          
                          return (
                            <tr key={t.transaction_id} className="border-b border-slate-100">
                              <td className="py-2 font-mono text-xs">{t.share_code || t.transaction_id.slice(-8)}</td>
                              <td className="py-2">{t.buyer_name}</td>
                              <td className="py-2">{t.seller_name}</td>
                              <td className="py-2 text-right font-mono">R {t.total.toFixed(2)}</td>
                              <td className="py-2 text-right font-mono text-green-600">R {payableToSeller.toFixed(2)}</td>
                            </tr>
                          );
                        })}
                    </tbody>
                    <tfoot>
                      <tr className="font-medium">
                        <td colSpan="3" className="pt-3">Total</td>
                        <td className="pt-3 text-right font-mono">
                          R {transactions
                            .filter(t => t.payment_status === 'Paid')
                            .reduce((sum, t) => sum + t.total, 0)
                            .toFixed(2)}
                        </td>
                        <td className="pt-3 text-right font-mono text-green-600">
                          R {transactions
                            .filter(t => t.payment_status === 'Paid')
                            .reduce((sum, t) => {
                              const payable = t.fee_paid_by === 'seller' 
                                ? t.item_price - t.trusttrade_fee 
                                : t.fee_paid_by === 'split'
                                ? t.item_price - (t.trusttrade_fee / 2)
                                : t.item_price;
                              return sum + payable;
                            }, 0)
                            .toFixed(2)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            <div className="flex gap-3 mt-4">
              <Button variant="outline" size="sm" onClick={() => navigate('/admin')}>
                Full Admin Dashboard
              </Button>
              <Button variant="outline" size="sm" onClick={() => navigate('/activity')}>
                Live Activity Board
              </Button>
            </div>
          </Card>
        )}

        {/* Quick Actions */}
        <Card className="p-6">
          <h2 className="text-xl font-semibold text-slate-900 mb-4">Quick Actions</h2>
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={() => navigate('/transactions/new')}
              data-testid="quick-action-new-transaction"
              className="hover:scale-[1.02] transition-all duration-200 active:scale-95"
            >
              <Plus className="w-4 h-4 mr-2" />
              New Transaction
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate('/transactions')}
              data-testid="quick-action-view-transactions"
            >
              <FileText className="w-4 h-4 mr-2" />
              View All Transactions
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate('/disputes')}
              data-testid="quick-action-view-disputes"
            >
              <AlertCircle className="w-4 h-4 mr-2" />
              View Disputes
            </Button>
          </div>
        </Card>

        {/* Recent Transactions */}
        <Card className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-slate-900">Recent Transactions</h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/transactions')}
              data-testid="view-all-transactions-link"
            >
              View All
            </Button>
          </div>
          {recentTransactions.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500 mb-4">No transactions yet</p>
              <Button
                onClick={() => navigate('/transactions/new')}
                data-testid="empty-state-create-transaction"
              >
                Create Your First Transaction
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b border-slate-200">
                    <th className="pb-3 font-medium text-slate-600">Reference</th>
                    <th className="pb-3 font-medium text-slate-600">Buyer</th>
                    <th className="pb-3 font-medium text-slate-600">Seller</th>
                    <th className="pb-3 font-medium text-slate-600">Amount</th>
                    <th className="pb-3 font-medium text-slate-600">Status</th>
                    <th className="pb-3 font-medium text-slate-600">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTransactions.map((transaction) => (
                    <tr
                      key={transaction.transaction_id}
                      onClick={() => navigate(`/transactions/${transaction.transaction_id}`)}
                      className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors"
                      data-testid={`transaction-row-${transaction.transaction_id}`}
                    >
                      <td className="py-3 font-mono text-xs text-primary">{transaction.share_code || '-'}</td>
                      <td className="py-3">{transaction.buyer_name}</td>
                      <td className="py-3">{transaction.seller_name}</td>
                      <td className="py-3 font-mono">R {transaction.item_price.toFixed(2)}</td>
                      <td className="py-3">
                        <span className="inline-block">
                          <Badge className={getStatusBadge(transaction.payment_status)}>
                            {transaction.payment_status}
                          </Badge>
                        </span>
                      </td>
                      <td className="py-3 text-slate-500">
                        {new Date(transaction.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </DashboardLayout>
  );
}

export default Dashboard;
