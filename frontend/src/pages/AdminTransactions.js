import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { AdminNavbar, Breadcrumbs } from '../components/AdminNavbar';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import api from '../utils/api';
import { toast } from 'sonner';
import { 
  FileText, Clock, Download, Search, Filter, ChevronRight
} from 'lucide-react';

const COLORS = {
  primary: '#1a2942',
  green: '#2ecc71',
  background: '#ffffff',
  section: '#f8f9fa',
  text: '#212529',
  subtext: '#6c757d',
  border: '#dee2e6',
  error: '#e74c3c',
  warning: '#f39c12',
  info: '#3498db'
};

const getStatusColor = (status) => {
  const s = status?.toLowerCase() || '';
  if (s.includes('completed') || s.includes('released')) return COLORS.green;
  if (s.includes('dispute') || s.includes('refund')) return COLORS.error;
  if (s.includes('pending') || s.includes('awaiting')) return COLORS.warning;
  if (s.includes('active') || s.includes('paid')) return COLORS.info;
  return COLORS.subtext;
};

function AdminTransactions() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [userRes, txnRes] = await Promise.all([
        api.get('/auth/me'),
        api.get('/admin/transactions')
      ]);
      
      if (!userRes.data.is_admin) {
        toast.error('Admin access required');
        navigate('/dashboard');
        return;
      }
      
      setUser(userRes.data);
      setTransactions(txnRes.data);
    } catch (error) {
      console.error('Failed to fetch:', error);
      toast.error('Failed to load transactions');
      navigate('/admin');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout', {});
      localStorage.removeItem('session_token');
      navigate('/');
    } catch (error) {
      localStorage.removeItem('session_token');
      navigate('/');
    }
  };

  const filteredTransactions = transactions.filter(t => {
    const matchesSearch = !searchQuery || 
      t.share_code?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.buyer_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.seller_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.buyer_email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.seller_email?.toLowerCase().includes(searchQuery.toLowerCase());
    
    let matchesStatus = true;
    if (statusFilter !== 'all') {
      const ps = t.payment_status?.toLowerCase() || '';
      if (statusFilter === 'pending') matchesStatus = ps.includes('pending') || ps.includes('awaiting');
      else if (statusFilter === 'active') matchesStatus = ps.includes('paid') || ps.includes('funds');
      else if (statusFilter === 'completed') matchesStatus = ps.includes('completed') || ps.includes('released');
      else if (statusFilter === 'disputed') matchesStatus = ps.includes('dispute');
    }
    
    return matchesSearch && matchesStatus;
  });

  const exportCSV = () => {
    const csv = filteredTransactions.map(t => 
      `${t.share_code},${t.buyer_name},${t.buyer_email},${t.seller_name},${t.seller_email},R${t.item_price},${t.payment_status},${t.created_at}`
    ).join('\n');
    const blob = new Blob(['ID,Buyer Name,Buyer Email,Seller Name,Seller Email,Amount,Status,Created\n' + csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transactions-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: COLORS.section }}>
        <div className="w-12 h-12 border-4 rounded-full animate-spin" style={{ borderColor: COLORS.primary, borderTopColor: 'transparent' }}></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: COLORS.section }}>
      <AdminNavbar user={user} onLogout={handleLogout} />
      
      <div className="max-w-7xl mx-auto px-4 py-6">
        <Breadcrumbs items={[
          { label: 'Admin', href: '/admin' },
          { label: 'Transactions' }
        ]} />

        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: COLORS.text }}>All Transactions</h1>
            <p style={{ color: COLORS.subtext }}>{filteredTransactions.length} transactions</p>
          </div>
          <Button onClick={exportCSV} variant="outline" size="sm">
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4" style={{ color: COLORS.subtext }} />
            <Input
              placeholder="Search by ID, name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="active">Active / Paid</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="disputed">Disputed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Transactions Table */}
        <Card style={{ backgroundColor: COLORS.background }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead style={{ backgroundColor: COLORS.section }}>
                <tr className="border-b" style={{ borderColor: COLORS.border }}>
                  <th className="text-left p-4 font-medium" style={{ color: COLORS.subtext }}>Reference</th>
                  <th className="text-left p-4 font-medium" style={{ color: COLORS.subtext }}>Buyer</th>
                  <th className="text-left p-4 font-medium" style={{ color: COLORS.subtext }}>Seller</th>
                  <th className="text-left p-4 font-medium" style={{ color: COLORS.subtext }}>Amount</th>
                  <th className="text-left p-4 font-medium" style={{ color: COLORS.subtext }}>Status</th>
                  <th className="text-left p-4 font-medium" style={{ color: COLORS.subtext }}>Created</th>
                  <th className="text-left p-4 font-medium" style={{ color: COLORS.subtext }}></th>
                </tr>
              </thead>
              <tbody>
                {filteredTransactions.map((t) => (
                  <tr 
                    key={t.transaction_id} 
                    className="border-b cursor-pointer hover:bg-gray-50 transition-colors"
                    style={{ borderColor: COLORS.border }}
                    onClick={() => navigate(`/admin/transaction/${t.transaction_id}`)}
                    data-testid={`transaction-row-${t.transaction_id}`}
                  >
                    <td className="p-4">
                      <span className="font-mono font-medium" style={{ color: COLORS.primary }}>
                        {t.share_code || t.transaction_id?.slice(0, 8)}
                      </span>
                    </td>
                    <td className="p-4">
                      <p className="font-medium" style={{ color: COLORS.text }}>{t.buyer_name}</p>
                      <p className="text-xs" style={{ color: COLORS.subtext }}>{t.buyer_email}</p>
                    </td>
                    <td className="p-4">
                      <p className="font-medium" style={{ color: COLORS.text }}>{t.seller_name}</p>
                      <p className="text-xs" style={{ color: COLORS.subtext }}>{t.seller_email}</p>
                    </td>
                    <td className="p-4 font-mono" style={{ color: COLORS.text }}>
                      R {t.item_price?.toLocaleString(undefined, {minimumFractionDigits: 2})}
                    </td>
                    <td className="p-4">
                      <Badge style={{ backgroundColor: getStatusColor(t.payment_status), color: 'white' }}>
                        {t.payment_status}
                      </Badge>
                    </td>
                    <td className="p-4" style={{ color: COLORS.subtext }}>
                      {new Date(t.created_at).toLocaleDateString()}
                    </td>
                    <td className="p-4">
                      <ChevronRight className="w-4 h-4" style={{ color: COLORS.subtext }} />
                    </td>
                  </tr>
                ))}
                {filteredTransactions.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center" style={{ color: COLORS.subtext }}>
                      No transactions found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}

export default AdminTransactions;
