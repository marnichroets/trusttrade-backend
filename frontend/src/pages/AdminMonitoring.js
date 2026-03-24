import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminNavbar from '../components/AdminNavbar';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import axios from 'axios';
import { toast } from 'sonner';
import { 
  Activity, AlertTriangle, CheckCircle, XCircle, Clock, 
  RefreshCw, Mail, Webhook, Server, TrendingUp, Users,
  AlertOctagon, RotateCcw, Send, Edit, Eye, Shield,
  Loader2, ChevronRight, ExternalLink, Bell, BellOff
} from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL;

export default function AdminMonitoring() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dashboard, setDashboard] = useState(null);
  const [webhookEvents, setWebhookEvents] = useState([]);
  const [emailLogs, setEmailLogs] = useState([]);
  const [adminActions, setAdminActions] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [alertStats, setAlertStats] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  
  // Modal states
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [newStatus, setNewStatus] = useState('');
  const [statusReason, setStatusReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const fetchDashboardData = useCallback(async (showToast = false) => {
    try {
      setRefreshing(true);
      
      const [dashboardRes, webhooksRes, emailsRes, actionsRes, alertsRes] = await Promise.all([
        axios.get(`${API_URL}/api/admin/monitoring/dashboard`, { withCredentials: true }),
        axios.get(`${API_URL}/api/admin/monitoring/webhook-events?limit=100`, { withCredentials: true }),
        axios.get(`${API_URL}/api/admin/monitoring/email-logs?limit=100`, { withCredentials: true }),
        axios.get(`${API_URL}/api/admin/monitoring/actions?limit=50`, { withCredentials: true }),
        axios.get(`${API_URL}/api/admin/alerts?hours=24&limit=50`, { withCredentials: true })
      ]);
      
      setDashboard(dashboardRes.data);
      setWebhookEvents(webhooksRes.data.events || []);
      setEmailLogs(emailsRes.data.logs || []);
      setAdminActions(actionsRes.data.actions || []);
      setAlerts(alertsRes.data.alerts || []);
      setAlertStats(alertsRes.data.stats || null);
      setLastRefresh(new Date());
      
      if (showToast) {
        toast.success('Dashboard refreshed');
      }
    } catch (error) {
      console.error('Error fetching dashboard:', error);
      if (error.response?.status === 403) {
        toast.error('Admin access required');
        navigate('/admin');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [navigate]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Auto-refresh every 15 seconds
  useEffect(() => {
    if (!autoRefresh) return;
    
    const interval = setInterval(() => {
      fetchDashboardData();
    }, 15000);
    
    return () => clearInterval(interval);
  }, [autoRefresh, fetchDashboardData]);

  const handleRetryWebhook = async (eventId) => {
    try {
      setActionLoading(true);
      await axios.post(`${API_URL}/api/admin/monitoring/retry-webhook/${eventId}`, {}, { withCredentials: true });
      toast.success('Webhook retry initiated');
      fetchDashboardData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to retry webhook');
    } finally {
      setActionLoading(false);
    }
  };

  const handleResendEmail = async (transactionId, emailType) => {
    try {
      setActionLoading(true);
      await axios.post(`${API_URL}/api/admin/monitoring/resend-email/${transactionId}/${emailType}`, {}, { withCredentials: true });
      toast.success('Email resent successfully');
      fetchDashboardData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to resend email');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateStatus = async () => {
    if (!selectedTransaction || !newStatus) return;
    
    try {
      setActionLoading(true);
      await axios.post(
        `${API_URL}/api/admin/monitoring/update-transaction-status/${selectedTransaction.transaction_id}`,
        { new_state: newStatus, reason: statusReason || 'Admin manual override' },
        { withCredentials: true }
      );
      toast.success('Transaction status updated');
      setShowStatusModal(false);
      setSelectedTransaction(null);
      setNewStatus('');
      setStatusReason('');
      fetchDashboardData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update status');
    } finally {
      setActionLoading(false);
    }
  };

  const handleResolveAlert = async (alertId) => {
    try {
      setActionLoading(true);
      await axios.post(`${API_URL}/api/admin/alerts/${alertId}/resolve`, {}, { withCredentials: true });
      toast.success('Alert resolved');
      fetchDashboardData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to resolve alert');
    } finally {
      setActionLoading(false);
    }
  };

  const handleTestAlert = async () => {
    try {
      setActionLoading(true);
      await axios.post(`${API_URL}/api/admin/alerts/test`, {}, { withCredentials: true });
      toast.success('Test alert sent! Check your email.');
      fetchDashboardData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to send test alert');
    } finally {
      setActionLoading(false);
    }
  };

  const getHealthStatusColor = (status) => {
    switch (status) {
      case 'healthy': return 'bg-blue-500';
      case 'warning': return 'bg-amber-500';
      case 'critical': return 'bg-red-500';
      default: return 'bg-slate-500';
    }
  };

  const getHealthStatusBg = (status) => {
    switch (status) {
      case 'healthy': return 'bg-blue-50 border-blue-200';
      case 'warning': return 'bg-amber-50 border-amber-200';
      case 'critical': return 'bg-red-50 border-red-200';
      default: return 'bg-slate-50 border-slate-200';
    }
  };

  const formatTimestamp = (ts) => {
    if (!ts) return 'N/A';
    return new Date(ts).toLocaleString();
  };

  const getTimeSince = (ts) => {
    if (!ts) return 'N/A';
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white">
        <AdminNavbar />
        <div className="flex items-center justify-center h-[80vh]">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50" data-testid="admin-monitoring-page">
      <AdminNavbar />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="bg-white p-2 rounded-lg shadow-sm border border-slate-200">
              <img src="/trusttrade-logo.png" alt="TrustTrade" className="h-10 object-contain" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">System Monitoring</h1>
              <p className="text-sm text-slate-500">Real-time production reliability dashboard</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            {/* Auto-refresh toggle */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-600">Auto-refresh</span>
              <button
                onClick={() => setAutoRefresh(!autoRefresh)}
                className={`w-12 h-6 rounded-full transition-colors ${autoRefresh ? 'bg-blue-500' : 'bg-slate-300'}`}
                data-testid="auto-refresh-toggle"
              >
                <div className={`w-5 h-5 bg-white rounded-full shadow transform transition-transform ${autoRefresh ? 'translate-x-6' : 'translate-x-0.5'}`} />
              </button>
            </div>
            
            {lastRefresh && (
              <span className="text-xs text-slate-500">
                Last: {lastRefresh.toLocaleTimeString()}
              </span>
            )}
            
            <Button 
              onClick={() => fetchDashboardData(true)} 
              variant="outline" 
              disabled={refreshing}
              data-testid="refresh-btn"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Health Status Banner */}
        {dashboard && (
          <Card className={`p-4 mb-6 border-2 ${getHealthStatusBg(dashboard.health_status)}`} data-testid="health-status-banner">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-4 h-4 rounded-full ${getHealthStatusColor(dashboard.health_status)} animate-pulse`} />
                <span className="font-semibold text-lg capitalize">{dashboard.health_status}</span>
                {dashboard.health_status === 'critical' && (
                  <Badge variant="destructive" className="ml-2">Action Required</Badge>
                )}
              </div>
              
              {dashboard.alerts && dashboard.alerts.length > 0 && (
                <div className="flex items-center gap-2">
                  <AlertOctagon className="w-5 h-5 text-amber-600" />
                  <span className="text-sm font-medium">{dashboard.alerts.length} Active Alert(s)</span>
                </div>
              )}
            </div>
            
            {/* Alerts */}
            {dashboard.alerts && dashboard.alerts.length > 0 && (
              <div className="mt-4 space-y-2">
                {dashboard.alerts.map((alert, idx) => (
                  <div 
                    key={idx} 
                    className={`flex items-center gap-2 p-2 rounded ${
                      alert.severity === 'critical' ? 'bg-red-100 text-red-800' :
                      alert.severity === 'high' ? 'bg-amber-100 text-amber-800' :
                      'bg-blue-100 text-blue-800'
                    }`}
                  >
                    <AlertTriangle className="w-4 h-4" />
                    <span className="text-sm font-medium">
                      {alert.type === 'webhook_failure' && `${alert.count} failed webhook(s) in last 24h`}
                      {alert.type === 'email_failure' && `${alert.count} failed email(s) in last 24h`}
                      {alert.type === 'stuck_transaction' && `${alert.count} stuck transaction(s) detected`}
                      {alert.type === 'payment_stuck' && `${alert.count} payment(s) not synced to state`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {/* Metrics Cards */}
        {dashboard && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
            <Card className="p-4" data-testid="metric-active-transactions">
              <div className="flex items-center gap-2 text-slate-600 mb-2">
                <Activity className="w-4 h-4" />
                <span className="text-xs">Active Transactions</span>
              </div>
              <p className="text-2xl font-bold text-slate-900">{dashboard.metrics.transactions.total_active}</p>
            </Card>
            
            <Card className="p-4" data-testid="metric-awaiting-payment">
              <div className="flex items-center gap-2 text-amber-600 mb-2">
                <Clock className="w-4 h-4" />
                <span className="text-xs">Awaiting Payment</span>
              </div>
              <p className="text-2xl font-bold text-amber-600">{dashboard.metrics.transactions.awaiting_payment}</p>
            </Card>
            
            <Card className="p-4" data-testid="metric-secured-24h">
              <div className="flex items-center gap-2 text-blue-600 mb-2">
                <Shield className="w-4 h-4" />
                <span className="text-xs">Secured (24h)</span>
              </div>
              <p className="text-2xl font-bold text-blue-600">{dashboard.metrics.transactions.payments_secured_24h}</p>
            </Card>
            
            <Card className="p-4" data-testid="metric-webhook-failures">
              <div className="flex items-center gap-2 text-red-600 mb-2">
                <Webhook className="w-4 h-4" />
                <span className="text-xs">Webhook Failures</span>
              </div>
              <p className="text-2xl font-bold text-red-600">{dashboard.metrics.webhooks.failed}</p>
            </Card>
            
            <Card className="p-4" data-testid="metric-email-failures">
              <div className="flex items-center gap-2 text-red-600 mb-2">
                <Mail className="w-4 h-4" />
                <span className="text-xs">Email Failures</span>
              </div>
              <p className="text-2xl font-bold text-red-600">{dashboard.metrics.emails.failed_24h}</p>
            </Card>
            
            <Card className="p-4" data-testid="metric-stuck-transactions">
              <div className="flex items-center gap-2 text-amber-600 mb-2">
                <AlertTriangle className="w-4 h-4" />
                <span className="text-xs">Stuck Transactions</span>
              </div>
              <p className="text-2xl font-bold text-amber-600">{dashboard.stuck_transactions?.length || 0}</p>
            </Card>
          </div>
        )}

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
            <TabsTrigger value="alerts" data-testid="tab-alerts" className="relative">
              Alerts
              {alerts.filter(a => !a.resolved).length > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-xs text-white flex items-center justify-center">
                  {alerts.filter(a => !a.resolved).length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="webhooks" data-testid="tab-webhooks">Webhooks</TabsTrigger>
            <TabsTrigger value="emails" data-testid="tab-emails">Emails</TabsTrigger>
            <TabsTrigger value="stuck" data-testid="tab-stuck">Stuck</TabsTrigger>
            <TabsTrigger value="actions" data-testid="tab-actions">Actions</TabsTrigger>
          </TabsList>

          {/* Alerts Tab */}
          <TabsContent value="alerts">
            <Card className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <Bell className="w-5 h-5 text-red-600" />
                  <h3 className="font-semibold text-lg">Critical Alerts</h3>
                </div>
                <div className="flex items-center gap-3">
                  {alertStats && (
                    <div className="text-sm text-slate-600">
                      <span className="font-medium text-red-600">{alertStats.unresolved}</span> unresolved / 
                      <span className="font-medium ml-1">{alertStats.total_24h}</span> total (24h)
                    </div>
                  )}
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={handleTestAlert}
                    disabled={actionLoading}
                  >
                    Test Alert
                  </Button>
                </div>
              </div>
              
              {alerts.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <BellOff className="w-12 h-12 mx-auto mb-3 text-blue-500" />
                  <p className="font-medium">No alerts</p>
                  <p className="text-sm">Everything is running smoothly</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {alerts.map((alert, idx) => (
                    <div 
                      key={idx} 
                      className={`p-4 rounded-lg border ${
                        alert.resolved 
                          ? 'bg-slate-50 border-slate-200' 
                          : alert.priority === 'CRITICAL' 
                            ? 'bg-red-50 border-red-200' 
                            : 'bg-amber-50 border-amber-200'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            {alert.priority === 'CRITICAL' && !alert.resolved && (
                              <AlertOctagon className="w-4 h-4 text-red-600" />
                            )}
                            <Badge className={
                              alert.resolved 
                                ? 'bg-slate-100 text-slate-600' 
                                : alert.priority === 'CRITICAL' 
                                  ? 'bg-red-100 text-red-800' 
                                  : 'bg-amber-100 text-amber-800'
                            }>
                              {alert.alert_type?.replace(/_/g, ' ').toUpperCase()}
                            </Badge>
                            {alert.resolved && (
                              <Badge className="bg-blue-100 text-blue-800">
                                <CheckCircle className="w-3 h-3 mr-1" />
                                Resolved
                              </Badge>
                            )}
                            {alert.email_sent && (
                              <Badge variant="outline" className="text-xs">
                                <Mail className="w-3 h-3 mr-1" />
                                Email Sent
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-slate-700 mb-2">{alert.message}</p>
                          <div className="flex items-center gap-4 text-xs text-slate-500">
                            {alert.share_code && <span>Ref: {alert.share_code}</span>}
                            <span>{getTimeSince(alert.timestamp)}</span>
                            {alert.resolved_by && <span>Resolved by: {alert.resolved_by}</span>}
                          </div>
                        </div>
                        {!alert.resolved && (
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => handleResolveAlert(alert.alert_id || alert._id)}
                            disabled={actionLoading}
                          >
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Resolve
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </TabsContent>

          {/* Overview Tab */}
          <TabsContent value="overview">
            {dashboard && (
              <div className="grid md:grid-cols-2 gap-6">
                {/* Webhook Stats */}
                <Card className="p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Webhook className="w-5 h-5 text-slate-600" />
                    <h3 className="font-semibold text-lg">Webhook Processing (24h)</h3>
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-slate-600">Total Received</span>
                      <span className="font-medium">{dashboard.metrics.webhooks.total_24h}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Processed</span>
                      <span className="font-medium text-blue-600">{dashboard.metrics.webhooks.processed}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Failed</span>
                      <span className="font-medium text-red-600">{dashboard.metrics.webhooks.failed}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Duplicates (ignored)</span>
                      <span className="font-medium text-slate-400">{dashboard.metrics.webhooks.duplicates}</span>
                    </div>
                    <div className="pt-3 border-t">
                      <div className="flex justify-between">
                        <span className="text-slate-600">Success Rate</span>
                        <span className={`font-bold ${dashboard.metrics.webhooks.success_rate >= 95 ? 'text-blue-600' : 'text-amber-600'}`}>
                          {dashboard.metrics.webhooks.success_rate}%
                        </span>
                      </div>
                    </div>
                  </div>
                </Card>

                {/* Email Stats */}
                <Card className="p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Mail className="w-5 h-5 text-slate-600" />
                    <h3 className="font-semibold text-lg">Email Delivery (24h)</h3>
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-slate-600">Sent Successfully</span>
                      <span className="font-medium text-blue-600">{dashboard.metrics.emails.sent_24h}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Failed</span>
                      <span className="font-medium text-red-600">{dashboard.metrics.emails.failed_24h}</span>
                    </div>
                    <div className="pt-3 border-t">
                      <div className="flex justify-between">
                        <span className="text-slate-600">Success Rate</span>
                        <span className={`font-bold ${dashboard.metrics.emails.success_rate >= 95 ? 'text-blue-600' : 'text-amber-600'}`}>
                          {dashboard.metrics.emails.success_rate}%
                        </span>
                      </div>
                    </div>
                  </div>
                </Card>

                {/* Payment Stuck Warning */}
                {dashboard.payment_stuck && dashboard.payment_stuck.length > 0 && (
                  <Card className="p-6 border-2 border-red-200 bg-red-50 md:col-span-2">
                    <div className="flex items-center gap-2 mb-4">
                      <AlertOctagon className="w-5 h-5 text-red-600" />
                      <h3 className="font-semibold text-lg text-red-900">Payment State Mismatch</h3>
                    </div>
                    <p className="text-sm text-red-700 mb-4">
                      These transactions have received payment but their state hasn't been updated. This may indicate a webhook failure.
                    </p>
                    <div className="space-y-2">
                      {dashboard.payment_stuck.map((txn, idx) => (
                        <div key={idx} className="flex items-center justify-between bg-white p-3 rounded border border-red-200">
                          <div>
                            <span className="font-medium">{txn.share_code || txn.transaction_id}</span>
                            <span className="text-sm text-red-600 ml-2">TradeSafe: {txn.tradesafe_state}</span>
                          </div>
                          <Button 
                            size="sm" 
                            onClick={() => {
                              setSelectedTransaction(txn);
                              setNewStatus('PAYMENT_SECURED');
                              setShowStatusModal(true);
                            }}
                          >
                            Fix Status
                          </Button>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}
              </div>
            )}
          </TabsContent>

          {/* Webhooks Tab */}
          <TabsContent value="webhooks">
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-lg">Recent Webhook Events</h3>
                <Badge variant="outline">{webhookEvents.length} events</Badge>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-3">Transaction</th>
                      <th className="text-left py-2 px-3">Event Type</th>
                      <th className="text-left py-2 px-3">Status</th>
                      <th className="text-left py-2 px-3">Timestamp</th>
                      <th className="text-left py-2 px-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {webhookEvents.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="text-center py-8 text-slate-500">
                          No webhook events recorded yet
                        </td>
                      </tr>
                    ) : (
                      webhookEvents.map((event, idx) => (
                        <tr 
                          key={idx} 
                          className={`border-b ${
                            event.status === 'failed' ? 'bg-red-50' : 
                            event.status === 'duplicate' ? 'bg-slate-50' : ''
                          }`}
                        >
                          <td className="py-2 px-3">
                            <span className="font-mono text-xs">{event.transaction_id || 'N/A'}</span>
                          </td>
                          <td className="py-2 px-3">
                            {event.payload?.state || event.payload?.event || 'Unknown'}
                          </td>
                          <td className="py-2 px-3">
                            <Badge className={
                              event.status === 'processed' ? 'bg-blue-100 text-blue-800' :
                              event.status === 'failed' ? 'bg-red-100 text-red-800' :
                              event.status === 'duplicate' ? 'bg-slate-100 text-slate-600' :
                              'bg-blue-100 text-blue-800'
                            }>
                              {event.status}
                            </Badge>
                          </td>
                          <td className="py-2 px-3 text-slate-600">{getTimeSince(event.timestamp)}</td>
                          <td className="py-2 px-3">
                            {event.status === 'failed' && (
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => handleRetryWebhook(event.event_id)}
                                disabled={actionLoading}
                              >
                                <RotateCcw className="w-3 h-3 mr-1" />
                                Retry
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </TabsContent>

          {/* Emails Tab */}
          <TabsContent value="emails">
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-lg">Recent Email Logs</h3>
                <Badge variant="outline">{emailLogs.length} logs</Badge>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-3">Transaction</th>
                      <th className="text-left py-2 px-3">Email Type</th>
                      <th className="text-left py-2 px-3">Recipient</th>
                      <th className="text-left py-2 px-3">Status</th>
                      <th className="text-left py-2 px-3">Timestamp</th>
                      <th className="text-left py-2 px-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {emailLogs.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center py-8 text-slate-500">
                          No email logs recorded yet
                        </td>
                      </tr>
                    ) : (
                      emailLogs.map((log, idx) => (
                        <tr 
                          key={idx} 
                          className={`border-b ${!log.success ? 'bg-red-50' : ''}`}
                        >
                          <td className="py-2 px-3">
                            <span className="font-mono text-xs">{log.transaction_id || 'N/A'}</span>
                          </td>
                          <td className="py-2 px-3 capitalize">
                            {log.email_event?.replace(/_/g, ' ') || 'Unknown'}
                          </td>
                          <td className="py-2 px-3 text-slate-600">{log.recipient || 'N/A'}</td>
                          <td className="py-2 px-3">
                            {log.success ? (
                              <Badge className="bg-blue-100 text-blue-800">
                                <CheckCircle className="w-3 h-3 mr-1" />
                                Sent
                              </Badge>
                            ) : (
                              <Badge className="bg-red-100 text-red-800">
                                <XCircle className="w-3 h-3 mr-1" />
                                Failed
                              </Badge>
                            )}
                          </td>
                          <td className="py-2 px-3 text-slate-600">{getTimeSince(log.timestamp)}</td>
                          <td className="py-2 px-3">
                            {!log.success && log.transaction_id && log.email_event && (
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => handleResendEmail(log.transaction_id, log.email_event)}
                                disabled={actionLoading}
                              >
                                <Send className="w-3 h-3 mr-1" />
                                Resend
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </TabsContent>

          {/* Stuck Transactions Tab */}
          <TabsContent value="stuck">
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-600" />
                  <h3 className="font-semibold text-lg">Stuck Transactions</h3>
                </div>
                <Badge variant="outline">{dashboard?.stuck_transactions?.length || 0} found</Badge>
              </div>
              
              <p className="text-sm text-slate-600 mb-4">
                Transactions with no state update for more than 10 minutes while in an active state.
              </p>
              
              {dashboard?.stuck_transactions?.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  <CheckCircle className="w-12 h-12 mx-auto mb-2 text-blue-500" />
                  <p>No stuck transactions detected</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {dashboard?.stuck_transactions?.map((txn, idx) => (
                    <div 
                      key={idx} 
                      className="flex items-center justify-between bg-amber-50 p-4 rounded-lg border border-amber-200"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{txn.share_code || txn.transaction_id}</span>
                          <Badge className="bg-amber-100 text-amber-800">{txn.transaction_state}</Badge>
                        </div>
                        <div className="text-sm text-slate-600">
                          {txn.buyer_name} → {txn.seller_name} | R{txn.item_price?.toFixed(2)}
                        </div>
                        <div className="text-xs text-slate-500">
                          Last update: {txn.last_webhook_at ? getTimeSince(txn.last_webhook_at) : 'Never'}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => navigate(`/admin/transaction/${txn.transaction_id}`)}
                        >
                          <Eye className="w-3 h-3 mr-1" />
                          View
                        </Button>
                        <Button 
                          size="sm"
                          onClick={() => {
                            setSelectedTransaction(txn);
                            setShowStatusModal(true);
                          }}
                        >
                          <Edit className="w-3 h-3 mr-1" />
                          Update Status
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </TabsContent>

          {/* Admin Actions Tab */}
          <TabsContent value="actions">
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-lg">Admin Action Log</h3>
                <Badge variant="outline">{adminActions.length} actions</Badge>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-3">Admin</th>
                      <th className="text-left py-2 px-3">Action</th>
                      <th className="text-left py-2 px-3">Transaction</th>
                      <th className="text-left py-2 px-3">Details</th>
                      <th className="text-left py-2 px-3">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adminActions.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="text-center py-8 text-slate-500">
                          No admin actions recorded yet
                        </td>
                      </tr>
                    ) : (
                      adminActions.map((action, idx) => (
                        <tr key={idx} className="border-b">
                          <td className="py-2 px-3">{action.admin_name || action.admin_email}</td>
                          <td className="py-2 px-3 capitalize">{action.action?.replace(/_/g, ' ')}</td>
                          <td className="py-2 px-3 font-mono text-xs">{action.transaction_id || 'N/A'}</td>
                          <td className="py-2 px-3 text-slate-600 text-xs">
                            {action.old_state && action.new_state && (
                              <span>{action.old_state} → {action.new_state}</span>
                            )}
                            {action.email_type && <span>Email: {action.email_type}</span>}
                            {action.event_id && <span>Event: {action.event_id?.slice(0, 8)}...</span>}
                          </td>
                          <td className="py-2 px-3 text-slate-600">{getTimeSince(action.timestamp)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Status Update Modal */}
      {showStatusModal && selectedTransaction && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md p-6 m-4">
            <h3 className="text-lg font-semibold mb-4">Update Transaction Status</h3>
            
            <div className="mb-4">
              <p className="text-sm text-slate-600">Transaction: <span className="font-medium">{selectedTransaction.share_code || selectedTransaction.transaction_id}</span></p>
              <p className="text-sm text-slate-600">Current State: <Badge>{selectedTransaction.transaction_state}</Badge></p>
            </div>
            
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">New Status</label>
              <select 
                className="w-full border rounded-md p-2"
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value)}
              >
                <option value="">Select status...</option>
                <option value="CREATED">CREATED</option>
                <option value="PENDING_CONFIRMATION">PENDING_CONFIRMATION</option>
                <option value="AWAITING_PAYMENT">AWAITING_PAYMENT</option>
                <option value="PAYMENT_SECURED">PAYMENT_SECURED</option>
                <option value="DELIVERY_IN_PROGRESS">DELIVERY_IN_PROGRESS</option>
                <option value="DELIVERED">DELIVERED</option>
                <option value="COMPLETED">COMPLETED</option>
                <option value="DISPUTED">DISPUTED</option>
                <option value="CANCELLED">CANCELLED</option>
                <option value="REFUNDED">REFUNDED</option>
              </select>
            </div>
            
            <div className="mb-6">
              <label className="block text-sm font-medium mb-2">Reason (optional)</label>
              <Textarea
                value={statusReason}
                onChange={(e) => setStatusReason(e.target.value)}
                placeholder="Reason for status change..."
                rows={3}
              />
            </div>
            
            <div className="flex gap-3">
              <Button 
                variant="outline" 
                className="flex-1"
                onClick={() => {
                  setShowStatusModal(false);
                  setSelectedTransaction(null);
                  setNewStatus('');
                  setStatusReason('');
                }}
              >
                Cancel
              </Button>
              <Button 
                className="flex-1 bg-blue-600 hover:bg-blue-700"
                onClick={handleUpdateStatus}
                disabled={!newStatus || actionLoading}
              >
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Update Status
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
