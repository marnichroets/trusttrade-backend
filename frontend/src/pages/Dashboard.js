import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import axios from 'axios';
import { Plus, FileText, AlertCircle, TrendingUp } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function Dashboard() {
  const [user, setUser] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [disputes, setDisputes] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const [userRes, transactionsRes, disputesRes] = await Promise.all([
        axios.get(`${API}/auth/me`, { withCredentials: true }),
        axios.get(`${API}/transactions`, { withCredentials: true }),
        axios.get(`${API}/disputes`, { withCredentials: true })
      ]);

      setUser(userRes.data);
      setTransactions(transactionsRes.data);
      setDisputes(disputesRes.data);
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

  const pendingTransactions = transactions.filter(t => t.payment_status === 'Pending');
  const pendingDisputes = disputes.filter(d => d.status === 'Pending');
  const recentTransactions = transactions.slice(0, 5);

  const getStatusBadge = (status) => {
    const variants = {
      'Pending': 'bg-yellow-100 text-yellow-800',
      'Paid': 'bg-green-100 text-green-800',
      'Released': 'bg-green-100 text-green-800',
      'Not Released': 'bg-slate-100 text-slate-600'
    };
    return variants[status] || 'bg-slate-100 text-slate-600';
  };

  return (
    <DashboardLayout user={user}>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900" data-testid="dashboard-title">Dashboard</h1>
          <p className="text-slate-600 mt-2">Welcome back, {user?.name}</p>
        </div>

        {/* Stats Cards */}
        <div className="grid md:grid-cols-3 gap-6">
          <Card className="p-6 hover:shadow-md transition-shadow duration-200">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-slate-600 mb-1">Total Transactions</p>
                <p className="text-3xl font-bold text-slate-900" data-testid="total-transactions">{transactions.length}</p>
              </div>
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                <FileText className="w-6 h-6 text-primary" />
              </div>
            </div>
          </Card>

          <Card className="p-6 hover:shadow-md transition-shadow duration-200">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-slate-600 mb-1">Pending Transactions</p>
                <p className="text-3xl font-bold text-yellow-600" data-testid="pending-transactions">{pendingTransactions.length}</p>
              </div>
              <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-yellow-600" />
              </div>
            </div>
          </Card>

          <Card className="p-6 hover:shadow-md transition-shadow duration-200">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-slate-600 mb-1">Pending Disputes</p>
                <p className="text-3xl font-bold text-red-600" data-testid="pending-disputes">{pendingDisputes.length}</p>
              </div>
              <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
                <AlertCircle className="w-6 h-6 text-red-600" />
              </div>
            </div>
          </Card>
        </div>

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
                      <td className="py-3">{transaction.buyer_name}</td>
                      <td className="py-3">{transaction.seller_name}</td>
                      <td className="py-3 font-mono">R {transaction.item_price.toFixed(2)}</td>
                      <td className="py-3">
                        <Badge className={getStatusBadge(transaction.payment_status)}>
                          {transaction.payment_status}
                        </Badge>
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