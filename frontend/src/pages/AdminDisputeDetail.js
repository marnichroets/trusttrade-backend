import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Textarea } from '../components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { AdminNavbar, Breadcrumbs } from '../components/AdminNavbar';
import axios from 'axios';
import { toast } from 'sonner';
import { 
  ArrowLeft, User, Mail, Phone, Calendar, Clock, 
  CheckCircle, XCircle, FileText, Download, DollarSign, 
  AlertTriangle, Loader2, Image as ImageIcon, MessageSquare, HelpCircle
} from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

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

const getDisputeStatusColor = (status) => {
  const s = status?.toLowerCase() || '';
  if (s.includes('resolved')) return COLORS.green;
  if (s.includes('escalated')) return COLORS.error;
  if (s.includes('review')) return COLORS.info;
  if (s.includes('open') || s.includes('pending')) return COLORS.warning;
  return COLORS.subtext;
};

function AdminDisputeDetail() {
  const { disputeId } = useParams();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [dispute, setDispute] = useState(null);
  const [transaction, setTransaction] = useState(null);
  const [buyer, setBuyer] = useState(null);
  const [seller, setSeller] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [adminNote, setAdminNote] = useState('');
  const [confirmModal, setConfirmModal] = useState({ open: false, action: '', title: '', message: '' });

  useEffect(() => {
    fetchData();
  }, [disputeId]);

  const fetchData = async () => {
    try {
      const [userRes, disputeRes] = await Promise.all([
        axios.get(`${API}/auth/me`, { withCredentials: true }),
        axios.get(`${API}/admin/dispute/${disputeId}`, { withCredentials: true })
      ]);
      
      if (!userRes.data.is_admin) {
        toast.error('Admin access required');
        navigate('/dashboard');
        return;
      }
      
      setUser(userRes.data);
      setDispute(disputeRes.data.dispute);
      setTransaction(disputeRes.data.transaction);
      setBuyer(disputeRes.data.buyer);
      setSeller(disputeRes.data.seller);
    } catch (error) {
      console.error('Failed to fetch:', error);
      toast.error('Failed to load dispute details');
      navigate('/admin/disputes');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await axios.post(`${API}/auth/logout`, {}, { withCredentials: true });
      navigate('/');
    } catch (error) {
      navigate('/');
    }
  };

  const openConfirmModal = (action, title, message) => {
    setConfirmModal({ open: true, action, title, message });
  };

  const handleAction = async () => {
    const action = confirmModal.action;
    setConfirmModal({ ...confirmModal, open: false });
    setActionLoading(true);
    
    try {
      let endpoint = '';
      let method = 'post';
      let data = { admin_email: user?.email, admin_notes: adminNote };
      
      switch (action) {
        case 'release_to_seller':
          endpoint = `${API}/admin/transactions/${transaction?.transaction_id}/release`;
          data.notes = adminNote || 'Dispute resolved - funds released to seller';
          break;
        case 'full_refund':
          endpoint = `${API}/admin/transactions/${transaction?.transaction_id}/refund`;
          data.reason = adminNote || 'Dispute resolved - full refund to buyer';
          break;
        case 'partial_refund':
          endpoint = `${API}/admin/transactions/${transaction?.transaction_id}/partial-refund`;
          data.reason = adminNote || 'Dispute resolved - partial refund';
          break;
        case 'request_buyer_info':
          endpoint = `${API}/admin/disputes/${disputeId}`;
          method = 'patch';
          data = { status: 'Awaiting Buyer Response', admin_notes: adminNote || 'Additional information requested from buyer' };
          break;
        case 'request_seller_info':
          endpoint = `${API}/admin/disputes/${disputeId}`;
          method = 'patch';
          data = { status: 'Awaiting Seller Response', admin_notes: adminNote || 'Additional information requested from seller' };
          break;
        case 'resolve_close':
          endpoint = `${API}/admin/disputes/${disputeId}`;
          method = 'patch';
          data = { status: 'Resolved', resolution: adminNote || 'Dispute resolved by admin', admin_notes: adminNote };
          break;
        case 'add_note':
          endpoint = `${API}/admin/disputes/${disputeId}`;
          method = 'patch';
          data = { admin_notes: adminNote };
          break;
        default:
          toast.error('Unknown action');
          return;
      }
      
      if (method === 'patch') {
        await axios.patch(endpoint, data, { withCredentials: true });
      } else {
        await axios.post(endpoint, data, { withCredentials: true });
      }
      
      toast.success(`Action completed: ${action.replace(/_/g, ' ')}`);
      setAdminNote('');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  const getPhotoUrl = (photo) => {
    if (!photo) return null;
    if (photo.startsWith('http')) return photo;
    const cleanPath = photo.replace(/^\/+/, '');
    if (cleanPath.includes('/')) return `${BACKEND_URL}/uploads/${cleanPath}`;
    return `${BACKEND_URL}/uploads/photos/${cleanPath}`;
  };

  const getDisputePhotoUrl = (photo) => {
    if (!photo) return null;
    if (photo.startsWith('http')) return photo;
    const cleanPath = photo.replace(/^\/+/, '');
    if (cleanPath.includes('/')) return `${BACKEND_URL}/uploads/${cleanPath}`;
    return `${BACKEND_URL}/uploads/disputes/${cleanPath}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: COLORS.section }}>
        <div className="w-12 h-12 border-4 rounded-full animate-spin" style={{ borderColor: COLORS.primary, borderTopColor: 'transparent' }}></div>
      </div>
    );
  }

  if (!dispute) {
    return (
      <div className="min-h-screen flex flex-col" style={{ backgroundColor: COLORS.section }}>
        <AdminNavbar user={user} onLogout={handleLogout} />
        <div className="flex-1 flex items-center justify-center">
          <p style={{ color: COLORS.text }}>Dispute not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: COLORS.section }}>
      <AdminNavbar user={user} onLogout={handleLogout} />

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Breadcrumbs */}
        <Breadcrumbs items={[
          { label: 'Admin', href: '/admin' },
          { label: 'Disputes', href: '/admin/disputes' },
          { label: `disp_${disputeId?.slice(0, 8)}` }
        ]} />

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => navigate('/admin/disputes')} className="p-2">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold" style={{ color: COLORS.text }}>
                Dispute disp_{disputeId?.slice(0, 8)}
              </h1>
              <p style={{ color: COLORS.subtext }} className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Raised {new Date(dispute.created_at).toLocaleString()}
              </p>
            </div>
          </div>
          <Badge style={{ backgroundColor: getDisputeStatusColor(dispute.status), color: 'white' }} className="text-sm px-4 py-2">
            {dispute.status}
          </Badge>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Dispute Details */}
            <Card className="p-6" style={{ backgroundColor: COLORS.background }}>
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2" style={{ color: COLORS.primary }}>
                <AlertTriangle className="w-5 h-5" /> Dispute Details
              </h2>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs uppercase mb-1 font-medium" style={{ color: COLORS.subtext }}>Dispute ID</p>
                  <p className="font-mono" style={{ color: COLORS.text }}>{dispute.dispute_id}</p>
                </div>
                <div>
                  <p className="text-xs uppercase mb-1 font-medium" style={{ color: COLORS.subtext }}>Reference</p>
                  <p className="font-mono font-semibold" style={{ color: COLORS.primary }}>disp_{dispute.dispute_id?.slice(0, 8)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase mb-1 font-medium" style={{ color: COLORS.subtext }}>Date Raised</p>
                  <p style={{ color: COLORS.text }}>{new Date(dispute.created_at).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs uppercase mb-1 font-medium" style={{ color: COLORS.subtext }}>Status</p>
                  <Badge style={{ backgroundColor: getDisputeStatusColor(dispute.status), color: 'white' }}>{dispute.status}</Badge>
                </div>
                <div>
                  <p className="text-xs uppercase mb-1 font-medium" style={{ color: COLORS.subtext }}>Raised By</p>
                  <p style={{ color: COLORS.text }}>
                    {dispute.raised_by_email === transaction?.buyer_email ? 'Buyer' : 'Seller'} - {dispute.raised_by_email || 'Unknown'}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase mb-1 font-medium" style={{ color: COLORS.subtext }}>Category</p>
                  <p className="capitalize" style={{ color: COLORS.text }}>{dispute.dispute_type?.replace(/_/g, ' ') || 'General Dispute'}</p>
                </div>
              </div>
            </Card>

            {/* Reason for Dispute */}
            <Card className="p-6" style={{ backgroundColor: COLORS.background }}>
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2" style={{ color: COLORS.primary }}>
                <MessageSquare className="w-5 h-5" /> Reason for Dispute
              </h2>
              <div className="space-y-4">
                <div>
                  <p className="text-xs uppercase mb-1 font-medium" style={{ color: COLORS.subtext }}>Category</p>
                  <Badge style={{ backgroundColor: COLORS.error, color: 'white' }} className="mb-2">
                    {dispute.dispute_type?.replace(/_/g, ' ') || 'General'}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs uppercase mb-2 font-medium" style={{ color: COLORS.subtext }}>Full Description</p>
                  <div className="p-4 rounded" style={{ backgroundColor: COLORS.section }}>
                    <p className="whitespace-pre-wrap" style={{ color: COLORS.text }}>
                      {dispute.description || dispute.details || dispute.reason || 'No description provided'}
                    </p>
                  </div>
                </div>
              </div>
            </Card>

            {/* Transaction Details */}
            {transaction && (
              <Card className="p-6" style={{ backgroundColor: COLORS.background }}>
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2" style={{ color: COLORS.primary }}>
                  <FileText className="w-5 h-5" /> Transaction Details
                </h2>
                <div className="grid md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <p className="text-xs uppercase mb-1 font-medium" style={{ color: COLORS.subtext }}>Reference</p>
                    <Link to={`/admin/transaction/${transaction.transaction_id}`} className="font-mono font-semibold hover:underline" style={{ color: COLORS.info }}>
                      {transaction.share_code}
                    </Link>
                  </div>
                  <div>
                    <p className="text-xs uppercase mb-1 font-medium" style={{ color: COLORS.subtext }}>Payment Amount</p>
                    <p className="text-xl font-bold" style={{ color: COLORS.green }}>R {transaction.item_price?.toLocaleString(undefined, {minimumFractionDigits: 2})}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase mb-1 font-medium" style={{ color: COLORS.subtext }}>Payment Status</p>
                    <Badge style={{ backgroundColor: COLORS.info, color: 'white' }}>{transaction.payment_status}</Badge>
                  </div>
                  <div>
                    <p className="text-xs uppercase mb-1 font-medium" style={{ color: COLORS.subtext }}>Payment Method</p>
                    <p className="capitalize" style={{ color: COLORS.text }}>{transaction.payment_method || 'Card'}</p>
                  </div>
                </div>
                <div className="mb-4">
                  <p className="text-xs uppercase mb-1 font-medium" style={{ color: COLORS.subtext }}>Item Description</p>
                  <p style={{ color: COLORS.text }}>{transaction.item_description}</p>
                </div>
                {/* Item Photos */}
                {transaction.item_photos && transaction.item_photos.length > 0 && (
                  <div>
                    <p className="text-xs uppercase mb-2 font-medium" style={{ color: COLORS.subtext }}>Item Photos</p>
                    <div className="grid grid-cols-3 gap-2">
                      {transaction.item_photos.slice(0, 3).map((photo, i) => (
                        <div key={i} className="relative group">
                          <img 
                            src={getPhotoUrl(photo)} 
                            alt={`Item ${i+1}`} 
                            className="w-full h-24 object-cover rounded cursor-pointer border hover:opacity-90"
                            style={{ borderColor: COLORS.border }}
                            onClick={() => window.open(getPhotoUrl(photo), '_blank')}
                            onError={(e) => { e.target.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect fill="%23f8f9fa" width="100" height="100"/></svg>'; }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="mt-4">
                  <Link to={`/admin/transaction/${transaction.transaction_id}`}>
                    <Button variant="outline" size="sm">View Full Transaction Details</Button>
                  </Link>
                </div>
              </Card>
            )}

            {/* Evidence Photos */}
            <Card className="p-6" style={{ backgroundColor: COLORS.background }}>
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2" style={{ color: COLORS.primary }}>
                <ImageIcon className="w-5 h-5" /> Evidence Photos
              </h2>
              {(dispute.evidence_photos && dispute.evidence_photos.length > 0) || (dispute.evidence && dispute.evidence.length > 0) ? (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {(dispute.evidence_photos || dispute.evidence || []).map((photo, i) => (
                    <div key={i} className="relative group">
                      <img 
                        src={getDisputePhotoUrl(photo)} 
                        alt={`Evidence ${i+1}`} 
                        className="w-full h-40 object-cover rounded cursor-pointer border hover:opacity-90 transition-opacity"
                        style={{ borderColor: COLORS.border }}
                        onClick={() => window.open(getDisputePhotoUrl(photo), '_blank')}
                        onError={(e) => { e.target.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect fill="%23f8f9fa" width="100" height="100"/><text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="%236c757d" font-size="10">No Image</text></svg>'; }}
                      />
                      <a 
                        href={getDisputePhotoUrl(photo)} 
                        download={`evidence-${i+1}`}
                        className="absolute bottom-2 right-2 p-2 rounded bg-white shadow opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Download className="w-4 h-4" style={{ color: COLORS.primary }} />
                      </a>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 rounded border-2 border-dashed flex flex-col items-center justify-center" style={{ borderColor: COLORS.border }}>
                  <ImageIcon className="w-12 h-12 mb-2" style={{ color: COLORS.subtext }} />
                  <p style={{ color: COLORS.subtext }}>No evidence photos uploaded</p>
                </div>
              )}
            </Card>

            {/* Party Statements */}
            <Card className="p-6" style={{ backgroundColor: COLORS.background }}>
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2" style={{ color: COLORS.primary }}>
                <User className="w-5 h-5" /> Party Statements
              </h2>
              <div className="space-y-4">
                {/* Buyer Statement */}
                <div className="p-4 rounded border" style={{ borderColor: COLORS.border }}>
                  <div className="flex items-center gap-2 mb-2">
                    <Badge style={{ backgroundColor: COLORS.info, color: 'white' }}>Buyer</Badge>
                    <span className="font-medium" style={{ color: COLORS.text }}>{transaction?.buyer_name}</span>
                    <span className="text-xs" style={{ color: COLORS.subtext }}>({transaction?.buyer_email})</span>
                  </div>
                  <p style={{ color: COLORS.text }}>
                    {dispute.buyer_statement || (dispute.raised_by_email === transaction?.buyer_email ? dispute.description : 'No statement provided')}
                  </p>
                  {dispute.buyer_statement_at && (
                    <p className="text-xs mt-2" style={{ color: COLORS.subtext }}>
                      Submitted: {new Date(dispute.buyer_statement_at).toLocaleString()}
                    </p>
                  )}
                </div>
                
                {/* Seller Statement */}
                <div className="p-4 rounded border" style={{ borderColor: COLORS.border }}>
                  <div className="flex items-center gap-2 mb-2">
                    <Badge style={{ backgroundColor: COLORS.green, color: 'white' }}>Seller</Badge>
                    <span className="font-medium" style={{ color: COLORS.text }}>{transaction?.seller_name}</span>
                    <span className="text-xs" style={{ color: COLORS.subtext }}>({transaction?.seller_email})</span>
                  </div>
                  <p style={{ color: COLORS.text }}>
                    {dispute.seller_statement || (dispute.raised_by_email === transaction?.seller_email ? dispute.description : 'No statement provided')}
                  </p>
                  {dispute.seller_statement_at && (
                    <p className="text-xs mt-2" style={{ color: COLORS.subtext }}>
                      Submitted: {new Date(dispute.seller_statement_at).toLocaleString()}
                    </p>
                  )}
                </div>
              </div>
            </Card>

            {/* Dispute Timeline */}
            <Card className="p-6" style={{ backgroundColor: COLORS.background }}>
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2" style={{ color: COLORS.primary }}>
                <Clock className="w-5 h-5" /> Dispute Timeline
              </h2>
              <div className="space-y-4">
                {/* Dispute opened */}
                <div className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS.error }}></div>
                    <div className="w-0.5 flex-1" style={{ backgroundColor: COLORS.border }}></div>
                  </div>
                  <div className="pb-4">
                    <p className="font-medium" style={{ color: COLORS.text }}>Dispute Opened</p>
                    <p className="text-xs" style={{ color: COLORS.subtext }}>
                      {new Date(dispute.created_at).toLocaleString()} • By: {dispute.raised_by_email || 'Unknown'}
                    </p>
                    <p className="text-sm mt-1" style={{ color: COLORS.subtext }}>
                      Category: {dispute.dispute_type?.replace(/_/g, ' ') || 'General'}
                    </p>
                  </div>
                </div>
                
                {/* Dispute history/updates */}
                {dispute.history && dispute.history.map((event, i) => (
                  <div key={i} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS.info }}></div>
                      <div className="w-0.5 flex-1" style={{ backgroundColor: COLORS.border }}></div>
                    </div>
                    <div className="pb-4">
                      <p className="font-medium" style={{ color: COLORS.text }}>{event.action || event.status}</p>
                      <p className="text-xs" style={{ color: COLORS.subtext }}>
                        {new Date(event.timestamp).toLocaleString()}
                        {event.by && ` • ${event.by}`}
                      </p>
                      {event.note && <p className="text-sm mt-1" style={{ color: COLORS.text }}>{event.note}</p>}
                    </div>
                  </div>
                ))}
                
                {/* Admin notes */}
                {dispute.admin_notes && (
                  <div className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS.warning }}></div>
                      <div className="w-0.5 flex-1" style={{ backgroundColor: COLORS.border }}></div>
                    </div>
                    <div className="pb-4">
                      <p className="font-medium" style={{ color: COLORS.text }}>Admin Note Added</p>
                      <p className="text-sm mt-1 p-2 rounded" style={{ backgroundColor: COLORS.section }}>
                        {typeof dispute.admin_notes === 'string' ? dispute.admin_notes : JSON.stringify(dispute.admin_notes)}
                      </p>
                    </div>
                  </div>
                )}
                
                {/* Resolution */}
                {dispute.resolution && (
                  <div className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS.green }}></div>
                    </div>
                    <div>
                      <p className="font-medium" style={{ color: COLORS.text }}>Dispute Resolved</p>
                      <p className="text-xs" style={{ color: COLORS.subtext }}>
                        {dispute.resolved_at ? new Date(dispute.resolved_at).toLocaleString() : ''}
                      </p>
                      <p className="text-sm mt-1 p-2 rounded" style={{ backgroundColor: COLORS.section }}>
                        {dispute.resolution}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          </div>

          {/* Admin Resolution Panel - Sidebar */}
          <div className="space-y-6">
            <Card className="p-6" style={{ backgroundColor: COLORS.background }}>
              <h2 className="text-lg font-semibold mb-4" style={{ color: COLORS.primary }}>Admin Resolution Panel</h2>
              <div className="space-y-3">
                <Button 
                  onClick={() => openConfirmModal('release_to_seller', 'Release Funds to Seller', `Release R ${transaction?.item_price?.toLocaleString()} to ${transaction?.seller_name}? This resolves the dispute in favor of the seller.`)}
                  disabled={actionLoading || dispute.status === 'Resolved'}
                  className="w-full text-white justify-center"
                  style={{ backgroundColor: COLORS.green }}
                >
                  <DollarSign className="w-4 h-4 mr-2" />
                  Release Funds to Seller
                </Button>
                
                <Button 
                  onClick={() => openConfirmModal('full_refund', 'Full Refund to Buyer', `Full refund of R ${transaction?.item_price?.toLocaleString()} to ${transaction?.buyer_name}? This resolves the dispute in favor of the buyer.`)}
                  disabled={actionLoading || dispute.status === 'Resolved'}
                  className="w-full text-white justify-center"
                  style={{ backgroundColor: COLORS.error }}
                >
                  <XCircle className="w-4 h-4 mr-2" />
                  Full Refund to Buyer
                </Button>
                
                <Button 
                  onClick={() => openConfirmModal('partial_refund', 'Partial Refund', 'Process a partial refund? Enter the amount and reason in the notes field.')}
                  disabled={actionLoading || dispute.status === 'Resolved'}
                  className="w-full text-white justify-center"
                  style={{ backgroundColor: COLORS.warning }}
                >
                  <DollarSign className="w-4 h-4 mr-2" />
                  Partial Refund
                </Button>
                
                <Button 
                  onClick={() => openConfirmModal('request_buyer_info', 'Request Info from Buyer', `Request additional information from ${transaction?.buyer_name}?`)}
                  disabled={actionLoading || dispute.status === 'Resolved'}
                  className="w-full text-white justify-center"
                  style={{ backgroundColor: COLORS.info }}
                >
                  <HelpCircle className="w-4 h-4 mr-2" />
                  Request More Info from Buyer
                </Button>
                
                <Button 
                  onClick={() => openConfirmModal('request_seller_info', 'Request Info from Seller', `Request additional information from ${transaction?.seller_name}?`)}
                  disabled={actionLoading || dispute.status === 'Resolved'}
                  className="w-full text-white justify-center"
                  style={{ backgroundColor: COLORS.info }}
                >
                  <HelpCircle className="w-4 h-4 mr-2" />
                  Request More Info from Seller
                </Button>
                
                <Button 
                  onClick={() => openConfirmModal('resolve_close', 'Resolve and Close', 'Mark this dispute as resolved and close it? Add resolution notes below.')}
                  disabled={actionLoading || dispute.status === 'Resolved'}
                  className="w-full text-white justify-center"
                  style={{ backgroundColor: COLORS.primary }}
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Resolve and Close
                </Button>
              </div>
              
              {/* Admin Notes Section */}
              <div className="mt-6 pt-6" style={{ borderTop: `1px solid ${COLORS.border}` }}>
                <p className="text-sm font-medium mb-2" style={{ color: COLORS.text }}>Admin Notes</p>
                <Textarea 
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  placeholder="Add notes for resolution or action..."
                  rows={4}
                  className="mb-3"
                  style={{ borderColor: COLORS.border }}
                />
                <Button 
                  onClick={() => openConfirmModal('add_note', 'Save Admin Note', 'Save this note to the dispute record?')}
                  disabled={actionLoading || !adminNote.trim()}
                  className="w-full text-white justify-center"
                  style={{ backgroundColor: COLORS.subtext }}
                >
                  Save Note
                </Button>
              </div>
            </Card>

            {/* Quick Info */}
            <Card className="p-6" style={{ backgroundColor: COLORS.background }}>
              <h3 className="text-sm font-semibold mb-3" style={{ color: COLORS.primary }}>Quick Info</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span style={{ color: COLORS.subtext }}>Days Open</span>
                  <span className="font-semibold" style={{ color: COLORS.text }}>
                    {Math.floor((new Date() - new Date(dispute.created_at)) / (1000 * 60 * 60 * 24))} days
                  </span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: COLORS.subtext }}>Transaction Amount</span>
                  <span className="font-semibold" style={{ color: COLORS.green }}>R {transaction?.item_price?.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: COLORS.subtext }}>Raised By</span>
                  <span style={{ color: COLORS.text }}>
                    {dispute.raised_by_email === transaction?.buyer_email ? 'Buyer' : 'Seller'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: COLORS.subtext }}>Transaction Status</span>
                  <Badge style={{ backgroundColor: COLORS.info, color: 'white' }} className="text-xs">
                    {transaction?.payment_status}
                  </Badge>
                </div>
              </div>
            </Card>

            {/* Saved Notes */}
            {dispute.admin_notes && (
              <Card className="p-6" style={{ backgroundColor: COLORS.background }}>
                <h3 className="text-sm font-semibold mb-3" style={{ color: COLORS.primary }}>Saved Admin Notes</h3>
                <div className="p-3 rounded text-sm" style={{ backgroundColor: COLORS.section }}>
                  <p style={{ color: COLORS.text }}>
                    {typeof dispute.admin_notes === 'string' ? dispute.admin_notes : JSON.stringify(dispute.admin_notes)}
                  </p>
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* Confirmation Dialog */}
      <Dialog open={confirmModal.open} onOpenChange={(open) => setConfirmModal({ ...confirmModal, open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle style={{ color: COLORS.text }}>{confirmModal.title}</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm" style={{ color: COLORS.subtext }}>{confirmModal.message}</p>
            {confirmModal.action !== 'add_note' && (
              <div className="mt-4 p-3 rounded" style={{ backgroundColor: COLORS.section }}>
                <p className="text-xs mb-2 font-medium" style={{ color: COLORS.subtext }}>This action will:</p>
                <ul className="text-xs space-y-1" style={{ color: COLORS.text }}>
                  <li>• Update the dispute status</li>
                  <li>• Send email notification to both parties</li>
                  <li>• Send SMS notification to both parties</li>
                  <li>• Log action to dispute timeline</li>
                </ul>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmModal({ ...confirmModal, open: false })}>
              Cancel
            </Button>
            <Button 
              onClick={handleAction} 
              disabled={actionLoading}
              className="text-white"
              style={{ 
                backgroundColor: confirmModal.action.includes('refund') 
                  ? COLORS.error 
                  : confirmModal.action.includes('release') || confirmModal.action.includes('resolve')
                    ? COLORS.green 
                    : COLORS.primary 
              }}
            >
              {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default AdminDisputeDetail;
