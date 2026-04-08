import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminNavbar, Breadcrumbs } from '../components/AdminNavbar';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import api from '../utils/api';
import { toast } from 'sonner';
import { 
  Users, Search, ChevronRight, CheckCircle, XCircle, Shield
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

function AdminUsers() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [userRes, usersRes] = await Promise.all([
        api.get('/auth/me'),
        api.get('/admin/users')
      ]);
      
      if (!userRes.data.is_admin) {
        toast.error('Admin access required');
        navigate('/dashboard');
        return;
      }
      
      setUser(userRes.data);
      setUsers(usersRes.data);
    } catch (error) {
      console.error('Failed to fetch:', error);
      toast.error('Failed to load users');
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

  const filteredUsers = users.filter(u => {
    if (!searchQuery) return true;
    return u.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.phone?.includes(searchQuery);
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
          { label: 'Users' }
        ]} />

        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: COLORS.text }}>All Users</h1>
            <p style={{ color: COLORS.subtext }}>{filteredUsers.length} users</p>
          </div>
        </div>

        {/* Search */}
        <div className="mb-6">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4" style={{ color: COLORS.subtext }} />
            <Input
              placeholder="Search by name, email or phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Users Table */}
        <Card style={{ backgroundColor: COLORS.background }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead style={{ backgroundColor: COLORS.section }}>
                <tr className="border-b" style={{ borderColor: COLORS.border }}>
                  <th className="text-left p-4 font-medium" style={{ color: COLORS.subtext }}>User</th>
                  <th className="text-left p-4 font-medium" style={{ color: COLORS.subtext }}>Email</th>
                  <th className="text-left p-4 font-medium" style={{ color: COLORS.subtext }}>Phone</th>
                  <th className="text-left p-4 font-medium" style={{ color: COLORS.subtext }}>Trades</th>
                  <th className="text-left p-4 font-medium" style={{ color: COLORS.subtext }}>Trust Score</th>
                  <th className="text-left p-4 font-medium" style={{ color: COLORS.subtext }}>Verified</th>
                  <th className="text-left p-4 font-medium" style={{ color: COLORS.subtext }}></th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u) => (
                  <tr 
                    key={u.user_id} 
                    className="border-b cursor-pointer hover:bg-gray-50 transition-colors"
                    style={{ borderColor: COLORS.border }}
                    onClick={() => navigate(`/admin/user/${u.user_id}`)}
                    data-testid={`user-row-${u.user_id}`}
                  >
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: `${COLORS.primary}15` }}>
                          <Users className="w-5 h-5" style={{ color: COLORS.primary }} />
                        </div>
                        <div>
                          <p className="font-medium" style={{ color: COLORS.text }}>{u.name}</p>
                          {u.is_admin && (
                            <Badge style={{ backgroundColor: COLORS.primary, color: 'white' }} className="text-xs">
                              <Shield className="w-3 h-3 mr-1" /> Admin
                            </Badge>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="p-4" style={{ color: COLORS.text }}>{u.email}</td>
                    <td className="p-4" style={{ color: COLORS.subtext }}>{u.phone || '-'}</td>
                    <td className="p-4" style={{ color: COLORS.text }}>{u.total_trades || 0}</td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-2 rounded-full" style={{ backgroundColor: COLORS.border }}>
                          <div 
                            className="h-2 rounded-full" 
                            style={{ 
                              width: `${u.trust_score || 50}%`,
                              backgroundColor: (u.trust_score || 50) >= 70 ? COLORS.green : (u.trust_score || 50) >= 40 ? COLORS.warning : COLORS.error
                            }}
                          />
                        </div>
                        <span style={{ color: COLORS.text }}>{u.trust_score || 50}</span>
                      </div>
                    </td>
                    <td className="p-4">
                      {u.verified || u.id_verified ? (
                        <Badge style={{ backgroundColor: COLORS.green, color: 'white' }}>
                          <CheckCircle className="w-3 h-3 mr-1" /> Verified
                        </Badge>
                      ) : u.id_verification_status === 'pending' ? (
                        <Badge style={{ backgroundColor: COLORS.warning, color: 'white' }}>Pending</Badge>
                      ) : (
                        <Badge style={{ backgroundColor: COLORS.subtext, color: 'white' }}>
                          <XCircle className="w-3 h-3 mr-1" /> Not Verified
                        </Badge>
                      )}
                    </td>
                    <td className="p-4">
                      <ChevronRight className="w-4 h-4" style={{ color: COLORS.subtext }} />
                    </td>
                  </tr>
                ))}
                {filteredUsers.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center" style={{ color: COLORS.subtext }}>
                      No users found
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

export default AdminUsers;
