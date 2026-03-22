import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Textarea } from '../components/ui/textarea';
import axios from 'axios';
import { toast } from 'sonner';
import { 
  ArrowLeft, User, Mail, Phone, CreditCard, Calendar, Clock, 
  Shield, CheckCircle, XCircle, AlertTriangle, FileText, Image as ImageIcon,
  Download, Truck, DollarSign, ChevronRight, MessageSquare, RefreshCw
} from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Color scheme
const COLORS = {
  primary: '#1a2942',
  success: '#2ecc71',
  danger: '#e74c3c',
  warning: '#f39c12',
  info: '#3498db',
  grey: '#6c757d',
  lightGrey: '#f8f9fa',
  border: '#dee2e6',
  text: '#212529'
};

const getStatusColor = (status) => {
  const s = status?.toLowerCase() || '';
  if (s.includes('completed') || s.includes('released')) return COLORS.success;
  if (s.includes('dispute')) return COLORS.danger;
  if (s.includes('pending') || s.includes('awaiting')) return COLORS.warning;
  if (s.includes('active') || s.includes('paid')) return COLORS.info;
  return COLORS.grey;
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

  useEffect(() => {
    fetchData();
  }, [transactionId]);

  const fetchData = async () => {
    try {
      const [userRes, txnRes] = await Promise.all([
        axios.get(`${API}/auth/me`, { withCredentials: true }),
        axios.get(`${API}/admin/transaction/${transactionId}`, { withCredentials: true })
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

  const handleAction = async (action, data = {}) => {
    if (!window.confirm(`Are you sure you want to ${action}?`)) return;
    
    setActionLoading(true);
    try {
      await axios.post(`${API}/admin/transaction/${transactionId}/action`, {
        action,
        ...data,
        admin_note: adminNote
      }, { withCredentials: true });
      
      toast.success(`Action completed: ${action}`);
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
    return `${BACKEND_URL}/uploads/photos/${photo}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: COLORS.lightGrey }}>
        <div className="w-12 h-12 border-4 rounded-full animate-spin" style={{ borderColor: COLORS.primary, borderTopColor: 'transparent' }}></div>
      </div>
    );
  }

  if (!transaction) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: COLORS.lightGrey }}>
        <p style={{ color: COLORS.text }}>Transaction not found</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: COLORS.lightGrey }}>
      {/* Admin Navbar */}
      <nav style={{ backgroundColor: COLORS.primary }} className="sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <Link to="/admin" className="text-white font-bold text-xl">TrustTrade Admin</Link>
              <div className="hidden md:flex items-center gap-4">
                <Link to="/admin" className="text-white/80 hover:text-white text-sm">Dashboard</Link>
                <Link to="/admin?tab=transactions" className="text-white/80 hover:text-white text-sm">Transactions</Link>
                <Link to="/admin?tab=users" className="text-white/80 hover:text-white text-sm">Users</Link>
                <Link to="/admin?tab=disputes" className="text-white/80 hover:text-white text-sm">Disputes</Link>
              </div>
            </div>
            <span className="text-white/80 text-sm">{user?.name}</span>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Breadcrumbs */}
        <div className="flex items-center gap-2 text-sm mb-6" style={{ color: COLORS.grey }}>
          <Link to="/admin" className="hover:underline">Admin</Link>
          <ChevronRight className="w-4 h-4" />
          <Link to="/admin?tab=transactions" className="hover:underline">Transactions</Link>
          <ChevronRight className="w-4 h-4" />
          <span style={{ color: COLORS.text }}>{transaction.share_code}</span>
        </div>

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => navigate('/admin')} className="p-2">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold" style={{ color: COLORS.text }}>
                Transaction {transaction.share_code}
              </h1>
              <p style={{ color: COLORS.grey }}>Created {new Date(transaction.created_at).toLocaleString()}</p>
            </div>
          </div>
          <Badge style={{ backgroundColor: getStatusColor(transaction.payment_status), color: 'white' }} className="text-sm px-3 py-1">
            {transaction.payment_status}
          </Badge>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Transaction Overview */}
            <Card className="p-6" style={{ backgroundColor: 'white' }}>
              <h2 className="text-lg font-semibold mb-4" style={{ color: COLORS.primary }}>Transaction Overview</h2>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs uppercase mb-1" style={{ color: COLORS.grey }}>Transaction ID</p>
                  <p className="font-mono text-sm" style={{ color: COLORS.text }}>{transaction.transaction_id}</p>
                </div>
                <div>
                  <p className="text-xs uppercase mb-1" style={{ color: COLORS.grey }}>Reference</p>
                  <p className="font-mono text-sm font-medium" style={{ color: COLORS.text }}>{transaction.share_code}</p>
                </div>
                <div>
                  <p className="text-xs uppercase mb-1" style={{ color: COLORS.grey }}>Created</p>
                  <p className="text-sm" style={{ color: COLORS.text }}>{new Date(transaction.created_at).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs uppercase mb-1" style={{ color: COLORS.grey }}>Delivery Method</p>
                  <p className="text-sm capitalize" style={{ color: COLORS.text }}>{transaction.delivery_method?.replace('_', ' ')}</p>
                </div>
                {transaction.tradesafe_id && (
                  <div className="md:col-span-2">
                    <p className="text-xs uppercase mb-1" style={{ color: COLORS.grey }}>TradeSafe Reference</p>
                    <p className="font-mono text-sm" style={{ color: COLORS.text }}>{transaction.tradesafe_id}</p>
                  </div>
                )}
              </div>
            </Card>

            {/* Buyer Details */}
            <Card className="p-6" style={{ backgroundColor: 'white' }}>
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2" style={{ color: COLORS.primary }}>
                <User className="w-5 h-5" /> Buyer Details
              </h2>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs uppercase mb-1" style={{ color: COLORS.grey }}>Full Name</p>
                  <p className="text-sm font-medium" style={{ color: COLORS.text }}>{transaction.buyer_name}</p>
                </div>
                <div>
                  <p className="text-xs uppercase mb-1" style={{ color: COLORS.grey }}>Email</p>
                  <p className="text-sm" style={{ color: COLORS.text }}>{transaction.buyer_email}</p>
                </div>
                <div>
                  <p className="text-xs uppercase mb-1" style={{ color: COLORS.grey }}>Phone</p>
                  <p className="text-sm" style={{ color: COLORS.text }}>{buyer?.phone || transaction.buyer_phone || 'Not provided'}</p>
                </div>
                <div>
                  <p className="text-xs uppercase mb-1" style={{ color: COLORS.grey }}>Verified</p>
                  {buyer?.id_verified ? (
                    <Badge style={{ backgroundColor: COLORS.success, color: 'white' }}>Verified</Badge>
                  ) : (
                    <Badge style={{ backgroundColor: COLORS.grey, color: 'white' }}>Not Verified</Badge>
                  )}
                </div>
                {buyer?.id_document && (
                  <div className="md:col-span-2">
                    <p className="text-xs uppercase mb-1" style={{ color: COLORS.grey }}>ID Document</p>
                    <img 
                      src={getPhotoUrl(buyer.id_document)} 
                      alt="ID" 
                      className="h-32 object-contain cursor-pointer rounded border hover:opacity-90"
                      style={{ borderColor: COLORS.border }}
                      onClick={() => window.open(getPhotoUrl(buyer.id_document), '_blank')}
                    />
                  </div>
                )}
              </div>
            </Card>

            {/* Seller Details */}
            <Card className="p-6" style={{ backgroundColor: 'white' }}>
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2" style={{ color: COLORS.primary }}>
                <User className="w-5 h-5" /> Seller Details
              </h2>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs uppercase mb-1" style={{ color: COLORS.grey }}>Full Name</p>
                  <p className="text-sm font-medium" style={{ color: COLORS.text }}>{transaction.seller_name}</p>
                </div>
                <div>
                  <p className="text-xs uppercase mb-1" style={{ color: COLORS.grey }}>Email</p>
                  <p className="text-sm" style={{ color: COLORS.text }}>{transaction.seller_email}</p>
                </div>
                <div>
                  <p className="text-xs uppercase mb-1" style={{ color: COLORS.grey }}>Phone</p>
                  <p className="text-sm" style={{ color: COLORS.text }}>{seller?.phone || transaction.seller_phone || 'Not provided'}</p>
                </div>
                <div>
                  <p className="text-xs uppercase mb-1" style={{ color: COLORS.grey }}>Banking Details</p>
                  {seller?.banking_details_added ? (
                    <Badge style={{ backgroundColor: COLORS.success, color: 'white' }}>Added</Badge>
                  ) : (
                    <Badge style={{ backgroundColor: COLORS.warning, color: 'white' }}>Not Added</Badge>
                  )}
                </div>
                <div>
                  <p className="text-xs uppercase mb-1" style={{ color: COLORS.grey }}>Verified</p>
                  {seller?.id_verified ? (
                    <Badge style={{ backgroundColor: COLORS.success, color: 'white' }}>Verified</Badge>
                  ) : (
                    <Badge style={{ backgroundColor: COLORS.grey, color: 'white' }}>Not Verified</Badge>
                  )}
                </div>
              </div>
            </Card>

            {/* Item Details */}
            <Card className="p-6" style={{ backgroundColor: 'white' }}>
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2" style={{ color: COLORS.primary }}>
                <FileText className="w-5 h-5" /> Item Details
              </h2>
              <div className="space-y-4">
                <div>
                  <p className="text-xs uppercase mb-1" style={{ color: COLORS.grey }}>Description</p>
                  <p className="text-sm" style={{ color: COLORS.text }}>{transaction.item_description}</p>
                </div>
                <div className="grid md:grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs uppercase mb-1" style={{ color: COLORS.grey }}>Category</p>
                    <p className="text-sm capitalize" style={{ color: COLORS.text }}>{transaction.item_category || 'Not specified'}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase mb-1" style={{ color: COLORS.grey }}>Condition</p>
                    <p className="text-sm" style={{ color: COLORS.text }}>{transaction.item_condition}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase mb-1" style={{ color: COLORS.grey }}>Known Issues</p>
                    <p className="text-sm" style={{ color: COLORS.text }}>{transaction.known_issues || 'None'}</p>
                  </div>
                </div>
                
                {/* Photos */}
                {transaction.item_photos && transaction.item_photos.length > 0 && (
                  <div>
                    <p className="text-xs uppercase mb-2" style={{ color: COLORS.grey }}>Photos</p>
                    <div className="grid grid-cols-3 gap-3">
                      {transaction.item_photos.map((photo, i) => (
                        <div key={i} className="relative group">
                          <img 
                            src={getPhotoUrl(photo)} 
                            alt={`Item ${i+1}`} 
                            className="w-full h-32 object-cover rounded cursor-pointer hover:opacity-90"
                            style={{ borderColor: COLORS.border }}
                            onClick={() => window.open(getPhotoUrl(photo), '_blank')}
                            onError={(e) => { e.target.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect fill="%23f1f5f9" width="100" height="100"/><text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="%2394a3b8" font-size="10">No Image</text></svg>'; }}
                          />
                          <a 
                            href={getPhotoUrl(photo)} 
                            download 
                            className="absolute bottom-2 right-2 p-1 rounded bg-white/90 opacity-0 group-hover:opacity-100 transition-opacity"
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
            <Card className="p-6" style={{ backgroundColor: 'white' }}>
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2" style={{ color: COLORS.primary }}>
                <CreditCard className="w-5 h-5" /> Payment Details
              </h2>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs uppercase mb-1" style={{ color: COLORS.grey }}>Item Price</p>
                  <p className="text-lg font-semibold" style={{ color: COLORS.text }}>R {transaction.item_price?.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase mb-1" style={{ color: COLORS.grey }}>TrustTrade Fee (2%)</p>
                  <p className="text-sm" style={{ color: COLORS.text }}>R {(transaction.item_price * 0.02)?.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase mb-1" style={{ color: COLORS.grey }}>Total Amount</p>
                  <p className="text-lg font-bold" style={{ color: COLORS.success }}>R {transaction.total?.toFixed(2) || (transaction.item_price * 1.02)?.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase mb-1" style={{ color: COLORS.grey }}>Payment Status</p>
                  <Badge style={{ backgroundColor: getStatusColor(transaction.payment_status), color: 'white' }}>
                    {transaction.payment_status}
                  </Badge>
                </div>
                {transaction.payment_date && (
                  <div>
                    <p className="text-xs uppercase mb-1" style={{ color: COLORS.grey }}>Payment Date</p>
                    <p className="text-sm" style={{ color: COLORS.text }}>{new Date(transaction.payment_date).toLocaleString()}</p>
                  </div>
                )}
              </div>
            </Card>

            {/* Timeline */}
            <Card className="p-6" style={{ backgroundColor: 'white' }}>
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2" style={{ color: COLORS.primary }}>
                <Clock className="w-5 h-5" /> Transaction Timeline
              </h2>
              <div className="space-y-4">
                {transaction.timeline && transaction.timeline.length > 0 ? (
                  transaction.timeline.map((event, i) => (
                    <div key={i} className="flex gap-3">
                      <div className="w-2 h-2 rounded-full mt-2" style={{ backgroundColor: COLORS.primary }}></div>
                      <div className="flex-1">
                        <p className="text-sm font-medium" style={{ color: COLORS.text }}>{event.action || event.status}</p>
                        <p className="text-xs" style={{ color: COLORS.grey }}>
                          {new Date(event.timestamp || event.created_at).toLocaleString()}
                          {event.by && ` • ${event.by}`}
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="space-y-3">
                    <div className="flex gap-3">
                      <div className="w-2 h-2 rounded-full mt-2" style={{ backgroundColor: COLORS.primary }}></div>
                      <div>
                        <p className="text-sm font-medium" style={{ color: COLORS.text }}>Transaction Created</p>
                        <p className="text-xs" style={{ color: COLORS.grey }}>{new Date(transaction.created_at).toLocaleString()}</p>
                      </div>
                    </div>
                    {transaction.seller_confirmed && (
                      <div className="flex gap-3">
                        <div className="w-2 h-2 rounded-full mt-2" style={{ backgroundColor: COLORS.success }}></div>
                        <div>
                          <p className="text-sm font-medium" style={{ color: COLORS.text }}>Seller Confirmed</p>
                        </div>
                      </div>
                    )}
                    {transaction.tradesafe_id && (
                      <div className="flex gap-3">
                        <div className="w-2 h-2 rounded-full mt-2" style={{ backgroundColor: COLORS.info }}></div>
                        <div>
                          <p className="text-sm font-medium" style={{ color: COLORS.text }}>Escrow Created</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </Card>
          </div>

          {/* Admin Actions Sidebar */}
          <div className="space-y-6">
            <Card className="p-6" style={{ backgroundColor: 'white' }}>
              <h2 className="text-lg font-semibold mb-4" style={{ color: COLORS.primary }}>Admin Actions</h2>
              <div className="space-y-3">
                <Button 
                  onClick={() => handleAction('release_funds')}
                  disabled={actionLoading}
                  className="w-full text-white"
                  style={{ backgroundColor: COLORS.success }}
                >
                  Release Funds to Seller
                </Button>
                <Button 
                  onClick={() => handleAction('refund_buyer')}
                  disabled={actionLoading}
                  className="w-full text-white"
                  style={{ backgroundColor: COLORS.danger }}
                >
                  Refund Buyer
                </Button>
                <Button 
                  onClick={() => handleAction('suspend_buyer')}
                  disabled={actionLoading}
                  className="w-full text-white"
                  style={{ backgroundColor: COLORS.warning }}
                >
                  Suspend Buyer
                </Button>
                <Button 
                  onClick={() => handleAction('suspend_seller')}
                  disabled={actionLoading}
                  className="w-full text-white"
                  style={{ backgroundColor: COLORS.warning }}
                >
                  Suspend Seller
                </Button>
                <Button 
                  onClick={() => handleAction('mark_resolved')}
                  disabled={actionLoading}
                  className="w-full text-white"
                  style={{ backgroundColor: COLORS.info }}
                >
                  Mark as Resolved
                </Button>
              </div>
              
              <div className="mt-6 pt-6" style={{ borderTop: `1px solid ${COLORS.border}` }}>
                <p className="text-sm font-medium mb-2" style={{ color: COLORS.text }}>Admin Note</p>
                <Textarea 
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  placeholder="Add a note about this action..."
                  rows={3}
                  style={{ borderColor: COLORS.border }}
                />
                <Button 
                  onClick={() => handleAction('add_note')}
                  disabled={actionLoading || !adminNote.trim()}
                  className="w-full mt-3 text-white"
                  style={{ backgroundColor: COLORS.primary }}
                >
                  Save Note
                </Button>
              </div>
            </Card>

            {/* Quick Info */}
            <Card className="p-6" style={{ backgroundColor: 'white' }}>
              <h3 className="text-sm font-semibold mb-3" style={{ color: COLORS.primary }}>Quick Info</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span style={{ color: COLORS.grey }}>Fee Allocation</span>
                  <span className="capitalize" style={{ color: COLORS.text }}>{transaction.fee_paid_by}</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: COLORS.grey }}>Auto Release</span>
                  <span style={{ color: COLORS.text }}>{transaction.auto_release_days || 3} days</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: COLORS.grey }}>Has Dispute</span>
                  <span style={{ color: COLORS.text }}>{transaction.has_dispute ? 'Yes' : 'No'}</span>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AdminTransactionDetail;
