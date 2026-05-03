import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import api from '../utils/api';
import { Plus, FileText, AlertCircle, TrendingUp, ShieldCheck, Lock, Eye, EyeOff, CreditCard, ArrowRight, Clock, Banknote, CheckCircle, ArrowUpRight } from 'lucide-react';

function Dashboard() {
  const [user, setUser] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [disputes, setDisputes] = useState([]);
  const [platformStats, setPlatformStats] = useState(null);
  const [adminData, setAdminData] = useState(null);
  const [walletData, setWalletData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showExactValues, setShowExactValues] = useState(false);
  const navigate = useNavigate();

  useEffect(() => { fetchDashboardData(); }, []);

  const fetchDashboardData = async () => {
    try {
      const [userRes, transactionsRes, disputesRes, statsRes, walletRes] = await Promise.all([
        api.get('/auth/me'),
        api.get('/transactions'),
        api.get('/disputes'),
        api.get('/platform/stats'),
        api.get('/wallet').catch(() => ({ data: null }))
      ]);
      setUser(userRes.data);
      setTransactions(transactionsRes.data);
      setDisputes(disputesRes.data);
      setPlatformStats(statsRes.data);
      if (walletRes.data) setWalletData(walletRes.data);
      if (userRes.data.is_admin) {
        try {
          const [adminStatsRes, escrowDetailsRes] = await Promise.all([
            api.get('/admin/stats'),
            api.get('/admin/escrow-details').catch(() => ({ data: null }))
          ]);
          setAdminData({ ...adminStatsRes.data, escrowDetails: escrowDetailsRes.data });
        } catch (e) { console.log('Admin data fetch failed:', e); }
      }
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
      navigate('/');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 36, height: 36, border: '3px solid #10b981', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
          <p style={{ fontSize: 13, color: '#64748b' }}>Loading dashboard…</p>
        </div>
      </div>
    );
  }

  const activeTransactions = transactions.filter(t =>
    t.payment_status !== 'Released' && t.payment_status !== 'Cancelled' && t.payment_status !== 'Refunded'
  );
  const pendingConfirmations = transactions.filter(t => !t.seller_confirmed || t.payment_status === 'Ready for Payment');
  const pendingDisputes = disputes.filter(d => d.status === 'Pending');
  const recentTransactions = transactions.slice(0, 6);
  const totalEscrowValue = transactions
    .filter(t => t.payment_status === 'Paid' || t.release_status === 'Not Released')
    .reduce((sum, t) => sum + (t.total || 0), 0);

  const statusColor = (ps) => {
    if (!ps) return { dot: '#94a3b8', bg: '#f1f5f9', text: '#64748b' };
    const p = ps.toLowerCase();
    if (p.includes('paid') || p.includes('secured') || p.includes('released')) return { dot: '#10b981', bg: '#ecfdf5', text: '#059669' };
    if (p.includes('payment') || p.includes('awaiting')) return { dot: '#3b82f6', bg: '#eff6ff', text: '#2563eb' };
    if (p.includes('delivery') || p.includes('progress')) return { dot: '#8b5cf6', bg: '#f5f3ff', text: '#7c3aed' };
    return { dot: '#f59e0b', bg: '#fffbeb', text: '#d97706' };
  };

  const S = {
    card: {
      background: '#fff',
      borderRadius: 14,
      border: '1px solid #f1f5f9',
      boxShadow: '0 1px 4px rgba(15,23,42,0.06)',
    },
    label: { fontSize: 11, fontWeight: 500, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' },
    sectionTitle: { fontSize: 15, fontWeight: 600, color: '#0f172a', margin: 0 },
  };

  return (
    <DashboardLayout user={user}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
        .dash-row-hover:hover { background: #f8fafc !important; }
        .dash-action:hover { opacity: 0.88; transform: translateY(-1px); }
        .stat-card:hover { box-shadow: 0 4px 16px rgba(15,23,42,0.1) !important; transform: translateY(-2px); }
        * { box-sizing: border-box; }
      `}</style>

      <div style={{ maxWidth: 900, display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <h1 data-testid="dashboard-title" style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', margin: '0 0 4px', letterSpacing: '-0.02em' }}>
              Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}, {user?.name?.split(' ')[0]} 👋
            </h1>
            <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>Here's what's happening with your escrow transactions.</p>
          </div>
          {user?.is_admin && (
            <button onClick={() => setShowExactValues(!showExactValues)} style={{ display:'flex',alignItems:'center',gap:6,padding:'6px 12px',borderRadius:8,border:'1px solid #e2e8f0',background:'#fff',fontSize:12,color:'#64748b',cursor:'pointer',transition:'all 0.15s' }}>
              {showExactValues ? <EyeOff size={13}/> : <Eye size={13}/>}
              {showExactValues ? 'Hide' : 'Show'} values
            </button>
          )}
        </div>

        {/* ── Stats row ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
          {[
            {
              icon: TrendingUp, iconColor: '#3b82f6', iconBg: '#eff6ff',
              label: 'Active', value: platformStats?.active_transactions ?? activeTransactions.length,
              sub: 'transactions', testId: 'active-transactions',
            },
            {
              icon: AlertCircle, iconColor: '#f59e0b', iconBg: '#fffbeb',
              label: 'Pending', value: platformStats?.pending_confirmations ?? pendingConfirmations.length,
              sub: 'need action', testId: 'pending-confirmations',
            },
            {
              icon: ShieldCheck, iconColor: '#10b981', iconBg: '#ecfdf5',
              label: 'Verified', value: platformStats?.verified_users ?? 0,
              sub: 'users', testId: 'verified-users',
            },
            {
              icon: Lock, iconColor: '#6366f1', iconBg: '#eef2ff',
              label: 'In Escrow', value: `R ${totalEscrowValue.toLocaleString('en-ZA', { minimumFractionDigits: 0 })}`,
              sub: 'secured', testId: 'total-escrow', valueColor: '#10b981',
            },
          ].map((s) => (
            <div key={s.label} className="stat-card" style={{ ...S.card, padding: '18px 16px', transition: 'all 0.2s ease', cursor: 'default' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={S.label}>{s.label}</span>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: s.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <s.icon size={14} color={s.iconColor} />
                </div>
              </div>
              <p data-testid={s.testId} style={{ fontSize: 24, fontWeight: 700, color: s.valueColor || '#0f172a', margin: '0 0 2px', letterSpacing: '-0.02em' }}>
                {s.value}
              </p>
              <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>{s.sub}</p>
            </div>
          ))}
        </div>

        {/* ── Hero CTA banner ── */}
        <div style={{
          borderRadius: 16, overflow: 'hidden',
          background: 'linear-gradient(135deg, #0f1729 0%, #1e293b 100%)',
          padding: '20px 24px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
          flexWrap: 'wrap',
          boxShadow: '0 4px 20px rgba(15,23,42,0.15)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <ShieldCheck size={20} color="#10b981" />
            </div>
            <div>
              <p style={{ fontSize: 14, fontWeight: 600, color: '#fff', margin: '0 0 3px' }}>All transactions protected by TrustTrade Escrow</p>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', margin: 0 }}>Funds only released when you confirm delivery</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.06)', padding: '6px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)' }}>
            <Clock size={12} color="rgba(255,255,255,0.5)" />
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Payouts: <strong style={{ color: '#fff' }}>10:00</strong> & <strong style={{ color: '#fff' }}>15:00</strong> daily</span>
          </div>
        </div>

        {/* ── Wallet ── */}
        {walletData && (
          <div style={{ ...S.card, padding: '20px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: '#ecfdf5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Banknote size={15} color="#10b981" />
                </div>
                <span style={S.sectionTitle}>My Wallet</span>
              </div>
              <button onClick={() => navigate('/settings/banking')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', fontSize: 12, color: '#475569', cursor: 'pointer' }}>
                <CreditCard size={12} /> Banking Details
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 14 }}>
              {[
                { label: 'Available', value: `R ${walletData.balance.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`, sub: 'Ready for payout', color: '#10b981', bg: '#ecfdf5', border: '#a7f3d0' },
                { label: 'In Escrow', value: `R ${walletData.pending_balance.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`, sub: 'Awaiting confirmation', color: '#f59e0b', bg: '#fffbeb', border: '#fde68a' },
                { label: 'Total Earned', value: `R ${walletData.total_earned.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`, sub: 'All time', color: '#6366f1', bg: '#eef2ff', border: '#c7d2fe' },
              ].map(w => (
                <div key={w.label} style={{ background: w.bg, border: `1px solid ${w.border}`, borderRadius: 10, padding: '14px 16px' }}>
                  <p style={{ ...S.label, marginBottom: 6 }}>{w.label}</p>
                  <p style={{ fontSize: 18, fontWeight: 700, color: w.color, margin: '0 0 2px', letterSpacing: '-0.01em' }}>{w.value}</p>
                  <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>{w.sub}</p>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: '#f8fafc', borderRadius: 8, border: '1px solid #f1f5f9' }}>
              <Clock size={13} color="#94a3b8" />
              <span style={{ fontSize: 12, color: '#64748b' }}>Bank payout within <strong style={{ color: '#0f172a' }}>1–2 business days</strong> after release</span>
              {!walletData.banking_details_set && (
                <span style={{ marginLeft: 'auto', fontSize: 11, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <AlertCircle size={11} /> Add banking details
                </span>
              )}
            </div>
          </div>
        )}

        {/* ── Quick Actions ── */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {[
            { icon: Plus, label: 'New Transaction', color: '#3b82f6', bg: '#eff6ff', path: '/transactions/new', testId: 'quick-action-new-transaction' },
            { icon: FileText, label: 'All Transactions', color: '#6366f1', bg: '#eef2ff', path: '/transactions', testId: 'quick-action-view-transactions' },
            { icon: AlertCircle, label: 'Disputes', color: '#f59e0b', bg: '#fffbeb', path: '/disputes', testId: 'quick-action-view-disputes' },
          ].map(a => (
            <button key={a.label} data-testid={a.testId} onClick={() => navigate(a.path)} className="dash-action" style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 10,
              border: '1px solid #f1f5f9', background: '#fff', fontSize: 13, fontWeight: 500, color: '#0f172a',
              cursor: 'pointer', transition: 'all 0.2s ease', boxShadow: '0 1px 3px rgba(15,23,42,0.05)',
            }}>
              <div style={{ width: 26, height: 26, borderRadius: 6, background: a.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <a.icon size={13} color={a.color} />
              </div>
              {a.label}
            </button>
          ))}
        </div>

        {/* ── Active Escrow ── */}
        {activeTransactions.length > 0 && (
          <div style={S.card}>
            <div style={{ padding: '18px 20px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f8fafc' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Lock size={15} color="#3b82f6" />
                <span style={S.sectionTitle}>Active Escrow</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#10b981', background: '#ecfdf5', padding: '2px 7px', borderRadius: 20, fontWeight: 500 }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#10b981', animation: 'pulse 2s infinite' }} />
                  Live
                </span>
              </div>
              <span style={{ fontSize: 12, color: '#94a3b8' }}>{activeTransactions.length} active</span>
            </div>
            <div style={{ padding: '8px 12px' }}>
              {activeTransactions.slice(0, 5).map((t) => {
                const isUserBuyer = t.buyer_user_id === user?.user_id;
                const role = isUserBuyer ? 'Buyer' : 'Seller';
                const otherParty = isUserBuyer ? t.seller_name : t.buyer_name;
                const sc = statusColor(t.payment_status);
                return (
                  <div
                    key={t.transaction_id}
                    onClick={() => navigate(`/transactions/${t.transaction_id}`)}
                    className="dash-row-hover"
                    data-testid={`transaction-row-${t.transaction_id}`}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 8px', borderRadius: 8, cursor: 'pointer', transition: 'background 0.15s' }}
                  >
                    <div style={{ width: 36, height: 36, borderRadius: 9, background: isUserBuyer ? '#eff6ff' : '#fff7ed', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: isUserBuyer ? '#3b82f6' : '#f97316' }}>{role[0]}</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 500, color: '#0f172a', margin: '0 0 2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {t.item_description.slice(0, 40)}{t.item_description.length > 40 ? '…' : ''}
                      </p>
                      <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>
                        {role} · {otherParty} · <span style={{ fontFamily: 'monospace' }}>{t.share_code}</span>
                      </p>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', margin: '0 0 3px', fontFamily: 'monospace' }}>R {t.item_price.toFixed(2)}</p>
                      <span style={{ fontSize: 10, fontWeight: 500, padding: '2px 7px', borderRadius: 20, background: sc.bg, color: sc.text }}>
                        {t.payment_status}
                      </span>
                    </div>
                    <ArrowUpRight size={13} color="#cbd5e1" />
                  </div>
                );
              })}
            </div>
            {activeTransactions.length > 5 && (
              <div style={{ padding: '12px 20px', borderTop: '1px solid #f8fafc' }}>
                <button onClick={() => navigate('/transactions')} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px', background: 'transparent', border: 'none', fontSize: 12, color: '#64748b', cursor: 'pointer' }}>
                  View all {activeTransactions.length} transactions <ArrowRight size={12} />
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Recent Transactions ── */}
        <div style={S.card}>
          <div style={{ padding: '18px 20px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={S.sectionTitle}>Recent Transactions</span>
            <button data-testid="view-all-transactions-link" onClick={() => navigate('/transactions')} style={{ fontSize: 12, color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
              View all <ArrowRight size={11} />
            </button>
          </div>
          {recentTransactions.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center' }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: '#f8fafc', border: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                <FileText size={20} color="#cbd5e1" />
              </div>
              <p style={{ fontSize: 14, color: '#64748b', margin: '0 0 12px' }}>No transactions yet</p>
              <button data-testid="empty-state-create-transaction" onClick={() => navigate('/transactions/new')} style={{ padding: '8px 18px', borderRadius: 8, background: '#0f1729', color: '#fff', border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                Create Your First Transaction
              </button>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                    {['Ref', 'Buyer', 'Seller', 'Amount', 'Status'].map((h, i) => (
                      <th key={h} style={{ padding: '8px 20px', fontSize: 11, fontWeight: 600, color: '#94a3b8', textAlign: i === 3 ? 'right' : 'left', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recentTransactions.map((t) => {
                    const sc = statusColor(t.payment_status);
                    return (
                      <tr
                        key={t.transaction_id}
                        data-testid={`transaction-row-${t.transaction_id}`}
                        onClick={() => navigate(`/transactions/${t.transaction_id}`)}
                        className="dash-row-hover"
                        style={{ borderBottom: '1px solid #f8fafc', cursor: 'pointer', transition: 'background 0.15s' }}
                      >
                        <td style={{ padding: '12px 20px', fontFamily: 'monospace', fontSize: 12, color: '#3b82f6', fontWeight: 600 }}>{t.share_code || '—'}</td>
                        <td style={{ padding: '12px 20px', fontSize: 13, color: '#0f172a' }}>{t.buyer_name}</td>
                        <td style={{ padding: '12px 20px', fontSize: 13, color: '#0f172a' }}>{t.seller_name}</td>
                        <td style={{ padding: '12px 20px', fontSize: 13, fontFamily: 'monospace', fontWeight: 600, color: '#0f172a', textAlign: 'right' }}>R {t.item_price.toFixed(2)}</td>
                        <td style={{ padding: '12px 20px' }}>
                          <span style={{ fontSize: 11, fontWeight: 500, padding: '3px 8px', borderRadius: 20, background: sc.bg, color: sc.text }}>
                            {t.payment_status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── How it works ── */}
        <div style={{ ...S.card, padding: '20px 24px', background: '#fafbfc' }}>
          <p style={{ ...S.sectionTitle, marginBottom: 14 }}>How TrustTrade Escrow Protects You</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 12 }}>
            {[
              { icon: CheckCircle, color: '#10b981', title: 'Funds held securely', desc: 'Your money goes to escrow, not directly to seller' },
              { icon: CheckCircle, color: '#10b981', title: 'Released on confirmation', desc: 'Seller gets paid only when you confirm receipt' },
              { icon: CheckCircle, color: '#10b981', title: 'Dispute protection', desc: 'Raise a dispute before release if something\'s wrong' },
              { icon: CheckCircle, color: '#10b981', title: 'Fast bank payout', desc: 'Released at 10:00 & 15:00, arrives in 1–2 business days' },
            ].map(f => (
              <div key={f.title} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <f.icon size={15} color={f.color} style={{ flexShrink: 0, marginTop: 1 }} />
                <div>
                  <p style={{ fontSize: 13, fontWeight: 500, color: '#0f172a', margin: '0 0 2px' }}>{f.title}</p>
                  <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Admin section ── */}
        {user?.is_admin && (
          <div style={{ ...S.card, padding: '20px 24px', background: '#fafbfc', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <Lock size={14} color="#64748b" />
              <span style={S.sectionTitle}>Admin Overview</span>
              <span style={{ fontSize: 10, fontWeight: 700, background: '#f1f5f9', color: '#64748b', padding: '2px 7px', borderRadius: 4, letterSpacing: '0.04em' }}>CONFIDENTIAL</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 14 }}>
              {[
                { label: 'Total Escrow', value: `R ${(platformStats?.total_escrow_value || 0).toLocaleString()}` },
                { label: 'Total Users', value: platformStats?.total_users || 0 },
                { label: 'Open Disputes', value: pendingDisputes.length, valueColor: pendingDisputes.length > 0 ? '#ef4444' : '#0f172a' },
              ].map(s => (
                <div key={s.label} style={{ background: '#fff', border: '1px solid #f1f5f9', borderRadius: 10, padding: '12px 14px' }}>
                  <p style={{ ...S.label, marginBottom: 4 }}>{s.label}</p>
                  <p style={{ fontSize: 18, fontWeight: 700, color: s.valueColor || '#0f172a', margin: 0 }}>{s.value}</p>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {[
                { label: 'Full Admin Dashboard', path: '/admin' },
                { label: 'Live Activity', path: '/activity' },
              ].map(b => (
                <button key={b.label} onClick={() => navigate(b.path)} style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', fontSize: 12, color: '#475569', cursor: 'pointer' }}>
                  {b.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

export default Dashboard;
