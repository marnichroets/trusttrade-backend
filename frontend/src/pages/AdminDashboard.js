import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { AdminNavbar, Breadcrumbs } from '../components/AdminNavbar';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import api from '../utils/api';
import { toast } from 'sonner';
import { 
  Users, FileText, AlertCircle, RefreshCw, DollarSign, 
  ShieldCheck, ChevronRight, TrendingUp, Clock
} from 'lucide-react';

const COLORS = {
  primary: '#3b82f6',  // Blue
  green: '#10b981',
  background: '#ffffff',
  section: '#f8fafc',
  text: '#1e293b',
  subtext: '#64748b',
  border: '#e2e8f0',
  error: '#ef4444',
  warning: '#f59e0b',
  info: '#3b82f6'
};

const getStatusColor = (status) => {
  const s = status?.toLowerCase() || '';
  if (s.includes('completed') || s.includes('released') || s.includes('resolved')) return COLORS.green;
  if (s.includes('dispute') || s.includes('refund') || s.includes('escalated')) return COLORS.error;
  if (s.includes('pending') || s.includes('awaiting') || s.includes('open')) return COLORS.warning;
  if (s.includes('active') || s.includes('paid') || s.includes('review')) return COLORS.info;
  return COLORS.subtext;
};

function AdminDashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [stats, setStats] = useState(null);
  const [recentTransactions, setRecentTransactions] = useState([]);
  const [recentUsers, setRecentUsers] = useState([]);
  const [recentDisputes, setRecentDisputes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [userRes, statsRes, txnRes, usersRes, disputesRes] = await Promise.all([
        api.get('/auth/me'),
        api.get('/admin/stats'),
        api.get('/admin/transactions'),
        api.get('/admin/users'),
        api.get('/admin/disputes')
      ]);
      
      if (!userRes.data.is_admin) {
        toast.error('Admin access required');
        navigate('/dashboard');
        return;
      }
      
      setUser(userRes.data);
      setStats(statsRes.data);
      setRecentTransactions(txnRes.data.slice(0, 5));
      setRecentUsers(usersRes.data.slice(0, 5));
      setRecentDisputes(disputesRes.data.slice(0, 5));
    } catch (error) {
      console.error('Failed to fetch:', error);
      toast.error('Failed to load admin data');
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
        <Breadcrumbs items={[{ label: 'Admin Dashboard' }]} />
        
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-4">
            <img src="/trusttrade-logo.png" alt="TrustTrade" className="h-16 object-contain" />
            <div>
              <h1 className="text-3xl font-bold" style={{ color: COLORS.text }}>Admin Dashboard</h1>
              <p style={{ color: COLORS.subtext }} className="mt-1">Platform overview and management</p>
            </div>
          </div>
          <Button onClick={() => { setLoading(true); fetchData(); }} variant="outline" size="sm" disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Stats Cards - Dark Navy Style */}
        {stats && (
          <div className="grid md:grid-cols-5 gap-4 mb-8">
            <Card className="p-5 hover:shadow-lg transition-shadow cursor-pointer" style={{ backgroundColor: COLORS.primary }} onClick={() => navigate('/admin/users')}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-white/70 mb-1">Total Users</p>
                  <p className="text-3xl font-bold text-white">{stats.total_users}</p>
                </div>
                <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-white/10">
                  <Users className="w-6 h-6 text-white" />
                </div>
              </div>
            </Card>

            <Card className="p-5 hover:shadow-lg transition-shadow cursor-pointer" style={{ backgroundColor: COLORS.primary }} onClick={() => navigate('/admin/transactions')}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-white/70 mb-1">Total Transactions</p>
                  <p className="text-3xl font-bold text-white">{stats.total_transactions}</p>
                </div>
                <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-white/10">
                  <FileText className="w-6 h-6 text-white" />
                </div>
              </div>
            </Card>

            <Card className="p-5 hover:shadow-lg transition-shadow" style={{ backgroundColor: COLORS.green }}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-white/80 mb-1">Total Revenue (2%)</p>
                  <p className="text-2xl font-bold text-white">R {(stats.total_volume * 0.02)?.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) || '0.00'}</p>
                </div>
                <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-white/20">
                  <DollarSign className="w-6 h-6 text-white" />
                </div>
              </div>
            </Card>

            <Card className="p-5 hover:shadow-lg transition-shadow cursor-pointer" style={{ backgroundColor: stats.pending_disputes > 0 ? COLORS.error : COLORS.primary }} onClick={() => navigate('/admin/disputes')}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-white/70 mb-1">Pending Disputes</p>
                  <p className="text-3xl font-bold text-white">{stats.pending_disputes || 0}</p>
                </div>
                <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-white/10">
                  <AlertCircle className="w-6 h-6 text-white" />
                </div>
              </div>
            </Card>

            <Card className="p-5 hover:shadow-lg transition-shadow cursor-pointer" style={{ backgroundColor: stats.pending_verifications > 0 ? COLORS.warning : COLORS.primary }} onClick={() => navigate('/admin/users')}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-white/70 mb-1">Pending Verification</p>
                  <p className="text-3xl font-bold text-white">{stats.pending_verifications || 0}</p>
                </div>
                <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-white/10">
                  <ShieldCheck className="w-6 h-6 text-white" />
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* Quick Links */}
        <div className="grid md:grid-cols-3 gap-6 mb-8">
          <Link to="/admin/transactions" className="block">
            <Card className="p-6 hover:shadow-lg transition-all hover:border-[#1a2942] border-2 border-transparent" style={{ backgroundColor: COLORS.background }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${COLORS.primary}15` }}>
                    <FileText className="w-6 h-6" style={{ color: COLORS.primary }} />
                  </div>
                  <div>
                    <h3 className="font-semibold" style={{ color: COLORS.text }}>Manage Transactions</h3>
                    <p className="text-sm" style={{ color: COLORS.subtext }}>View all transactions, release funds, process refunds</p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5" style={{ color: COLORS.subtext }} />
              </div>
            </Card>
          </Link>

          <Link to="/admin/users" className="block">
            <Card className="p-6 hover:shadow-lg transition-all hover:border-[#1a2942] border-2 border-transparent" style={{ backgroundColor: COLORS.background }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${COLORS.green}20` }}>
                    <Users className="w-6 h-6" style={{ color: COLORS.green }} />
                  </div>
                  <div>
                    <h3 className="font-semibold" style={{ color: COLORS.text }}>Manage Users</h3>
                    <p className="text-sm" style={{ color: COLORS.subtext }}>Verify IDs, suspend accounts, view profiles</p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5" style={{ color: COLORS.subtext }} />
              </div>
            </Card>
          </Link>

          <Link to="/admin/disputes" className="block">
            <Card className="p-6 hover:shadow-lg transition-all hover:border-[#1a2942] border-2 border-transparent" style={{ backgroundColor: COLORS.background }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${COLORS.error}15` }}>
                    <AlertCircle className="w-6 h-6" style={{ color: COLORS.error }} />
                  </div>
                  <div>
                    <h3 className="font-semibold" style={{ color: COLORS.text }}>Manage Disputes</h3>
                    <p className="text-sm" style={{ color: COLORS.subtext }}>Review evidence, resolve conflicts, process refunds</p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5" style={{ color: COLORS.subtext }} />
              </div>
            </Card>
          </Link>

          <Link to="/admin/token-recovery" className="block">
            <Card className="p-6 hover:shadow-lg transition-all hover:border-[#1a2942] border-2 border-transparent" style={{ backgroundColor: COLORS.background }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${COLORS.warning}15` }}>
                    <DollarSign className="w-6 h-6" style={{ color: COLORS.warning }} />
                  </div>
                  <div>
                    <h3 className="font-semibold" style={{ color: COLORS.text }}>Token Recovery</h3>
                    <p className="text-sm" style={{ color: COLORS.subtext }}>Recover legacy TradeSafe token balances</p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5" style={{ color: COLORS.subtext }} />
              </div>
            </Card>
          </Link>
        </div>

        {/* Recent Activity Grid */}
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Recent Transactions */}
          <Card className="p-6" style={{ backgroundColor: COLORS.background }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2" style={{ color: COLORS.primary }}>
                <Clock className="w-5 h-5" /> Recent Transactions
              </h2>
              <Link to="/admin/transactions" className="text-sm hover:underline" style={{ color: COLORS.info }}>
                View All
              </Link>
            </div>
            <div className="space-y-3">
              {recentTransactions.map((t) => (
                <div 
                  key={t.transaction_id}
                  className="flex items-center justify-between p-3 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors border"
                  style={{ borderColor: COLORS.border }}
                  onClick={() => navigate(`/admin/transaction/${t.transaction_id}`)}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: `${COLORS.primary}10` }}>
                      <FileText className="w-5 h-5" style={{ color: COLORS.primary }} />
                    </div>
                    <div>
                      <p className="font-mono font-medium text-sm" style={{ color: COLORS.primary }}>{t.share_code}</p>
                      <p className="text-xs" style={{ color: COLORS.subtext }}>{t.buyer_name} → {t.seller_name}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-mono font-semibold" style={{ color: COLORS.text }}>R {t.item_price?.toLocaleString()}</p>
                    <Badge style={{ backgroundColor: getStatusColor(t.payment_status), color: 'white' }} className="text-xs">
                      {t.payment_status}
                    </Badge>
                  </div>
                </div>
              ))}
              {recentTransactions.length === 0 && (
                <p className="text-center py-4" style={{ color: COLORS.subtext }}>No transactions yet</p>
              )}
            </div>
          </Card>

          {/* Recent Users & Disputes */}
          <div className="space-y-6">
            {/* Recent Users */}
            <Card className="p-6" style={{ backgroundColor: COLORS.background }}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold flex items-center gap-2" style={{ color: COLORS.primary }}>
                  <Users className="w-5 h-5" /> Recent Users
                </h2>
                <Link to="/admin/users" className="text-sm hover:underline" style={{ color: COLORS.info }}>
                  View All
                </Link>
              </div>
              <div className="space-y-2">
                {recentUsers.slice(0, 3).map((u) => (
                  <div 
                    key={u.user_id}
                    className="flex items-center justify-between p-3 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors border"
                    style={{ borderColor: COLORS.border }}
                    onClick={() => navigate(`/admin/user/${u.user_id}`)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: `${COLORS.green}15` }}>
                        <Users className="w-4 h-4" style={{ color: COLORS.green }} />
                      </div>
                      <div>
                        <p className="font-medium text-sm" style={{ color: COLORS.text }}>{u.name}</p>
                        <p className="text-xs" style={{ color: COLORS.subtext }}>{u.email}</p>
                      </div>
                    </div>
                    {u.verified || u.id_verified ? (
                      <Badge style={{ backgroundColor: COLORS.green, color: 'white' }} className="text-xs">Verified</Badge>
                    ) : u.id_verification_status === 'pending' ? (
                      <Badge style={{ backgroundColor: COLORS.warning, color: 'white' }} className="text-xs">Pending</Badge>
                    ) : (
                      <Badge style={{ backgroundColor: COLORS.subtext, color: 'white' }} className="text-xs">Unverified</Badge>
                    )}
                  </div>
                ))}
              </div>
            </Card>

            {/* Recent Disputes */}
            <Card className="p-6" style={{ backgroundColor: COLORS.background }}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold flex items-center gap-2" style={{ color: COLORS.primary }}>
                  <AlertCircle className="w-5 h-5" /> Recent Disputes
                </h2>
                <Link to="/admin/disputes" className="text-sm hover:underline" style={{ color: COLORS.info }}>
                  View All
                </Link>
              </div>
              <div className="space-y-2">
                {recentDisputes.slice(0, 3).map((d) => (
                  <div 
                    key={d.dispute_id}
                    className="flex items-center justify-between p-3 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors border"
                    style={{ borderColor: COLORS.border }}
                    onClick={() => navigate(`/admin/dispute/${d.dispute_id}`)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: `${COLORS.error}15` }}>
                        <AlertCircle className="w-4 h-4" style={{ color: COLORS.error }} />
                      </div>
                      <div>
                        <p className="font-mono font-medium text-sm" style={{ color: COLORS.primary }}>disp_{d.dispute_id?.slice(0, 8)}</p>
                        <p className="text-xs capitalize" style={{ color: COLORS.subtext }}>{d.dispute_type?.replace(/_/g, ' ') || 'General'}</p>
                      </div>
                    </div>
                    <Badge style={{ backgroundColor: getStatusColor(d.status), color: 'white' }} className="text-xs">
                      {d.status}
                    </Badge>
                  </div>
                ))}
                {recentDisputes.length === 0 && (
                  <p className="text-center py-4" style={{ color: COLORS.subtext }}>No disputes</p>
                )}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AdminDashboard;
