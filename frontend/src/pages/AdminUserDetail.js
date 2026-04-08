import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { AdminNavbar, Breadcrumbs } from '../components/AdminNavbar';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Textarea } from '../components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import api, { API_URL } from '../utils/api';
import { toast } from 'sonner';
import { 
  ArrowLeft, User, Mail, Phone, Calendar, Shield, CheckCircle, XCircle, 
  Download, FileText, Ban, Loader2, Image as ImageIcon
} from 'lucide-react';

const BACKEND_URL = API_URL.replace('/api', '');

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

function AdminUserDetail() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const [admin, setAdmin] = useState(null);
  const [userData, setUserData] = useState(null);
  const [buyerTransactions, setBuyerTransactions] = useState([]);
  const [sellerTransactions, setSellerTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [confirmModal, setConfirmModal] = useState({ open: false, action: '', title: '', message: '' });
  const [notes, setNotes] = useState('');

  useEffect(() => {
    fetchData();
  }, [userId]);

  const fetchData = async () => {
    try {
      const [adminRes, userRes] = await Promise.all([
        api.get('/auth/me'),
        api.get(`/admin/user/${userId}`)
      ]);
      
      if (!adminRes.data.is_admin) {
        toast.error('Admin access required');
        navigate('/dashboard');
        return;
      }
      
      setAdmin(adminRes.data);
      setUserData(userRes.data.user);
      setBuyerTransactions(userRes.data.buyer_transactions || []);
      setSellerTransactions(userRes.data.seller_transactions || []);
    } catch (error) {
      console.error('Failed to fetch:', error);
      toast.error('Failed to load user details');
      navigate('/admin/users');
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

  const openConfirmModal = (action, title, message) => {
    setConfirmModal({ open: true, action, title, message });
  };

  const handleAction = async () => {
    const action = confirmModal.action;
    setConfirmModal({ ...confirmModal, open: false });
    setActionLoading(true);
    
    try {
      let endpoint = `/admin/users/${userId}`;
      let data = { admin_email: admin?.email, notes };
      
      switch (action) {
        case 'verify':
          endpoint += '/verification';
          data.status = 'verified';
          break;
        case 'reject':
          endpoint += '/verification';
          data.status = 'rejected';
          break;
        case 'suspend':
          endpoint += '/suspend';
          break;
        case 'ban':
          endpoint += '/ban';
          break;
        default:
          toast.error('Unknown action');
          return;
      }
      
      await api.post(endpoint, data);
      toast.success(`User ${action} completed`);
      setNotes('');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  const getPhotoUrl = (path) => {
    if (!path) return null;
    if (path.startsWith('http')) return path;
    const cleanPath = path.replace(/^\/+/, '');
    if (cleanPath.includes('/')) return `${BACKEND_URL}/uploads/${cleanPath}`;
    return `${BACKEND_URL}/uploads/verification/${cleanPath}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: COLORS.section }}>
        <div className="w-12 h-12 border-4 rounded-full animate-spin" style={{ borderColor: COLORS.primary, borderTopColor: 'transparent' }}></div>
      </div>
    );
  }

  if (!userData) {
    return (
      <div className="min-h-screen flex flex-col" style={{ backgroundColor: COLORS.section }}>
        <AdminNavbar user={admin} onLogout={handleLogout} />
        <div className="flex-1 flex items-center justify-center">
          <p style={{ color: COLORS.text }}>User not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: COLORS.section }}>
      <AdminNavbar user={admin} onLogout={handleLogout} />

      <div className="max-w-7xl mx-auto px-4 py-6">
        <Breadcrumbs items={[
          { label: 'Admin', href: '/admin' },
          { label: 'Users', href: '/admin/users' },
          { label: userData.name }
        ]} />

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => navigate('/admin/users')} className="p-2">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ backgroundColor: `${COLORS.primary}15` }}>
                <User className="w-8 h-8" style={{ color: COLORS.primary }} />
              </div>
              <div>
                <h1 className="text-2xl font-bold" style={{ color: COLORS.text }}>{userData.name}</h1>
                <p style={{ color: COLORS.subtext }}>{userData.email}</p>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            {userData.verified || userData.id_verified ? (
              <Badge style={{ backgroundColor: COLORS.green, color: 'white' }} className="px-3 py-1.5">
                <CheckCircle className="w-4 h-4 mr-1" /> Verified
              </Badge>
            ) : (
              <Badge style={{ backgroundColor: COLORS.subtext, color: 'white' }} className="px-3 py-1.5">
                Not Verified
              </Badge>
            )}
            {userData.suspension_flag && (
              <Badge style={{ backgroundColor: COLORS.error, color: 'white' }} className="px-3 py-1.5">
                <Ban className="w-4 h-4 mr-1" /> Suspended
              </Badge>
            )}
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* User Info */}
            <Card className="p-6" style={{ backgroundColor: COLORS.background }}>
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2" style={{ color: COLORS.primary }}>
                <User className="w-5 h-5" /> User Information
              </h2>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs uppercase mb-1 font-medium" style={{ color: COLORS.subtext }}>Full Name</p>
                  <p style={{ color: COLORS.text }}>{userData.name}</p>
                </div>
                <div>
                  <p className="text-xs uppercase mb-1 font-medium" style={{ color: COLORS.subtext }}>Email</p>
                  <p className="flex items-center gap-1" style={{ color: COLORS.text }}>
                    <Mail className="w-4 h-4" /> {userData.email}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase mb-1 font-medium" style={{ color: COLORS.subtext }}>Phone</p>
                  <p className="flex items-center gap-1" style={{ color: COLORS.text }}>
                    <Phone className="w-4 h-4" /> {userData.phone || 'Not provided'}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase mb-1 font-medium" style={{ color: COLORS.subtext }}>ID Number</p>
                  <p className="font-mono" style={{ color: COLORS.text }}>{userData.id_number || 'Not provided'}</p>
                </div>
                <div>
                  <p className="text-xs uppercase mb-1 font-medium" style={{ color: COLORS.subtext }}>Account Created</p>
                  <p className="flex items-center gap-1" style={{ color: COLORS.text }}>
                    <Calendar className="w-4 h-4" /> {userData.created_at ? new Date(userData.created_at).toLocaleDateString() : 'Unknown'}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase mb-1 font-medium" style={{ color: COLORS.subtext }}>Trust Score</p>
                  <div className="flex items-center gap-2">
                    <div className="w-20 h-2 rounded-full" style={{ backgroundColor: COLORS.border }}>
                      <div 
                        className="h-2 rounded-full" 
                        style={{ 
                          width: `${userData.trust_score || 50}%`,
                          backgroundColor: (userData.trust_score || 50) >= 70 ? COLORS.green : (userData.trust_score || 50) >= 40 ? COLORS.warning : COLORS.error
                        }}
                      />
                    </div>
                    <span className="font-semibold" style={{ color: COLORS.text }}>{userData.trust_score || 50}</span>
                  </div>
                </div>
              </div>
            </Card>

            {/* ID Documents */}
            <Card className="p-6" style={{ backgroundColor: COLORS.background }}>
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2" style={{ color: COLORS.primary }}>
                <FileText className="w-5 h-5" /> ID Verification Documents
              </h2>
              <div className="grid md:grid-cols-2 gap-4">
                {/* ID Document */}
                {(userData.id_front_path || userData.verification?.id_document_path) ? (
                  <div className="relative group">
                    <p className="text-xs uppercase mb-2 font-medium" style={{ color: COLORS.subtext }}>ID Document</p>
                    <img 
                      src={getPhotoUrl(userData.id_front_path || userData.verification?.id_document_path)} 
                      alt="ID Document" 
                      className="w-full h-48 object-cover rounded border cursor-pointer hover:opacity-90"
                      style={{ borderColor: COLORS.border }}
                      onClick={() => window.open(getPhotoUrl(userData.id_front_path || userData.verification?.id_document_path), '_blank')}
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
                    <a 
                      href={getPhotoUrl(userData.id_front_path || userData.verification?.id_document_path)} 
                      download 
                      className="absolute bottom-4 right-2 p-2 rounded bg-white shadow opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Download className="w-4 h-4" style={{ color: COLORS.primary }} />
                    </a>
                  </div>
                ) : (
                  <div className="p-8 rounded border-2 border-dashed flex flex-col items-center justify-center" style={{ borderColor: COLORS.border }}>
                    <ImageIcon className="w-12 h-12 mb-2" style={{ color: COLORS.subtext }} />
                    <p style={{ color: COLORS.subtext }}>No ID document uploaded</p>
                  </div>
                )}
                
                {/* Selfie */}
                {(userData.selfie_path || userData.verification?.selfie_path) ? (
                  <div className="relative group">
                    <p className="text-xs uppercase mb-2 font-medium" style={{ color: COLORS.subtext }}>Selfie</p>
                    <img 
                      src={getPhotoUrl(userData.selfie_path || userData.verification?.selfie_path)} 
                      alt="Selfie" 
                      className="w-full h-48 object-cover rounded border cursor-pointer hover:opacity-90"
                      style={{ borderColor: COLORS.border }}
                      onClick={() => window.open(getPhotoUrl(userData.selfie_path || userData.verification?.selfie_path), '_blank')}
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
                    <a 
                      href={getPhotoUrl(userData.selfie_path || userData.verification?.selfie_path)} 
                      download 
                      className="absolute bottom-4 right-2 p-2 rounded bg-white shadow opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Download className="w-4 h-4" style={{ color: COLORS.primary }} />
                    </a>
                  </div>
                ) : (
                  <div className="p-8 rounded border-2 border-dashed flex flex-col items-center justify-center" style={{ borderColor: COLORS.border }}>
                    <ImageIcon className="w-12 h-12 mb-2" style={{ color: COLORS.subtext }} />
                    <p style={{ color: COLORS.subtext }}>No selfie uploaded</p>
                  </div>
                )}
              </div>
            </Card>

            {/* Transactions as Buyer */}
            <Card className="p-6" style={{ backgroundColor: COLORS.background }}>
              <h2 className="text-lg font-semibold mb-4" style={{ color: COLORS.primary }}>
                Transactions as Buyer ({buyerTransactions.length})
              </h2>
              {buyerTransactions.length > 0 ? (
                <div className="space-y-2">
                  {buyerTransactions.map((t) => (
                    <Link 
                      key={t.transaction_id}
                      to={`/admin/transaction/${t.transaction_id}`}
                      className="flex items-center justify-between p-3 rounded border hover:bg-gray-50 transition-colors"
                      style={{ borderColor: COLORS.border }}
                    >
                      <div>
                        <span className="font-mono font-medium" style={{ color: COLORS.primary }}>{t.share_code}</span>
                        <p className="text-xs" style={{ color: COLORS.subtext }}>{t.item_description?.slice(0, 50)}...</p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono" style={{ color: COLORS.text }}>R {t.item_price?.toLocaleString()}</p>
                        <Badge style={{ backgroundColor: t.payment_status?.toLowerCase().includes('complete') ? COLORS.green : COLORS.info, color: 'white' }} className="text-xs">
                          {t.payment_status}
                        </Badge>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <p style={{ color: COLORS.subtext }}>No transactions as buyer</p>
              )}
            </Card>

            {/* Transactions as Seller */}
            <Card className="p-6" style={{ backgroundColor: COLORS.background }}>
              <h2 className="text-lg font-semibold mb-4" style={{ color: COLORS.primary }}>
                Transactions as Seller ({sellerTransactions.length})
              </h2>
              {sellerTransactions.length > 0 ? (
                <div className="space-y-2">
                  {sellerTransactions.map((t) => (
                    <Link 
                      key={t.transaction_id}
                      to={`/admin/transaction/${t.transaction_id}`}
                      className="flex items-center justify-between p-3 rounded border hover:bg-gray-50 transition-colors"
                      style={{ borderColor: COLORS.border }}
                    >
                      <div>
                        <span className="font-mono font-medium" style={{ color: COLORS.primary }}>{t.share_code}</span>
                        <p className="text-xs" style={{ color: COLORS.subtext }}>{t.item_description?.slice(0, 50)}...</p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono" style={{ color: COLORS.text }}>R {t.item_price?.toLocaleString()}</p>
                        <Badge style={{ backgroundColor: t.payment_status?.toLowerCase().includes('complete') ? COLORS.green : COLORS.info, color: 'white' }} className="text-xs">
                          {t.payment_status}
                        </Badge>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <p style={{ color: COLORS.subtext }}>No transactions as seller</p>
              )}
            </Card>
          </div>

          {/* Admin Actions Sidebar */}
          <div className="space-y-6">
            <Card className="p-6" style={{ backgroundColor: COLORS.background }}>
              <h2 className="text-lg font-semibold mb-4" style={{ color: COLORS.primary }}>Admin Actions</h2>
              <div className="space-y-3">
                <Button 
                  onClick={() => openConfirmModal('verify', 'Verify ID', `Verify ${userData.name}'s identity documents?`)}
                  disabled={actionLoading || userData.verified}
                  className="w-full text-white justify-center"
                  style={{ backgroundColor: COLORS.green }}
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Verify ID
                </Button>
                
                <Button 
                  onClick={() => openConfirmModal('reject', 'Reject ID', `Reject ${userData.name}'s identity documents?`)}
                  disabled={actionLoading}
                  className="w-full text-white justify-center"
                  style={{ backgroundColor: COLORS.error }}
                >
                  <XCircle className="w-4 h-4 mr-2" />
                  Reject ID
                </Button>
                
                <Button 
                  onClick={() => openConfirmModal('suspend', 'Suspend User', `Suspend ${userData.name}'s account? They will not be able to use the platform.`)}
                  disabled={actionLoading || userData.suspension_flag}
                  className="w-full text-white justify-center"
                  style={{ backgroundColor: COLORS.warning }}
                >
                  <Ban className="w-4 h-4 mr-2" />
                  Suspend User
                </Button>
                
                <Button 
                  onClick={() => openConfirmModal('ban', 'Ban User', `Permanently ban ${userData.name}? This cannot be undone.`)}
                  disabled={actionLoading}
                  className="w-full text-white justify-center"
                  style={{ backgroundColor: COLORS.error }}
                >
                  <Ban className="w-4 h-4 mr-2" />
                  Ban User
                </Button>
              </div>
              
              <div className="mt-6 pt-6" style={{ borderTop: `1px solid ${COLORS.border}` }}>
                <p className="text-sm font-medium mb-2" style={{ color: COLORS.text }}>Admin Notes</p>
                <Textarea 
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add notes for this action..."
                  rows={3}
                  style={{ borderColor: COLORS.border }}
                />
              </div>
            </Card>

            {/* Quick Stats */}
            <Card className="p-6" style={{ backgroundColor: COLORS.background }}>
              <h3 className="text-sm font-semibold mb-3" style={{ color: COLORS.primary }}>Quick Stats</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span style={{ color: COLORS.subtext }}>Total Trades</span>
                  <span className="font-semibold" style={{ color: COLORS.text }}>{userData.total_trades || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: COLORS.subtext }}>Successful Trades</span>
                  <span className="font-semibold" style={{ color: COLORS.green }}>{userData.successful_trades || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: COLORS.subtext }}>Average Rating</span>
                  <span className="font-semibold" style={{ color: COLORS.text }}>{userData.average_rating?.toFixed(1) || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: COLORS.subtext }}>Valid Disputes</span>
                  <span className="font-semibold" style={{ color: userData.valid_disputes_count > 0 ? COLORS.error : COLORS.text }}>
                    {userData.valid_disputes_count || 0}
                  </span>
                </div>
              </div>
            </Card>
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
                backgroundColor: confirmModal.action === 'verify' ? COLORS.green : COLORS.error
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

export default AdminUserDetail;
