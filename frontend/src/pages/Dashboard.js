import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout, { V } from '../components/DashboardLayout';
import api from '../utils/api';
import {
  Plus, FileText, AlertCircle, TrendingUp, ShieldCheck, Lock,
  Eye, EyeOff, CreditCard, ArrowRight, Clock, Banknote,
  CheckCircle, ArrowUpRight, Activity,
} from 'lucide-react';

/* ── Helpers ───────────────────────────────────────────────────────────────── */

const statusStyle = (ps) => {
  if (!ps) return { color: V.sub };
  const p = ps.toLowerCase();
  if (p.includes('released') || p.includes('paid') || p.includes('secured'))
    return { color: V.success };
  if (p.includes('awaiting') || p.includes('payment') || p.includes('ready'))
    return { color: V.accent };
  if (p.includes('delivery') || p.includes('progress') || p.includes('transit'))
    return { color: '#A78BFA' };
  if (p.includes('dispute') || p.includes('cancel'))
    return { color: V.error };
  return { color: V.warn };
};

/* Section heading with rule */
function SectionHead({ label, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
      <span style={{
        fontSize: 10, fontWeight: 700, color: V.sub,
        textTransform: 'uppercase', letterSpacing: '0.12em',
        fontFamily: V.mono, whiteSpace: 'nowrap',
      }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 1, background: V.border }} />
      {right && <div style={{ flexShrink: 0 }}>{right}</div>}
    </div>
  );
}

/* ── Component ─────────────────────────────────────────────────────────────── */

function Dashboard() {
  const [user, setUser]                 = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [disputes, setDisputes]         = useState([]);
  const [platformStats, setPlatformStats] = useState(null);
  const [adminData, setAdminData]       = useState(null);
  const [walletData, setWalletData]     = useState(null);
  const [loading, setLoading]           = useState(true);
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
        api.get('/wallet').catch(() => ({ data: null })),
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
            api.get('/admin/escrow-details').catch(() => ({ data: null })),
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

  /* ── Derived data ── */
  const activeTransactions    = transactions.filter(t =>
    t.payment_status !== 'Released' && t.payment_status !== 'Cancelled' && t.payment_status !== 'Refunded'
  );
  const pendingConfirmations  = transactions.filter(t => !t.seller_confirmed || t.payment_status === 'Ready for Payment');
  const pendingDisputes       = disputes.filter(d => d.status === 'Pending');
  const recentTransactions    = transactions.slice(0, 6);
  const totalEscrowValue      = transactions
    .filter(t => t.payment_status === 'Paid' || t.release_status === 'Not Released')
    .reduce((sum, t) => sum + (t.total || 0), 0);

  /* ── Shared inline styles ── */
  const card = {
    background: V.surface,
    border: `1px solid ${V.border}`,
    borderRadius: 4,
  };

  const mono = { fontFamily: V.mono };

  return (
    <DashboardLayout user={user} loading={loading}>
      <div style={{ maxWidth: 960, display: 'flex', flexDirection: 'column', gap: 24, animation: 'vaultFadeIn 0.2s ease' }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <h1
              data-testid="dashboard-title"
              style={{ fontSize: 24, fontWeight: 700, color: V.text, margin: '0 0 4px', letterSpacing: '-0.02em' }}
            >
              {loading ? 'Loading…' : `${new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 18 ? 'Good afternoon' : 'Good evening'}, ${user?.name?.split(' ')[0] ?? ''}`}
            </h1>
            <p style={{ fontSize: 12, color: V.sub, margin: 0, fontFamily: V.mono }}>
              SECURE ESCROW DASHBOARD · {new Date().toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase()}
            </p>
          </div>
          {user?.is_admin && (
            <button
              onClick={() => setShowExactValues(!showExactValues)}
              className="vault-btn"
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 12px', borderRadius: 3,
                border: `1px solid ${V.border}`,
                background: 'transparent', color: V.sub,
                fontSize: 12, cursor: 'pointer', fontFamily: V.sans,
                ...mono,
              }}
            >
              {showExactValues ? <EyeOff size={12} /> : <Eye size={12} />}
              {showExactValues ? 'HIDE' : 'SHOW'} VALUES
            </button>
          )}
        </div>

        {/* ── Stats row ── */}
        <div>
          <SectionHead label="Overview" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 1, border: `1px solid ${V.border}`, borderRadius: 4, overflow: 'hidden' }}>
            {[
              {
                icon: Activity, iconColor: V.accent,
                label: 'ACTIVE', value: platformStats?.active_transactions ?? activeTransactions.length,
                sub: 'transactions', testId: 'active-transactions',
              },
              {
                icon: AlertCircle, iconColor: V.warn,
                label: 'PENDING', value: platformStats?.pending_confirmations ?? pendingConfirmations.length,
                sub: 'need action', testId: 'pending-confirmations',
              },
              {
                icon: ShieldCheck, iconColor: V.success,
                label: 'VERIFIED', value: platformStats?.verified_users ?? 0,
                sub: 'users', testId: 'verified-users',
              },
              {
                icon: Lock, iconColor: '#A78BFA',
                label: 'IN ESCROW',
                value: `R ${totalEscrowValue.toLocaleString('en-ZA', { minimumFractionDigits: 0 })}`,
                sub: 'secured', testId: 'total-escrow', valueColor: V.success,
              },
            ].map((s, i) => (
              <div
                key={s.label}
                style={{
                  ...card,
                  borderRadius: 0,
                  border: 'none',
                  borderRight: i < 3 ? `1px solid ${V.border}` : 'none',
                  padding: '16px 20px',
                  cursor: 'default',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: V.sub, letterSpacing: '0.1em', fontFamily: V.mono }}>
                    {s.label}
                  </span>
                  <s.icon size={13} color={s.iconColor} />
                </div>
                <p
                  data-testid={s.testId}
                  style={{
                    fontSize: 24, fontWeight: 700,
                    color: s.valueColor || V.text,
                    margin: '0 0 4px',
                    fontFamily: V.mono,
                    letterSpacing: '-0.02em',
                  }}
                >
                  {s.value}
                </p>
                <p style={{ fontSize: 12, color: V.sub, margin: 0 }}>{s.sub}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Escrow protection banner ── */}
        <div style={{
          ...card,
          padding: '14px 20px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          borderLeft: `2px solid ${V.accent}`,
          flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <ShieldCheck size={16} color={V.accent} style={{ flexShrink: 0 }} />
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: V.text, margin: '0 0 2px' }}>
                All transactions protected by TrustTrade Escrow
              </p>
              <p style={{ fontSize: 12, color: V.sub, margin: 0 }}>
                Funds only released when you confirm delivery
              </p>
            </div>
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'rgba(255,255,255,0.03)',
            border: `1px solid ${V.border}`,
            borderRadius: 2, padding: '6px 12px',
          }}>
            <Clock size={11} color={V.sub} />
            <span style={{ fontSize: 12, color: V.sub, fontFamily: V.mono }}>
              PAYOUTS&nbsp;&nbsp;<span style={{ color: V.text }}>10:00</span>&nbsp;&amp;&nbsp;<span style={{ color: V.text }}>15:00</span>
            </span>
          </div>
        </div>

        {/* ── Wallet ── */}
        {walletData && (
          <div>
            <SectionHead
              label="Wallet"
              right={
                <button
                  onClick={() => navigate('/settings/banking')}
                  className="vault-btn"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '5px 10px', borderRadius: 3,
                    border: `1px solid ${V.border}`,
                    background: 'transparent', color: V.sub,
                    fontSize: 11, cursor: 'pointer', fontFamily: V.sans,
                  }}
                >
                  <CreditCard size={11} /> Banking Details
                </button>
              }
            />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 1, border: `1px solid ${V.border}`, borderRadius: 4, overflow: 'hidden', marginBottom: 1 }}>
              {[
                { label: 'AVAILABLE',    value: `R ${walletData.balance.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`, sub: 'Ready for payout',       color: V.success },
                { label: 'IN ESCROW',    value: `R ${walletData.pending_balance.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`, sub: 'Awaiting confirmation',  color: V.warn },
                { label: 'TOTAL EARNED', value: `R ${walletData.total_earned.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`, sub: 'All time',                color: V.accent },
              ].map((w, i) => (
                <div key={w.label} style={{
                  background: V.surface, borderRight: i < 2 ? `1px solid ${V.border}` : 'none',
                  padding: '14px 18px',
                }}>
                  <p style={{ fontSize: 10, fontWeight: 700, color: V.sub, letterSpacing: '0.1em', fontFamily: V.mono, margin: '0 0 10px' }}>
                    {w.label}
                  </p>
                  <p style={{ fontSize: 20, fontWeight: 700, color: w.color, margin: '0 0 3px', fontFamily: V.mono, letterSpacing: '-0.02em' }}>
                    {w.value}
                  </p>
                  <p style={{ fontSize: 12, color: V.sub, margin: 0 }}>{w.sub}</p>
                </div>
              ))}
            </div>
            <div style={{
              background: V.surface, border: `1px solid ${V.border}`,
              borderRadius: 4, padding: '9px 16px',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <Clock size={12} color={V.sub} style={{ flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: V.sub }}>
                Bank payout within <span style={{ color: V.text, fontWeight: 600 }}>1–2 business days</span> after release
              </span>
              {!walletData.banking_details_set && (
                <span style={{ marginLeft: 'auto', fontSize: 11, color: V.warn, display: 'flex', alignItems: 'center', gap: 4, fontFamily: V.mono }}>
                  <AlertCircle size={11} /> ADD BANKING
                </span>
              )}
            </div>
          </div>
        )}

        {/* ── Quick actions ── */}
        <div>
          <SectionHead label="Actions" />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[
              { icon: Plus,        label: 'New Transaction', path: '/transactions/new',    testId: 'quick-action-new-transaction',    color: V.accent },
              { icon: FileText,    label: 'All Transactions', path: '/transactions',       testId: 'quick-action-view-transactions',  color: V.sub },
              { icon: AlertCircle, label: 'Disputes',        path: '/disputes',            testId: 'quick-action-view-disputes',      color: V.warn },
            ].map(a => (
              <button
                key={a.label}
                data-testid={a.testId}
                onClick={() => navigate(a.path)}
                className="vault-btn vault-btn-primary"
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '9px 16px', borderRadius: 3,
                  border: `1px solid ${V.border}`,
                  background: 'transparent', color: V.sub,
                  fontSize: 13, fontWeight: 500, cursor: 'pointer',
                  fontFamily: V.sans,
                }}
              >
                <a.icon size={13} color={a.color} />
                {a.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Active escrow ── */}
        {activeTransactions.length > 0 && (
          <div>
            <SectionHead
              label="Active Escrow"
              right={
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: V.success,
                    boxShadow: `0 0 6px ${V.success}`,
                    display: 'inline-block',
                    animation: 'vaultPulse 2s infinite',
                    flexShrink: 0,
                  }} />
                  <span style={{ fontSize: 10, color: V.success, fontFamily: V.mono, fontWeight: 700 }}>
                    LIVE · {activeTransactions.length}
                  </span>
                </div>
              }
            />
            <div style={{ ...card, overflow: 'hidden' }}>
              {activeTransactions.slice(0, 5).map((t, i) => {
                const isUserBuyer = t.buyer_user_id === user?.user_id;
                const role        = isUserBuyer ? 'B' : 'S';
                const roleColor   = isUserBuyer ? V.accent : V.warn;
                const otherParty  = isUserBuyer ? t.seller_name : t.buyer_name;
                const sc          = statusStyle(t.payment_status);
                return (
                  <div
                    key={t.transaction_id}
                    onClick={() => navigate(`/transactions/${t.transaction_id}`)}
                    className="vault-row"
                    data-testid={`transaction-row-${t.transaction_id}`}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '10px 16px',
                      borderBottom: i < Math.min(activeTransactions.length, 5) - 1 ? `1px solid ${V.border}` : 'none',
                      cursor: 'pointer', transition: 'background 0.1s',
                    }}
                  >
                    <div style={{
                      width: 28, height: 28, borderRadius: 2, flexShrink: 0,
                      border: `1px solid rgba(${isUserBuyer ? '0,209,255' : '240,180,41'},0.3)`,
                      background: `rgba(${isUserBuyer ? '0,209,255' : '240,180,41'},0.06)`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 700, color: roleColor, fontFamily: V.mono,
                    }}>
                      {role}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 500, color: V.text, margin: '0 0 2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {t.item_description.slice(0, 45)}{t.item_description.length > 45 ? '…' : ''}
                      </p>
                      <p style={{ fontSize: 11, color: V.sub, margin: 0, fontFamily: V.mono }}>
                        {isUserBuyer ? 'BUYER' : 'SELLER'} · {otherParty} · {t.share_code}
                      </p>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: V.text, margin: '0 0 3px', fontFamily: V.mono }}>
                        R&nbsp;{t.item_price.toFixed(2)}
                      </p>
                      <span style={{ fontSize: 10, fontWeight: 600, fontFamily: V.mono, letterSpacing: '0.04em', ...sc }}>
                        {(t.payment_status || '').toUpperCase()}
                      </span>
                    </div>
                    <ArrowUpRight size={12} color={V.border} />
                  </div>
                );
              })}
              {activeTransactions.length > 5 && (
                <div style={{ padding: '10px 16px', borderTop: `1px solid ${V.border}` }}>
                  <button
                    onClick={() => navigate('/transactions')}
                    className="vault-btn"
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      padding: '7px', background: 'transparent', border: `1px solid ${V.border}`,
                      borderRadius: 2, fontSize: 11, color: V.sub, cursor: 'pointer',
                      fontFamily: V.mono, letterSpacing: '0.06em',
                    }}
                  >
                    VIEW ALL {activeTransactions.length} TRANSACTIONS <ArrowRight size={11} />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Recent transactions table ── */}
        <div>
          <SectionHead
            label="Recent Transactions"
            right={
              <button
                data-testid="view-all-transactions-link"
                onClick={() => navigate('/transactions')}
                className="vault-btn"
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  background: 'none', border: 'none',
                  fontSize: 11, color: V.accent, cursor: 'pointer',
                  fontFamily: V.mono, letterSpacing: '0.06em',
                }}
              >
                VIEW ALL <ArrowRight size={10} />
              </button>
            }
          />
          <div style={{ ...card, overflow: 'hidden' }}>
            {recentTransactions.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center' }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 4,
                  background: 'rgba(255,255,255,0.03)',
                  border: `1px solid ${V.border}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 12px',
                }}>
                  <FileText size={18} color={V.border} />
                </div>
                <p style={{ fontSize: 13, color: V.sub, margin: '0 0 14px' }}>No transactions yet</p>
                <button
                  data-testid="empty-state-create-transaction"
                  onClick={() => navigate('/transactions/new')}
                  className="vault-btn vault-btn-primary"
                  style={{
                    padding: '8px 20px', borderRadius: 3,
                    border: `1px solid ${V.accent}`,
                    background: 'rgba(0,209,255,0.08)',
                    color: V.accent, fontSize: 12, cursor: 'pointer',
                    fontFamily: V.sans, fontWeight: 600,
                  }}
                >
                  Create First Transaction
                </button>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${V.border}` }}>
                      {['REF', 'BUYER', 'SELLER', 'AMOUNT', 'STATUS'].map((h, i) => (
                        <th key={h} style={{
                          padding: '10px 16px',
                          fontSize: 10, fontWeight: 700, color: V.sub,
                          textAlign: i === 3 ? 'right' : 'left',
                          letterSpacing: '0.1em', fontFamily: V.mono,
                          background: 'transparent',
                        }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {recentTransactions.map((t) => {
                      const sc = statusStyle(t.payment_status);
                      return (
                        <tr
                          key={t.transaction_id}
                          data-testid={`transaction-row-${t.transaction_id}`}
                          onClick={() => navigate(`/transactions/${t.transaction_id}`)}
                          className="vault-tr"
                          style={{ borderBottom: `1px solid ${V.border}`, cursor: 'pointer' }}
                        >
                          <td style={{ padding: '11px 16px', fontFamily: V.mono, fontSize: 12, color: V.accent, fontWeight: 600 }}>
                            {t.share_code || '—'}
                          </td>
                          <td style={{ padding: '11px 16px', fontSize: 13, color: V.text }}>{t.buyer_name}</td>
                          <td style={{ padding: '11px 16px', fontSize: 13, color: V.text }}>{t.seller_name}</td>
                          <td style={{ padding: '11px 16px', fontFamily: V.mono, fontSize: 12, fontWeight: 600, color: V.success, textAlign: 'right' }}>
                            R&nbsp;{t.item_price.toFixed(2)}
                          </td>
                          <td style={{ padding: '11px 16px' }}>
                            <span style={{ fontSize: 10, fontWeight: 700, fontFamily: V.mono, letterSpacing: '0.06em', ...sc }}>
                              {(t.payment_status || '—').toUpperCase()}
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
        </div>

        {/* ── How it works ── */}
        <div>
          <SectionHead label="How Escrow Protects You" />
          <div style={{ ...card, padding: '16px 20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '10px 24px' }}>
              {[
                { title: 'Funds held securely',    desc: 'Your money goes to escrow, not directly to seller' },
                { title: 'Released on confirmation', desc: 'Seller gets paid only when you confirm receipt' },
                { title: 'Dispute protection',      desc: "Raise a dispute before release if something's wrong" },
                { title: 'Fast bank payout',        desc: 'Released at 10:00 & 15:00, arrives in 1–2 business days' },
              ].map(f => (
                <div key={f.title} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <CheckCircle size={13} color={V.success} style={{ flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <p style={{ fontSize: 12, fontWeight: 600, color: V.text, margin: '0 0 2px' }}>{f.title}</p>
                    <p style={{ fontSize: 12, color: V.sub, margin: 0 }}>{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Admin section ── */}
        {user?.is_admin && (
          <div>
            <SectionHead
              label="Admin Overview"
              right={
                <span style={{
                  fontSize: 9, fontWeight: 700,
                  color: V.warn, border: `1px solid rgba(240,180,41,0.3)`,
                  background: 'rgba(240,180,41,0.06)',
                  padding: '2px 7px', borderRadius: 2,
                  letterSpacing: '0.1em', fontFamily: V.mono,
                }}>
                  CONFIDENTIAL
                </span>
              }
            />
            <div style={{ ...card, overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', borderBottom: `1px solid ${V.border}` }}>
                {[
                  { label: 'TOTAL ESCROW',  value: `R ${(platformStats?.total_escrow_value || 0).toLocaleString()}` },
                  { label: 'TOTAL USERS',   value: platformStats?.total_users || 0 },
                  { label: 'OPEN DISPUTES', value: pendingDisputes.length, valueColor: pendingDisputes.length > 0 ? V.error : V.success },
                ].map((s, i) => (
                  <div key={s.label} style={{
                    padding: '14px 18px',
                    borderRight: i < 2 ? `1px solid ${V.border}` : 'none',
                  }}>
                    <p style={{ fontSize: 10, fontWeight: 700, color: V.sub, fontFamily: V.mono, letterSpacing: '0.1em', margin: '0 0 8px' }}>
                      {s.label}
                    </p>
                    <p style={{ fontSize: 20, fontWeight: 700, color: s.valueColor || V.text, margin: 0, fontFamily: V.mono }}>
                      {s.value}
                    </p>
                  </div>
                ))}
              </div>
              <div style={{ padding: '12px 16px', display: 'flex', gap: 8 }}>
                {[
                  { label: 'Full Admin Dashboard', path: '/admin' },
                  { label: 'Live Activity',         path: '/activity' },
                ].map(b => (
                  <button
                    key={b.label}
                    onClick={() => navigate(b.path)}
                    className="vault-btn"
                    style={{
                      padding: '7px 14px', borderRadius: 3,
                      border: `1px solid ${V.border}`,
                      background: 'transparent', color: V.sub,
                      fontSize: 12, cursor: 'pointer', fontFamily: V.sans,
                    }}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

      </div>
    </DashboardLayout>
  );
}

export default Dashboard;
