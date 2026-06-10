import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import { Card } from '../components/ui/card';
import api from '../utils/api';
import { toast } from 'sonner';
import { Activity, TrendingUp, ShieldCheck, Package, Users, DollarSign, CheckCircle, AlertTriangle, Rocket } from 'lucide-react';

// Format an ISO date (YYYY-MM-DD) as e.g. "4 June 2026".
function formatLaunchDate(value) {
  if (!value) return '';
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' });
}

function LiveActivity() {
  const [user, setUser] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchData();
    // Refresh stats every 30 seconds
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      const [userRes, statsRes] = await Promise.all([
        api.get('/auth/me'),
        api.get('/platform/stats')
      ]);

      setUser(userRes.data);
      setStats(statsRes.data);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
      if (error.response?.status === 401) {
        navigate('/');
      }
    } finally {
      setLoading(false);
    }
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Activity className="w-8 h-8 text-primary" />
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Live Activity</h1>
              <p className="text-slate-600">Real-time platform statistics</p>
            </div>
          </div>
          {stats?.platform_launch_date && (
            <div
              className="inline-flex items-center gap-2 rounded-full border border-green-200 bg-green-50 px-3 py-1.5 text-sm font-medium text-green-700"
              data-testid="launch-marker"
            >
              <Rocket className="w-4 h-4" />
              Platform launched: {formatLaunchDate(stats.platform_launch_date)}
            </div>
          )}
        </div>

        <p className="text-xs text-slate-400">
          Stats reflect real platform activity since launch — pre-launch test transactions are excluded.
        </p>

        {/* Hero Stats */}
        <Card className="p-8 bg-gradient-to-r from-primary to-blue-600 text-white">
          <div className="text-center mb-6">
            <h2 className="text-xl font-semibold mb-2">Live Today on TrustTrade</h2>
            <div className="flex items-center justify-center gap-2 text-sm opacity-80">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
              Live
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                <CheckCircle className="w-6 h-6" />
              </div>
              <p className="text-4xl font-bold mb-1" data-testid="completed-today">
                {stats?.completed_today || 0}
              </p>
              <p className="text-sm opacity-80">trades completed today</p>
            </div>
            
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                <DollarSign className="w-6 h-6" />
              </div>
              <p className="text-4xl font-bold mb-1" data-testid="total-secured">
                R {((stats?.total_secured || 0) / 1000).toFixed(0)}k
              </p>
              <p className="text-sm opacity-80">secured in transactions</p>
            </div>
            
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <p className="text-4xl font-bold mb-1" data-testid="fraud-cases">
                {stats?.fraud_cases_today || 0}
              </p>
              <p className="text-sm opacity-80">fraud cases today</p>
            </div>
          </div>
        </Card>

        {/* Detailed Stats — admins see 4 cards; non-admins see 2, centered. */}
        <div className={`grid gap-4 ${user?.is_admin ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-2 md:max-w-xl md:mx-auto'}`}>
          <Card className="p-4">
            <div className="flex items-center gap-3 mb-2">
              <Users className="w-5 h-5 text-primary" />
              <span className="text-sm text-slate-600">Total Users</span>
            </div>
            <p className="text-2xl font-bold text-slate-900" data-testid="total-users">
              {stats?.total_users || 0}
            </p>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-3 mb-2">
              <Package className="w-5 h-5 text-primary" />
              <span className="text-sm text-slate-600">Total Transactions</span>
            </div>
            <p className="text-2xl font-bold text-slate-900" data-testid="total-transactions">
              {stats?.total_transactions || 0}
            </p>
          </Card>

          {/* Admin-only: not meaningful at low volume and could erode trust if shown publicly */}
          {user?.is_admin && (
            <Card className="p-4">
              <div className="flex items-center gap-3 mb-2">
                <TrendingUp className="w-5 h-5 text-green-500" />
                <span className="text-sm text-slate-600">Success Rate</span>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Admin</span>
              </div>
              <p className="text-2xl font-bold text-green-600" data-testid="success-rate">
                {stats?.success_rate || 0}%
              </p>
            </Card>
          )}

          {user?.is_admin && (
            <Card className="p-4">
              <div className="flex items-center gap-3 mb-2">
                <AlertTriangle className="w-5 h-5 text-orange-500" />
                <span className="text-sm text-slate-600">Open Disputes</span>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Admin</span>
              </div>
              <p className="text-2xl font-bold text-slate-900" data-testid="open-disputes">
                {stats?.pending_disputes || 0}
              </p>
            </Card>
          )}
        </div>

        {/* Recent Activity */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Platform Health</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600">Active Transactions</span>
              <span className="font-medium">{stats?.active_transactions || 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600">Pending Confirmations</span>
              <span className="font-medium">{stats?.pending_confirmations || 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600">Verified Users</span>
              <span className="font-medium">{stats?.verified_users || 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600">Total Escrow Value (Since Launch)</span>
              <span className="font-medium text-primary">
                {(() => {
                  const amount = stats?.total_escrow_value || 0;
                  if (amount >= 1000000) return `R ${(amount / 1000000).toFixed(1)}M+`;
                  if (amount >= 1000) return `R ${Math.floor(amount / 1000)}k+`;
                  return `R ${Math.floor(amount / 100) * 100}+`;
                })()}
              </span>
            </div>
          </div>
        </Card>

        <p className="text-xs text-slate-400 text-center">
          Stats refresh automatically every 30 seconds
        </p>
      </div>
    </DashboardLayout>
  );
}

export default LiveActivity;
