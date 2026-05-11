import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import DashboardLayout, { V } from '../components/DashboardLayout';
import TransactionActivityFeed from '../components/TransactionActivityFeed';
import { fieldText, getFlowCopy, getTransactionFlowType, resolveEscrowUiState } from '../components/transactionState';
import { buildUserActivityFeed } from '../utils/transactionActivity';
import { getPayoutScheduleMessage } from '../utils/payoutSchedule';
import { usePlatformConfig } from '../context/PlatformConfigContext';
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
  Landmark,
  Lock,
  PackageCheck,
  Plus,
  RadioTower,
  ShieldCheck,
  TrendingUp,
  WalletCards,
} from 'lucide-react';

const DASHBOARD_VALUES_KEY = 'trusttrade_dashboard_show_exact_values';

const money = (value, decimals = 0) =>
  `R ${Number(value || 0).toLocaleString('en-ZA', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;

const hiddenMoney = '••••••';

const displayMoney = (value, showExactValues, decimals = 0) =>
  showExactValues ? money(value, decimals) : hiddenMoney;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const getTransactionValue = (transaction) =>
  transaction?.item_price ?? transaction?.total ?? transaction?.amount ?? 0;

const isUserBuyerForTransaction = (transaction, user) =>
  transaction?.buyer_user_id === user?.user_id ||
  (transaction?.buyer_email && user?.email && transaction.buyer_email.toLowerCase() === user.email.toLowerCase());

const emailMatches = (value, user) =>
  Boolean(value && user?.email && String(value).trim().toLowerCase() === String(user.email).trim().toLowerCase());

const normalizePhone = (value) => String(value || '').replace(/\D/g, '');

const phoneMatches = (transactionValue, user) => {
  const transactionPhone = normalizePhone(transactionValue);
  const userPhone = normalizePhone(user?.phone);
  return Boolean(transactionPhone && userPhone && transactionPhone === userPhone);
};

const isUserSellerForTransaction = (transaction, user) =>
  transaction?.seller_user_id === user?.user_id ||
  (transaction?.seller_email && user?.email && transaction.seller_email.toLowerCase() === user.email.toLowerCase()) ||
  (transaction?.freelancer_email && user?.email && transaction.freelancer_email.toLowerCase() === user.email.toLowerCase());

const isUserParticipantForTransaction = (transaction, user) =>
  Boolean(transaction && user && (
    isUserBuyerForTransaction(transaction, user) ||
    isUserSellerForTransaction(transaction, user) ||
    (transaction?.recipient_info && user?.email && transaction.recipient_info.toLowerCase() === user.email.toLowerCase()) ||
    phoneMatches(transaction?.buyer_phone, user) ||
    phoneMatches(transaction?.seller_phone, user) ||
    phoneMatches(transaction?.recipient_info, user)
  ));

const isExplicitDisputeCardParticipant = (transaction, user) =>
  Boolean(transaction && user && (
    transaction?.buyer_user_id === user?.user_id ||
    transaction?.seller_user_id === user?.user_id ||
    emailMatches(transaction?.buyer_email, user) ||
    emailMatches(transaction?.seller_email, user) ||
    emailMatches(transaction?.invited_email, user) ||
    emailMatches(transaction?.recipient_email, user) ||
    emailMatches(transaction?.recipient_info, user)
  ));

const normalizeStatus = (...values) => fieldText(...values).replace(/[_-]/g, ' ');

const isDisputeResolved = (dispute) => {
  const status = normalizeStatus(dispute?.status, dispute?.resolution, dispute?.admin_decision);
  return ['resolved', 'closed', 'dismissed', 'cancelled', 'canceled'].some((value) => status.includes(value));
};

const isDisputeOpen = (dispute) => {
  const status = normalizeStatus(dispute?.status);
  if (isDisputeResolved(dispute)) return false;
  return !status || ['pending', 'open', 'active', 'response required', 'awaiting response', 'escalated'].some((value) => status.includes(value));
};

const isDisputeAwaitingReview = (dispute) => {
  const status = normalizeStatus(dispute?.status, dispute?.review_status);
  return ['review', 'under review', 'admin review', 'trusttrade review'].some((value) => status.includes(value));
};

const userSubmittedDisputeResponse = (dispute, role) => {
  if (role === 'Buyer') {
    return Boolean(dispute?.buyer_statement || dispute?.buyer_statement_at || dispute?.buyer_response_at || dispute?.buyer_responded_at);
  }
  if (role === 'Seller') {
    return Boolean(dispute?.seller_statement || dispute?.seller_statement_at || dispute?.seller_response_at || dispute?.seller_responded_at);
  }
  return false;
};

const payoutCompleted = (transaction) => {
  const status = normalizeStatus(transaction?.payout_status, transaction?.settlement_status, transaction?.withdrawal_status);
  return Boolean(
    transaction?.settlement_confirmed_at ||
    transaction?.withdrawal_completed_at ||
    transaction?.bank_reference ||
    transaction?.settlement_reference ||
    status.includes('payout completed') ||
    status.includes('settlement confirmed') ||
    status.includes('completed')
  );
};

const getDisputeActorRole = (dispute, transaction) => {
  if (!dispute || !transaction) return null;
  if (dispute.raised_by_user_id && dispute.raised_by_user_id === transaction.buyer_user_id) return 'Buyer';
  if (dispute.raised_by_user_id && dispute.raised_by_user_id === transaction.seller_user_id) return 'Seller';
  if (emailMatches(transaction.buyer_email, { email: dispute.raised_by_email })) return 'Buyer';
  if (emailMatches(transaction.seller_email, { email: dispute.raised_by_email })) return 'Seller';
  return null;
};

const getDisputeActionState = (dispute, transaction, user) => {
  const role = isUserBuyerForTransaction(transaction, user) ? 'Buyer' : isUserSellerForTransaction(transaction, user) ? 'Seller' : 'Viewer';
  if (!isExplicitDisputeCardParticipant(transaction, user)) return { kind: 'hidden', role };
  if (isDisputeResolved(dispute)) {
    return { kind: 'resolved', role, label: 'Dispute resolved', color: V.sub, priority: 90 };
  }
  if (payoutCompleted(transaction)) {
    return { kind: 'resolved', role, label: 'Dispute resolved', color: V.sub, priority: 90 };
  }
  if (!isDisputeOpen(dispute)) return { kind: 'hidden', role };

  const explicitRequired = normalizeStatus(dispute?.response_required_from, dispute?.awaiting_response_from, dispute?.needs_response_from);
  if (isDisputeAwaitingReview(dispute) && !explicitRequired) {
    return { kind: 'waiting', role, label: 'Waiting for TrustTrade review', color: V.warn, priority: 80 };
  }
  const raisedByRole = getDisputeActorRole(dispute, transaction);
  const requiredRole = explicitRequired.includes('buyer') ? 'Buyer' : explicitRequired.includes('seller') ? 'Seller' : raisedByRole === 'Buyer' ? 'Seller' : raisedByRole === 'Seller' ? 'Buyer' : null;

  if (requiredRole === role && !userSubmittedDisputeResponse(dispute, role)) {
    return {
      kind: 'action',
      role,
      label: `${role} response required`,
      color: V.error,
      priority: 10,
    };
  }

  if (isDisputeAwaitingReview(dispute) || userSubmittedDisputeResponse(dispute, role) || requiredRole) {
    return { kind: 'waiting', role, label: 'Waiting for TrustTrade review', color: V.warn, priority: 80 };
  }

  return { kind: 'waiting', role, label: 'Waiting for TrustTrade review', color: V.warn, priority: 80 };
};

const filterUserRelevantDisputes = (disputes, transactions, user) => {
  const transactionById = new Map(transactions.map((transaction) => [transaction.transaction_id, transaction]));
  return disputes.filter((dispute) => {
    const transaction = transactionById.get(dispute.transaction_id);
    return isUserParticipantForTransaction(transaction, user);
  });
};

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
  const [showExactValues, setShowExactValues] = useState(() => {
    const stored = window.sessionStorage.getItem(DASHBOARD_VALUES_KEY);
    if (stored === null) return true;
    return stored !== 'false';
  });
  const [now, setNow] = useState(() => new Date());
  const { config: platformConfig } = usePlatformConfig();
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const updateNow = () => setNow(new Date());
    updateNow();

    const timer = window.setInterval(updateNow, 1000);
    window.addEventListener('focus', updateNow);
    document.addEventListener('visibilitychange', updateNow);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', updateNow);
      document.removeEventListener('visibilitychange', updateNow);
    };
  }, []);

  useEffect(() => {
    window.sessionStorage.setItem(DASHBOARD_VALUES_KEY, String(showExactValues));
  }, [showExactValues]);

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

  const payoutSchedule = useMemo(() => getPayoutScheduleMessage(now, platformConfig), [now, platformConfig]);

  const userRelevantDisputes = useMemo(
    () => filterUserRelevantDisputes(disputes, transactions, user),
    [disputes, transactions, user]
  );
  const userRelevantTransactions = useMemo(
    () => transactions.filter((transaction) => isUserParticipantForTransaction(transaction, user)),
    [transactions, user]
  );
  const pendingDisputes = userRelevantDisputes.filter(isDisputeOpen);
  const activeTransactions = userRelevantTransactions.filter(t => !resolveEscrowUiState(t, pendingDisputes, now, payoutSchedule).terminal);
  const actionItems = useMemo(() => buildActionItems(userRelevantTransactions, userRelevantDisputes, user, payoutSchedule), [userRelevantTransactions, userRelevantDisputes, user, payoutSchedule]);
  const latestActivity = useMemo(
    () => buildUserActivityFeed(userRelevantTransactions, { user, disputes: userRelevantDisputes, limit: 7, activeFirst: true }),
    [userRelevantTransactions, userRelevantDisputes, user]
  );
  const pendingConfirmations = userRelevantTransactions.filter(t => {
    const state = resolveEscrowUiState(t, pendingDisputes);
    return ['CREATED', 'DELIVERY_PENDING'].includes(state.state);
  });
  const recentTransactions = userRelevantTransactions.slice(0, 6);
  const totalEscrowValue = userRelevantTransactions
    .filter(t => ['ESCROW_LOCKED', 'DELIVERY_PENDING', 'DELIVERED', 'DISPUTED'].includes(resolveEscrowUiState(t, pendingDisputes, now, payoutSchedule).state))
    .reduce((sum, t) => sum + (t.total || getTransactionValue(t)), 0);
  const pendingConfirmationValue = userRelevantTransactions
    .filter(t => resolveEscrowUiState(t, pendingDisputes, now, payoutSchedule).state === 'DELIVERY_PENDING')
    .reduce((sum, t) => sum + (t.total || getTransactionValue(t)), 0);

  const disputeHoldValue = userRelevantTransactions
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
            radial-gradient(circle at 24% 0%, rgba(0,209,255,0.08), transparent 36%),
            radial-gradient(circle at 78% 18%, rgba(0,255,163,0.06), transparent 32%),
            linear-gradient(180deg, rgba(10,14,20,0), rgba(10,14,20,0.9));
        }
        .tt-command-panel {
          position: relative;
          border: 1px solid rgba(255,255,255,0.1);
          background: linear-gradient(145deg, rgba(28,33,40,0.88), rgba(8,12,20,0.96));
          box-shadow: 0 18px 60px rgba(0,0,0,0.24), inset 0 1px 0 rgba(255,255,255,0.03);
          backdrop-filter: blur(22px);
        }
        .tt-command-panel::after {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          background: linear-gradient(120deg, transparent 0%, rgba(255,255,255,0.025) 42%, transparent 68%);
          opacity: 0.45;
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
          border-color: rgba(0,209,255,0.26) !important;
          background: rgba(0,209,255,0.03) !important;
        }
        .tt-activity-row:hover {
          transform: translateY(-1px);
          border-color: rgba(0,209,255,0.24) !important;
          background: rgba(0,209,255,0.03) !important;
        }
        .tt-action:hover {
          transform: translateY(-2px);
          border-color: rgba(0,209,255,0.34) !important;
          color: ${V.text} !important;
          box-shadow: 0 10px 24px rgba(0,209,255,0.06);
        }
        @media (prefers-reduced-motion: reduce) {
          .tt-live-row, .tt-action, .tt-activity-row { transition: none !important; }
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
          now={now}
          payoutSchedule={payoutSchedule}
        />

        {!loading && user && (!user.phone_verified || ((user.role === 'seller') && !user.banking_details_completed)) && (
          <ProfileReadiness user={user} navigate={navigate} />
        )}

        <ActionRequiredPanel actionItems={actionItems} navigate={navigate} showExactValues={showExactValues} />

        <LatestActivityCard events={latestActivity} navigate={navigate} />

        <LiveTransactionFeed
          activeTransactions={activeTransactions}
          pendingDisputes={pendingDisputes}
          user={user}
          navigate={navigate}
          reduceMotion={reduceMotion}
          showExactValues={showExactValues}
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
            showExactValues={showExactValues}
          />
          <WalletCommand
            walletData={walletData}
            walletSegments={walletSegments}
            pendingDisputes={pendingDisputes}
            navigate={navigate}
            showExactValues={showExactValues}
            payoutSchedule={payoutSchedule}
          />
        </div>

        <ActionDock navigate={navigate} />

          <TrustOperations
            activeTransactions={activeTransactions}
            pendingConfirmations={pendingConfirmations}
            pendingDisputes={pendingDisputes}
            platformStats={platformStats}
            totalEscrowValue={totalEscrowValue}
            showExactValues={showExactValues}
            payoutSchedule={payoutSchedule}
          />

        <RecentLedger recentTransactions={recentTransactions} pendingDisputes={pendingDisputes} navigate={navigate} showExactValues={showExactValues} />

        {user?.is_admin && (
          <AdminCommand
            platformStats={platformStats}
            pendingDisputes={pendingDisputes}
            adminData={adminData}
            navigate={navigate}
            showExactValues={showExactValues}
          />
        )}
      </div>
    </DashboardLayout>
  );
}

function CommandHeader({ greeting, user, showExactValues, setShowExactValues, now, payoutSchedule }) {
  const dateLabel = now.toLocaleDateString('en-ZA', {
    weekday: 'long',
    day: '2-digit',
    month: 'short',
  });
  const timeLabel = now.toLocaleTimeString('en-ZA', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const phoneVerified = Boolean(user?.phone_verified);
  const bankingReady = Boolean(user?.banking_details_completed);
  const showBanking = user?.role === 'seller' || bankingReady;
  const setupIncomplete = !phoneVerified || (user?.role === 'seller' && !bankingReady);

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
            Secure escrow dashboard &middot; {dateLabel} &middot; {timeLabel} &middot; Escrow system online
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
              background: 'rgba(255,255,255,0.025)',
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
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <AccountStatusPill
          icon={phoneVerified ? CheckCircle : AlertCircle}
          label={phoneVerified ? 'Phone verified' : 'Phone verification needed'}
          tone={phoneVerified ? 'success' : 'muted'}
          color={phoneVerified ? V.success : V.sub}
        />
        {showBanking && (
          <AccountStatusPill
            icon={bankingReady ? Landmark : AlertCircle}
            label={bankingReady ? 'Banking details added' : 'Banking details needed'}
            tone={bankingReady ? 'success' : 'warn'}
            color={bankingReady ? V.success : V.warn}
          />
        )}
        <AccountStatusPill
          icon={ShieldCheck}
          label="Escrow system online"
          tone="muted"
          color={V.sub}
        />
        <AccountStatusPill
          icon={RadioTower}
          label={payoutSchedule.shortCopy || 'Next payout release'}
          tone="warn"
          color={V.warn}
        />
        {setupIncomplete && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid rgba(240,180,41,0.24)', background: 'rgba(240,180,41,0.08)', color: V.warn, padding: '7px 11px', borderRadius: 999, fontSize: 11, fontWeight: 800 }}>
            <AlertCircle size={13} />
            Account setup incomplete
          </span>
        )}
      </div>
    </div>
  );
}

function AccountStatusPill({ icon: Icon, label, tone, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: `1px solid ${tone === 'success' ? 'rgba(0,255,163,0.18)' : tone === 'warn' ? 'rgba(240,180,41,0.2)' : V.border}`, background: tone === 'success' ? 'rgba(0,255,163,0.06)' : tone === 'warn' ? 'rgba(240,180,41,0.06)' : 'rgba(255,255,255,0.025)', padding: '8px 11px', borderRadius: 999 }}>
      <Icon size={13} color={color} />
      <span style={{ color: V.sub, fontSize: 12, fontWeight: 700 }}>{label}</span>
    </div>
  );
}

function EscrowEngine({ activeTransactions, pendingConfirmations, pendingDisputes, platformStats, totalEscrowValue, reduceMotion, navigate, showExactValues }) {
  const activeCount = platformStats?.active_transactions ?? activeTransactions.length;
  const pendingCount = platformStats?.pending_confirmations ?? pendingConfirmations.length;
  const verifiedUsers = platformStats?.verified_users ?? 0;

  return (
    <section className="tt-command-panel" style={{ minHeight: 500, padding: 22, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 50% 42%, rgba(0,209,255,0.12), transparent 32%), radial-gradient(circle at 72% 58%, rgba(0,255,163,0.08), transparent 30%)' }} />
      <div style={{ position: 'relative', zIndex: 1, display: 'grid', minHeight: 456, gridTemplateRows: 'auto 1fr auto', gap: 18 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
          <div>
            <p style={{ margin: '0 0 8px', color: V.sub, fontFamily: V.mono, fontSize: 11, fontWeight: 800, letterSpacing: '0.12em' }}>
              LIVE ESCROW ENGINE
            </p>
            <h2 style={{ margin: 0, maxWidth: 610, color: V.text, fontSize: 'clamp(30px, 4vw, 54px)', lineHeight: 0.96, fontWeight: 800, letterSpacing: '-0.045em' }}>
              Protected money flow, visible from agreement to settlement.
            </h2>
          </div>
          <button
            onClick={() => navigate('/transactions/new')}
            className="tt-action"
            style={{ display: 'flex', alignItems: 'center', gap: 9, border: '1px solid rgba(0,209,255,0.24)', background: 'linear-gradient(135deg, rgba(0,209,255,0.1), rgba(0,255,163,0.06))', color: V.text, borderRadius: 6, padding: '12px 16px', cursor: 'pointer', fontWeight: 800 }}
          >
            <Plus size={16} color={V.accent} />
            New Transaction
          </button>
        </div>

        <div style={{ position: 'relative', minHeight: 255, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <FlowEndpoint label="Buyer" value="funds captured" icon={CreditCard} side="left" />
          <FlowEndpoint label="Seller" value="settlement controlled" icon={PackageCheck} side="right" />
          <motion.div
            animate={reduceMotion ? {} : { x: ['-230px', '0px', '230px'], opacity: [0, 1, 1, 0] }}
            transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut' }}
            style={{ position: 'absolute', zIndex: 2, width: 11, height: 11, borderRadius: '50%', background: '#E6FBFF', boxShadow: '0 0 18px rgba(0,209,255,0.55)' }}
          />
          <div className="tt-hide-sm" style={{ position: 'absolute', left: '14%', right: '14%', top: '50%', height: 1, background: 'linear-gradient(90deg, rgba(0,209,255,0.14), rgba(0,255,163,0.5), rgba(240,180,41,0.16))' }} />
          <EscrowCore reduceMotion={reduceMotion} value={totalEscrowValue} showExactValues={showExactValues} />
        </div>

        <div className="tt-responsive-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 1, border: `1px solid ${V.border}`, background: V.border }}>
          <MetricCell icon={Activity} label="Active" value={activeCount} sub="transactions" color={V.accent} testId="active-transactions" />
          <MetricCell icon={AlertCircle} label="Pending" value={pendingCount} sub="need action" color={V.warn} testId="pending-confirmations" />
          <MetricCell icon={ShieldCheck} label="Verified" value={verifiedUsers} sub="users" color={V.success} testId="verified-users" />
          <MetricCell icon={Lock} label="In escrow" value={displayMoney(totalEscrowValue, showExactValues)} sub="secured" color={V.success} testId="total-escrow" />
        </div>
      </div>
    </section>
  );
}

function FlowEndpoint({ label, value, icon: Icon, side }) {
  return (
    <div className="tt-hide-sm" style={{ position: 'absolute', [side]: 8, zIndex: 3, width: 170, border: `1px solid ${V.border}`, background: 'rgba(10,14,20,0.78)', padding: 14, backdropFilter: 'blur(16px)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 38, height: 38, display: 'grid', placeItems: 'center', border: '1px solid rgba(0,209,255,0.22)', background: 'rgba(0,209,255,0.06)', borderRadius: 6 }}>
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

function EscrowCore({ reduceMotion, value, showExactValues }) {
  return (
    <div style={{ position: 'relative', width: 230, height: 230, display: 'grid', placeItems: 'center' }}>
      <motion.div
        animate={reduceMotion ? {} : { rotate: 360 }}
        transition={{ duration: 24, repeat: Infinity, ease: 'linear' }}
        style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'conic-gradient(from 80deg, transparent, rgba(0,209,255,0.46), rgba(0,255,163,0.36), rgba(240,180,41,0.16), transparent)', filter: 'drop-shadow(0 0 24px rgba(0,209,255,0.18))' }}
      />
      <motion.div
        animate={reduceMotion ? {} : { scale: [1, 1.08, 1], opacity: [0.55, 0.95, 0.55] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
        style={{ position: 'absolute', inset: 34, borderRadius: '50%', background: 'rgba(0,209,255,0.12)', filter: 'blur(18px)' }}
      />
      <div style={{ position: 'relative', width: 164, height: 164, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.14)', background: 'linear-gradient(145deg, rgba(12,18,30,0.96), rgba(5,9,16,0.98))', display: 'grid', placeItems: 'center', boxShadow: 'inset 0 0 28px rgba(0,209,255,0.12), 0 0 40px rgba(0,209,255,0.1)' }}>
        <div style={{ textAlign: 'center' }}>
          <ShieldCheck size={42} color={V.success} style={{ margin: '0 auto 10px', filter: 'drop-shadow(0 0 10px rgba(0,255,163,0.35))' }} />
          <p style={{ margin: 0, color: V.sub, fontSize: 10, fontFamily: V.mono, fontWeight: 800, letterSpacing: '0.12em' }}>LOCKED CORE</p>
          <p style={{ margin: '6px 0 0', color: V.text, fontFamily: V.mono, fontWeight: 800 }}>{displayMoney(value, showExactValues)}</p>
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

function WalletCommand({ walletData, walletSegments, pendingDisputes, navigate, showExactValues, payoutSchedule = {} }) {
  const protectedAmount = walletSegments.hasWallet || walletSegments.held > 0 ? displayMoney(walletSegments.held, showExactValues, 2) : 'Not available';
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
            style={{ display: 'flex', alignItems: 'center', gap: 7, border: `1px solid ${V.border}`, background: 'rgba(255,255,255,0.025)', color: V.sub, borderRadius: 6, padding: '9px 11px', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}
          >
            <CreditCard size={13} /> Banking
          </button>
        </div>

        <div style={{ display: 'grid', placeItems: 'center', minHeight: 240 }}>
          <div style={{ position: 'relative', width: 210, height: 210, borderRadius: '50%', background: ring, padding: 14, boxShadow: '0 0 42px rgba(0,209,255,0.08)' }}>
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
          <WalletLine label="Available for payout" value={walletSegments.hasWallet ? displayMoney(walletSegments.available, showExactValues, 2) : 'Not available'} helper={payoutSchedule.shortCopy || 'Next payout release'} color={walletSegments.hasWallet ? V.success : V.sub} />
          <WalletLine label="Protected in escrow" value={protectedAmount} helper="Locked until release conditions are met." color={V.warn} />
          <WalletLine label="Awaiting confirmation" value={displayMoney(walletSegments.pending, showExactValues, 2)} helper="Delivery confirmation still required." color="#A78BFA" />
          <WalletLine label="Dispute hold" value={displayMoney(pendingDisputes.length > 0 ? walletSegments.disputeHold : 0, showExactValues, 2)} helper="Paused until a dispute is resolved." color={pendingDisputes.length > 0 ? V.error : V.success} />
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
  const needsSellerBanking = user.role === 'seller' && !user.banking_details_completed;
  const phonePrompt = 'Verify your phone number to continue.';
  const bankingPrompt = 'Add banking details to receive payouts.';
  return (
    <section className="tt-command-panel" style={{ position: 'relative', zIndex: 1, padding: 16, borderLeft: `2px solid ${V.warn}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <AlertCircle size={17} color={V.warn} />
          <div>
            <p style={{ margin: 0, color: V.text, fontWeight: 800 }}>Complete your command profile</p>
            <p style={{ margin: '3px 0 0', color: V.sub, fontSize: 12 }}>
              {!user.phone_verified && needsSellerBanking
                ? `${phonePrompt} ${bankingPrompt}`
                : !user.phone_verified
                ? phonePrompt
                : bankingPrompt}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {!user.phone_verified && <MiniButton label="Verify phone" onClick={() => navigate('/verify/phone')} />}
          {needsSellerBanking && <MiniButton label="Add banking details" onClick={() => navigate('/settings/banking')} />}
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
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 74, border: `1px solid ${V.border}`, background: 'rgba(255,255,255,0.025)', color: V.text, borderRadius: 6, padding: '14px 16px', cursor: 'pointer', fontWeight: 800 }}
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

function buildActionItems(transactions, pendingDisputes, user, payoutSchedule) {
  return transactions
    .map((transaction) => {
      const meta = resolveEscrowUiState(transaction, pendingDisputes);
      if (transaction.archived || ['EXPIRED', 'CANCELLED', 'REFUNDED', 'COMPLETED'].includes(meta.state)) {
        return null;
      }
      const flowType = getTransactionFlowType(transaction);
      const flow = getFlowCopy(transaction);
      const isBuyer = isUserBuyerForTransaction(transaction, user);
      const isSeller = isUserSellerForTransaction(transaction, user);
      const scopedDisputes = pendingDisputes.filter((d) => d.transaction_id === transaction.transaction_id);
      const disputeStates = scopedDisputes.map((dispute) => getDisputeActionState(dispute, transaction, user));
      const disputeState = disputeStates.find((state) => state.kind === 'action') ||
        disputeStates.find((state) => state.kind === 'waiting') ||
        disputeStates.find((state) => state.kind === 'resolved');
      const amount = getTransactionValue(transaction);
      const base = {
        transaction,
        amount,
        role: isBuyer ? 'Buyer' : isSeller ? 'Seller' : 'Viewer',
        status: meta.label,
        path: `/transactions/${transaction.transaction_id}`,
        priority: 99,
        button: 'View Transaction',
        title: 'Review transaction',
        helper: meta.description,
        color: V.accent,
        eyebrow: meta.state === 'FUNDED' ? 'Awaiting payment' : 'Current step',
      };

      if (!meta.actionable && disputeState?.kind !== 'action' && disputeState?.kind !== 'waiting') {
        return null;
      }

      if (isBuyer && meta.state === 'FUNDED') {
        return { ...base, priority: 3, title: 'Your next step: Fund escrow', button: 'Pay into Escrow', color: V.accent, helper: meta.secondaryLabel || 'Pay securely into escrow. Seller is paid only after you confirm delivery.' };
      }
      if (isSeller && meta.state === 'FUNDED') {
        return { ...base, priority: 4, title: 'Waiting for buyer to fund escrow', button: 'View Transaction', color: V.warn, helper: meta.secondaryLabel || 'Share this link with the buyer. Funds will be protected once the buyer pays.' };
      }
      if (isSeller && ['ESCROW_LOCKED', 'DELIVERY_PENDING'].includes(meta.state)) {
        return {
          ...base,
          priority: 5,
          title: flowType === 'delivery' ? 'Funds secured — deliver safely' : 'Funds secured in escrow',
          button: flowType === 'delivery' ? 'Add Delivery Info' : 'View Transaction',
          color: V.success,
          helper: flow.securedSeller,
        };
      }
      if (isBuyer && meta.state === 'DELIVERED') {
        return { ...base, priority: 6, title: flow.confirmationLabel, button: flow.confirmAction, color: V.success, helper: flow.confirmationDescription };
      }
      if (disputeState?.kind === 'action') {
        return { ...base, priority: disputeState.priority, title: disputeState.label, status: disputeState.label, button: 'Respond to Dispute', path: '/disputes-dashboard', color: V.error, helper: 'Your response is needed before TrustTrade can continue the review.' };
      }
      if (disputeState?.kind === 'waiting') {
        return { ...base, priority: disputeState.priority, title: disputeState.label, status: disputeState.label, button: 'View Dispute', path: '/disputes-dashboard', color: V.warn, eyebrow: 'Status Update', helper: 'No response is needed from you right now. TrustTrade is reviewing the case.' };
      }
      if (disputeState?.kind === 'resolved') {
        return { ...base, priority: disputeState.priority, title: disputeState.label, status: disputeState.label, button: 'View History', path: '/disputes-dashboard', color: V.sub, eyebrow: 'History', helper: 'This dispute is closed and kept for transaction history.' };
      }
      if (meta.state === 'RELEASED') {
        return { ...base, priority: 70, title: 'Payout processing', button: 'View Transaction', color: V.warn, eyebrow: 'Status Update', helper: payoutSchedule.shortCopy || 'Next payout release' };
      }
      return null;
    })
    .filter(Boolean)
    .sort((a, b) => a.priority - b.priority);
}

function ActionRequiredPanel({ actionItems, navigate, showExactValues }) {
  const action = actionItems[0];
  if (!action) return null;
  const { transaction } = action;
  const eyebrow = action.eyebrow || (action.status === 'Awaiting payment' ? 'Awaiting payment' : 'Current step');
  return (
    <section className="tt-command-panel" style={{ padding: 18, borderLeft: `2px solid ${action.color}` }}>
      <div style={{ position: 'relative', zIndex: 1, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 16, alignItems: 'center' }} className="tt-responsive-grid">
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: '0 0 7px', color: action.color, fontFamily: V.mono, fontSize: 10, fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
            {eyebrow} / {action.role}
          </p>
          <h2 style={{ margin: 0, color: V.text, fontSize: 'clamp(20px, 2.4vw, 30px)', fontWeight: 850, letterSpacing: '-0.035em' }}>
            {action.title}
          </h2>
          <p style={{ margin: '8px 0 0', color: V.sub, fontSize: 13, lineHeight: 1.55 }}>
            {transaction.item_description || 'Protected transaction'} · {transaction.share_code || transaction.deal_id || transaction.transaction_id} · {displayMoney(action.amount, showExactValues, 2)}
          </p>
          <p style={{ margin: '6px 0 0', color: V.sub, fontSize: 12 }}>{action.helper}</p>
        </div>
        <div style={{ display: 'grid', justifyItems: 'end', gap: 8 }}>
          <span style={{ color: action.color, background: `${action.color}18`, border: `1px solid ${action.color}55`, borderRadius: 999, padding: '5px 9px', fontSize: 10, fontFamily: V.mono, fontWeight: 900, textTransform: 'uppercase' }}>
            {action.status}
          </span>
          <button
            onClick={() => navigate(action.path, action.path === '/disputes-dashboard' ? { state: { transactionId: transaction.transaction_id } } : undefined)}
            className="tt-action"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, border: `1px solid ${action.color}80`, background: `${action.color}14`, color: V.text, borderRadius: 6, padding: '11px 14px', cursor: 'pointer', fontWeight: 850, whiteSpace: 'nowrap' }}
          >
            {action.button}
            <ArrowRight size={14} color={action.color} />
          </button>
        </div>
      </div>
    </section>
  );
}

function LatestActivityCard({ events, navigate }) {
  return (
    <section className="tt-command-panel" style={{ padding: 18, overflow: 'hidden' }}>
      <div style={{ position: 'relative', zIndex: 1 }}>
        <SectionTitle
          label="Latest Activity"
          right={events.length ? `${events.length} updates` : "You're all caught up"}
        />
        <TransactionActivityFeed
          events={events}
          compact
          showTransaction
          onOpenEvent={(event) => navigate(event.path)}
        />
      </div>
    </section>
  );
}

function LiveTransactionFeed({ activeTransactions, pendingDisputes, user, navigate, reduceMotion, showExactValues }) {
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
                showExactValues={showExactValues}
              />
            ))}
            {activeTransactions.length > 5 && (
              <button onClick={() => navigate('/transactions')} className="tt-action" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, border: `1px solid ${V.border}`, background: 'rgba(255,255,255,0.025)', color: V.sub, padding: 11, borderRadius: 5, cursor: 'pointer', fontFamily: V.mono, fontSize: 11, fontWeight: 800 }}>
                VIEW ALL {activeTransactions.length} TRANSACTIONS <ArrowRight size={12} />
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function TransactionRail({ transaction, pendingDisputes, index, user, navigate, reduceMotion, showExactValues }) {
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
            <span style={{ width: 28, height: 28, borderRadius: 6, display: 'grid', placeItems: 'center', border: `1px solid ${isUserBuyer ? 'rgba(0,209,255,0.24)' : 'rgba(240,180,41,0.24)'}`, background: isUserBuyer ? 'rgba(0,209,255,0.05)' : 'rgba(240,180,41,0.05)', color: isUserBuyer ? V.accent : V.warn, fontFamily: V.mono, fontSize: 11, fontWeight: 800 }}>
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
              style={{ position: 'absolute', left: 0, top: 12, height: 2, background: `linear-gradient(90deg, ${V.accent}, ${meta.color})`, boxShadow: `0 0 10px ${meta.color}55` }}
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
          <p style={{ margin: 0, color: V.text, fontFamily: V.mono, fontWeight: 800 }}>{displayMoney(getTransactionValue(transaction), showExactValues, 2)}</p>
          <span style={{ display: 'inline-flex', marginTop: 8, color: meta.color, background: meta.bg, border: `1px solid ${meta.color}55`, padding: '5px 8px', borderRadius: 999, fontSize: 10, fontFamily: V.mono, fontWeight: 800, textTransform: 'uppercase' }}>
            {meta.label}
          </span>
          {meta.secondaryLabel && (
            <p style={{ margin: '6px 0 0', color: V.sub, fontSize: 10, fontFamily: V.mono }}>{meta.secondaryLabel}</p>
          )}
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

function TrustOperations({ activeTransactions, pendingConfirmations, pendingDisputes, platformStats, totalEscrowValue, showExactValues, payoutSchedule }) {
  const rows = [
    { label: 'Escrow lock active', value: activeTransactions.length, icon: Lock, color: V.success },
    { label: 'Pending confirmation', value: platformStats?.pending_confirmations ?? pendingConfirmations.length, icon: Clock, color: V.warn },
    { label: 'Dispute protection', value: pendingDisputes.length, icon: AlertCircle, color: pendingDisputes.length > 0 ? V.error : V.success },
    { label: 'Secured value', value: displayMoney(totalEscrowValue, showExactValues), icon: TrendingUp, color: V.accent },
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
          <p style={{ margin: 0, color: V.text, fontWeight: 800 }}>Payout timing</p>
          <p style={{ margin: '6px 0 0', color: V.sub, fontSize: 12 }}>{payoutSchedule.copy || 'Bank clearing may take up to 2 business days.'}</p>
        </div>
      </div>
    </section>
  );
}

function RecentLedger({ recentTransactions, pendingDisputes, navigate, showExactValues }) {
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
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${V.border}` }}>
                  {['REF', 'PARTIES', 'FLOW STATE', 'SETTLEMENT', 'AMOUNT', 'OPEN'].map((head, index) => (
                    <th key={head} style={{ padding: '11px 10px', color: V.sub, fontSize: 10, fontFamily: V.mono, fontWeight: 800, letterSpacing: '0.12em', textAlign: index === 4 ? 'right' : 'left' }}>{head}</th>
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
                      <td style={{ padding: '13px 10px', color: meta.terminal ? V.success : V.sub, fontSize: 11, fontFamily: V.mono, fontWeight: 700 }}>{meta.secondaryLabel || (meta.state === 'DISPUTED' ? 'Payout paused' : 'Active escrow')}</td>
                      <td style={{ padding: '13px 10px', color: V.success, fontFamily: V.mono, fontWeight: 800, textAlign: 'right' }}>{displayMoney(getTransactionValue(transaction), showExactValues, 2)}</td>
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

function AdminCommand({ platformStats, pendingDisputes, adminData, navigate, showExactValues }) {
  return (
    <section className="tt-command-panel" style={{ padding: 20 }}>
      <div style={{ position: 'relative', zIndex: 1 }}>
        <SectionTitle label="Admin Command Layer" right="confidential" />
        <div className="tt-responsive-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, border: `1px solid ${V.border}`, background: V.border }}>
          <MetricCell icon={ShieldCheck} label="Total escrow" value={displayMoney(platformStats?.total_escrow_value || 0, showExactValues)} sub="platform secured" color={V.success} />
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
        <span style={{ color: V.sub, fontSize: 10, fontFamily: V.mono, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{right}</span>
      ) : right}
    </div>
  );
}

export default Dashboard;
