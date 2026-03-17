import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
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
import { Users, FileText, AlertCircle, TrendingUp, RefreshCw, DollarSign, MessageSquare, ShieldCheck, CheckCircle, XCircle, Loader2 } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function AdminDashboard() {
  const [user, setUser] = useState(null);
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [disputes, setDisputes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  
  // Modal states
  const [refundModal, setRefundModal] = useState({ open: false, transaction: null });
  const [releaseModal, setReleaseModal] = useState({ open: false, transaction: null });
  const [notesModal, setNotesModal] = useState({ open: false, transaction: null, notes: '' });
  const [verifyModal, setVerifyModal] = useState({ open: false, user: null, status: 'verified', notes: '' });
  const [disputeModal, setDisputeModal] = useState({ open: false, dispute: null, status: '', resolution: '', notes: '' });
  
  const navigate = useNavigate();

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

  const getStatusBadge = (status) => {
    const variants = {
      'Pending': 'bg-yellow-100 text-yellow-800',
      'Paid': 'bg-green-100 text-green-800',
      'Released': 'bg-green-100 text-green-800',
      'Refunded': 'bg-red-100 text-red-800',
      'Resolved': 'bg-green-100 text-green-800',
      'Open': 'bg-yellow-100 text-yellow-800',
      'Under Review': 'bg-blue-100 text-blue-800',
      'Escalated': 'bg-red-100 text-red-800'
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
            <h1 className="text-3xl font-bold text-slate-900" data-testid="admin-dashboard-title">Admin Dashboard</h1>
            <p className="text-slate-600 mt-2">System overview and management</p>
          </div>
          <Button onClick={fetchData} variant="outline" size="sm">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="grid md:grid-cols-4 gap-6">
            <Card className="p-6 hover:shadow-md transition-shadow duration-200">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-slate-600 mb-1">Total Users</p>
                  <p className="text-3xl font-bold text-slate-900" data-testid="admin-total-users">{stats.total_users}</p>
                </div>
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                  <Users className="w-6 h-6 text-primary" />
                </div>
              </div>
            </Card>

            <Card className="p-6 hover:shadow-md transition-shadow duration-200">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-slate-600 mb-1">Total Transactions</p>
                  <p className="text-3xl font-bold text-slate-900">{stats.total_transactions}</p>
                </div>
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                  <FileText className="w-6 h-6 text-green-600" />
                </div>
              </div>
            </Card>

            <Card className="p-6 hover:shadow-md transition-shadow duration-200">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-slate-600 mb-1">Pending Transactions</p>
                  <p className="text-3xl font-bold text-yellow-600">{stats.pending_transactions}</p>
                </div>
                <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
                  <TrendingUp className="w-6 h-6 text-yellow-600" />
                </div>
              </div>
            </Card>

            <Card className="p-6 hover:shadow-md transition-shadow duration-200">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-slate-600 mb-1">Open Disputes</p>
                  <p className="text-3xl font-bold text-red-600">{stats.pending_disputes}</p>
                </div>
                <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
                  <AlertCircle className="w-6 h-6 text-red-600" />
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* Tabs */}
        <Tabs defaultValue="transactions" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="transactions">Transactions</TabsTrigger>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="disputes">Disputes</TabsTrigger>
          </TabsList>

          {/* Transactions Tab */}
          <TabsContent value="transactions" className="mt-6">
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b">
                    <tr>
                      <th className="text-left p-4 text-sm font-medium text-slate-600">ID / Code</th>
                      <th className="text-left p-4 text-sm font-medium text-slate-600">Buyer</th>
                      <th className="text-left p-4 text-sm font-medium text-slate-600">Seller</th>
                      <th className="text-left p-4 text-sm font-medium text-slate-600">Amount</th>
                      <th className="text-left p-4 text-sm font-medium text-slate-600">Delivery</th>
                      <th className="text-left p-4 text-sm font-medium text-slate-600">Status</th>
                      <th className="text-left p-4 text-sm font-medium text-slate-600">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.slice(0, 20).map((t) => (
                      <tr key={t.transaction_id} className="border-b hover:bg-slate-50">
                        <td className="p-4">
                          <p className="font-mono text-sm font-medium">{t.share_code || t.transaction_id?.slice(0, 8)}</p>
                        </td>
                        <td className="p-4">
                          <p className="text-sm">{t.buyer_name}</p>
                          <p className="text-xs text-slate-500">{t.buyer_email}</p>
                        </td>
                        <td className="p-4">
                          <p className="text-sm">{t.seller_name}</p>
                          <p className="text-xs text-slate-500">{t.seller_email}</p>
                        </td>
                        <td className="p-4 font-mono">R {t.item_price?.toFixed(2)}</td>
                        <td className="p-4">
                          <Badge variant="outline" className="text-xs">
                            {t.delivery_method || 'N/A'}
                          </Badge>
                        </td>
                        <td className="p-4">
                          <Badge className={getStatusBadge(t.payment_status)}>{t.payment_status}</Badge>
                        </td>
                        <td className="p-4">
                          <div className="flex gap-1 flex-wrap">
                            {t.payment_status === 'Paid' && (
                              <Button 
                                size="sm" 
                                variant="outline"
                                className="text-green-600 border-green-200 hover:bg-green-50"
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
                                className="text-red-600 border-red-200 hover:bg-red-50"
                                onClick={() => setRefundModal({ open: true, transaction: t, reason: '' })}
                              >
                                <RefreshCw className="w-3 h-3 mr-1" />
                                Refund
                              </Button>
                            )}
                            <Button 
                              size="sm" 
                              variant="ghost"
                              onClick={() => setNotesModal({ open: true, transaction: t, notes: '' })}
                            >
                              <MessageSquare className="w-3 h-3 mr-1" />
                              Note
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </TabsContent>

          {/* Users Tab */}
          <TabsContent value="users" className="mt-6">
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b">
                    <tr>
                      <th className="text-left p-4 text-sm font-medium text-slate-600">Name</th>
                      <th className="text-left p-4 text-sm font-medium text-slate-600">Email</th>
                      <th className="text-left p-4 text-sm font-medium text-slate-600">Trades</th>
                      <th className="text-left p-4 text-sm font-medium text-slate-600">Trust Score</th>
                      <th className="text-left p-4 text-sm font-medium text-slate-600">Verified</th>
                      <th className="text-left p-4 text-sm font-medium text-slate-600">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.slice(0, 20).map((u) => (
                      <tr key={u.user_id} className="border-b hover:bg-slate-50">
                        <td className="p-4">
                          <p className="font-medium">{u.name}</p>
                          {u.is_admin && <Badge className="bg-purple-100 text-purple-800 text-xs mt-1">Admin</Badge>}
                        </td>
                        <td className="p-4 text-sm">{u.email}</td>
                        <td className="p-4 text-sm">{u.total_trades || 0}</td>
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            <div className="w-16 bg-slate-200 rounded-full h-2">
                              <div 
                                className="bg-primary h-2 rounded-full" 
                                style={{ width: `${u.trust_score || 50}%` }}
                              />
                            </div>
                            <span className="text-sm">{u.trust_score || 50}</span>
                          </div>
                        </td>
                        <td className="p-4">
                          {u.verified ? (
                            <Badge className="bg-green-100 text-green-800">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Verified
                            </Badge>
                          ) : (
                            <Badge className="bg-yellow-100 text-yellow-800">Pending</Badge>
                          )}
                        </td>
                        <td className="p-4">
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => setVerifyModal({ open: true, user: u, status: u.verified ? 'verified' : 'pending', notes: '' })}
                          >
                            <ShieldCheck className="w-3 h-3 mr-1" />
                            Verify ID
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </TabsContent>

          {/* Disputes Tab */}
          <TabsContent value="disputes" className="mt-6">
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b">
                    <tr>
                      <th className="text-left p-4 text-sm font-medium text-slate-600">Dispute ID</th>
                      <th className="text-left p-4 text-sm font-medium text-slate-600">Transaction</th>
                      <th className="text-left p-4 text-sm font-medium text-slate-600">Type</th>
                      <th className="text-left p-4 text-sm font-medium text-slate-600">Raised By</th>
                      <th className="text-left p-4 text-sm font-medium text-slate-600">Status</th>
                      <th className="text-left p-4 text-sm font-medium text-slate-600">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {disputes.map((d) => (
                      <tr key={d.dispute_id} className="border-b hover:bg-slate-50">
                        <td className="p-4 font-mono text-sm">{d.dispute_id?.slice(0, 8)}</td>
                        <td className="p-4 font-mono text-sm">{d.transaction_id?.slice(0, 8)}</td>
                        <td className="p-4 text-sm">{d.dispute_type}</td>
                        <td className="p-4 text-sm">{d.raised_by_name || 'Unknown'}</td>
                        <td className="p-4">
                          <Badge className={getStatusBadge(d.status)}>{d.status}</Badge>
                        </td>
                        <td className="p-4">
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => setDisputeModal({ 
                              open: true, 
                              dispute: d, 
                              status: d.status?.toLowerCase().replace(' ', '_') || 'open',
                              resolution: '',
                              notes: d.admin_notes || ''
                            })}
                          >
                            <AlertCircle className="w-3 h-3 mr-1" />
                            Update
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {disputes.length === 0 && (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-slate-500">No disputes found</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* ============ MODALS ============ */}

      {/* Refund Modal */}
      <Dialog open={refundModal.open} onOpenChange={(open) => setRefundModal({ ...refundModal, open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Refund Transaction</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-slate-600">
              Refund transaction <strong>{refundModal.transaction?.share_code}</strong> for{' '}
              <strong>R {refundModal.transaction?.total?.toFixed(2)}</strong>?
            </p>
            <div>
              <label className="text-sm font-medium">Reason (optional)</label>
              <Textarea
                value={refundModal.reason || ''}
                onChange={(e) => setRefundModal({ ...refundModal, reason: e.target.value })}
                placeholder="Enter refund reason..."
              />
            </div>
            <p className="text-xs text-slate-500">
              The buyer ({refundModal.transaction?.buyer_email}) will be notified via email.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRefundModal({ open: false, transaction: null })}>
              Cancel
            </Button>
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
            <p className="text-sm text-slate-600">
              Release funds for transaction <strong>{releaseModal.transaction?.share_code}</strong>?
            </p>
            <div className="p-4 bg-green-50 rounded-lg">
              <p className="text-sm text-green-800">
                <strong>R {releaseModal.transaction?.item_price?.toFixed(2)}</strong> will be released to{' '}
                <strong>{releaseModal.transaction?.seller_name}</strong>
              </p>
            </div>
            <div>
              <label className="text-sm font-medium">Admin Notes (optional)</label>
              <Textarea
                value={releaseModal.notes || ''}
                onChange={(e) => setReleaseModal({ ...releaseModal, notes: e.target.value })}
                placeholder="Add notes..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReleaseModal({ open: false, transaction: null })}>
              Cancel
            </Button>
            <Button onClick={handleReleaseFunds} disabled={actionLoading} className="bg-green-600 hover:bg-green-700">
              {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Release Funds'}
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
          <div className="space-y-4 py-4">
            <p className="text-sm text-slate-600">
              Add a note to transaction <strong>{notesModal.transaction?.share_code}</strong>
            </p>
            <Textarea
              value={notesModal.notes}
              onChange={(e) => setNotesModal({ ...notesModal, notes: e.target.value })}
              placeholder="Enter your note..."
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNotesModal({ open: false, transaction: null, notes: '' })}>
              Cancel
            </Button>
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
            <p className="text-sm text-slate-600">
              Update verification for <strong>{verifyModal.user?.name}</strong> ({verifyModal.user?.email})
            </p>
            <div>
              <label className="text-sm font-medium">Verification Status</label>
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
            </div>
            <div>
              <label className="text-sm font-medium">Notes (optional)</label>
              <Textarea
                value={verifyModal.notes}
                onChange={(e) => setVerifyModal({ ...verifyModal, notes: e.target.value })}
                placeholder="Add verification notes..."
              />
            </div>
            <p className="text-xs text-slate-500">
              The user will be notified via email about this status change.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVerifyModal({ open: false, user: null, status: 'verified', notes: '' })}>
              Cancel
            </Button>
            <Button onClick={handleVerifyUser} disabled={actionLoading}>
              {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Update Status'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Update Dispute Modal */}
      <Dialog open={disputeModal.open} onOpenChange={(open) => setDisputeModal({ ...disputeModal, open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Dispute Status</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-slate-600">
              Update dispute <strong>{disputeModal.dispute?.dispute_id?.slice(0, 8)}</strong>
            </p>
            <div>
              <label className="text-sm font-medium">Dispute Status</label>
              <Select value={disputeModal.status} onValueChange={(val) => setDisputeModal({ ...disputeModal, status: val })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="under_review">Under Review</SelectItem>
                  <SelectItem value="escalated">Escalated</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {disputeModal.status === 'resolved' && (
              <div>
                <label className="text-sm font-medium">Resolution</label>
                <Textarea
                  value={disputeModal.resolution}
                  onChange={(e) => setDisputeModal({ ...disputeModal, resolution: e.target.value })}
                  placeholder="Describe the resolution..."
                />
              </div>
            )}
            <div>
              <label className="text-sm font-medium">Admin Notes</label>
              <Textarea
                value={disputeModal.notes}
                onChange={(e) => setDisputeModal({ ...disputeModal, notes: e.target.value })}
                placeholder="Add notes..."
              />
            </div>
            <p className="text-xs text-slate-500">
              Both buyer and seller will be notified via email.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisputeModal({ open: false, dispute: null, status: '', resolution: '', notes: '' })}>
              Cancel
            </Button>
            <Button onClick={handleUpdateDispute} disabled={actionLoading || !disputeModal.status}>
              {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Update Dispute'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

export default AdminDashboard;
