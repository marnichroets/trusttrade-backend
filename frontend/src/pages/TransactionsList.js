import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import axios from 'axios';
import { Plus, FileText, Search } from 'lucide-react';
import { Input } from '../components/ui/input';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function TransactionsList() {
  const [user, setUser] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [filteredTransactions, setFilteredTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    filterTransactions();
  }, [transactions, searchTerm]);

  const fetchData = async () => {
    try {
      const [userRes, transactionsRes] = await Promise.all([
        axios.get(`${API}/auth/me`, { withCredentials: true }),
        axios.get(`${API}/transactions`, { withCredentials: true })
      ]);

      setUser(userRes.data);
      setTransactions(transactionsRes.data);
    } catch (error) {
      console.error('Failed to fetch data:', error);
      navigate('/');
    } finally {
      setLoading(false);
    }
  };

  const filterTransactions = () => {
    if (!searchTerm) {
      setFilteredTransactions(transactions);
      return;
    }

    const term = searchTerm.toLowerCase();
    const filtered = transactions.filter(t =>
      t.buyer_name.toLowerCase().includes(term) ||
      t.seller_name.toLowerCase().includes(term) ||
      t.item_description.toLowerCase().includes(term) ||
      t.transaction_id.toLowerCase().includes(term)
    );
    setFilteredTransactions(filtered);
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

  return (
    <DashboardLayout user={user}>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-slate-900" data-testid="transactions-list-title">My Transactions</h1>
            <p className="text-slate-600 mt-2">{filteredTransactions.length} transaction(s)</p>
          </div>
          <Button
            onClick={() => navigate('/transactions/new')}
            data-testid="new-transaction-btn"
            className="hover:scale-[1.02] transition-all duration-200 active:scale-95"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Transaction
          </Button>
        </div>

        {/* Search */}
        <Card className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
            <Input
              type="text"
              placeholder="Search by buyer, seller, description, or transaction ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
              data-testid="search-transactions-input"
            />
          </div>
        </Card>

        {/* Transactions Table */}
        <Card className="p-6">
          {filteredTransactions.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500 mb-4">
                {searchTerm ? 'No transactions found matching your search' : 'No transactions yet'}
              </p>
              {!searchTerm && (
                <Button
                  onClick={() => navigate('/transactions/new')}
                  data-testid="empty-state-create-transaction"
                >
                  Create Your First Transaction
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b border-slate-200">
                    <th className="pb-3 font-medium text-slate-600">Transaction ID</th>
                    <th className="pb-3 font-medium text-slate-600">Buyer</th>
                    <th className="pb-3 font-medium text-slate-600">Seller</th>
                    <th className="pb-3 font-medium text-slate-600">Item</th>
                    <th className="pb-3 font-medium text-slate-600">Item Price (R)</th>
                    <th className="pb-3 font-medium text-slate-600">Fee (R)</th>
                    <th className="pb-3 font-medium text-slate-600">Total (R)</th>
                    <th className="pb-3 font-medium text-slate-600">Payment Status</th>
                    <th className="pb-3 font-medium text-slate-600">Release Status</th>
                    <th className="pb-3 font-medium text-slate-600">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTransactions.map((transaction) => (
                    <tr
                      key={transaction.transaction_id}
                      onClick={() => navigate(`/transactions/${transaction.transaction_id}`)}
                      className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors"
                      data-testid={`transaction-row-${transaction.transaction_id}`}
                    >
                      <td className="py-4 font-mono text-xs text-slate-500">
                        {transaction.transaction_id.substring(0, 12)}...
                      </td>
                      <td className="py-4">{transaction.buyer_name}</td>
                      <td className="py-4">{transaction.seller_name}</td>
                      <td className="py-4 max-w-xs truncate" title={transaction.item_description}>
                        {transaction.item_description}
                      </td>
                      <td className="py-4 font-mono">R {transaction.item_price.toFixed(2)}</td>
                      <td className="py-4 font-mono">R {transaction.trusttrade_fee.toFixed(2)}</td>
                      <td className="py-4 font-mono font-semibold">R {transaction.total.toFixed(2)}</td>
                      <td className="py-4">
                        <span className="inline-block">
                          <Badge className={getStatusBadge(transaction.payment_status)}>
                            {transaction.payment_status}
                          </Badge>
                        </span>
                      </td>
                      <td className="py-4">
                        <span className="inline-block">
                          <Badge className={getReleaseStatusBadge(transaction.release_status)}>
                            {transaction.release_status}
                          </Badge>
                        </span>
                      </td>
                      <td className="py-4 text-slate-500">
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

export default TransactionsList;