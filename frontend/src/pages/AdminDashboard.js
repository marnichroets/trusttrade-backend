import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import axios from 'axios';
import { toast } from 'sonner';
import { Users, FileText, AlertCircle, TrendingUp } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function AdminDashboard() {
  const [user, setUser] = useState(null);
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [disputes, setDisputes] = useState([]);
  const [loading, setLoading] = useState(true);
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

  const handleUpdateDisputeStatus = async (disputeId, newStatus) => {
    try {
      await axios.patch(
        `${API}/disputes/${disputeId}`,
        { status: newStatus },
        { withCredentials: true }
      );

      toast.success('Dispute status updated');
      fetchData(); // Refresh data
    } catch (error) {
      console.error('Failed to update dispute:', error);
      toast.error('Failed to update dispute status');
    }
  };

  const getStatusBadge = (status) => {
    const variants = {
      'Pending': 'bg-yellow-100 text-yellow-800',
      'Paid': 'bg-green-100 text-green-800',
      'Released': 'bg-green-100 text-green-800',
      'Resolved': 'bg-green-100 text-green-800'
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
        <div>
          <h1 className="text-3xl font-bold text-slate-900" data-testid="admin-dashboard-title">Admin Dashboard</h1>
          <p className="text-slate-600 mt-2">System overview and management</p>
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
                  <p className="text-3xl font-bold text-slate-900" data-testid="admin-total-transactions">{stats.total_transactions}</p>
                </div>
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <FileText className="w-6 h-6 text-blue-600" />
                </div>
              </div>
            </Card>

            <Card className="p-6 hover:shadow-md transition-shadow duration-200">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-slate-600 mb-1">Pending Transactions</p>
                  <p className="text-3xl font-bold text-yellow-600" data-testid="admin-pending-transactions">{stats.pending_transactions}</p>
                </div>
                <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
                  <TrendingUp className="w-6 h-6 text-yellow-600" />
                </div>
              </div>
            </Card>

            <Card className="p-6 hover:shadow-md transition-shadow duration-200">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-slate-600 mb-1">Pending Disputes</p>
                  <p className="text-3xl font-bold text-red-600" data-testid="admin-pending-disputes">{stats.pending_disputes}</p>
                </div>
                <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
                  <AlertCircle className="w-6 h-6 text-red-600" />
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* Tabs */}
        <Tabs defaultValue="users" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="users" data-testid="tab-users">Users</TabsTrigger>
            <TabsTrigger value="transactions" data-testid="tab-transactions">Transactions</TabsTrigger>
            <TabsTrigger value="disputes" data-testid="tab-disputes">Disputes</TabsTrigger>
          </TabsList>

          {/* Users Tab */}
          <TabsContent value="users">
            <Card className="p-6">
              <h2 className="text-xl font-semibold text-slate-900 mb-4">All Users</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left border-b border-slate-200">
                      <th className="pb-3 font-medium text-slate-600">Name</th>
                      <th className="pb-3 font-medium text-slate-600">Email</th>
                      <th className="pb-3 font-medium text-slate-600">Role</th>
                      <th className="pb-3 font-medium text-slate-600">Admin</th>
                      <th className="pb-3 font-medium text-slate-600">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((usr) => (
                      <tr key={usr.user_id} className="border-b border-slate-100" data-testid={`user-row-${usr.user_id}`}>
                        <td className="py-3">{usr.name}</td>
                        <td className="py-3">{usr.email}</td>
                        <td className="py-3 capitalize">{usr.role}</td>
                        <td className="py-3">
                          <span className="inline-block">
                            {usr.is_admin ? (
                              <Badge className="bg-purple-100 text-purple-800">Admin</Badge>
                            ) : (
                              <Badge className="bg-slate-100 text-slate-600">User</Badge>
                            )}
                          </span>
                        </td>
                        <td className="py-3 text-slate-500">{new Date(usr.created_at).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </TabsContent>

          {/* Transactions Tab */}
          <TabsContent value="transactions">
            <Card className="p-6">
              <h2 className="text-xl font-semibold text-slate-900 mb-4">All Transactions</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left border-b border-slate-200">
                      <th className="pb-3 font-medium text-slate-600">ID</th>
                      <th className="pb-3 font-medium text-slate-600">Buyer</th>
                      <th className="pb-3 font-medium text-slate-600">Seller</th>
                      <th className="pb-3 font-medium text-slate-600">Item</th>
                      <th className="pb-3 font-medium text-slate-600">Amount (R)</th>
                      <th className="pb-3 font-medium text-slate-600">Status</th>
                      <th className="pb-3 font-medium text-slate-600">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((txn) => (
                      <tr
                        key={txn.transaction_id}
                        onClick={() => navigate(`/transactions/${txn.transaction_id}`)}
                        className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors"
                        data-testid={`admin-transaction-row-${txn.transaction_id}`}
                      >
                        <td className="py-3 font-mono text-xs">{txn.transaction_id.substring(0, 12)}...</td>
                        <td className="py-3">{txn.buyer_name}</td>
                        <td className="py-3">{txn.seller_name}</td>
                        <td className="py-3 max-w-xs truncate">{txn.item_description}</td>
                        <td className="py-3 font-mono">R {txn.total.toFixed(2)}</td>
                        <td className="py-3">
                          <Badge className={getStatusBadge(txn.payment_status)}>
                            {txn.payment_status}
                          </Badge>
                        </td>
                        <td className="py-3 text-slate-500">{new Date(txn.created_at).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </TabsContent>

          {/* Disputes Tab */}
          <TabsContent value="disputes">
            <Card className="p-6">
              <h2 className="text-xl font-semibold text-slate-900 mb-4">All Disputes</h2>
              {disputes.length === 0 ? (
                <div className="text-center py-12">
                  <AlertCircle className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                  <p className="text-slate-500">No disputes yet</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {disputes.map((dispute) => (
                    <Card key={dispute.dispute_id} className="p-5 bg-slate-50 border-slate-200" data-testid={`admin-dispute-${dispute.dispute_id}`}>
                      <div className="grid md:grid-cols-2 gap-4 mb-4">
                        <div>
                          <p className="text-xs text-slate-500 mb-1">Dispute ID</p>
                          <p className="font-mono text-sm text-slate-700">{dispute.dispute_id}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 mb-1">Transaction ID</p>
                          <p className="font-mono text-sm text-slate-700">{dispute.transaction_id}</p>
                        </div>
                      </div>
                      <div className="mb-4">
                        <p className="text-xs text-slate-500 mb-1">Description</p>
                        <p className="text-sm text-slate-700 whitespace-pre-wrap">{dispute.description}</p>
                      </div>
                      <div className="flex justify-between items-center">
                        <div className="text-xs text-slate-500">
                          Created on {new Date(dispute.created_at).toLocaleString()}
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge className={getStatusBadge(dispute.status)}>
                            {dispute.status}
                          </Badge>
                          {dispute.status === 'Pending' && (
                            <Select
                              onValueChange={(value) => handleUpdateDisputeStatus(dispute.dispute_id, value)}
                            >
                              <SelectTrigger className="w-40" data-testid={`update-dispute-status-${dispute.dispute_id}`}>
                                <SelectValue placeholder="Update Status" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Resolved">Mark as Resolved</SelectItem>
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

export default AdminDashboard;