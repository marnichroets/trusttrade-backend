import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AdminNavbar, Breadcrumbs } from '../components/AdminNavbar';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Textarea } from '../components/ui/textarea';
import axios from 'axios';
import { toast } from 'sonner';
import { 
  Users, FileText, AlertCircle, TrendingUp, RefreshCw, DollarSign, 
  MessageSquare, ShieldCheck, CheckCircle, XCircle, Loader2, Eye, 
  Image, File, Mail, Clock, Edit, CreditCard, Download
} from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// TrustTrade Color System
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

function AdminDashboard() {
  const [searchParams] = useSearchParams();
  const [user, setUser] = useState(null);
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [disputes, setDisputes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'transactions');
  
  // Search and filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  
  // Modal states
  const [refundModal, setRefundModal] = useState({ open: false, transaction: null, reason: '' });
  const [releaseModal, setReleaseModal] = useState({ open: false, transaction: null, notes: '' });
  const [notesModal, setNotesModal] = useState({ open: false, transaction: null, notes: '' });
  const [verifyModal, setVerifyModal] = useState({ open: false, user: null, status: 'verified', notes: '' });
  const [disputeModal, setDisputeModal] = useState({ open: false, dispute: null, status: '', resolution: '', notes: '' });
  const [filesModal, setFilesModal] = useState({ open: false, title: '', files: [] });
  const [detailModal, setDetailModal] = useState({ open: false, type: '', data: null });
  const [emailModal, setEmailModal] = useState({ open: false, user: null, subject: '', body: '' });
  const [statusModal, setStatusModal] = useState({ open: false, transaction: null, status: '' });
  const [markPaidModal, setMarkPaidModal] = useState({ open: false, transaction: null });
  
  const navigate = useNavigate();

  // Filter transactions based on search and status
  const filteredTransactions = transactions.filter(t => {
    const matchesSearch = !searchQuery || 
      t.share_code?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.buyer_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.seller_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.buyer_email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.seller_email?.toLowerCase().includes(searchQuery.toLowerCase());
    
    // Map filter values to actual payment_status values
    let matchesStatus = true;
    if (statusFilter !== 'all') {
      const paymentStatus = t.payment_status?.toLowerCase() || '';
      if (statusFilter === 'pending') {
        matchesStatus = paymentStatus.includes('pending') || paymentStatus.includes('awaiting');
      } else if (statusFilter === 'active') {
        matchesStatus = paymentStatus.includes('paid') || paymentStatus.includes('funds') || paymentStatus.includes('delivery');
      } else if (statusFilter === 'completed') {
        matchesStatus = paymentStatus.includes('completed') || paymentStatus.includes('released');
      } else if (statusFilter === 'disputed') {
        matchesStatus = paymentStatus.includes('dispute') || t.status === 'disputed';
      }
    }
    
    return matchesSearch && matchesStatus;
  });

  // Filter users based on search
  const filteredUsers = users.filter(u => {
    if (!searchQuery) return true;
    return u.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email?.toLowerCase().includes(searchQuery.toLowerCase());
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const userRes = await axios.get(`${API}/auth/me`, { withCredentials: true });
      const currentUser = userRes.data;
      
      if (!currentUser.is_admin) {
        toast.error('Access denied: Admin only');
        navigate('/dashboard');
        return;
      }

      setUser(currentUser);

      const [statsRes, usersRes, transactionsRes, disputesRes] = await Promise.all([
        axios.get(`${API}/admin/stats`, { withCredentials: true }),
        axios.get(`${API}/admin/users`, { withCredentials: true }),
        axios.get(`${API}/admin/transactions`, { withCredentials: true }),
        axios.get(`${API}/admin/disputes`, { withCredentials: true })
      ]);

      setStats(statsRes.data);
      setUsers(usersRes.data);
      setTransactions(transactionsRes.data);
      setDisputes(disputesRes.data);
    } catch (error) {
      console.error('Failed to fetch admin data:', error);
      toast.error('Failed to load admin dashboard');
      navigate('/dashboard');
    } finally {
      setLoading(false);
    }
  };

  // ============ ADMIN ACTIONS ============

  const handleRefund = async () => {
    if (!refundModal.transaction) return;
    setActionLoading(true);
    try {
      await axios.post(
        `${API}/admin/transactions/${refundModal.transaction.transaction_id}/refund`,
        { reason: refundModal.reason || 'Admin refund' },
        { withCredentials: true }
      );
      toast.success('Transaction refunded and buyer notified via email');
      setRefundModal({ open: false, transaction: null, reason: '' });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to refund transaction');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReleaseFunds = async () => {
    if (!releaseModal.transaction) return;
    setActionLoading(true);
    try {
      await axios.post(
        `${API}/admin/transactions/${releaseModal.transaction.transaction_id}/release`,
        { notes: releaseModal.notes || '' },
        { withCredentials: true }
      );
      toast.success('Funds released and seller notified via email');
      setReleaseModal({ open: false, transaction: null, notes: '' });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to release funds');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddNotes = async () => {
    if (!notesModal.transaction || !notesModal.notes.trim()) return;
    setActionLoading(true);
    try {
      await axios.post(
        `${API}/admin/transactions/${notesModal.transaction.transaction_id}/notes`,
        { notes: notesModal.notes },
        { withCredentials: true }
      );
      toast.success('Note added to transaction successfully');
      setNotesModal({ open: false, transaction: null, notes: '' });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to add notes');
    } finally {
      setActionLoading(false);
    }
  };

  const handleVerifyUser = async () => {
    if (!verifyModal.user) return;
    setActionLoading(true);
    try {
      await axios.post(
        `${API}/admin/users/${verifyModal.user.user_id}/verification`,
        { status: verifyModal.status, notes: verifyModal.notes },
        { withCredentials: true }
      );
      toast.success(`User verification status updated to ${verifyModal.status} and user notified`);
      setVerifyModal({ open: false, user: null, status: 'verified', notes: '' });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update verification');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateDispute = async () => {
    if (!disputeModal.dispute || !disputeModal.status) return;
    setActionLoading(true);
    try {
      await axios.patch(
        `${API}/admin/disputes/${disputeModal.dispute.dispute_id}`,
        { 
          status: disputeModal.status, 
          resolution: disputeModal.resolution,
          admin_notes: disputeModal.notes 
        },
        { withCredentials: true }
      );
      toast.success('Dispute status updated and both parties notified');
      setDisputeModal({ open: false, dispute: null, status: '', resolution: '', notes: '' });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update dispute');
    } finally {
      setActionLoading(false);
    }
  };

  const handleMarkAsPaid = async () => {
    if (!markPaidModal.transaction) return;
    setActionLoading(true);
    try {
      await axios.post(
        `${API}/transactions/${markPaidModal.transaction.transaction_id}/confirm-payment`,
        {},
        { withCredentials: true }
      );
      toast.success('Transaction marked as paid');
      setMarkPaidModal({ open: false, transaction: null });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to mark as paid');
    } finally {
      setActionLoading(false);
    }
  };

  const handleOverrideStatus = async () => {
    if (!statusModal.transaction || !statusModal.status) return;
    setActionLoading(true);
    try {
      await axios.post(
        `${API}/admin/transactions/${statusModal.transaction.transaction_id}/status`,
        { status: statusModal.status },
        { withCredentials: true }
      );
      toast.success('Payment status overridden');
      setStatusModal({ open: false, transaction: null, status: '' });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to override status');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSendEmail = async () => {
    if (!emailModal.user || !emailModal.subject || !emailModal.body) return;
    setActionLoading(true);
    try {
      await axios.post(
        `${API}/admin/send-email`,
        { 
          to_email: emailModal.user.email,
          to_name: emailModal.user.name,
          subject: emailModal.subject,
          body: emailModal.body
        },
        { withCredentials: true }
      );
      toast.success('Email sent successfully');
      setEmailModal({ open: false, user: null, subject: '', body: '' });
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to send email');
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    const s = status?.toLowerCase() || '';
    // Use TrustTrade color scheme
    if (s.includes('completed') || s.includes('released') || s.includes('resolved') || s.includes('paid')) 
      return 'bg-[#2ecc71] text-white';
    if (s.includes('dispute') || s.includes('refund') || s.includes('escalated')) 
      return 'bg-[#e74c3c] text-white';
    if (s.includes('pending') || s.includes('awaiting') || s.includes('open')) 
      return 'bg-[#f39c12] text-white';
    if (s.includes('active') || s.includes('review')) 
      return 'bg-[#3498db] text-white';
    return 'bg-[#6c757d] text-white';
  };

  const formatAutoRelease = (timestamp) => {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp);
    const now = new Date();
    const diffHours = Math.round((date - now) / (1000 * 60 * 60));
    if (diffHours < 0) return 'Expired';
    if (diffHours < 24) return `${diffHours}h remaining`;
    return `${Math.round(diffHours / 24)}d remaining`;
  };

  // Helper to construct proper file URLs
  const getFileUrl = (path, folder = 'photos') => {
    if (!path) return null;
    if (path.startsWith('http')) return path;
    // Remove any leading slashes
    const cleanPath = path.replace(/^\/+/, '');
    // If path already contains folder structure, use as-is
    if (cleanPath.includes('/')) {
      return `${BACKEND_URL}/uploads/${cleanPath}`;
    }
    return `${BACKEND_URL}/uploads/${folder}/${cleanPath}`;
  };

  const collectFiles = (item, type) => {
    const files = [];
    if (type === 'transaction') {
      if (item.item_photos?.length) {
        item.item_photos.forEach((p, i) => files.push({ name: `Photo ${i+1}`, url: getFileUrl(p, 'photos'), type: 'image' }));
      }
      if (item.agreement_pdf_path) {
        files.push({ name: 'Agreement PDF', url: getFileUrl(item.agreement_pdf_path, 'pdfs'), type: 'pdf' });
      }
    } else if (type === 'user') {
      // Check verification paths
      const verification = item.verification || {};
      if (item.id_front_path) files.push({ name: 'ID Front', url: getFileUrl(item.id_front_path, 'verification'), type: 'image' });
      else if (verification.id_document_path) files.push({ name: 'ID Document', url: getFileUrl(verification.id_document_path, 'verification'), type: 'image' });
      
      if (item.id_back_path) files.push({ name: 'ID Back', url: getFileUrl(item.id_back_path, 'verification'), type: 'image' });
      
      if (item.selfie_path) files.push({ name: 'Selfie', url: getFileUrl(item.selfie_path, 'verification'), type: 'image' });
      else if (verification.selfie_path) files.push({ name: 'Selfie', url: getFileUrl(verification.selfie_path, 'verification'), type: 'image' });
    }
    return files;
  };

  const handleLogout = async () => {
    try {
      await axios.post(`${API}/auth/logout`, {}, { withCredentials: true });
      navigate('/');
    } catch (error) {
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
        {/* Breadcrumbs */}
        <Breadcrumbs items={[{ label: 'Admin Dashboard' }]} />
        
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold" style={{ color: COLORS.text }} data-testid="admin-dashboard-title">Admin Dashboard</h1>
            <p style={{ color: COLORS.subtext }} className="mt-2">Manage transactions, users, and disputes</p>
          </div>
          <Button onClick={() => { setLoading(true); fetchData(); }} variant="outline" size="sm" disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Refreshing...' : 'Refresh'}
          </Button>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="grid md:grid-cols-5 gap-4 mb-6">
            <Card className="p-4 hover:shadow-md transition-shadow duration-200" style={{ backgroundColor: COLORS.background }}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs mb-1" style={{ color: COLORS.subtext }}>Total Users</p>
                  <p className="text-2xl font-bold" style={{ color: COLORS.text }}>{stats.total_users}</p>
                </div>
                <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${COLORS.primary}15` }}>
                  <Users className="w-5 h-5" style={{ color: COLORS.primary }} />
                </div>
              </div>
            </Card>

            <Card className="p-4 hover:shadow-md transition-shadow duration-200" style={{ backgroundColor: COLORS.background }}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs mb-1" style={{ color: COLORS.subtext }}>Total Transactions</p>
                  <p className="text-2xl font-bold" style={{ color: COLORS.text }}>{stats.total_transactions}</p>
                </div>
                <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${COLORS.green}20` }}>
                  <FileText className="w-5 h-5" style={{ color: COLORS.green }} />
                </div>
              </div>
            </Card>

            <Card className="p-4 hover:shadow-md transition-shadow duration-200" style={{ backgroundColor: `${COLORS.green}10`, borderColor: COLORS.green }}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs mb-1" style={{ color: COLORS.green }}>Total Revenue (2%)</p>
                  <p className="text-2xl font-bold" style={{ color: COLORS.green }}>R {(stats.total_volume * 0.02)?.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) || '0.00'}</p>
                </div>
                <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${COLORS.green}30` }}>
                  <DollarSign className="w-5 h-5" style={{ color: COLORS.green }} />
                </div>
              </div>
            </Card>

            <Card className="p-4 hover:shadow-md transition-shadow duration-200" style={{ backgroundColor: COLORS.background }}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs mb-1" style={{ color: COLORS.subtext }}>Pending Disputes</p>
                  <p className="text-2xl font-bold" style={{ color: COLORS.error }}>{stats.pending_disputes || 0}</p>
                </div>
                <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${COLORS.error}15` }}>
                  <AlertCircle className="w-5 h-5" style={{ color: COLORS.error }} />
                </div>
              </div>
            </Card>

            <Card className="p-4 hover:shadow-md transition-shadow duration-200" style={{ backgroundColor: COLORS.background }}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs mb-1" style={{ color: COLORS.subtext }}>Pending ID Verification</p>
                  <p className="text-2xl font-bold" style={{ color: COLORS.warning }}>{stats.pending_verifications || 0}</p>
                </div>
                <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${COLORS.warning}20` }}>
                  <ShieldCheck className="w-5 h-5" style={{ color: COLORS.warning }} />
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3" style={{ backgroundColor: COLORS.background }}>
            <TabsTrigger value="transactions" style={{ color: activeTab === 'transactions' ? COLORS.primary : COLORS.subtext }}>Transactions ({filteredTransactions.length})</TabsTrigger>
            <TabsTrigger value="users" style={{ color: activeTab === 'users' ? COLORS.primary : COLORS.subtext }}>Users ({filteredUsers.length})</TabsTrigger>
            <TabsTrigger value="disputes" style={{ color: activeTab === 'disputes' ? COLORS.primary : COLORS.subtext }}>Disputes ({disputes.length})</TabsTrigger>
          </TabsList>

          {/* Transactions Tab */}
          <TabsContent value="transactions" className="mt-6">
            {/* Search and Filters */}
            <div className="flex flex-col sm:flex-row gap-4 mb-6">
              <div className="flex-1">
                <Input
                  placeholder="Search by ID, name or email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="disputed">Disputed</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={() => {
                const csv = filteredTransactions.map(t => 
                  `${t.share_code},${t.buyer_name},${t.buyer_email},${t.seller_name},${t.seller_email},R${t.item_price},${t.payment_status},${t.created_at}`
                ).join('\n');
                const blob = new Blob(['ID,Buyer Name,Buyer Email,Seller Name,Seller Email,Amount,Status,Created\n' + csv], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `transactions-${new Date().toISOString().split('T')[0]}.csv`;
                a.click();
              }}>
                <Download className="w-4 h-4 mr-2" />
                Export CSV
              </Button>
            </div>

            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b">
                    <tr>
                      <th className="text-left p-3 font-medium text-slate-600">ID</th>
                      <th className="text-left p-3 font-medium text-slate-600">Buyer</th>
                      <th className="text-left p-3 font-medium text-slate-600">Seller</th>
                      <th className="text-left p-3 font-medium text-slate-600">Amount</th>
                      <th className="text-left p-3 font-medium text-slate-600">Status</th>
                      <th className="text-left p-3 font-medium text-slate-600">Delivery</th>
                      <th className="text-left p-3 font-medium text-slate-600">Timer</th>
                      <th className="text-left p-3 font-medium text-slate-600">Files</th>
                      <th className="text-left p-3 font-medium text-slate-600">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTransactions.slice(0, 50).map((t) => {
                      const files = collectFiles(t, 'transaction');
                      return (
                        <tr key={t.transaction_id} className="border-b hover:bg-slate-50">
                          <td className="p-3">
                            <button 
                              onClick={() => navigate(`/admin/transaction/${t.transaction_id}`)}
                              className="font-mono text-xs font-medium text-primary hover:underline"
                            >
                              {t.share_code || t.transaction_id?.slice(0, 8)}
                            </button>
                          </td>
                          <td className="p-3">
                            <p className="text-xs font-medium">{t.buyer_name}</p>
                            <p className="text-xs text-slate-500 truncate max-w-[120px]">{t.buyer_email}</p>
                          </td>
                          <td className="p-3">
                            <p className="text-xs font-medium">{t.seller_name}</p>
                            <p className="text-xs text-slate-500 truncate max-w-[120px]">{t.seller_email}</p>
                          </td>
                          <td className="p-3 font-mono text-xs">R {t.item_price?.toFixed(2)}</td>
                          <td className="p-3">
                            <Badge className={`${getStatusBadge(t.payment_status)} text-xs`}>{t.payment_status}</Badge>
                          </td>
                          <td className="p-3">
                            <Badge variant="outline" className="text-xs">{t.delivery_method || 'N/A'}</Badge>
                          </td>
                          <td className="p-3">
                            {t.auto_release_at ? (
                              <span className="text-xs flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {formatAutoRelease(t.auto_release_at)}
                              </span>
                            ) : (
                              <span className="text-xs text-slate-400">-</span>
                            )}
                          </td>
                          <td className="p-3">
                            {files.length > 0 ? (
                              <Button 
                                size="sm" 
                                variant="ghost"
                                className="h-7 px-2"
                                onClick={() => setFilesModal({ open: true, title: `Files - ${t.share_code}`, files })}
                              >
                                <Image className="w-3 h-3 mr-1" />
                                {files.length}
                              </Button>
                            ) : (
                              <span className="text-xs text-slate-400">-</span>
                            )}
                          </td>
                          <td className="p-3">
                            <div className="flex gap-1 flex-wrap">
                              {t.payment_status === 'Ready for Payment' && (
                                <Button 
                                  size="sm" 
                                  variant="outline"
                                  className="h-7 px-2 text-xs text-blue-600 border-blue-200"
                                  onClick={() => setMarkPaidModal({ open: true, transaction: t })}
                                >
                                  <CreditCard className="w-3 h-3 mr-1" />
                                  Paid
                                </Button>
                              )}
                              {t.payment_status === 'Paid' && (
                                <Button 
                                  size="sm" 
                                  variant="outline"
                                  className="h-7 px-2 text-xs text-green-600 border-green-200"
                                  onClick={() => setReleaseModal({ open: true, transaction: t, notes: '' })}
                                >
                                  <DollarSign className="w-3 h-3 mr-1" />
                                  Release
                                </Button>
                              )}
                              {['Paid', 'Ready for Payment'].includes(t.payment_status) && (
                                <Button 
                                  size="sm" 
                                  variant="outline"
                                  className="h-7 px-2 text-xs text-red-600 border-red-200"
                                  onClick={() => setRefundModal({ open: true, transaction: t, reason: '' })}
                                >
                                  Refund
                                </Button>
                              )}
                              <Button 
                                size="sm" 
                                variant="ghost"
                                className="h-7 px-2 text-xs"
                                onClick={() => setStatusModal({ open: true, transaction: t, status: t.payment_status })}
                              >
                                <Edit className="w-3 h-3" />
                              </Button>
                              <Button 
                                size="sm" 
                                variant="ghost"
                                className="h-7 px-2 text-xs"
                                onClick={() => setNotesModal({ open: true, transaction: t, notes: '' })}
                              >
                                <MessageSquare className="w-3 h-3" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          </TabsContent>

          {/* Users Tab */}
          <TabsContent value="users" className="mt-6">
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b">
                    <tr>
                      <th className="text-left p-3 font-medium text-slate-600">Name</th>
                      <th className="text-left p-3 font-medium text-slate-600">Email</th>
                      <th className="text-left p-3 font-medium text-slate-600">Trades</th>
                      <th className="text-left p-3 font-medium text-slate-600">Trust</th>
                      <th className="text-left p-3 font-medium text-slate-600">ID Files</th>
                      <th className="text-left p-3 font-medium text-slate-600">Verified</th>
                      <th className="text-left p-3 font-medium text-slate-600">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.slice(0, 30).map((u) => {
                      const files = collectFiles(u, 'user');
                      return (
                        <tr key={u.user_id} className="border-b hover:bg-slate-50">
                          <td className="p-3">
                            <button 
                              onClick={() => setDetailModal({ open: true, type: 'user', data: u })}
                              className="font-medium text-primary hover:underline text-xs"
                            >
                              {u.name}
                            </button>
                            {u.is_admin && <Badge className="bg-purple-100 text-purple-800 text-xs ml-2">Admin</Badge>}
                          </td>
                          <td className="p-3 text-xs">{u.email}</td>
                          <td className="p-3 text-xs">{u.total_trades || 0}</td>
                          <td className="p-3">
                            <div className="flex items-center gap-1">
                              <div className="w-12 bg-slate-200 rounded-full h-1.5">
                                <div 
                                  className="bg-primary h-1.5 rounded-full" 
                                  style={{ width: `${u.trust_score || 50}%` }}
                                />
                              </div>
                              <span className="text-xs">{u.trust_score || 50}</span>
                            </div>
                          </td>
                          <td className="p-3">
                            {files.length > 0 ? (
                              <Button 
                                size="sm" 
                                variant="ghost"
                                className="h-7 px-2"
                                onClick={() => setFilesModal({ open: true, title: `ID Files - ${u.name}`, files })}
                              >
                                <File className="w-3 h-3 mr-1" />
                                {files.length}
                              </Button>
                            ) : (
                              <span className="text-xs text-slate-400">None</span>
                            )}
                          </td>
                          <td className="p-3">
                            {u.verified ? (
                              <Badge className="bg-green-100 text-green-800 text-xs">
                                <CheckCircle className="w-3 h-3 mr-1" />
                                Verified
                              </Badge>
                            ) : (
                              <Badge className="bg-yellow-100 text-yellow-800 text-xs">Pending</Badge>
                            )}
                          </td>
                          <td className="p-3">
                            <div className="flex gap-1">
                              <Button 
                                size="sm" 
                                variant="outline"
                                className="h-7 px-2 text-xs"
                                onClick={() => setVerifyModal({ open: true, user: u, status: u.verified ? 'verified' : 'pending', notes: '' })}
                              >
                                <ShieldCheck className="w-3 h-3 mr-1" />
                                Verify
                              </Button>
                              <Button 
                                size="sm" 
                                variant="ghost"
                                className="h-7 px-2 text-xs"
                                onClick={() => setEmailModal({ open: true, user: u, subject: '', body: '' })}
                              >
                                <Mail className="w-3 h-3" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          </TabsContent>

          {/* Disputes Tab */}
          <TabsContent value="disputes" className="mt-6">
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b">
                    <tr>
                      <th className="text-left p-3 font-medium text-slate-600">Dispute ID</th>
                      <th className="text-left p-3 font-medium text-slate-600">Transaction</th>
                      <th className="text-left p-3 font-medium text-slate-600">Buyer</th>
                      <th className="text-left p-3 font-medium text-slate-600">Seller</th>
                      <th className="text-left p-3 font-medium text-slate-600">Type</th>
                      <th className="text-left p-3 font-medium text-slate-600">Status</th>
                      <th className="text-left p-3 font-medium text-slate-600">Notes</th>
                      <th className="text-left p-3 font-medium text-slate-600">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {disputes.map((d) => (
                      <tr key={d.dispute_id} className="border-b hover:bg-slate-50">
                        <td className="p-3">
                          <button 
                            onClick={() => navigate(`/admin/dispute/${d.dispute_id}`)}
                            className="font-mono text-xs font-medium text-primary hover:underline"
                          >
                            {d.dispute_id?.slice(0, 8)}
                          </button>
                        </td>
                        <td className="p-3 font-mono text-xs">{d.transaction_id?.slice(0, 8)}</td>
                        <td className="p-3 text-xs">{d.buyer_email || '-'}</td>
                        <td className="p-3 text-xs">{d.seller_email || '-'}</td>
                        <td className="p-3 text-xs">{d.dispute_type}</td>
                        <td className="p-3">
                          <Badge className={`${getStatusBadge(d.status)} text-xs`}>{d.status}</Badge>
                        </td>
                        <td className="p-3 text-xs max-w-[150px] truncate">
                          {Array.isArray(d.admin_notes) 
                            ? d.admin_notes.map(n => n.note || n).join(', ').slice(0, 50) 
                            : (typeof d.admin_notes === 'object' ? JSON.stringify(d.admin_notes) : d.admin_notes) || '-'}
                        </td>
                        <td className="p-3">
                          <div className="flex gap-1">
                            <Button 
                              size="sm" 
                              variant="outline"
                              className="h-7 px-2 text-xs"
                              onClick={() => setDisputeModal({ 
                                open: true, 
                                dispute: d, 
                                status: d.status?.toLowerCase().replace(' ', '_') || 'open',
                                resolution: d.resolution || '',
                                notes: d.admin_notes || ''
                              })}
                            >
                              <Edit className="w-3 h-3 mr-1" />
                              Update
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {disputes.length === 0 && (
                      <tr>
                        <td colSpan={8} className="p-8 text-center text-slate-500">No disputes found</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </TabsContent>
        </Tabs>

      {/* ============ MODALS ============ */}

      {/* Files Viewer Modal */}
      <Dialog open={filesModal.open} onOpenChange={(open) => setFilesModal({ ...filesModal, open })}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{filesModal.title}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            {filesModal.files.map((f, i) => (
              <div key={i} className="border rounded-lg p-3 cursor-pointer group" onClick={() => window.open(f.url, '_blank')}>
                <p className="text-sm font-medium mb-2">{f.name}</p>
                {f.type === 'image' ? (
                  <img 
                    src={f.url} 
                    alt={f.name} 
                    className="w-full h-48 object-contain rounded bg-slate-100 group-hover:opacity-90 transition-opacity" 
                    onError={(e) => { e.target.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect fill="%23f1f5f9" width="100" height="100"/><text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="%2394a3b8" font-size="12">No Image</text></svg>'; }}
                  />
                ) : (
                  <div className="w-full h-48 bg-slate-100 rounded flex items-center justify-center">
                    <FileText className="w-12 h-12 text-slate-400" />
                  </div>
                )}
                <div className="flex justify-between items-center mt-2">
                  <p className="text-xs text-slate-500 group-hover:text-primary">Click to view full size</p>
                  <a 
                    href={f.url} 
                    download 
                    className="text-xs text-primary hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Download
                  </a>
                </div>
              </div>
            ))}
            {filesModal.files.length === 0 && (
              <p className="col-span-2 text-center text-slate-500 py-8">No files uploaded</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Detail View Modal */}
      <Dialog open={detailModal.open} onOpenChange={(open) => setDetailModal({ ...detailModal, open })}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {detailModal.type === 'transaction' && `Transaction Details - ${detailModal.data?.share_code}`}
              {detailModal.type === 'user' && `User Details - ${detailModal.data?.name}`}
              {detailModal.type === 'dispute' && `Dispute Details - ${detailModal.data?.dispute_id?.slice(0,8)}`}
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            {detailModal.data && Object.entries(detailModal.data).map(([key, value]) => (
              <div key={key} className="border-b pb-2">
                <p className="text-xs text-slate-500 font-medium">{key}</p>
                <div className="text-sm">
                  {value === null || value === undefined ? (
                    <span className="text-slate-400">-</span>
                  ) : Array.isArray(value) ? (
                    value.length === 0 ? (
                      <span className="text-slate-400">Empty</span>
                    ) : (
                      <div className="space-y-1">
                        {value.map((item, i) => (
                          <div key={i} className="bg-slate-50 p-2 rounded text-xs">
                            {typeof item === 'object' ? (
                              <pre className="whitespace-pre-wrap">{JSON.stringify(item, null, 2)}</pre>
                            ) : (
                              String(item)
                            )}
                          </div>
                        ))}
                      </div>
                    )
                  ) : typeof value === 'object' ? (
                    <pre className="bg-slate-50 p-2 rounded text-xs whitespace-pre-wrap">{JSON.stringify(value, null, 2)}</pre>
                  ) : typeof value === 'boolean' ? (
                    <Badge className={value ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
                      {value ? 'Yes' : 'No'}
                    </Badge>
                  ) : (
                    String(value)
                  )}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Refund Modal */}
      <Dialog open={refundModal.open} onOpenChange={(open) => setRefundModal({ ...refundModal, open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Refund Transaction</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-slate-600">
              Refund <strong>{refundModal.transaction?.share_code}</strong> for{' '}
              <strong>R {refundModal.transaction?.total?.toFixed(2)}</strong>?
            </p>
            <Textarea
              value={refundModal.reason}
              onChange={(e) => setRefundModal({ ...refundModal, reason: e.target.value })}
              placeholder="Refund reason..."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRefundModal({ open: false, transaction: null, reason: '' })}>Cancel</Button>
            <Button onClick={handleRefund} disabled={actionLoading} className="bg-red-600 hover:bg-red-700">
              {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirm Refund'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Release Funds Modal */}
      <Dialog open={releaseModal.open} onOpenChange={(open) => setReleaseModal({ ...releaseModal, open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Release Funds</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-4 bg-green-50 rounded-lg">
              <p className="text-sm text-green-800">
                Release <strong>R {releaseModal.transaction?.item_price?.toFixed(2)}</strong> to{' '}
                <strong>{releaseModal.transaction?.seller_name}</strong>
              </p>
            </div>
            <Textarea
              value={releaseModal.notes}
              onChange={(e) => setReleaseModal({ ...releaseModal, notes: e.target.value })}
              placeholder="Admin notes..."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReleaseModal({ open: false, transaction: null, notes: '' })}>Cancel</Button>
            <Button onClick={handleReleaseFunds} disabled={actionLoading} className="bg-green-600 hover:bg-green-700">
              {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Release Funds'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mark as Paid Modal */}
      <Dialog open={markPaidModal.open} onOpenChange={(open) => setMarkPaidModal({ ...markPaidModal, open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark as Paid</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-slate-600">
              Mark transaction <strong>{markPaidModal.transaction?.share_code}</strong> as paid?
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMarkPaidModal({ open: false, transaction: null })}>Cancel</Button>
            <Button onClick={handleMarkAsPaid} disabled={actionLoading}>
              {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirm Payment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Override Status Modal */}
      <Dialog open={statusModal.open} onOpenChange={(open) => setStatusModal({ ...statusModal, open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Override Payment Status</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Select value={statusModal.status} onValueChange={(val) => setStatusModal({ ...statusModal, status: val })}>
              <SelectTrigger>
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Pending Seller Confirmation">Pending Seller Confirmation</SelectItem>
                <SelectItem value="Pending Buyer Confirmation">Pending Buyer Confirmation</SelectItem>
                <SelectItem value="Ready for Payment">Ready for Payment</SelectItem>
                <SelectItem value="Paid">Paid</SelectItem>
                <SelectItem value="Released">Released</SelectItem>
                <SelectItem value="Refunded">Refunded</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusModal({ open: false, transaction: null, status: '' })}>Cancel</Button>
            <Button onClick={handleOverrideStatus} disabled={actionLoading}>
              {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Update Status'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Notes Modal */}
      <Dialog open={notesModal.open} onOpenChange={(open) => setNotesModal({ ...notesModal, open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Admin Note</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Textarea
              value={notesModal.notes}
              onChange={(e) => setNotesModal({ ...notesModal, notes: e.target.value })}
              placeholder="Enter note..."
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNotesModal({ open: false, transaction: null, notes: '' })}>Cancel</Button>
            <Button onClick={handleAddNotes} disabled={actionLoading || !notesModal.notes.trim()}>
              {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add Note'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Verify User Modal */}
      <Dialog open={verifyModal.open} onOpenChange={(open) => setVerifyModal({ ...verifyModal, open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update ID Verification</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm">User: <strong>{verifyModal.user?.name}</strong> ({verifyModal.user?.email})</p>
            <Select value={verifyModal.status} onValueChange={(val) => setVerifyModal({ ...verifyModal, status: val })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="verified">Verified</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
            <Textarea
              value={verifyModal.notes}
              onChange={(e) => setVerifyModal({ ...verifyModal, notes: e.target.value })}
              placeholder="Notes..."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVerifyModal({ open: false, user: null, status: 'verified', notes: '' })}>Cancel</Button>
            <Button onClick={handleVerifyUser} disabled={actionLoading}>
              {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Update'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send Email Modal */}
      <Dialog open={emailModal.open} onOpenChange={(open) => setEmailModal({ ...emailModal, open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Email to User</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm">To: <strong>{emailModal.user?.email}</strong></p>
            <Input
              value={emailModal.subject}
              onChange={(e) => setEmailModal({ ...emailModal, subject: e.target.value })}
              placeholder="Subject..."
            />
            <Textarea
              value={emailModal.body}
              onChange={(e) => setEmailModal({ ...emailModal, body: e.target.value })}
              placeholder="Email body..."
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmailModal({ open: false, user: null, subject: '', body: '' })}>Cancel</Button>
            <Button onClick={handleSendEmail} disabled={actionLoading || !emailModal.subject || !emailModal.body}>
              {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Send Email'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Update Dispute Modal */}
      <Dialog open={disputeModal.open} onOpenChange={(open) => setDisputeModal({ ...disputeModal, open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Dispute</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Select value={disputeModal.status} onValueChange={(val) => setDisputeModal({ ...disputeModal, status: val })}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="under_review">Under Review</SelectItem>
                <SelectItem value="escalated">Escalated</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
              </SelectContent>
            </Select>
            {disputeModal.status === 'resolved' && (
              <Textarea
                value={disputeModal.resolution}
                onChange={(e) => setDisputeModal({ ...disputeModal, resolution: e.target.value })}
                placeholder="Resolution..."
              />
            )}
            <Textarea
              value={disputeModal.notes}
              onChange={(e) => setDisputeModal({ ...disputeModal, notes: e.target.value })}
              placeholder="Admin notes..."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisputeModal({ open: false, dispute: null, status: '', resolution: '', notes: '' })}>Cancel</Button>
            <Button onClick={handleUpdateDispute} disabled={actionLoading || !disputeModal.status}>
              {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Update'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </div>
  );
}

export default AdminDashboard;
