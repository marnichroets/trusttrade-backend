import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Textarea } from '../components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { AdminNavbar, Breadcrumbs } from '../components/AdminNavbar';
import api, { API_URL } from '../utils/api';
import { toast } from 'sonner';
import { 
  ArrowLeft, User, Mail, Phone, CreditCard, Calendar, Clock, 
  Shield, CheckCircle, XCircle, FileText, Download, DollarSign, 
  AlertTriangle, Loader2, Image as ImageIcon, Ban
} from 'lucide-react';

const BACKEND_URL = API_URL.replace('/api', '');

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

const getStatusColor = (status) => {
  const s = status?.toLowerCase() || '';
  if (s.includes('completed') || s.includes('released')) return COLORS.green;
  if (s.includes('dispute') || s.includes('refund')) return COLORS.error;
  if (s.includes('pending') || s.includes('awaiting')) return COLORS.warning;
  if (s.includes('active') || s.includes('paid')) return COLORS.info;
  return COLORS.subtext;
};

const getStatusBadgeStyle = (status) => {
  return { backgroundColor: getStatusColor(status), color: 'white' };
};

function AdminTransactionDetail() {
  const { transactionId } = useParams();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [transaction, setTransaction] = useState(null);
  const [buyer, setBuyer] = useState(null);
  const [seller, setSeller] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [adminNote, setAdminNote] = useState('');
  
  // Confirmation modals
  const [confirmModal, setConfirmModal] = useState({ open: false, action: '', title: '', message: '' });

  useEffect(() => {
    fetchData();
  }, [transactionId]);

  const fetchData = async () => {
    try {
      const [userRes, txnRes] = await Promise.all([
        api.get('/auth/me'),
        api.get(`/admin/transaction/${transactionId}`)
      ]);
      
      if (!userRes.data.is_admin) {
        toast.error('Admin access required');
        navigate('/dashboard');
        return;
      }
      
      setUser(userRes.data);
      setTransaction(txnRes.data.transaction);
      setBuyer(txnRes.data.buyer);
      setSeller(txnRes.data.seller);
    } catch (error) {
      console.error('Failed to fetch:', error);
      toast.error('Failed to load transaction details');
      navigate('/admin');
    } finally {
      setLoading(false);
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
      let data = { admin_email: user?.email, admin_note: adminNote };
      
      switch (action) {
        case 'release_funds':
          endpoint = `/admin/transactions/${transactionId}/release`;
          data.notes = adminNote;
          break;
        case 'refund_buyer':
          endpoint = `/admin/transactions/${transactionId}/refund`;
          data.reason = adminNote || 'Admin refund';
          break;
        case 'suspend_buyer':
          endpoint = `/admin/users/${buyer?.user_id}/suspend`;
          break;
        case 'suspend_seller':
          endpoint = `/admin/users/${seller?.user_id}/suspend`;
          break;
        case 'add_note':
          endpoint = `/admin/transactions/${transactionId}/notes`;
          data = { notes: adminNote };
          break;
        default:
          toast.error('Unknown action');
          return;
      }
      
      await api.post(endpoint, data);
      toast.success(`Action completed: ${action.replace('_', ' ')}`);
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
    // Remove any leading slashes and construct proper URL
    const cleanPath = photo.replace(/^\/+/, '');
    return `${BACKEND_URL}/uploads/${cleanPath.includes('/') ? cleanPath : `photos/${cleanPath}`}`;
  };

  const getVerificationPhotoUrl = (path) => {
    if (!path) return null;
    if (path.startsWith('http')) return path;
    const cleanPath = path.replace(/^\/+/, '');
    return `${BACKEND_URL}/uploads/${cleanPath.includes('/') ? cleanPath : `verification/${cleanPath}`}`;
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

  if (!transaction) {
    return (
      <div className="min-h-screen flex flex-col" style={{ backgroundColor: COLORS.section }}>
        <AdminNavbar user={user} onLogout={handleLogout} />
        <div className="flex-1 flex items-center justify-center">
          <p style={{ color: COLORS.text }}>Transaction not found</p>
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
          { label: 'Transactions', href: '/admin?tab=transactions' },
          { label: transaction.share_code || transactionId }
        ]} />

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              onClick={() => navigate('/admin')} 
              className="p-2"
              data-testid="back-to-admin"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold" style={{ color: COLORS.text }} data-testid="transaction-title">
                Transaction {transaction.share_code}
              </h1>
              <p style={{ color: COLORS.subtext }} className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Created {new Date(transaction.created_at).toLocaleString()}
              </p>
            </div>
          </div>
          <Badge style={getStatusBadgeStyle(transaction.payment_status)} className="text-sm px-4 py-2" data-testid="transaction-status">
            {transaction.payment_status}
          </Badge>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Main Content - Left 2 columns */}
          <div className="lg:col-span-2 space-y-6">
            {/* Transaction Overview */}
            <Card className="p-6" style={{ backgroundColor: COLORS.background }} data-testid="overview-section">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2" style={{ color: COLORS.primary }}>
                <FileText className="w-5 h-5" /> Transaction Overview
              </h2>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs uppercase mb-1 font-medium" style={{ color: COLORS.subtext }}>Transaction ID</p>
                  <p className="font-mono text-sm" style={{ color: COLORS.text }}>{transaction.transaction_id}</p>
                </div>
                <div>
                  <p className="text-xs uppercase mb-1 font-medium" style={{ color: COLORS.subtext }}>Reference Code</p>
                  <p className="font-mono text-sm font-semibold" style={{ color: COLORS.primary }}>{transaction.share_code}</p>
                </div>
                <div>
                  <p className="text-xs uppercase mb-1 font-medium" style={{ color: COLORS.subtext }}>Created</p>
                  <p className="text-sm" style={{ color: COLORS.text }}>{new Date(transaction.created_at).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs uppercase mb-1 font-medium" style={{ color: COLORS.subtext }}>Delivery Method</p>
                  <p className="text-sm capitalize" style={{ color: COLORS.text }}>{transaction.delivery_method?.replace(/_/g, ' ') || 'Not specified'}</p>
                </div>
                <div>
                  <p className="text-xs uppercase mb-1 font-medium" style={{ color: COLORS.subtext }}>Status</p>
                  <Badge style={getStatusBadgeStyle(transaction.payment_status)}>{transaction.payment_status}</Badge>
                </div>
                {transaction.tradesafe_id && (
                  <div>
                    <p className="text-xs uppercase mb-1 font-medium" style={{ color: COLORS.subtext }}>TradeSafe Reference</p>
                    <p className="font-mono text-sm" style={{ color: COLORS.text }}>{transaction.tradesafe_id}</p>
                  </div>
                )}
              </div>
            </Card>

            {/* Two columns: Buyer and Seller */}
            <div className="grid md:grid-cols-2 gap-6">
              {/* Buyer Details */}
              <Card className="p-6" style={{ backgroundColor: COLORS.background }} data-testid="buyer-section">
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2" style={{ color: COLORS.primary }}>
                  <User className="w-5 h-5" /> Buyer Details
                </h2>
                <div className="space-y-3">
                  <div>
                    <p className="text-xs uppercase mb-1 font-medium" style={{ color: COLORS.subtext }}>Full Name</p>
                    <p className="text-sm font-medium" style={{ color: COLORS.text }}>{transaction.buyer_name}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase mb-1 font-medium" style={{ color: COLORS.subtext }}>Email</p>
                    <p className="text-sm flex items-center gap-1" style={{ color: COLORS.text }}>
                      <Mail className="w-3 h-3" /> {transaction.buyer_email}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase mb-1 font-medium" style={{ color: COLORS.subtext }}>Phone</p>
                    <p className="text-sm flex items-center gap-1" style={{ color: COLORS.text }}>
                      <Phone className="w-3 h-3" /> {buyer?.phone || transaction.buyer_phone || 'Not provided'}
                    </p>
                  </div>
                  {buyer?.id_number && (
                    <div>
                      <p className="text-xs uppercase mb-1 font-medium" style={{ color: COLORS.subtext }}>ID Number</p>
                      <p className="text-sm font-mono" style={{ color: COLORS.text }}>{buyer.id_number}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs uppercase mb-1 font-medium" style={{ color: COLORS.subtext }}>Verified Status</p>
                    {buyer?.id_verified || buyer?.verified ? (
                      <Badge style={{ backgroundColor: COLORS.green, color: 'white' }} className="inline-flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" /> Verified
                      </Badge>
                    ) : (
                      <Badge style={{ backgroundColor: COLORS.subtext, color: 'white' }}>Not Verified</Badge>
                    )}
                  </div>
                  
                  {/* Buyer ID Photo */}
                  {(buyer?.id_front_path || buyer?.id_document || buyer?.verification?.id_document_path) && (
                    <div>
                      <p className="text-xs uppercase mb-2 font-medium" style={{ color: COLORS.subtext }}>ID Document</p>
                      <div className="relative group">
                        <img 
                          src={getVerificationPhotoUrl(buyer.id_front_path || buyer.id_document || buyer.verification?.id_document_path)} 
                          alt="Buyer ID" 
                          className="h-32 object-contain cursor-pointer rounded border hover:opacity-90"
                          style={{ borderColor: COLORS.border }}
                          onClick={() => window.open(getVerificationPhotoUrl(buyer.id_front_path || buyer.id_document || buyer.verification?.id_document_path), '_blank')}
                          onError={(e) => { e.target.style.display = 'none'; }}
                        />
                        <a 
                          href={getVerificationPhotoUrl(buyer.id_front_path || buyer.id_document || buyer.verification?.id_document_path)} 
                          download 
                          className="absolute bottom-2 right-2 p-1.5 rounded bg-white shadow opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Download className="w-4 h-4" style={{ color: COLORS.primary }} />
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              </Card>

              {/* Seller Details */}
              <Card className="p-6" style={{ backgroundColor: COLORS.background }} data-testid="seller-section">
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2" style={{ color: COLORS.primary }}>
                  <User className="w-5 h-5" /> Seller Details
                </h2>
                <div className="space-y-3">
                  <div>
                    <p className="text-xs uppercase mb-1 font-medium" style={{ color: COLORS.subtext }}>Full Name</p>
                    <p className="text-sm font-medium" style={{ color: COLORS.text }}>{transaction.seller_name}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase mb-1 font-medium" style={{ color: COLORS.subtext }}>Email</p>
                    <p className="text-sm flex items-center gap-1" style={{ color: COLORS.text }}>
                      <Mail className="w-3 h-3" /> {transaction.seller_email}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase mb-1 font-medium" style={{ color: COLORS.subtext }}>Phone</p>
                    <p className="text-sm flex items-center gap-1" style={{ color: COLORS.text }}>
                      <Phone className="w-3 h-3" /> {seller?.phone || transaction.seller_phone || 'Not provided'}
                    </p>
                  </div>
                  {seller?.id_number && (
                    <div>
                      <p className="text-xs uppercase mb-1 font-medium" style={{ color: COLORS.subtext }}>ID Number</p>
                      <p className="text-sm font-mono" style={{ color: COLORS.text }}>{seller.id_number}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs uppercase mb-1 font-medium" style={{ color: COLORS.subtext }}>Banking Details</p>
                    {seller?.banking_details_added ? (
                      <Badge style={{ backgroundColor: COLORS.green, color: 'white' }} className="inline-flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" /> Added
                      </Badge>
                    ) : (
                      <Badge style={{ backgroundColor: COLORS.warning, color: 'white' }}>Not Added</Badge>
                    )}
                  </div>
                  <div>
                    <p className="text-xs uppercase mb-1 font-medium" style={{ color: COLORS.subtext }}>Verified Status</p>
                    {seller?.id_verified || seller?.verified ? (
                      <Badge style={{ backgroundColor: COLORS.green, color: 'white' }} className="inline-flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" /> Verified
                      </Badge>
                    ) : (
                      <Badge style={{ backgroundColor: COLORS.subtext, color: 'white' }}>Not Verified</Badge>
                    )}
                  </div>
                  
                  {/* Seller ID Photo */}
                  {(seller?.id_front_path || seller?.id_document || seller?.verification?.id_document_path) && (
                    <div>
                      <p className="text-xs uppercase mb-2 font-medium" style={{ color: COLORS.subtext }}>ID Document</p>
                      <div className="relative group">
                        <img 
                          src={getVerificationPhotoUrl(seller.id_front_path || seller.id_document || seller.verification?.id_document_path)} 
                          alt="Seller ID" 
                          className="h-32 object-contain cursor-pointer rounded border hover:opacity-90"
                          style={{ borderColor: COLORS.border }}
                          onClick={() => window.open(getVerificationPhotoUrl(seller.id_front_path || seller.id_document || seller.verification?.id_document_path), '_blank')}
                          onError={(e) => { e.target.style.display = 'none'; }}
                        />
                        <a 
                          href={getVerificationPhotoUrl(seller.id_front_path || seller.id_document || seller.verification?.id_document_path)} 
                          download 
                          className="absolute bottom-2 right-2 p-1.5 rounded bg-white shadow opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Download className="w-4 h-4" style={{ color: COLORS.primary }} />
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            </div>

            {/* Item Details */}
            <Card className="p-6" style={{ backgroundColor: COLORS.background }} data-testid="item-section">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2" style={{ color: COLORS.primary }}>
                <ImageIcon className="w-5 h-5" /> Item Details
              </h2>
              <div className="space-y-4">
                <div>
                  <p className="text-xs uppercase mb-1 font-medium" style={{ color: COLORS.subtext }}>Description</p>
                  <p className="text-sm" style={{ color: COLORS.text }}>{transaction.item_description}</p>
                </div>
                <div className="grid md:grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs uppercase mb-1 font-medium" style={{ color: COLORS.subtext }}>Category</p>
                    <p className="text-sm capitalize" style={{ color: COLORS.text }}>{transaction.item_category || 'Not specified'}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase mb-1 font-medium" style={{ color: COLORS.subtext }}>Condition</p>
                    <p className="text-sm" style={{ color: COLORS.text }}>{transaction.item_condition || 'Not specified'}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase mb-1 font-medium" style={{ color: COLORS.subtext }}>Known Issues</p>
                    <p className="text-sm" style={{ color: COLORS.text }}>{transaction.known_issues || 'None reported'}</p>
                  </div>
                </div>
                
                {/* Item Photos Gallery */}
                {transaction.item_photos && transaction.item_photos.length > 0 && (
                  <div>
                    <p className="text-xs uppercase mb-3 font-medium" style={{ color: COLORS.subtext }}>
                      Photos ({transaction.item_photos.length})
                    </p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {transaction.item_photos.map((photo, i) => (
                        <div key={i} className="relative group">
                          <img 
                            src={getPhotoUrl(photo)} 
                            alt={`Item ${i+1}`} 
                            className="w-full h-32 object-cover rounded cursor-pointer border hover:opacity-90 transition-opacity"
                            style={{ borderColor: COLORS.border }}
                            onClick={() => window.open(getPhotoUrl(photo), '_blank')}
                            onError={(e) => { 
                              e.target.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect fill="%23f8f9fa" width="100" height="100"/><text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="%236c757d" font-size="10">No Image</text></svg>'; 
                            }}
                          />
                          <a 
                            href={getPhotoUrl(photo)} 
                            download={`item-photo-${i+1}`}
                            className="absolute bottom-2 right-2 p-1.5 rounded bg-white shadow opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Download className="w-4 h-4" style={{ color: COLORS.primary }} />
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Card>

            {/* Payment Details */}
            <Card className="p-6" style={{ backgroundColor: COLORS.background }} data-testid="payment-section">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2" style={{ color: COLORS.primary }}>
                <CreditCard className="w-5 h-5" /> Payment Details
              </h2>
              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs uppercase mb-1 font-medium" style={{ color: COLORS.subtext }}>Item Price</p>
                  <p className="text-xl font-bold" style={{ color: COLORS.text }}>R {transaction.item_price?.toLocaleString(undefined, {minimumFractionDigits: 2})}</p>
                </div>
                <div>
                  <p className="text-xs uppercase mb-1 font-medium" style={{ color: COLORS.subtext }}>TrustTrade Fee (2%)</p>
                  <p className="text-sm" style={{ color: COLORS.text }}>R {(transaction.item_price * 0.02)?.toLocaleString(undefined, {minimumFractionDigits: 2})}</p>
                </div>
                <div>
                  <p className="text-xs uppercase mb-1 font-medium" style={{ color: COLORS.subtext }}>Total Amount</p>
                  <p className="text-xl font-bold" style={{ color: COLORS.green }}>
                    R {(transaction.total || transaction.item_price * 1.02)?.toLocaleString(undefined, {minimumFractionDigits: 2})}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase mb-1 font-medium" style={{ color: COLORS.subtext }}>Fee Paid By</p>
                  <p className="text-sm capitalize" style={{ color: COLORS.text }}>{transaction.fee_paid_by || 'Buyer'}</p>
                </div>
                {transaction.payment_date && (
                  <div>
                    <p className="text-xs uppercase mb-1 font-medium" style={{ color: COLORS.subtext }}>Payment Date</p>
                    <p className="text-sm" style={{ color: COLORS.text }}>{new Date(transaction.payment_date).toLocaleString()}</p>
                  </div>
                )}
                {transaction.payment_method && (
                  <div>
                    <p className="text-xs uppercase mb-1 font-medium" style={{ color: COLORS.subtext }}>Payment Method</p>
                    <p className="text-sm capitalize" style={{ color: COLORS.text }}>{transaction.payment_method}</p>
                  </div>
                )}
              </div>
            </Card>

            {/* Transaction Timeline */}
            <Card className="p-6" style={{ backgroundColor: COLORS.background }} data-testid="timeline-section">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2" style={{ color: COLORS.primary }}>
                <Clock className="w-5 h-5" /> Transaction Timeline
              </h2>
              <div className="space-y-4">
                {/* Default events */}
                <div className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS.green }}></div>
                    <div className="w-0.5 flex-1" style={{ backgroundColor: COLORS.border }}></div>
                  </div>
                  <div className="pb-4">
                    <p className="text-sm font-medium" style={{ color: COLORS.text }}>Transaction Created</p>
                    <p className="text-xs" style={{ color: COLORS.subtext }}>{new Date(transaction.created_at).toLocaleString()}</p>
                    <p className="text-xs" style={{ color: COLORS.subtext }}>By: {transaction.creator_email || 'System'}</p>
                  </div>
                </div>
                
                {transaction.seller_confirmed && (
                  <div className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS.green }}></div>
                      <div className="w-0.5 flex-1" style={{ backgroundColor: COLORS.border }}></div>
                    </div>
                    <div className="pb-4">
                      <p className="text-sm font-medium" style={{ color: COLORS.text }}>Seller Confirmed</p>
                      <p className="text-xs" style={{ color: COLORS.subtext }}>{transaction.seller_confirmed_at ? new Date(transaction.seller_confirmed_at).toLocaleString() : 'Date not recorded'}</p>
                    </div>
                  </div>
                )}
                
                {transaction.tradesafe_id && (
                  <div className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS.info }}></div>
                      <div className="w-0.5 flex-1" style={{ backgroundColor: COLORS.border }}></div>
                    </div>
                    <div className="pb-4">
                      <p className="text-sm font-medium" style={{ color: COLORS.text }}>Escrow Created on TradeSafe</p>
                      <p className="text-xs" style={{ color: COLORS.subtext }}>Reference: {transaction.tradesafe_id}</p>
                    </div>
                  </div>
                )}
                
                {transaction.payment_status === 'Paid' && (
                  <div className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS.green }}></div>
                      <div className="w-0.5 flex-1" style={{ backgroundColor: COLORS.border }}></div>
                    </div>
                    <div className="pb-4">
                      <p className="text-sm font-medium" style={{ color: COLORS.text }}>Payment Received</p>
                      <p className="text-xs" style={{ color: COLORS.subtext }}>Funds now held in escrow</p>
                    </div>
                  </div>
                )}
                
                {/* Custom timeline events */}
                {transaction.timeline && transaction.timeline.map((event, i) => (
                  <div key={i} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS.primary }}></div>
                      <div className="w-0.5 flex-1" style={{ backgroundColor: COLORS.border }}></div>
                    </div>
                    <div className="pb-4">
                      <p className="text-sm font-medium" style={{ color: COLORS.text }}>{event.action || event.status}</p>
                      <p className="text-xs" style={{ color: COLORS.subtext }}>
                        {new Date(event.timestamp || event.created_at).toLocaleString()}
                        {event.by && ` • ${event.by}`}
                      </p>
                      {event.note && <p className="text-xs mt-1" style={{ color: COLORS.text }}>{event.note}</p>}
                    </div>
                  </div>
                ))}
                
                {/* Admin notes in timeline */}
                {transaction.admin_notes && transaction.admin_notes.map((note, i) => (
                  <div key={`note-${i}`} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS.warning }}></div>
                      <div className="w-0.5 flex-1" style={{ backgroundColor: COLORS.border }}></div>
                    </div>
                    <div className="pb-4">
                      <p className="text-sm font-medium" style={{ color: COLORS.text }}>Admin Note</p>
                      <p className="text-xs" style={{ color: COLORS.subtext }}>
                        {note.timestamp ? new Date(note.timestamp).toLocaleString() : 'Date not recorded'}
                        {note.admin_email && ` • ${note.admin_email}`}
                      </p>
                      <p className="text-sm mt-1 p-2 rounded" style={{ backgroundColor: COLORS.section, color: COLORS.text }}>
                        {typeof note === 'string' ? note : note.note}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* Admin Actions Sidebar - Right column */}
          <div className="space-y-6">
            {/* Admin Actions Panel */}
            <Card className="p-6" style={{ backgroundColor: COLORS.background }} data-testid="admin-actions-panel">
              <h2 className="text-lg font-semibold mb-4" style={{ color: COLORS.primary }}>Admin Actions</h2>
              <div className="space-y-3">
                <Button 
                  onClick={() => openConfirmModal('release_funds', 'Release Funds', `Release funds to ${transaction.seller_name}? This action cannot be undone.`)}
                  disabled={actionLoading || !['Paid', 'Funds in Escrow'].includes(transaction.payment_status)}
                  className="w-full text-white justify-center"
                  style={{ backgroundColor: COLORS.green }}
                  data-testid="release-funds-btn"
                >
                  <DollarSign className="w-4 h-4 mr-2" />
                  Release Funds to Seller
                </Button>
                
                <Button 
                  onClick={() => openConfirmModal('refund_buyer', 'Refund Buyer', `Refund ${transaction.buyer_name}? This will cancel the transaction and return funds.`)}
                  disabled={actionLoading || !['Paid', 'Ready for Payment', 'Funds in Escrow'].includes(transaction.payment_status)}
                  className="w-full text-white justify-center"
                  style={{ backgroundColor: COLORS.error }}
                  data-testid="refund-buyer-btn"
                >
                  <XCircle className="w-4 h-4 mr-2" />
                  Refund Buyer
                </Button>
                
                <Button 
                  onClick={() => openConfirmModal('suspend_buyer', 'Suspend Buyer', `Suspend buyer account (${transaction.buyer_name})? They will not be able to use the platform.`)}
                  disabled={actionLoading}
                  className="w-full text-white justify-center"
                  style={{ backgroundColor: COLORS.warning }}
                  data-testid="suspend-buyer-btn"
                >
                  <Ban className="w-4 h-4 mr-2" />
                  Suspend Buyer
                </Button>
                
                <Button 
                  onClick={() => openConfirmModal('suspend_seller', 'Suspend Seller', `Suspend seller account (${transaction.seller_name})? They will not be able to use the platform.`)}
                  disabled={actionLoading}
                  className="w-full text-white justify-center"
                  style={{ backgroundColor: COLORS.warning }}
                  data-testid="suspend-seller-btn"
                >
                  <Ban className="w-4 h-4 mr-2" />
                  Suspend Seller
                </Button>
              </div>
              
              {/* Admin Notes Section */}
              <div className="mt-6 pt-6" style={{ borderTop: `1px solid ${COLORS.border}` }}>
                <p className="text-sm font-medium mb-2" style={{ color: COLORS.text }}>Add Admin Note</p>
                <Textarea 
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  placeholder="Add a note about this transaction or action..."
                  rows={3}
                  className="mb-3"
                  style={{ borderColor: COLORS.border }}
                  data-testid="admin-note-input"
                />
                <Button 
                  onClick={() => openConfirmModal('add_note', 'Add Note', 'Save this admin note to the transaction timeline?')}
                  disabled={actionLoading || !adminNote.trim()}
                  className="w-full text-white justify-center"
                  style={{ backgroundColor: COLORS.primary }}
                  data-testid="save-note-btn"
                >
                  Save Note
                </Button>
              </div>
            </Card>

            {/* Quick Info */}
            <Card className="p-6" style={{ backgroundColor: COLORS.background }}>
              <h3 className="text-sm font-semibold mb-3" style={{ color: COLORS.primary }}>Quick Info</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between items-center">
                  <span style={{ color: COLORS.subtext }}>Auto Release</span>
                  <span style={{ color: COLORS.text }}>{transaction.auto_release_days || 3} days</span>
                </div>
                {transaction.auto_release_at && (
                  <div className="flex justify-between items-center">
                    <span style={{ color: COLORS.subtext }}>Release Date</span>
                    <span style={{ color: COLORS.text }}>{new Date(transaction.auto_release_at).toLocaleDateString()}</span>
                  </div>
                )}
                <div className="flex justify-between items-center">
                  <span style={{ color: COLORS.subtext }}>Has Dispute</span>
                  <span style={{ color: transaction.has_dispute ? COLORS.error : COLORS.text }}>
                    {transaction.has_dispute ? 'Yes' : 'No'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span style={{ color: COLORS.subtext }}>Delivery Confirmed</span>
                  <span style={{ color: COLORS.text }}>{transaction.delivery_confirmed ? 'Yes' : 'No'}</span>
                </div>
              </div>
            </Card>

            {/* Saved Admin Notes */}
            {transaction.admin_notes && transaction.admin_notes.length > 0 && (
              <Card className="p-6" style={{ backgroundColor: COLORS.background }}>
                <h3 className="text-sm font-semibold mb-3" style={{ color: COLORS.primary }}>
                  Saved Notes ({transaction.admin_notes.length})
                </h3>
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {transaction.admin_notes.map((note, i) => (
                    <div key={i} className="p-3 rounded text-sm" style={{ backgroundColor: COLORS.section }}>
                      <p style={{ color: COLORS.text }}>{typeof note === 'string' ? note : note.note}</p>
                      <p className="text-xs mt-1" style={{ color: COLORS.subtext }}>
                        {note.timestamp ? new Date(note.timestamp).toLocaleString() : ''}
                        {note.admin_email && ` • ${note.admin_email}`}
                      </p>
                    </div>
                  ))}
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
                <p className="text-xs mb-2" style={{ color: COLORS.subtext }}>This action will:</p>
                <ul className="text-xs space-y-1" style={{ color: COLORS.text }}>
                  <li>• Log to transaction timeline with your admin email</li>
                  <li>• Send email notification to both parties</li>
                  <li>• Send SMS notification to both parties</li>
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
                backgroundColor: confirmModal.action.includes('refund') || confirmModal.action.includes('suspend') 
                  ? COLORS.error 
                  : confirmModal.action.includes('release') 
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

export default AdminTransactionDetail;
