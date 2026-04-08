import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminNavbar, Breadcrumbs } from '../components/AdminNavbar';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import api from '../utils/api';
import { toast } from 'sonner';
import { 
  AlertCircle, Search, ChevronRight, Filter
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
  if (s.includes('resolved')) return COLORS.green;
  if (s.includes('escalated')) return COLORS.error;
  if (s.includes('review')) return COLORS.info;
  if (s.includes('open') || s.includes('pending')) return COLORS.warning;
  return COLORS.subtext;
};

function AdminDisputes() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [disputes, setDisputes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [userRes, disputesRes] = await Promise.all([
        api.get('/auth/me'),
        api.get('/admin/disputes')
      ]);
      
      if (!userRes.data.is_admin) {
        toast.error('Admin access required');
        navigate('/dashboard');
        return;
      }
      
      setUser(userRes.data);
      setDisputes(disputesRes.data);
    } catch (error) {
      console.error('Failed to fetch:', error);
      toast.error('Failed to load disputes');
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

  const filteredDisputes = disputes.filter(d => {
    const matchesSearch = !searchQuery || 
      d.dispute_id?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.transaction_id?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.buyer_email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.seller_email?.toLowerCase().includes(searchQuery.toLowerCase());
    
    let matchesStatus = true;
    if (statusFilter !== 'all') {
      const s = d.status?.toLowerCase() || '';
      if (statusFilter === 'open') matchesStatus = s.includes('open') || s.includes('pending');
      else if (statusFilter === 'review') matchesStatus = s.includes('review');
      else if (statusFilter === 'resolved') matchesStatus = s.includes('resolved');
      else if (statusFilter === 'escalated') matchesStatus = s.includes('escalated');
    }
    
    return matchesSearch && matchesStatus;
  });

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
          { label: 'Disputes' }
        ]} />

        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: COLORS.text }}>All Disputes</h1>
            <p style={{ color: COLORS.subtext }}>{filteredDisputes.length} disputes</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4" style={{ color: COLORS.subtext }} />
            <Input
              placeholder="Search by ID or email..."
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
              <SelectItem value="open">Open / Pending</SelectItem>
              <SelectItem value="review">Under Review</SelectItem>
              <SelectItem value="escalated">Escalated</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Disputes Table */}
        <Card style={{ backgroundColor: COLORS.background }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead style={{ backgroundColor: COLORS.section }}>
                <tr className="border-b" style={{ borderColor: COLORS.border }}>
                  <th className="text-left p-4 font-medium" style={{ color: COLORS.subtext }}>Dispute ID</th>
                  <th className="text-left p-4 font-medium" style={{ color: COLORS.subtext }}>Transaction</th>
                  <th className="text-left p-4 font-medium" style={{ color: COLORS.subtext }}>Type</th>
                  <th className="text-left p-4 font-medium" style={{ color: COLORS.subtext }}>Raised By</th>
                  <th className="text-left p-4 font-medium" style={{ color: COLORS.subtext }}>Status</th>
                  <th className="text-left p-4 font-medium" style={{ color: COLORS.subtext }}>Created</th>
                  <th className="text-left p-4 font-medium" style={{ color: COLORS.subtext }}></th>
                </tr>
              </thead>
              <tbody>
                {filteredDisputes.map((d) => (
                  <tr 
                    key={d.dispute_id} 
                    className="border-b cursor-pointer hover:bg-gray-50 transition-colors"
                    style={{ borderColor: COLORS.border }}
                    onClick={() => navigate(`/admin/dispute/${d.dispute_id}`)}
                    data-testid={`dispute-row-${d.dispute_id}`}
                  >
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="w-4 h-4" style={{ color: COLORS.error }} />
                        <span className="font-mono font-medium" style={{ color: COLORS.primary }}>
                          disp_{d.dispute_id?.slice(0, 8)}
                        </span>
                      </div>
                    </td>
                    <td className="p-4 font-mono" style={{ color: COLORS.text }}>
                      {d.share_code || d.transaction_id?.slice(0, 8)}
                    </td>
                    <td className="p-4 capitalize" style={{ color: COLORS.text }}>
                      {d.dispute_type?.replace(/_/g, ' ') || 'General'}
                    </td>
                    <td className="p-4" style={{ color: COLORS.subtext }}>
                      {d.raised_by_email || d.raised_by || '-'}
                    </td>
                    <td className="p-4">
                      <Badge style={{ backgroundColor: getStatusColor(d.status), color: 'white' }}>
                        {d.status}
                      </Badge>
                    </td>
                    <td className="p-4" style={{ color: COLORS.subtext }}>
                      {new Date(d.created_at).toLocaleDateString()}
                    </td>
                    <td className="p-4">
                      <ChevronRight className="w-4 h-4" style={{ color: COLORS.subtext }} />
                    </td>
                  </tr>
                ))}
                {filteredDisputes.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center" style={{ color: COLORS.subtext }}>
                      No disputes found
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

export default AdminDisputes;
