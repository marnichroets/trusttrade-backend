import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import DashboardLayout, { V } from '../components/DashboardLayout';
import { fieldText, resolveEscrowUiState } from '../components/transactionState';
import api from '../utils/api';
import {
  Activity,
  AlertCircle,
  ArrowRight,
  ArrowUpRight,
  Banknote,
  CheckCircle,
  Clock,
  CreditCard,
  Eye,
  EyeOff,
  FileText,
  Fingerprint,
  Landmark,
  Lock,
  PackageCheck,
  Plus,
  RadioTower,
  ShieldCheck,
  TrendingUp,
  WalletCards,
} from 'lucide-react';

const money = (value, decimals = 0) =>
  `R ${Number(value || 0).toLocaleString('en-ZA', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const getTransactionValue = (transaction) =>
  transaction?.item_price ?? transaction?.total ?? transaction?.amount ?? 0;

const flowSteps = [
  { label: 'Confirm', icon: CheckCircle },
  { label: 'Payment', icon: CreditCard },
  { label: 'Escrow', icon: Lock },
  { label: 'Delivery', icon: PackageCheck },
  { label: 'Release', icon: Banknote },
];

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
  const reduceMotion = useReducedMotion();

  const fetchDashboardData = useCallback(async () => {
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
  }, [navigate]);

  useEffect(() => { fetchDashboardData(); }, [fetchDashboardData]);

  const pendingDisputes = disputes.filter(d => fieldText(d.status).includes('pending') || fieldText(d.status).includes('open'));
  const activeTransactions = transactions.filter(t => !resolveEscrowUiState(t, pendingDisputes).terminal);
  const pendingConfirmations = transactions.filter(t => {
    const state = resolveEscrowUiState(t, pendingDisputes);
    return ['CREATED', 'DELIVERY_PENDING'].includes(state.state);
  });
  const recentTransactions = transactions.slice(0, 6);
  const totalEscrowValue = transactions
    .filter(t => ['ESCROW_LOCKED', 'DELIVERY_PENDING', 'DELIVERED', 'DISPUTED'].includes(resolveEscrowUiState(t, pendingDisputes).state))
    .reduce((sum, t) => sum + (t.total || getTransactionValue(t)), 0);
  const pendingConfirmationValue = transactions
    .filter(t => resolveEscrowUiState(t, pendingDisputes).state === 'DELIVERY_PENDING')
    .reduce((sum, t) => sum + (t.total || getTransactionValue(t)), 0);

  const disputeHoldValue = transactions
    .filter(t => resolveEscrowUiState(t, pendingDisputes).state === 'DISPUTED')
    .reduce((sum, t) => sum + (t.total || getTransactionValue(t)), 0);

  const walletSegments = useMemo(() => {
    const available = Number(walletData?.balance || 0);
    const walletPending = Number(walletData?.pending_balance || 0);
    const held = totalEscrowValue || walletPending;
    const pending = pendingConfirmationValue;
    const disputeHold = disputeHoldValue;
    const total = Math.max(available + held + pending + disputeHold, 1);
    return {
      available,
      held,
      pending,
      disputeHold,
      heldPct: clamp((held / total) * 100, 8, 88),
      pendingPct: pending ? clamp((pending / total) * 100, 6, 70) : 0,
      availablePct: clamp((available / total) * 100, 6, 70),
      hasWallet: Boolean(walletData),
    };
  }, [disputeHoldValue, walletData, pendingConfirmationValue, totalEscrowValue]);

  const greeting = loading
    ? 'Loading'
    : `${new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 18 ? 'Good afternoon' : 'Good evening'}, ${user?.name?.split(' ')[0] ?? ''}`;

  return (
    <DashboardLayout user={user} loading={loading}>
      <style>{`
        .tt-command {
          position: relative;
          max-width: 1320px;
          min-height: calc(100vh - 48px);
          display: flex;
          flex-direction: column;
          gap: 22px;
          overflow: hidden;
          animation: vaultFadeIn 0.28s ease;
        }
        .tt-command::before {
          content: "";
          position: fixed;
          inset: 0;
          pointer-events: none;
          background:
            radial-gradient(circle at 24% 0%, rgba(0,209,255,0.16), transparent 34%),
            radial-gradient(circle at 78% 18%, rgba(0,255,163,0.1), transparent 30%),
            linear-gradient(180deg, rgba(10,14,20,0), rgba(10,14,20,0.84));
        }
        .tt-command-panel {
          position: relative;
          border: 1px solid rgba(255,255,255,0.1);
          background: linear-gradient(145deg, rgba(28,33,40,0.82), rgba(8,12,20,0.92));
          box-shadow: 0 30px 120px rgba(0,0,0,0.36), inset 0 1px 0 rgba(255,255,255,0.04);
          backdrop-filter: blur(22px);
        }
        .tt-command-panel::after {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          background: linear-gradient(120deg, transparent 0%, rgba(255,255,255,0.04) 42%, transparent 68%);
          opacity: 0.75;
        }
        .tt-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.28fr) minmax(340px, 0.72fr);
          gap: 18px;
          align-items: stretch;
        }
        .tt-live-row {
          transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease;
        }
        .tt-live-row:hover {
          transform: translateY(-2px);
          border-color: rgba(0,209,255,0.42) !important;
          background: rgba(0,209,255,0.045) !important;
        }
        .tt-action:hover {
          transform: translateY(-2px);
          border-color: rgba(0,209,255,0.52) !important;
          color: ${V.text} !important;
          box-shadow: 0 16px 45px rgba(0,209,255,0.08);
        }
        @media (prefers-reduced-motion: reduce) {
          .tt-live-row, .tt-action { transition: none !important; }
        }
        @media (max-width: 1180px) {
          .tt-grid { grid-template-columns: 1fr; }
        }
        @media (max-width: 760px) {
          .tt-command { gap: 16px; }
          .tt-responsive-grid { grid-template-columns: 1fr !important; }
          .tt-hide-sm { display: none !important; }
        }
      `}</style>

      <div className="tt-command">
        <CommandHeader
          greeting={greeting}
          user={user}
          showExactValues={showExactValues}
          setShowExactValues={setShowExactValues}
        />

        <div className="tt-grid">
          <EscrowEngine
            activeTransactions={activeTransactions}
            pendingConfirmations={pendingConfirmations}
            pendingDisputes={pendingDisputes}
            platformStats={platformStats}
            totalEscrowValue={totalEscrowValue}
            reduceMotion={reduceMotion}
            navigate={navigate}
          />
          <WalletCommand
            walletData={walletData}
            walletSegments={walletSegments}
            pendingDisputes={pendingDisputes}
            navigate={navigate}
          />
        </div>

        {!loading && user && (!user.phone_verified || !user.banking_details_completed) && (
          <ProfileReadiness user={user} navigate={navigate} />
        )}

        <ActionDock navigate={navigate} />

        <div className="tt-grid">
          <LiveTransactionFeed
            activeTransactions={activeTransactions}
            pendingDisputes={pendingDisputes}
            user={user}
            navigate={navigate}
            reduceMotion={reduceMotion}
          />
          <TrustOperations
            activeTransactions={activeTransactions}
            pendingConfirmations={pendingConfirmations}
            pendingDisputes={pendingDisputes}
            platformStats={platformStats}
            totalEscrowValue={totalEscrowValue}
          />
        </div>

        <RecentLedger recentTransactions={recentTransactions} pendingDisputes={pendingDisputes} navigate={navigate} />

        {user?.is_admin && (
          <AdminCommand
            platformStats={platformStats}
            pendingDisputes={pendingDisputes}
            adminData={adminData}
            navigate={navigate}
          />
        )}
      </div>
    </DashboardLayout>
  );
}

function CommandHeader({ greeting, user, showExactValues, setShowExactValues }) {
  const dateLabel = new Date().toLocaleDateString('en-ZA', {
    weekday: 'long',
    day: '2-digit',
    month: 'short',
  });
  const timeLabel = new Date().toLocaleTimeString('en-ZA', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div style={{ position: 'relative', display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <p style={{ margin: '0 0 7px', color: V.accent, fontFamily: V.mono, fontSize: 10, fontWeight: 800, letterSpacing: '0.12em' }}>
            TRUSTTRADE COMMAND CENTER
          </p>
          <h1
            data-testid="dashboard-title"
            style={{ margin: 0, color: V.text, fontSize: 'clamp(24px, 3vw, 38px)', lineHeight: 1.05, fontWeight: 800, letterSpacing: '-0.035em' }}
          >
            {greeting}
          </h1>
          <p style={{ margin: '8px 0 0', color: V.sub, fontSize: 12, fontFamily: V.mono, fontWeight: 700, letterSpacing: '0.02em' }}>
            Secure escrow dashboard &middot; {dateLabel} &middot; {timeLabel}
          </p>
        </div>
        {user?.is_admin && (
          <button
            onClick={() => setShowExactValues(!showExactValues)}
            className="tt-action"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 13px',
              borderRadius: 6,
              border: `1px solid ${V.border}`,
              background: 'rgba(255,255,255,0.035)',
              color: V.sub,
              fontSize: 11,
              cursor: 'pointer',
              fontFamily: V.mono,
              fontWeight: 700,
            }}
          >
            {showExactValues ? <EyeOff size={13} /> : <Eye size={13} />}
            {showExactValues ? 'HIDE' : 'SHOW'} VALUES
          </button>
        )}
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {[
          ['SA banking ready', Landmark, V.accent],
          ['Escrow system online', ShieldCheck, V.success],
          ['Verification active', Fingerprint, '#A78BFA'],
          ['Payout windows 10:00 / 15:00', RadioTower, V.warn],
        ].map(([label, Icon, color]) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, border: `1px solid ${V.border}`, background: 'rgba(255,255,255,0.035)', padding: '8px 11px', borderRadius: 999 }}>
            <Icon size={13} color={color} />
            <span style={{ color: V.sub, fontSize: 12, fontWeight: 700 }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function EscrowEngine({ activeTransactions, pendingConfirmations, pendingDisputes, platformStats, totalEscrowValue, reduceMotion, navigate }) {
  const activeCount = platformStats?.active_transactions ?? activeTransactions.length;
  const pendingCount = platformStats?.pending_confirmations ?? pendingConfirmations.length;
  const verifiedUsers = platformStats?.verified_users ?? 0;

  return (
    <section className="tt-command-panel" style={{ minHeight: 500, padding: 22, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 50% 42%, rgba(0,209,255,0.2), transparent 30%), radial-gradient(circle at 72% 58%, rgba(0,255,163,0.12), transparent 28%)' }} />
      <div style={{ position: 'relative', zIndex: 1, display: 'grid', minHeight: 456, gridTemplateRows: 'auto 1fr auto', gap: 18 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
          <div>
            <p style={{ margin: '0 0 8px', color: V.sub, fontFamily: V.mono, fontSize: 11, fontWeight: 800, letterSpacing: '0.12em' }}>
              LIVE ESCROW ENGINE
            </p>
            <h2 style={{ margin: 0, maxWidth: 610, color: V.text, fontSize: 'clamp(30px, 4vw, 54px)', lineHeight: 0.96, fontWeight: 800, letterSpacing: '-0.045em' }}>
              Protected money flow, visible from capture to payout.
            </h2>
          </div>
          <button
            onClick={() => navigate('/transactions/new')}
            className="tt-action"
            style={{ display: 'flex', alignItems: 'center', gap: 9, border: '1px solid rgba(0,209,255,0.36)', background: 'linear-gradient(135deg, rgba(0,209,255,0.16), rgba(0,255,163,0.1))', color: V.text, borderRadius: 6, padding: '12px 16px', cursor: 'pointer', fontWeight: 800 }}
          >
            <Plus size={16} color={V.accent} />
            New Transaction
          </button>
        </div>

        <div style={{ position: 'relative', minHeight: 255, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <FlowEndpoint label="Buyer" value="funds captured" icon={CreditCard} side="left" />
          <FlowEndpoint label="Seller" value="payout controlled" icon={PackageCheck} side="right" />
          <motion.div
            animate={reduceMotion ? {} : { x: ['-230px', '0px', '230px'], opacity: [0, 1, 1, 0] }}
            transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut' }}
            style={{ position: 'absolute', zIndex: 2, width: 13, height: 13, borderRadius: '50%', background: '#E6FBFF', boxShadow: '0 0 36px rgba(0,209,255,0.95)' }}
          />
          <div className="tt-hide-sm" style={{ position: 'absolute', left: '14%', right: '14%', top: '50%', height: 1, background: 'linear-gradient(90deg, rgba(0,209,255,0.2), rgba(0,255,163,0.78), rgba(240,180,41,0.25))' }} />
          <EscrowCore reduceMotion={reduceMotion} value={totalEscrowValue} />
        </div>

        <div className="tt-responsive-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 1, border: `1px solid ${V.border}`, background: V.border }}>
          <MetricCell icon={Activity} label="Active" value={activeCount} sub="transactions" color={V.accent} testId="active-transactions" />
          <MetricCell icon={AlertCircle} label="Pending" value={pendingCount} sub="need action" color={V.warn} testId="pending-confirmations" />
          <MetricCell icon={ShieldCheck} label="Verified" value={verifiedUsers} sub="users" color={V.success} testId="verified-users" />
          <MetricCell icon={Lock} label="In escrow" value={money(totalEscrowValue)} sub="secured" color={V.success} testId="total-escrow" />
        </div>
      </div>
    </section>
  );
}

function FlowEndpoint({ label, value, icon: Icon, side }) {
  return (
    <div className="tt-hide-sm" style={{ position: 'absolute', [side]: 8, zIndex: 3, width: 170, border: `1px solid ${V.border}`, background: 'rgba(10,14,20,0.72)', padding: 14, backdropFilter: 'blur(18px)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 38, height: 38, display: 'grid', placeItems: 'center', border: '1px solid rgba(0,209,255,0.32)', background: 'rgba(0,209,255,0.09)', borderRadius: 6 }}>
          <Icon size={18} color={V.accent} />
        </div>
        <div>
          <p style={{ margin: 0, color: V.text, fontWeight: 800 }}>{label}</p>
          <p style={{ margin: '2px 0 0', color: V.sub, fontSize: 11, fontFamily: V.mono, textTransform: 'uppercase' }}>{value}</p>
        </div>
      </div>
    </div>
  );
}

function EscrowCore({ reduceMotion, value }) {
  return (
    <div style={{ position: 'relative', width: 230, height: 230, display: 'grid', placeItems: 'center' }}>
      <motion.div
        animate={reduceMotion ? {} : { rotate: 360 }}
        transition={{ duration: 24, repeat: Infinity, ease: 'linear' }}
        style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'conic-gradient(from 80deg, transparent, rgba(0,209,255,0.74), rgba(0,255,163,0.62), rgba(240,180,41,0.22), transparent)', filter: 'drop-shadow(0 0 45px rgba(0,209,255,0.32))' }}
      />
      <motion.div
        animate={reduceMotion ? {} : { scale: [1, 1.08, 1], opacity: [0.55, 0.95, 0.55] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
        style={{ position: 'absolute', inset: 32, borderRadius: '50%', background: 'rgba(0,209,255,0.18)', filter: 'blur(28px)' }}
      />
      <div style={{ position: 'relative', width: 164, height: 164, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.16)', background: 'linear-gradient(145deg, rgba(12,18,30,0.96), rgba(5,9,16,0.98))', display: 'grid', placeItems: 'center', boxShadow: 'inset 0 0 55px rgba(0,209,255,0.2), 0 0 85px rgba(0,209,255,0.2)' }}>
        <div style={{ textAlign: 'center' }}>
          <ShieldCheck size={42} color={V.success} style={{ margin: '0 auto 10px', filter: 'drop-shadow(0 0 20px rgba(0,255,163,0.7))' }} />
          <p style={{ margin: 0, color: V.sub, fontSize: 10, fontFamily: V.mono, fontWeight: 800, letterSpacing: '0.12em' }}>LOCKED CORE</p>
          <p style={{ margin: '6px 0 0', color: V.text, fontFamily: V.mono, fontWeight: 800 }}>{money(value)}</p>
        </div>
      </div>
    </div>
  );
}

function MetricCell({ icon: Icon, label, value, sub, color, testId }) {
  return (
    <div style={{ background: 'rgba(10,14,20,0.78)', padding: '16px 18px', minHeight: 112 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ color: V.sub, fontSize: 10, fontFamily: V.mono, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{label}</span>
        <Icon size={14} color={color} />
      </div>
      <p data-testid={testId} style={{ margin: 0, color, fontSize: 24, fontFamily: V.mono, fontWeight: 800, letterSpacing: '-0.04em' }}>{value}</p>
      <p style={{ margin: '4px 0 0', color: V.sub, fontSize: 12 }}>{sub}</p>
    </div>
  );
}

function WalletCommand({ walletData, walletSegments, pendingDisputes, navigate }) {
  const protectedAmount = walletSegments.hasWallet || walletSegments.held > 0 ? money(walletSegments.held, 2) : 'Not available';
  const ring = `conic-gradient(${V.success} 0 ${walletSegments.availablePct}%, ${V.warn} ${walletSegments.availablePct}% ${walletSegments.availablePct + walletSegments.heldPct}%, #A78BFA ${walletSegments.availablePct + walletSegments.heldPct}% ${walletSegments.availablePct + walletSegments.heldPct + walletSegments.pendingPct}%, ${V.error} ${walletSegments.availablePct + walletSegments.heldPct + walletSegments.pendingPct}% ${walletSegments.availablePct + walletSegments.heldPct + walletSegments.pendingPct + (walletSegments.disputeHold ? 8 : 0)}%, rgba(255,255,255,0.08) ${walletSegments.availablePct + walletSegments.heldPct + walletSegments.pendingPct + (walletSegments.disputeHold ? 8 : 0)}% 100%)`;
  return (
    <section className="tt-command-panel" style={{ padding: 20, overflow: 'hidden' }}>
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 18 }}>
          <div>
            <p style={{ margin: '0 0 5px', color: V.sub, fontFamily: V.mono, fontSize: 11, fontWeight: 800, letterSpacing: '0.12em' }}>ESCROW PROTECTION</p>
            <h2 style={{ margin: 0, color: V.text, fontSize: 24, fontWeight: 800, letterSpacing: '-0.03em' }}>Escrow Protection Summary</h2>
          </div>
          <button
            onClick={() => navigate('/settings/banking')}
            className="tt-action"
            style={{ display: 'flex', alignItems: 'center', gap: 7, border: `1px solid ${V.border}`, background: 'rgba(255,255,255,0.035)', color: V.sub, borderRadius: 6, padding: '9px 11px', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}
          >
            <CreditCard size={13} /> Banking
          </button>
        </div>

        <div style={{ display: 'grid', placeItems: 'center', minHeight: 240 }}>
          <div style={{ position: 'relative', width: 210, height: 210, borderRadius: '50%', background: ring, padding: 14, boxShadow: '0 0 75px rgba(0,209,255,0.14)' }}>
            <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: V.bg, display: 'grid', placeItems: 'center', border: `1px solid ${V.border}` }}>
              <div style={{ textAlign: 'center' }}>
                <WalletCards size={31} color={V.accent} style={{ margin: '0 auto 8px' }} />
                <p style={{ margin: 0, color: V.sub, fontSize: 10, fontFamily: V.mono, fontWeight: 800 }}>PROTECTED IN ESCROW</p>
                <p style={{ margin: '5px 0 0', color: V.warn, fontSize: 22, fontFamily: V.mono, fontWeight: 800 }}>{protectedAmount}</p>
                <p style={{ margin: '7px auto 0', maxWidth: 130, color: V.sub, fontSize: 10, lineHeight: 1.4 }}>Not available until release conditions are met</p>
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 10 }}>
          <WalletLine label="Available for payout" value={walletSegments.hasWallet ? money(walletSegments.available, 2) : 'Not available'} helper="Released funds ready for payout." color={walletSegments.hasWallet ? V.success : V.sub} />
          <WalletLine label="Protected in escrow" value={protectedAmount} helper="Locked until release conditions are met." color={V.warn} />
          <WalletLine label="Awaiting confirmation" value={money(walletSegments.pending, 2)} helper="Delivery confirmation still required." color="#A78BFA" />
          <WalletLine label="Dispute hold" value={pendingDisputes.length > 0 ? money(walletSegments.disputeHold, 2) : money(0, 2)} helper="Paused until a dispute is resolved." color={pendingDisputes.length > 0 ? V.error : V.success} />
        </div>
        <p style={{ margin: '14px 0 0', color: V.sub, fontSize: 12, lineHeight: 1.6 }}>
          Protected funds remain locked until delivery is confirmed or a dispute is resolved.
        </p>
      </div>
    </section>
  );
}

function WalletLine({ label, value, helper, color }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '3px 12px', alignItems: 'start', borderTop: `1px solid ${V.border}`, paddingTop: 10 }}>
      <span style={{ color: V.text, fontSize: 12, fontWeight: 800 }}>{label}</span>
      <span style={{ color, fontSize: 12, fontFamily: V.mono, fontWeight: 800 }}>{value}</span>
      <span style={{ gridColumn: '1 / -1', color: V.sub, fontSize: 11 }}>{helper}</span>
    </div>
  );
}

function ProfileReadiness({ user, navigate }) {
  return (
    <section className="tt-command-panel" style={{ position: 'relative', zIndex: 1, padding: 16, borderLeft: `2px solid ${V.warn}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <AlertCircle size={17} color={V.warn} />
          <div>
            <p style={{ margin: 0, color: V.text, fontWeight: 800 }}>Complete your command profile</p>
            <p style={{ margin: '3px 0 0', color: V.sub, fontSize: 12 }}>
              {!user.phone_verified && !user.banking_details_completed
                ? 'Add phone verification and banking details before money can move cleanly.'
                : !user.phone_verified
                ? 'Add phone verification to strengthen identity confidence.'
                : 'Add banking details to receive protected payouts.'}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {!user.phone_verified && <MiniButton label="Add phone" onClick={() => navigate('/verify/phone')} />}
          {!user.banking_details_completed && <MiniButton label="Add banking" onClick={() => navigate('/settings/banking')} />}
        </div>
      </div>
    </section>
  );
}

function MiniButton({ label, onClick }) {
  return (
    <button onClick={onClick} className="tt-action" style={{ border: `1px solid rgba(240,180,41,0.38)`, background: 'rgba(240,180,41,0.08)', color: V.warn, borderRadius: 5, padding: '8px 11px', cursor: 'pointer', fontSize: 11, fontFamily: V.mono, fontWeight: 800, textTransform: 'uppercase' }}>
      {label}
    </button>
  );
}

function ActionDock({ navigate }) {
  const actions = [
    { icon: Plus, label: 'New Transaction', path: '/transactions/new', testId: 'quick-action-new-transaction', color: V.accent },
    { icon: FileText, label: 'All Transactions', path: '/transactions', testId: 'quick-action-view-transactions', color: V.success },
    { icon: AlertCircle, label: 'Disputes', path: '/disputes', testId: 'quick-action-view-disputes', color: V.warn },
  ];
  return (
    <section style={{ position: 'relative', zIndex: 1, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }} className="tt-responsive-grid">
      {actions.map((action) => (
        <button
          key={action.label}
          data-testid={action.testId}
          onClick={() => navigate(action.path)}
          className="tt-action"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 74, border: `1px solid ${V.border}`, background: 'rgba(255,255,255,0.035)', color: V.text, borderRadius: 6, padding: '14px 16px', cursor: 'pointer', fontWeight: 800 }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <action.icon size={17} color={action.color} />
            {action.label}
          </span>
          <ArrowRight size={14} color={V.sub} />
        </button>
      ))}
    </section>
  );
}

function LiveTransactionFeed({ activeTransactions, pendingDisputes, user, navigate, reduceMotion }) {
  return (
    <section className="tt-command-panel" style={{ padding: 20, overflow: 'hidden' }}>
      <div style={{ position: 'relative', zIndex: 1 }}>
        <SectionTitle label="Live Transaction Rail" right={`${activeTransactions.length} active`} />
        {activeTransactions.length === 0 ? (
          <EmptyState navigate={navigate} />
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {activeTransactions.slice(0, 5).map((transaction, index) => (
              <TransactionRail
                key={transaction.transaction_id}
                transaction={transaction}
                pendingDisputes={pendingDisputes}
                index={index}
                user={user}
                navigate={navigate}
                reduceMotion={reduceMotion}
              />
            ))}
            {activeTransactions.length > 5 && (
              <button onClick={() => navigate('/transactions')} className="tt-action" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, border: `1px solid ${V.border}`, background: 'rgba(255,255,255,0.035)', color: V.sub, padding: 11, borderRadius: 5, cursor: 'pointer', fontFamily: V.mono, fontSize: 11, fontWeight: 800 }}>
                VIEW ALL {activeTransactions.length} TRANSACTIONS <ArrowRight size={12} />
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function TransactionRail({ transaction, pendingDisputes, index, user, navigate, reduceMotion }) {
  const isUserBuyer = transaction.buyer_user_id === user?.user_id;
  const otherParty = isUserBuyer ? transaction.seller_name : transaction.buyer_name;
  const meta = resolveEscrowUiState(transaction, pendingDisputes);
  const progress = (meta.progressIndex / flowSteps.length) * 100;

  return (
    <div
      onClick={() => navigate(`/transactions/${transaction.transaction_id}`)}
      data-testid={`transaction-row-${transaction.transaction_id}`}
      className="tt-live-row"
      style={{ border: `1px solid ${V.border}`, background: 'rgba(255,255,255,0.025)', borderRadius: 6, padding: 14, cursor: 'pointer' }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 14, alignItems: 'start' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <span style={{ width: 28, height: 28, borderRadius: 6, display: 'grid', placeItems: 'center', border: `1px solid ${isUserBuyer ? 'rgba(0,209,255,0.4)' : 'rgba(240,180,41,0.4)'}`, background: isUserBuyer ? 'rgba(0,209,255,0.08)' : 'rgba(240,180,41,0.08)', color: isUserBuyer ? V.accent : V.warn, fontFamily: V.mono, fontSize: 11, fontWeight: 800 }}>
              {isUserBuyer ? 'B' : 'S'}
            </span>
            <div style={{ minWidth: 0 }}>
              <p style={{ margin: 0, color: V.text, fontSize: 14, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {transaction.item_description || 'Protected transaction'}
              </p>
              <p style={{ margin: '3px 0 0', color: V.sub, fontSize: 11, fontFamily: V.mono }}>
                {isUserBuyer ? 'BUYER' : 'SELLER'} / {otherParty || 'Counterparty'} / {transaction.share_code}
              </p>
            </div>
          </div>
          <div style={{ position: 'relative', height: 42, marginTop: 12 }}>
            <div style={{ position: 'absolute', left: 0, right: 0, top: 12, height: 2, background: 'rgba(255,255,255,0.08)' }} />
            <motion.div
              initial={false}
              animate={{ width: `${progress}%` }}
              transition={reduceMotion ? { duration: 0 } : { duration: 0.55, delay: index * 0.05 }}
              style={{ position: 'absolute', left: 0, top: 12, height: 2, background: `linear-gradient(90deg, ${V.accent}, ${meta.color})`, boxShadow: `0 0 20px ${meta.color}` }}
            />
            <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: `repeat(${flowSteps.length}, 1fr)` }}>
              {flowSteps.map((step, stepIndex) => {
                const Icon = step.icon;
                const active = stepIndex < meta.progressIndex;
                return (
                  <div key={step.label} style={{ display: 'flex', justifyContent: stepIndex === 0 ? 'flex-start' : stepIndex === flowSteps.length - 1 ? 'flex-end' : 'center' }}>
                    <div title={step.label} style={{ width: 25, height: 25, display: 'grid', placeItems: 'center', borderRadius: '50%', border: `1px solid ${active ? meta.color : V.border}`, background: active ? meta.bg : V.bg }}>
                      <Icon size={12} color={active ? meta.color : V.dim} />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="tt-hide-sm" style={{ position: 'relative', display: 'grid', gridTemplateColumns: `repeat(${flowSteps.length}, 1fr)`, marginTop: 5 }}>
              {flowSteps.map((step, stepIndex) => (
                <span key={step.label} style={{ color: stepIndex < meta.progressIndex ? V.sub : V.dim, fontSize: 9, fontFamily: V.mono, textAlign: stepIndex === 0 ? 'left' : stepIndex === flowSteps.length - 1 ? 'right' : 'center' }}>
                  {step.label}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div style={{ textAlign: 'right', minWidth: 118 }}>
          <p style={{ margin: 0, color: V.text, fontFamily: V.mono, fontWeight: 800 }}>{money(getTransactionValue(transaction), 2)}</p>
          <span style={{ display: 'inline-flex', marginTop: 8, color: meta.color, background: meta.bg, border: `1px solid ${meta.color}55`, padding: '5px 8px', borderRadius: 999, fontSize: 10, fontFamily: V.mono, fontWeight: 800, textTransform: 'uppercase' }}>
            {meta.label}
          </span>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ navigate }) {
  return (
    <div style={{ minHeight: 238, display: 'grid', placeItems: 'center', textAlign: 'center', border: `1px solid ${V.border}`, background: 'rgba(255,255,255,0.025)', borderRadius: 6, padding: 24 }}>
      <div>
        <ShieldCheck size={36} color={V.dim} style={{ margin: '0 auto 12px' }} />
        <p style={{ margin: '0 0 14px', color: V.sub }}>No live escrow rails yet.</p>
        <button data-testid="empty-state-create-transaction" onClick={() => navigate('/transactions/new')} className="tt-action" style={{ border: `1px solid ${V.accent}`, background: 'rgba(0,209,255,0.1)', color: V.accent, padding: '10px 14px', borderRadius: 5, cursor: 'pointer', fontWeight: 800 }}>
          Create First Transaction
        </button>
      </div>
    </div>
  );
}

function TrustOperations({ activeTransactions, pendingConfirmations, pendingDisputes, platformStats, totalEscrowValue }) {
  const rows = [
    { label: 'Escrow lock active', value: activeTransactions.length, icon: Lock, color: V.success },
    { label: 'Pending confirmation', value: platformStats?.pending_confirmations ?? pendingConfirmations.length, icon: Clock, color: V.warn },
    { label: 'Dispute protection', value: pendingDisputes.length, icon: AlertCircle, color: pendingDisputes.length > 0 ? V.error : V.success },
    { label: 'Secured value', value: money(totalEscrowValue), icon: TrendingUp, color: V.accent },
  ];
  return (
    <section className="tt-command-panel" style={{ padding: 20 }}>
      <div style={{ position: 'relative', zIndex: 1 }}>
        <SectionTitle label="Protection Matrix" right="monitored" />
        <div style={{ display: 'grid', gap: 12 }}>
          {rows.map((row) => (
            <div key={row.label} style={{ display: 'grid', gridTemplateColumns: '38px 1fr auto', gap: 12, alignItems: 'center', borderBottom: `1px solid ${V.border}`, paddingBottom: 12 }}>
              <div style={{ width: 38, height: 38, display: 'grid', placeItems: 'center', borderRadius: 6, border: `1px solid ${row.color}55`, background: `${row.color}18` }}>
                <row.icon size={17} color={row.color} />
              </div>
              <div>
                <p style={{ margin: 0, color: V.text, fontWeight: 800 }}>{row.label}</p>
                <p style={{ margin: '3px 0 0', color: V.sub, fontSize: 12 }}>Live transaction intelligence</p>
              </div>
              <span style={{ color: row.color, fontFamily: V.mono, fontWeight: 800 }}>{row.value}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 18, border: `1px solid ${V.border}`, background: 'rgba(255,255,255,0.025)', padding: 14 }}>
          <p style={{ margin: 0, color: V.text, fontWeight: 800 }}>Bank payout windows</p>
          <p style={{ margin: '6px 0 0', color: V.sub, fontSize: 12 }}>Released funds route through controlled windows at 10:00 and 15:00.</p>
        </div>
      </div>
    </section>
  );
}

function RecentLedger({ recentTransactions, pendingDisputes, navigate }) {
  return (
    <section className="tt-command-panel" style={{ padding: 20, overflow: 'hidden' }}>
      <div style={{ position: 'relative', zIndex: 1 }}>
        <SectionTitle
          label="Recent Escrow Ledger"
          right={(
            <button data-testid="view-all-transactions-link" onClick={() => navigate('/transactions')} className="tt-action" style={{ display: 'flex', alignItems: 'center', gap: 5, border: 0, background: 'transparent', color: V.accent, cursor: 'pointer', fontFamily: V.mono, fontSize: 11, fontWeight: 800 }}>
              VIEW ALL <ArrowRight size={11} />
            </button>
          )}
        />
        {recentTransactions.length === 0 ? (
          <EmptyState navigate={navigate} />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${V.border}` }}>
                  {['REF', 'PARTIES', 'FLOW STATE', 'AMOUNT', 'OPEN'].map((head, index) => (
                    <th key={head} style={{ padding: '11px 10px', color: V.sub, fontSize: 10, fontFamily: V.mono, fontWeight: 800, letterSpacing: '0.12em', textAlign: index === 3 ? 'right' : 'left' }}>{head}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentTransactions.map((transaction) => {
                  const meta = resolveEscrowUiState(transaction, pendingDisputes);
                  return (
                    <tr key={transaction.transaction_id} data-testid={`transaction-row-${transaction.transaction_id}`} onClick={() => navigate(`/transactions/${transaction.transaction_id}`)} className="vault-tr" style={{ borderBottom: `1px solid ${V.border}`, cursor: 'pointer' }}>
                      <td style={{ padding: '13px 10px', color: V.accent, fontFamily: V.mono, fontWeight: 800, fontSize: 12 }}>{transaction.share_code || '-'}</td>
                      <td style={{ padding: '13px 10px', color: V.text, fontSize: 13 }}>{transaction.buyer_name || 'Buyer'} -> {transaction.seller_name || 'Seller'}</td>
                      <td style={{ padding: '13px 10px' }}>
                        <span style={{ color: meta.color, background: meta.bg, border: `1px solid ${meta.color}55`, borderRadius: 999, padding: '5px 8px', fontFamily: V.mono, fontSize: 10, fontWeight: 800, textTransform: 'uppercase' }}>{meta.label}</span>
                      </td>
                      <td style={{ padding: '13px 10px', color: V.success, fontFamily: V.mono, fontWeight: 800, textAlign: 'right' }}>{money(getTransactionValue(transaction), 2)}</td>
                      <td style={{ padding: '13px 10px' }}><ArrowUpRight size={13} color={V.dim} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

function AdminCommand({ platformStats, pendingDisputes, adminData, navigate }) {
  return (
    <section className="tt-command-panel" style={{ padding: 20 }}>
      <div style={{ position: 'relative', zIndex: 1 }}>
        <SectionTitle label="Admin Command Layer" right="confidential" />
        <div className="tt-responsive-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, border: `1px solid ${V.border}`, background: V.border }}>
          <MetricCell icon={ShieldCheck} label="Total escrow" value={money(platformStats?.total_escrow_value || 0)} sub="platform secured" color={V.success} />
          <MetricCell icon={Activity} label="Total users" value={platformStats?.total_users || 0} sub="identity graph" color={V.accent} />
          <MetricCell icon={AlertCircle} label="Open disputes" value={pendingDisputes.length} sub="protection cases" color={pendingDisputes.length > 0 ? V.error : V.success} />
        </div>
        {adminData?.escrowDetails && (
          <p style={{ margin: '12px 0 0', color: V.sub, fontSize: 12 }}>Escrow detail feed connected.</p>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
          <button onClick={() => navigate('/admin')} className="tt-action" style={{ border: `1px solid ${V.border}`, background: 'transparent', color: V.sub, padding: '9px 13px', borderRadius: 5, cursor: 'pointer', fontWeight: 700 }}>Full Admin Dashboard</button>
          <button onClick={() => navigate('/activity')} className="tt-action" style={{ border: `1px solid ${V.border}`, background: 'transparent', color: V.sub, padding: '9px 13px', borderRadius: 5, cursor: 'pointer', fontWeight: 700 }}>Live Activity</button>
        </div>
      </div>
    </section>
  );
}

function SectionTitle({ label, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 15 }}>
      <span style={{ color: V.sub, fontSize: 10, fontFamily: V.mono, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${V.border}, transparent)` }} />
      {typeof right === 'string' ? (
        <span style={{ color: V.success, fontSize: 10, fontFamily: V.mono, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{right}</span>
      ) : right}
    </div>
  );
}

export default Dashboard;
