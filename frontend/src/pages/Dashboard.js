import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import api from '../utils/api';
import { Plus, FileText, AlertCircle, TrendingUp, ShieldCheck, Wallet, Lock, Eye, EyeOff, CreditCard, ArrowRight, Clock, Shield, Banknote, CheckCircle } from 'lucide-react';

function Dashboard() {
  const [user, setUser] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [disputes, setDisputes] = useState([]);
  const [platformStats, setPlatformStats] = useState(null);
  const [adminData, setAdminData] = useState(null);
  const [walletData, setWalletData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showExactValues, setShowExactValues] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const [userRes, transactionsRes, disputesRes, statsRes, walletRes] = await Promise.all([
        api.get('/auth/me'),
        api.get('/transactions'),
        api.get('/disputes'),
        api.get('/platform/stats'),
        api.get('/wallet').catch(() => ({ data: null }))
      ]);

      setUser(userRes.data);
      setTransactions(transactionsRes.data);
      setDisputes(disputesRes.data);
      setPlatformStats(statsRes.data);
      if (walletRes.data) setWalletData(walletRes.data);

      if (userRes.data.is_admin) {
        try {
          const [adminStatsRes, escrowDetailsRes] = await Promise.all([
            api.get('/admin/stats'),
            api.get('/admin/escrow-details').catch(() => ({ data: null }))
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
        <div className="w-8 h-8 border-3 border-slate-900 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const activeTransactions = transactions.filter(t => 
    t.payment_status !== 'Released' && t.payment_status !== 'Cancelled' && t.payment_status !== 'Refunded'
  );
  const pendingConfirmations = transactions.filter(t => 
    !t.seller_confirmed || t.payment_status === 'Ready for Payment'
  );
  const pendingDisputes = disputes.filter(d => d.status === 'Pending');
  const recentTransactions = transactions.slice(0, 5);

  const totalEscrowValue = transactions
    .filter(t => t.payment_status === 'Paid' || t.release_status === 'Not Released')
    .reduce((sum, t) => sum + (t.total || 0), 0);

  const getStatusBadge = (status) => {
    const variants = {
      'Pending': 'bg-amber-100 text-amber-700 border-amber-200',
      'Pending Seller Confirmation': 'bg-orange-100 text-orange-700 border-orange-200',
      'Ready for Payment': 'bg-blue-100 text-blue-700 border-blue-200',
      'Awaiting Payment': 'bg-blue-100 text-blue-700 border-blue-200',
      'Paid': 'bg-emerald-100 text-emerald-700 border-emerald-200',
      'Funds Secured': 'bg-emerald-100 text-emerald-700 border-emerald-200',
      'Delivery in Progress': 'bg-purple-100 text-purple-700 border-purple-200',
      'Released': 'bg-green-100 text-green-700 border-green-200',
      'Completed': 'bg-green-100 text-green-700 border-green-200'
    };
    return variants[status] || 'bg-slate-100 text-slate-600 border-slate-200';
  };

  return (
    <DashboardLayout user={user}>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold text-slate-900" data-testid="dashboard-title">Dashboard</h1>
            <p className="text-sm text-slate-500 mt-1">Welcome back, {user?.name}</p>
          </div>
          {user?.is_admin && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowExactValues(!showExactValues)}
              className="text-xs h-8"
            >
              {showExactValues ? <EyeOff className="w-3 h-3 mr-1" /> : <Eye className="w-3 h-3 mr-1" />}
              {showExactValues ? 'Hide Values' : 'Show Values'}
            </Button>
          )}
        </div>

        {/* Escrow Protection Banner - Compact */}
        <div className="bg-slate-900 text-white rounded-lg px-4 py-3 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Shield className="w-5 h-5 text-emerald-400" />
            <div>
              <p className="text-sm font-medium">All transactions protected by TrustTrade Escrow</p>
              <p className="text-xs text-slate-400">Funds only released when you confirm delivery</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Clock className="w-3.5 h-3.5" />
            <span>Payouts: <strong className="text-white">10:00</strong> & <strong className="text-white">15:00</strong> daily</span>
          </div>
        </div>

        {/* Quick Stats - Compact Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4 text-blue-600" />
              <span className="text-xs text-slate-500">Active</span>
            </div>
            <p className="text-2xl font-bold text-slate-900" data-testid="active-transactions">
              {platformStats?.active_transactions || activeTransactions.length}
            </p>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <AlertCircle className="w-4 h-4 text-amber-600" />
              <span className="text-xs text-slate-500">Pending</span>
            </div>
            <p className="text-2xl font-bold text-slate-900" data-testid="pending-confirmations">
              {platformStats?.pending_confirmations || pendingConfirmations.length}
            </p>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span className="text-xs text-slate-500">Verified</span>
            </div>
            <p className="text-2xl font-bold text-slate-900" data-testid="verified-users">
              {platformStats?.verified_users || 0}
            </p>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Lock className="w-4 h-4 text-slate-600" />
              <span className="text-xs text-slate-500">In Escrow</span>
            </div>
            <p className="text-2xl font-bold text-emerald-600" data-testid="total-escrow">
              R {totalEscrowValue.toLocaleString('en-ZA', { minimumFractionDigits: 0 })}
            </p>
          </Card>
        </div>

        {/* Wallet Section - Clear Breakdown */}
        {walletData && (
          <Card className="p-5 bg-gradient-to-br from-emerald-50 to-slate-50 border-emerald-200">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Wallet className="w-5 h-5 text-emerald-600" />
                <span className="font-semibold text-slate-900">My Wallet</span>
              </div>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => navigate('/settings/banking')}
                className="text-xs h-8"
              >
                <CreditCard className="w-3 h-3 mr-1" />
                Banking Details
              </Button>
            </div>

            {/* Three Column Wallet */}
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="bg-white rounded-lg p-3 border border-slate-100">
                <div className="flex items-center gap-1.5 mb-1">
                  <Banknote className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-xs text-slate-500">Available</span>
                </div>
                <p className="text-xl font-bold text-emerald-600">
                  R {walletData.balance.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">Ready for payout</p>
              </div>
              
              <div className="bg-white rounded-lg p-3 border border-slate-100">
                <div className="flex items-center gap-1.5 mb-1">
                  <Lock className="w-3.5 h-3.5 text-amber-600" />
                  <span className="text-xs text-slate-500">In Escrow</span>
                </div>
                <p className="text-xl font-bold text-amber-600">
                  R {walletData.pending_balance.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">Awaiting buyer confirmation</p>
              </div>
              
              <div className="bg-white rounded-lg p-3 border border-slate-100">
                <div className="flex items-center gap-1.5 mb-1">
                  <TrendingUp className="w-3.5 h-3.5 text-slate-600" />
                  <span className="text-xs text-slate-500">Total Earned</span>
                </div>
                <p className="text-xl font-bold text-slate-700">
                  R {walletData.total_earned.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">All time</p>
              </div>
            </div>

            {/* Payout Info */}
            <div className="bg-white rounded-lg p-3 border border-slate-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-slate-400" />
                  <span className="text-sm text-slate-600">Bank payout within <strong>1-2 business days</strong> after release</span>
                </div>
                {!walletData.banking_details_set && (
                  <span className="text-xs text-amber-600 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    Add banking details
                  </span>
                )}
              </div>
            </div>
          </Card>
        )}

        {/* Active Escrow Transactions */}
        {activeTransactions.length > 0 && (
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-blue-600" />
                <span className="font-semibold text-slate-900">Active Escrow</span>
                <span className="text-xs text-emerald-600 flex items-center gap-1 ml-2">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                  Live
                </span>
              </div>
            </div>

            <div className="space-y-2">
              {activeTransactions.slice(0, 5).map((t) => {
                const isUserBuyer = t.buyer_user_id === user?.user_id;
                const role = isUserBuyer ? 'Buyer' : 'Seller';
                const otherParty = isUserBuyer ? t.seller_name : t.buyer_name;
                
                return (
                  <div 
                    key={t.transaction_id}
                    onClick={() => navigate(`/transactions/${t.transaction_id}`)}
                    className="flex items-center justify-between p-3 bg-slate-50 rounded-lg hover:bg-slate-100 cursor-pointer transition-colors border border-slate-100"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        t.payment_status === 'Paid' || t.payment_status === 'Funds Secured' ? 'bg-emerald-500' : 
                        t.payment_status === 'Ready for Payment' || t.payment_status === 'Awaiting Payment' ? 'bg-blue-500' : 
                        'bg-amber-500'
                      }`}></div>
                      <div>
                        <p className="font-medium text-slate-900 text-sm leading-tight">
                          {t.item_description.slice(0, 35)}{t.item_description.length > 35 ? '...' : ''}
                        </p>
                        <p className="text-xs text-slate-500">
                          {role} • {otherParty} • <span className="font-mono">{t.share_code}</span>
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-mono font-semibold text-slate-900 text-sm">R {t.item_price.toFixed(2)}</p>
                      <Badge className={`text-[10px] px-1.5 py-0 ${getStatusBadge(t.payment_status)} border`}>
                        {t.payment_status}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>

            {activeTransactions.length > 5 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/transactions')}
                className="w-full mt-3 text-xs"
              >
                View all {activeTransactions.length} transactions
                <ArrowRight className="w-3 h-3 ml-1" />
              </Button>
            )}
          </Card>
        )}

        {/* Quick Actions - Compact */}
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="font-semibold text-slate-900 text-sm">Quick Actions</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => navigate('/transactions/new')}
              className="bg-blue-600 hover:bg-blue-700 h-9 text-sm"
              data-testid="quick-action-new-transaction"
            >
              <Plus className="w-4 h-4 mr-1" />
              New Transaction
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate('/transactions')}
              className="h-9 text-sm"
              data-testid="quick-action-view-transactions"
            >
              <FileText className="w-4 h-4 mr-1" />
              All Transactions
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate('/disputes')}
              className="h-9 text-sm"
              data-testid="quick-action-view-disputes"
            >
              <AlertCircle className="w-4 h-4 mr-1" />
              Disputes
            </Button>
          </div>
        </Card>

        {/* Recent Transactions Table */}
        <Card className="p-5">
          <div className="flex justify-between items-center mb-4">
            <span className="font-semibold text-slate-900">Recent Transactions</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/transactions')}
              className="text-xs h-7"
              data-testid="view-all-transactions-link"
            >
              View All
            </Button>
          </div>
          
          {recentTransactions.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 text-sm mb-3">No transactions yet</p>
              <Button
                onClick={() => navigate('/transactions/new')}
                size="sm"
                data-testid="empty-state-create-transaction"
              >
                Create Your First Transaction
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto -mx-5 px-5">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b border-slate-100">
                    <th className="pb-2 font-medium text-slate-500 text-xs">Ref</th>
                    <th className="pb-2 font-medium text-slate-500 text-xs">Buyer</th>
                    <th className="pb-2 font-medium text-slate-500 text-xs">Seller</th>
                    <th className="pb-2 font-medium text-slate-500 text-xs text-right">Amount</th>
                    <th className="pb-2 font-medium text-slate-500 text-xs">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTransactions.map((transaction) => (
                    <tr
                      key={transaction.transaction_id}
                      onClick={() => navigate(`/transactions/${transaction.transaction_id}`)}
                      className="border-b border-slate-50 hover:bg-slate-50 cursor-pointer"
                      data-testid={`transaction-row-${transaction.transaction_id}`}
                    >
                      <td className="py-2.5 font-mono text-xs text-blue-600">{transaction.share_code || '-'}</td>
                      <td className="py-2.5 text-slate-700">{transaction.buyer_name}</td>
                      <td className="py-2.5 text-slate-700">{transaction.seller_name}</td>
                      <td className="py-2.5 text-right font-mono font-medium text-slate-900">R {transaction.item_price.toFixed(2)}</td>
                      <td className="py-2.5">
                        <Badge className={`text-[10px] px-1.5 py-0 ${getStatusBadge(transaction.payment_status)} border`}>
                          {transaction.payment_status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Escrow Explainer - Compact FAQ */}
        <Card className="p-5 bg-slate-50 border-slate-200">
          <h3 className="font-semibold text-slate-900 text-sm mb-3">How TrustTrade Escrow Protects You</h3>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-slate-800">Funds held securely</p>
                <p className="text-xs text-slate-500">Your money goes to escrow, not directly to seller</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-slate-800">Released on confirmation</p>
                <p className="text-xs text-slate-500">Seller gets paid only when you confirm receipt</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-slate-800">Dispute protection</p>
                <p className="text-xs text-slate-500">Raise a dispute before release if something's wrong</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-slate-800">Fast bank payout</p>
                <p className="text-xs text-slate-500">Released at 10:00 & 15:00, arrives in 1-2 business days</p>
              </div>
            </div>
          </div>
        </Card>

        {/* Admin Section */}
        {user?.is_admin && (
          <Card className="p-5 bg-slate-100 border-slate-300">
            <div className="flex items-center gap-2 mb-3">
              <Lock className="w-4 h-4 text-slate-600" />
              <span className="font-semibold text-slate-900 text-sm">Admin View</span>
              <Badge className="bg-slate-200 text-slate-600 text-[10px]">Confidential</Badge>
            </div>
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div className="bg-white rounded-lg p-3">
                <p className="text-xs text-slate-500">Total Escrow</p>
                <p className="text-lg font-bold text-slate-900">
                  R {(platformStats?.total_escrow_value || 0).toLocaleString()}
                </p>
              </div>
              <div className="bg-white rounded-lg p-3">
                <p className="text-xs text-slate-500">Total Users</p>
                <p className="text-lg font-bold text-slate-900">{platformStats?.total_users || 0}</p>
              </div>
              <div className="bg-white rounded-lg p-3">
                <p className="text-xs text-slate-500">Open Disputes</p>
                <p className="text-lg font-bold text-red-600">{pendingDisputes.length}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => navigate('/admin')} className="text-xs h-8">
                Full Admin Dashboard
              </Button>
              <Button variant="outline" size="sm" onClick={() => navigate('/activity')} className="text-xs h-8">
                Live Activity
              </Button>
            </div>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}

export default Dashboard;
