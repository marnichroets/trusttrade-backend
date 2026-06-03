import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import PaymentConfirmModal from '../components/PaymentConfirmModal';
import EmailVerificationPrompt from '../components/EmailVerificationPrompt';
import Timeline from '../components/Timeline';
import TransactionActivityFeed from '../components/TransactionActivityFeed';
import { TransactionTimeline } from '../components/TransactionTimeline';
import AutoReleaseCountdown from '../components/AutoReleaseCountdown';
import StepProgressTracker from '../components/StepProgressTracker';
import { getFlowCopy, getTransactionFlowType, mapEscrowUiStateToTimelineState, resolveEscrowUiState } from '../components/transactionState';
import { Textarea } from '../components/ui/textarea';
import { Input } from '../components/ui/input';
import { buildTransactionActivity } from '../utils/transactionActivity';
import { usePlatformConfig } from '../context/PlatformConfigContext';
import { getPayoutScheduleMessage, calculatePayoutSchedule } from '../utils/payoutSchedule';
import api from '../utils/api';
import { toast } from 'sonner';
import {
  ArrowLeft, FileText, User, Download, CheckCircle2, Image as ImageIcon,
  Star, Copy, Share2, Check, AlertTriangle, CreditCard, Truck, Shield,
  Loader2, Phone, Lock, RefreshCw, Clock, Banknote
} from 'lucide-react';

const BASE_URL = process.env.REACT_APP_API_URL || 'https://trusttrade-backend-production-3efa.up.railway.app';
const API = BASE_URL ? `${BASE_URL}/api` : '/api';
const PHONE_VERIFICATION_PROMPT = 'Verify your phone number to continue.';
const BANKING_DETAILS_PROMPT = 'Add banking details to receive payouts.';
const COURIER_ENABLED = process.env.REACT_APP_COURIER_ENABLED !== 'false';

function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function splitTrustTradeFee(totalFee, feeAllocation) {
  const fee = roundMoney(totalFee);
  const alloc = (feeAllocation || 'BUYER').toUpperCase();

  if (['SELLER', 'SELLER_AGENT'].includes(alloc)) {
    return { buyerFee: 0, sellerFee: fee };
  }
  if (['BUYER_SELLER', 'SPLIT', 'SPLIT_AGENT', 'BUYER_SELLER_AGENT'].includes(alloc)) {
    const buyerFee = roundMoney(fee / 2);
    return { buyerFee, sellerFee: roundMoney(fee - buyerFee) };
  }
  return { buyerFee: fee, sellerFee: 0 };
}

function parseErrorMessage(error) {
  const detail = error.response?.data?.detail;
  if (!detail) return 'An error occurred';
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) return detail.map(e => e.msg || e.message || JSON.stringify(e)).join(', ');
  if (typeof detail === 'object') return detail.msg || detail.message || JSON.stringify(detail);
  return 'An error occurred';
}

function formatDetailDate(value) {
  if (!value) return 'Recorded by TrustTrade';
  return new Date(value).toLocaleString('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function addBusinessDays(date, days) {
  const next = new Date(date);
  let remaining = days;
  while (remaining > 0) {
    next.setDate(next.getDate() + 1);
    const day = next.getDay();
    if (day !== 0 && day !== 6) remaining -= 1;
  }
  return next;
}

function formatSettlementDate(value) {
  return new Date(value).toLocaleDateString('en-ZA', {
    weekday: 'long',
    day: '2-digit',
    month: 'short',
  });
}

function getPayoutActivity(transaction) {
  const releasedAt = transaction.released_at || transaction.funds_released_at || transaction.completed_at || transaction.delivery_confirmed_at;
  const processingStartedAt = transaction.payout_processing_started_at ||
    transaction.withdrawal_requested_at ||
    transaction.withdrawal_started_at ||
    transaction.withdrawal_triggered_at ||
    releasedAt;
  const settlementConfirmedAt = transaction.settlement_confirmed_at || transaction.withdrawal_completed_at || null;
  const settlementConfirmed = Boolean(settlementConfirmedAt || transaction.bank_reference || transaction.settlement_reference || transaction.settlement_status === 'settlement_confirmed');

  return {
    releasedAt,
    processingStartedAt,
    settlementConfirmedAt,
    settlementConfirmed,
  };
}

function getPayoutStatus(transaction) {
  const activity = getPayoutActivity(transaction);
  const rawPayout = String(transaction.payout_status || '').toLowerCase();
  const rawSettlement = String(transaction.settlement_status || '').toLowerCase();
  const releaseDate = activity.releasedAt ? new Date(activity.releasedAt) : new Date();
  const isWeekend = releaseDate.getDay() === 0 || releaseDate.getDay() === 6;

  if (activity.settlementConfirmed || rawPayout.includes('complete') || rawSettlement.includes('confirm')) {
    return { label: 'Completed', tone: 'green' };
  }
  if (activity.releasedAt && (rawPayout.includes('fail') || rawSettlement.includes('withdrawal_failed'))) {
    return { label: 'Bank settlement pending', tone: 'amber' };
  }
  if (isWeekend) {
    return { label: 'Expected next business day', tone: 'amber' };
  }
  if (activity.processingStartedAt || rawPayout.includes('processing') || rawPayout.includes('withdraw')) {
    return { label: 'Bank processing', tone: 'blue' };
  }
  return { label: 'Processing', tone: 'slate' };
}

function getSettlementEstimate(transaction) {
  const activity = getPayoutActivity(transaction);
  if (activity.settlementConfirmedAt) {
    return {
      title: 'Settlement confirmed',
      detail: formatDetailDate(activity.settlementConfirmedAt),
    };
  }

  const basis = activity.processingStartedAt || activity.releasedAt || new Date();
  const releasedDate = new Date(basis);
  const isWeekend = releasedDate.getDay() === 0 || releasedDate.getDay() === 6;
  const estimatedDate = addBusinessDays(releasedDate, isWeekend ? 1 : 1);

  return {
    title: isWeekend ? 'Weekend release notice' : 'Expected settlement estimate',
    detail: isWeekend
      ? `Bank processing resumes on the next business day. Current estimate: ${formatSettlementDate(estimatedDate)}.`
      : `Expected next business day: ${formatSettlementDate(estimatedDate)}.`,
    holidayNote: 'Public holiday handling will follow bank processing calendars.',
  };
}

function PayoutStatusBadge({ status }) {
  const tones = {
    green: { bg: 'rgba(16,185,129,0.14)', text: '#6EE7B7', border: 'rgba(16,185,129,0.30)' },
    blue: { bg: 'rgba(59,130,246,0.14)', text: '#60A5FA', border: 'rgba(59,130,246,0.30)' },
    amber: { bg: 'rgba(245,158,11,0.14)', text: '#FBBF24', border: 'rgba(245,158,11,0.30)' },
    slate: { bg: '#334155', text: '#94A3B8', border: '#334155' },
  };
  const tone = tones[status.tone] || tones.slate;

  return (
    <span
      title="Funds have been released and are awaiting bank clearing."
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        borderRadius: 999,
        padding: '5px 9px',
        background: tone.bg,
        color: tone.text,
        border: `1px solid ${tone.border}`,
        fontSize: 11,
        fontWeight: 800,
        whiteSpace: 'nowrap',
      }}
    >
      {status.label}
    </span>
  );
}

function FinalizedEscrowState({ transaction, uiState, payoutSchedule }) {
  const activity = getPayoutActivity(transaction);
  const status = getPayoutStatus(transaction);
  const estimate = getSettlementEstimate(transaction);
  const completedAt = activity.settlementConfirmedAt || activity.releasedAt || transaction.updated_at;

  return (
    <div style={{
      background: 'linear-gradient(135deg,rgba(16,185,129,0.14),#0F172A)',
      border: '1px solid rgba(16,185,129,0.30)',
      borderLeft: '3px solid #10b981',
      borderRadius: 14,
      padding: '20px 22px',
      boxShadow: '0 12px 34px rgba(16,185,129,0.1)',
    }}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        <div style={{ width: 42, height: 42, borderRadius: 12, background: 'rgba(16,185,129,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <CheckCircle2 size={22} color="#34D399" />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 5 }}>
            <p style={{ fontSize: 15, fontWeight: 800, color: '#6EE7B7', margin: 0 }}>
              Funds released to wallet
            </p>
            <PayoutStatusBadge status={status} />
          </div>
          <p style={{ fontSize: 13, color: '#34D399', margin: '0 0 14px', lineHeight: 1.6 }}>
            Your payout is now moving through the banking system. Payment release is complete; {payoutSchedule.copy}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10 }}>
            {[
              ['Payment state', uiState.label],
              ['Payout status', status.label],
              ['Settlement estimate', estimate.detail],
              ['Completed', formatDetailDate(completedAt)],
              ['Protection', 'TrustTrade'],
            ].map(([label, value]) => (
              <div key={label} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(16,185,129,0.14)', borderRadius: 10, padding: '10px 12px' }}>
                <p style={{ fontSize: 10, color: '#34D399', fontWeight: 700, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</p>
                <p style={{ fontSize: 12, color: '#6EE7B7', fontWeight: 700, margin: 0 }}>{value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function PayoutTimeline({ transaction, payoutSchedule }) {
  const activity = getPayoutActivity(transaction);
  const status = getPayoutStatus(transaction);
  const estimate = getSettlementEstimate(transaction);
  const steps = [
    { label: 'Payment released', value: activity.releasedAt ? formatDetailDate(activity.releasedAt) : 'Waiting for payment release', state: activity.releasedAt ? 'complete' : 'pending' },
    { label: 'Payout processing started', value: activity.processingStartedAt ? formatDetailDate(activity.processingStartedAt) : 'Starts after release', state: activity.processingStartedAt ? 'complete' : activity.releasedAt ? 'active' : 'pending' },
    { label: 'Bank processing', value: activity.settlementConfirmed ? 'Bank settlement evidence recorded' : 'Funds are moving through banking rails', state: activity.settlementConfirmed ? 'complete' : activity.releasedAt ? 'active' : 'pending' },
    { label: estimate.title, value: `${estimate.detail} ${estimate.holidayNote || ''}`.trim(), state: activity.releasedAt ? 'active' : 'pending' },
    { label: 'Completed', value: activity.settlementConfirmedAt ? formatDetailDate(activity.settlementConfirmedAt) : 'No confirmed bank settlement yet', state: activity.settlementConfirmedAt ? 'complete' : 'pending' },
  ];
  const activityRows = [
    ['released_at', activity.releasedAt],
    ['payout_processing_started_at', activity.processingStartedAt],
    ['settlement_confirmed_at', activity.settlementConfirmedAt],
  ];

  return (
    <div style={{ background: '#243147', border: '1px solid #334155', borderRadius: 14, padding: '18px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.4)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 14 }}>
        <div>
          <p style={{ fontSize: 11, color: '#94A3B8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 4px' }}>Payout timeline</p>
          <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>
            {payoutSchedule.copy}
          </p>
        </div>
        <PayoutStatusBadge status={status} />
      </div>
      <div style={{ display: 'grid', gap: 10 }}>
        {steps.map((step) => (
          <div key={step.label} style={{ display: 'grid', gridTemplateColumns: '18px 1fr', gap: 10, alignItems: 'start' }}>
            <div style={{ width: 14, height: 14, borderRadius: '50%', marginTop: 2, background: step.state === 'complete' ? '#10b981' : step.state === 'active' ? '#60A5FA' : '#334155', boxShadow: step.state === 'complete' ? '0 0 0 4px rgba(16,185,129,0.12)' : step.state === 'active' ? '0 0 0 4px rgba(37,99,235,0.12)' : 'none' }} />
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#F8FAFC', margin: 0 }}>{step.label}</p>
              <p style={{ fontSize: 12, color: '#94A3B8', margin: '2px 0 0' }}>{step.value}</p>
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #334155' }}>
        <p style={{ fontSize: 11, color: '#94A3B8', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 8px' }}>
          Payout activity timestamps
        </p>
        <div style={{ display: 'grid', gap: 7 }}>
          {activityRows.map(([label, value]) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12 }}>
              <span style={{ color: '#94A3B8', fontFamily: 'monospace' }}>{label}</span>
              <span style={{ color: value ? '#F8FAFC' : '#94a3b8', fontWeight: 600, textAlign: 'right' }}>
                {value ? formatDetailDate(value) : 'Not recorded yet'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function getSADateKey(date) {
  const d = new Date(date.getTime() + 2 * 60 * 60 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function PayoutTimelineTracker({ transaction, platformConfig }) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  const activity = getPayoutActivity(transaction);
  const releasedAt = activity.releasedAt ? new Date(activity.releasedAt) : null;
  if (!releasedAt) return null;

  const { payoutRunAt, bankRunLabel } = calculatePayoutSchedule(releasedAt, platformConfig || {});
  const settlementConfirmed = activity.settlementConfirmed;

  const inInspection = now < payoutRunAt;
  const inBankProcessing = now >= payoutRunAt && !settlementConfirmed;
  const completed = settlementConfirmed;

  // Progress: 0→80% during inspection, 80→95% during bank processing, 100% complete
  const totalMs = payoutRunAt.getTime() - releasedAt.getTime();
  const elapsedMs = Math.min(now.getTime() - releasedAt.getTime(), totalMs);
  const rawProgress = totalMs > 0 ? Math.round((elapsedMs / totalMs) * 80) : 0;
  const progress = completed ? 100 : inBankProcessing ? 92 : Math.min(78, rawProgress);

  // Countdown
  const msUntilPayout = Math.max(0, payoutRunAt.getTime() - now.getTime());
  const hoursUntilPayout = Math.floor(msUntilPayout / (1000 * 60 * 60));
  const minutesUntilPayout = Math.floor((msUntilPayout % (1000 * 60 * 60)) / (1000 * 60));

  const countdownText = completed
    ? 'Payout complete'
    : msUntilPayout === 0
    ? 'Bank processing now'
    : hoursUntilPayout > 0
    ? `Estimated payout in: ${hoursUntilPayout}h ${minutesUntilPayout}m`
    : minutesUntilPayout > 0
    ? `Estimated payout in: ${minutesUntilPayout}m`
    : 'Processing now';

  // Date label helpers (SA timezone = UTC+2, no DST)
  const relDayLabel = (target) => {
    const tk = getSADateKey(target);
    const nk = getSADateKey(now);
    if (tk === nk) return 'Today';
    const tmr = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    if (tk === getSADateKey(tmr)) return 'Tomorrow';
    const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const utcDay = new Date(target.getTime() + 2 * 60 * 60 * 1000).getUTCDay();
    return DAYS[utcDay];
  };

  // Payout time string from the UTC payoutRunAt (which was built in SAST)
  const payoutH = String(new Date(payoutRunAt.getTime() + 2 * 60 * 60 * 1000).getUTCHours()).padStart(2, '0');
  const payoutM = String(payoutRunAt.getUTCMinutes()).padStart(2, '0');
  const payoutTimeStr = `${payoutH}:${payoutM}`;

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const saPayoutDate = new Date(payoutRunAt.getTime() + 2 * 60 * 60 * 1000);
  const payoutDay = saPayoutDate.getUTCDate();
  const payoutMonth = MONTHS[saPayoutDate.getUTCMonth()];
  const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const payoutWeekday = WEEKDAYS[saPayoutDate.getUTCDay()];

  const payoutBoldLabel = `${payoutWeekday} ${payoutDay} ${payoutMonth} at ${payoutTimeStr}`;
  const inspectionEndLabel = `${relDayLabel(payoutRunAt)} ${payoutTimeStr}`;

  const steps = [
    {
      label: 'Payment Released',
      detail: formatDetailDate(activity.releasedAt),
      state: 'complete',
    },
    {
      label: 'Payout Processing Started',
      detail: formatDetailDate(activity.processingStartedAt || activity.releasedAt),
      state: 'complete',
    },
    {
      label: 'TradeSafe Inspection Period',
      detail: inInspection
        ? `Inspection ends: ${inspectionEndLabel}`
        : `Completed — ${inspectionEndLabel}`,
      state: completed ? 'complete' : inInspection ? 'active' : 'complete',
    },
    {
      label: 'Bank Processing',
      detail: `Estimated: next ${bankRunLabel} run`,
      state: completed ? 'complete' : inBankProcessing ? 'active' : inInspection ? 'pending' : 'complete',
    },
    {
      label: 'Estimated in FNB',
      detail: payoutBoldLabel,
      state: completed ? 'complete' : 'pending',
      highlight: !completed,
    },
  ];

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(16,185,129,0.14) 0%, #243147 100%)',
      border: '1px solid rgba(16,185,129,0.30)',
      borderLeft: '3px solid #10b981',
      borderRadius: 14,
      padding: '20px 22px',
      boxShadow: '0 4px 20px rgba(16,185,129,0.08)',
    }}>
      <style>{`@keyframes payout-pulse{0%,100%{opacity:1}50%{opacity:0.5}}`}</style>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <p style={{ fontSize: 11, color: '#34D399', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 3px' }}>
            Payout Timeline
          </p>
          <p style={{ fontSize: 15, fontWeight: 700, color: '#F8FAFC', margin: 0 }}>
            {countdownText}
          </p>
        </div>
        {!completed && msUntilPayout > 0 && (
          <div style={{ background: 'rgba(16,185,129,0.14)', border: '1px solid rgba(16,185,129,0.30)', borderRadius: 99, padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
            <Clock size={11} color="#34D399" />
            <span style={{ fontSize: 12, fontWeight: 700, color: '#34D399', whiteSpace: 'nowrap' }}>
              {hoursUntilPayout > 0 ? `${hoursUntilPayout}h ${minutesUntilPayout}m` : `${minutesUntilPayout}m`}
            </span>
          </div>
        )}
        {completed && (
          <div style={{ background: 'rgba(16,185,129,0.14)', border: '1px solid rgba(16,185,129,0.30)', borderRadius: 99, padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 5 }}>
            <CheckCircle2 size={11} color="#34D399" />
            <span style={{ fontSize: 12, fontWeight: 700, color: '#34D399' }}>Done</span>
          </div>
        )}
      </div>

      {/* Bold estimated payout date */}
      {!completed && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ background: 'rgba(16,185,129,0.14)', border: '1px solid rgba(16,185,129,0.30)', borderRadius: 8, padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Banknote size={14} color="#34D399" style={{ flexShrink: 0 }} />
            <div>
              <span style={{ fontSize: 12, color: '#34D399' }}>Estimated payout: </span>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#6EE7B7' }}>{payoutBoldLabel}</span>
            </div>
          </div>
          <p style={{ fontSize: 11, color: '#94a3b8', margin: '6px 2px 0', lineHeight: 1.4 }}>
            Estimates based on standard processing. Actual timing may vary by 1–2 hours.
          </p>
        </div>
      )}

      {/* Progress bar */}
      <div style={{ background: '#334155', borderRadius: 99, height: 5, marginBottom: 18, overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          background: completed ? '#10b981' : 'linear-gradient(90deg, #10b981, #34d399)',
          borderRadius: 99,
          width: `${progress}%`,
          transition: 'width 1s ease',
        }} />
      </div>

      {/* Steps */}
      <div>
        {steps.map((step, i) => (
          <div key={i} style={{ display: 'flex', gap: 10 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 18, flexShrink: 0 }}>
              <div style={{
                width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: step.state === 'complete' ? '#10b981' : step.state === 'active' ? '#60A5FA' : '#334155',
                boxShadow: step.state === 'active' ? '0 0 0 4px rgba(37,99,235,0.12)' : 'none',
              }}>
                {step.state === 'complete' && <Check size={10} color="#fff" />}
                {step.state === 'active' && (
                  <Loader2 size={9} color="#fff" style={{ animation: 'spin 1s linear infinite' }} />
                )}
              </div>
              {i < steps.length - 1 && (
                <div style={{
                  width: 2, flex: 1, minHeight: 14,
                  background: step.state === 'complete' ? 'rgba(16,185,129,0.30)' : '#334155',
                  margin: '3px 0',
                }} />
              )}
            </div>

            <div style={{ flex: 1, paddingBottom: i < steps.length - 1 ? 12 : 0 }}>
              <p style={{
                fontSize: 13,
                fontWeight: step.state !== 'pending' ? 700 : 500,
                color: step.state === 'pending' ? '#94a3b8' : '#F8FAFC',
                margin: '0 0 2px',
                lineHeight: 1.3,
              }}>
                {step.label}
              </p>
              {step.highlight && step.state !== 'complete' ? (
                <span style={{
                  fontSize: 13, fontWeight: 800, color: '#6EE7B7',
                  background: 'rgba(16,185,129,0.14)', border: '1px solid rgba(16,185,129,0.30)',
                  borderRadius: 6, padding: '2px 8px', display: 'inline-block',
                }}>
                  {step.detail}
                </span>
              ) : (
                <p style={{
                  fontSize: 12,
                  color: step.state === 'pending' ? '#475569' : '#94A3B8',
                  margin: 0, lineHeight: 1.4,
                }}>
                  {step.detail}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Seller-facing preview shown while funds are sitting in escrow (PAYMENT_SECURED)
// but the release hasn't happened yet. Gives the seller a same-page answer to
// "when am I getting paid?" by estimating: earliest release time → bank run via
// calculatePayoutSchedule → date the money lands. All dates labelled "Estimated"
// (not "Expected") with a subtle clarifying note.
function SellerExpectedPayoutCard({ transaction, platformConfig }) {
  const fundsReceivedAt = transaction.funds_received_at
    || transaction.payment_verified_at
    || null;
  if (!fundsReceivedAt) return null;

  // Earliest release timestamp the seller can hope for. Prefer the backend-set
  // auto_release_at; fall back to funds_received_at + delivery-method default if
  // the field hasn't been written yet.
  const deliveryMethod = (transaction.delivery_method || 'courier').toLowerCase();
  const AUTO_RELEASE_DAYS_BY_METHOD = {
    courier: 3,
    postnet: 5,
    bank_deposit: 2,
    digital: 0,
    instant: 0,
    meet_in_person: 1,
    collection: 1,
    other: 3,
  };
  const fallbackDays = AUTO_RELEASE_DAYS_BY_METHOD[deliveryMethod] ?? 3;
  const estimatedReleaseAt = transaction.auto_release_at
    ? new Date(transaction.auto_release_at)
    : new Date(new Date(fundsReceivedAt).getTime() + fallbackDays * 24 * 60 * 60 * 1000);

  // Walk the estimated release through the bank-run schedule to get the date
  // the money actually lands in the seller's bank.
  const { payoutRunAt, bankRunLabel } = calculatePayoutSchedule(estimatedReleaseAt, platformConfig || {});

  const dateFmt = (d) => new Date(d).toLocaleDateString('en-ZA', {
    weekday: 'long', day: '2-digit', month: 'short', year: 'numeric',
  });

  const earliestReleaseLabel = dateFmt(estimatedReleaseAt);
  const payoutLandsLabel = dateFmt(payoutRunAt);
  const releasePlainEnglish = deliveryMethod === 'digital'
    ? 'as soon as the buyer confirms (auto-releases shortly otherwise)'
    : 'when the buyer confirms receipt or the auto-release timer expires';

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(16,185,129,0.14) 0%, #243147 100%)',
      border: '1px solid rgba(16,185,129,0.30)',
      borderLeft: '3px solid #10b981',
      borderRadius: 14,
      padding: '18px 20px',
      boxShadow: '0 1px 3px rgba(15,23,42,0.04)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div>
          <p style={{ fontSize: 11, color: '#34D399', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 3px' }}>
            Payout Timeline
          </p>
          <p style={{ fontSize: 15, fontWeight: 700, color: '#F8FAFC', margin: 0 }}>
            Funds secured in escrow — here's when to expect your money
          </p>
        </div>
        <div style={{ background: 'rgba(16,185,129,0.14)', border: '1px solid rgba(16,185,129,0.30)', borderRadius: 99, padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
          <Shield size={11} color="#34D399" />
          <span style={{ fontSize: 12, fontWeight: 700, color: '#34D399', whiteSpace: 'nowrap' }}>Protected</span>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 10, marginBottom: 14 }}>
        <div style={{ background: 'rgba(16,185,129,0.14)', border: '1px solid rgba(16,185,129,0.30)', borderRadius: 8, padding: '10px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Shield size={14} color="#34D399" style={{ flexShrink: 0 }} />
            <div>
              <span style={{ fontSize: 12, color: '#34D399' }}>Estimated release from escrow: </span>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#6EE7B7' }}>{earliestReleaseLabel}</span>
            </div>
          </div>
          <p style={{ fontSize: 11, color: '#94A3B8', margin: '4px 0 0 22px', lineHeight: 1.4 }}>
            Funds release {releasePlainEnglish}.
          </p>
        </div>

        <div style={{ background: 'rgba(16,185,129,0.14)', border: '1px solid rgba(16,185,129,0.30)', borderRadius: 8, padding: '10px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Banknote size={14} color="#34D399" style={{ flexShrink: 0 }} />
            <div>
              <span style={{ fontSize: 12, color: '#34D399' }}>Estimated in your bank: </span>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#6EE7B7' }}>{payoutLandsLabel}</span>
            </div>
          </div>
          <p style={{ fontSize: 11, color: '#94A3B8', margin: '4px 0 0 22px', lineHeight: 1.4 }}>
            Next bank run after release: {bankRunLabel}.
          </p>
        </div>
      </div>

      <p style={{ fontSize: 11, color: '#94a3b8', margin: 0, lineHeight: 1.4 }}>
        Why two dates? The <strong>release date</strong> is when funds leave escrow once the buyer
        confirms (or auto-release fires). They're then paid out on the next scheduled bank run, and
        the EFT clears into your account the following business day — that's the <strong>bank date</strong>.
        Estimates based on standard processing; actual timing may vary.
      </p>
    </div>
  );
}

function NextStepCard({ nextStep }) {
  if (!nextStep) return null;
  return (
    <div style={{
      background: nextStep.bg,
      border: `1px solid ${nextStep.border}`,
      borderLeft: `3px solid ${nextStep.color}`,
      borderRadius: 14,
      padding: '18px 20px',
    }}>
      <p style={{ fontSize: 11, color: nextStep.color, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 7px' }}>
        {nextStep.roleContext}
      </p>
      <h2 style={{ fontSize: 20, color: nextStep.titleColor, fontWeight: 800, margin: '0 0 7px', letterSpacing: '-0.02em' }}>
        {nextStep.title}
      </h2>
      <p style={{ fontSize: 13, color: nextStep.textColor, margin: 0, lineHeight: 1.6 }}>
        {nextStep.description}
      </p>
    </div>
  );
}

function CurrentStateHeader({ uiState, flowType, userRole, paymentProcessing }) {
  const title = (() => {
    if (uiState.state === 'EXPIRED') return 'Transaction expired due to no payment';
    if (uiState.state === 'FUNDED') return paymentProcessing ? 'Payment processing…' : 'Awaiting buyer payment';
    if (uiState.state === 'ESCROW_LOCKED') return 'Payment secured';
    if (uiState.state === 'DELIVERY_PENDING') return flowType === 'delivery' ? 'Delivery in progress' : flowType === 'instant' ? 'Release approved' : 'Release conditions in progress';
    if (uiState.state === 'DELIVERED') return flowType === 'delivery' ? 'Awaiting buyer confirmation' : 'Release conditions met';
    if (uiState.state === 'RELEASED') return 'Bank payout release scheduled';
    if (uiState.state === 'COMPLETED') return 'Completed';
    if (uiState.state === 'DISPUTED') return 'Disputed';
    return uiState.label || 'Transaction status';
  })();

  return (
    <div style={{
      background: '#3B82F6',
      border: `1px solid ${uiState.color || '#334155'}55`,
      borderRadius: 16,
      padding: '18px 20px',
      boxShadow: '0 18px 42px rgba(15,23,42,0.16)',
      minWidth: 0,
    }}>
      <p style={{ margin: '0 0 7px', color: uiState.color || '#93c5fd', fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
        Current state / {userRole} / {flowType === 'delivery' ? 'delivery' : flowType === 'instant' ? 'instant release' : 'release conditions'}
      </p>
      <h1 style={{ margin: 0, color: '#fff', fontSize: 'clamp(22px, 4vw, 32px)', fontWeight: 850, letterSpacing: '-0.03em', lineHeight: 1.1, overflowWrap: 'anywhere' }}>
        {title}
      </h1>
      <p style={{ margin: '9px 0 0', color: 'rgba(255,255,255,0.68)', fontSize: 13, lineHeight: 1.55 }}>
        {uiState.description}
      </p>
    </div>
  );
}

function TransactionDetail() {
  const API_BASE = process.env.REACT_APP_API_URL || '';
  const BASE_URL_LOCAL = API_BASE.replace('/api', '');
  const [user, setUser] = useState(null);
  const [profileIncompleteError, setProfileIncompleteError] = useState(null);
  const [transaction, setTransaction] = useState(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [sellerConfirming, setSellerConfirming] = useState(false);
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [review, setReview] = useState('');
  const [submittingRating, setSubmittingRating] = useState(false);
  const [reviewSkipped, setReviewSkipped] = useState(false);
  const [copied, setCopied] = useState(false);
  const [creatingEscrow, setCreatingEscrow] = useState(false);
  const [loadingPaymentLink, setLoadingPaymentLink] = useState(false);
  const [paymentInfo, setPaymentInfo] = useState(null);
  const [startingDelivery, setStartingDelivery] = useState(false);
  const [dispatchedLocally, setDispatchedLocally] = useState(false);
  const [acceptingDelivery, setAcceptingDelivery] = useState(false);
  const [deliveryConfirmedLocally, setDeliveryConfirmedLocally] = useState(false);
  const [payoutReadiness, setPayoutReadiness] = useState(null);
  const [checkingPayoutReadiness, setCheckingPayoutReadiness] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState(null);
  const [payConfirm, setPayConfirm] = useState(null);  // { link, total_value, processing_fee }
  const [paymentProcessing, setPaymentProcessing] = useState(false);
  const [needsPhoneVerification, setNeedsPhoneVerification] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [verificationError, setVerificationError] = useState(null);
  const [remainingOtpRequests, setRemainingOtpRequests] = useState(3);
  const [remainingVerifyAttempts, setRemainingVerifyAttempts] = useState(5);
  const [otpExpiresIn, setOtpExpiresIn] = useState(10);
  const [isLockedOut, setIsLockedOut] = useState(false);
  const [lockoutMinutes, setLockoutMinutes] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [wrongAccount, setWrongAccount] = useState(null);
  const [emailVerificationRequired, setEmailVerificationRequired] = useState(false);
  const [phoneVerificationContext, setPhoneVerificationContext] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [trackingData, setTrackingData] = useState(null);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const { config: platformConfig } = usePlatformConfig();
  const payoutSchedule = useMemo(() => getPayoutScheduleMessage(new Date(), platformConfig), [platformConfig]);
  const navigate = useNavigate();
  const { transactionId } = useParams();

  useEffect(() => { fetchData(); }, [transactionId]);

  useEffect(() => {
    if (!transaction || !user) return;
    const isBuyerUser = transaction.buyer_email === user.email || transaction.buyer_user_id === user.user_id;
    const escrowState = transaction.tradesafe_state;
    const hasEscrow = !!transaction.tradesafe_id;
    const uiState = resolveEscrowUiState(transaction);
    const canRelease = uiState.actionable && hasEscrow && isBuyerUser && ['INITIATED', 'SENT', 'DELIVERED'].includes(escrowState);
    if (canRelease && !payoutReadiness) checkPayoutReadiness();
  }, [transaction, user]);

  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  // Is the transaction still waiting for the buyer's payment to be confirmed?
  const isAwaitingPayment = (txn) => {
    if (!txn) return false;
    const ps = (txn.payment_status || '').toLowerCase();
    const ts = (txn.tradesafe_state || '').toUpperCase();
    return ps.includes('awaiting') || ts === 'CREATED' || ts === 'PENDING';
  };

  // Bug 3: auto-refresh the transaction status every 15s without a full page reload.
  // While the payment is still awaiting confirmation we use the active TradeSafe
  // sync endpoint so both buyer and seller see the status flip as soon as funds
  // arrive, instead of waiting up to 30 minutes for the webhook.
  useEffect(() => {
    if (!transaction) return;
    if (resolveEscrowUiState(transaction).terminal) return;
    if (paymentProcessing) return; // handled by the faster post-payment poll below
    const interval = setInterval(async () => {
      if (isAwaitingPayment(transaction) && transaction.tradesafe_id) {
        try { await api.post(`${API}/tradesafe/sync/${transactionId}`, {}, { withCredentials: true }); } catch (e) {}
      }
      fetchData();
    }, 15000);
    return () => clearInterval(interval);
  }, [transaction?.delivery_confirmed, transaction?.payment_status, transaction?.tradesafe_state, transaction?.tradesafe_id, transactionId, paymentProcessing]);

  // Bug 2: if the buyer just initiated payment, enter "processing" mode on return.
  useEffect(() => {
    const flag = localStorage.getItem(`tt_payment_initiated_${transactionId}`);
    if (!flag) return;
    const ts = parseInt(flag, 10);
    if (isNaN(ts) || Date.now() - ts > 30 * 60 * 1000) {
      localStorage.removeItem(`tt_payment_initiated_${transactionId}`);
      return;
    }
    setPaymentProcessing(true);
  }, [transactionId]);

  // Bug 2: while processing, actively poll TradeSafe every 10s for up to 5 minutes.
  // Stop (and clear the flag) as soon as the payment is confirmed or the window elapses.
  useEffect(() => {
    if (!paymentProcessing) return;
    // If the transaction is already past awaiting payment, we're done.
    if (transaction && !isAwaitingPayment(transaction)) {
      setPaymentProcessing(false);
      localStorage.removeItem(`tt_payment_initiated_${transactionId}`);
      return;
    }
    let cancelled = false;
    const startedAt = Date.now();
    const MAX_MS = 5 * 60 * 1000;
    const poll = async () => {
      if (cancelled) return;
      try {
        if (transaction?.tradesafe_id) {
          await api.post(`${API}/tradesafe/sync/${transactionId}`, {}, { withCredentials: true });
        }
      } catch (e) {}
      if (!cancelled) await fetchData();
    };
    poll();
    const interval = setInterval(() => {
      if (Date.now() - startedAt > MAX_MS) {
        clearInterval(interval);
        setPaymentProcessing(false);
        localStorage.removeItem(`tt_payment_initiated_${transactionId}`);
        return;
      }
      poll();
    }, 10000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [paymentProcessing, transaction?.tradesafe_id, transaction?.payment_status, transaction?.tradesafe_state, transactionId]);

  // Refresh immediately when user returns to tab after completing payment
  useEffect(() => {
    const onVisible = () => { if (!document.hidden) fetchData(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', fetchData);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', fetchData);
    };
  }, [transactionId]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchData = async () => {
    try {
      const userRes = await api.get(`${API}/auth/me`, { withCredentials: true });
      setUser(userRes.data);
      if (userRes.data.phone) setPhoneNumber(userRes.data.phone);
      const transactionRes = await api.get(`${API}/transactions/${transactionId}`, { withCredentials: true });
      setTransaction(transactionRes.data);
      setNeedsPhoneVerification(false);
      setPhoneVerificationContext(null);
    } catch (error) {
      const errorDetail = error.response?.data?.detail;
      const errorStatus = error.response?.status;
      if (errorStatus === 403 && typeof errorDetail === 'object' && errorDetail?.type === 'phone_verification_required') {
        setNeedsPhoneVerification(true);
        setPhoneVerificationContext({ maskedPhone: errorDetail.invited_phone_masked, inviteType: errorDetail.invite_type, itemDescription: errorDetail.item_description, itemPrice: errorDetail.item_price, message: errorDetail.message });
        setVerificationError(errorDetail.message);
        try { const userRes = await api.get(`${API}/auth/me`, { withCredentials: true }); setUser(userRes.data); if (userRes.data.phone) setPhoneNumber(userRes.data.phone); } catch (e) {}
      } else if (errorStatus === 403 && typeof errorDetail === 'string' && (errorDetail.includes('phone') || errorDetail.includes('Phone'))) {
        setNeedsPhoneVerification(true); setVerificationError(errorDetail);
        try { const userRes = await api.get(`${API}/auth/me`, { withCredentials: true }); setUser(userRes.data); if (userRes.data.phone) setPhoneNumber(userRes.data.phone); } catch (e) {}
      } else if (errorStatus === 403) {
        const errorMsg = typeof errorDetail === 'string' ? errorDetail : (errorDetail?.message || 'Access denied');
        const match = errorMsg.match(/sent to (?:email address |phone number )?([^\s.]+)/i);
        const expectedEmail = match ? match[1] : 'the invited account';
        try { const userRes = await api.get(`${API}/auth/me`, { withCredentials: true }); setUser(userRes.data); setWrongAccount({ expected: expectedEmail, current: userRes.data.email, message: errorMsg }); } catch (e) { setWrongAccount({ expected: expectedEmail, current: 'current account', message: errorMsg }); }
      } else { toast.error('Transaction not found'); navigate('/transactions'); }
    } finally { setLoading(false); }
  };

  const validatePhoneAgainstMask = (enteredPhone, maskedPhone) => {
    if (!maskedPhone) return true;
    let normalized = enteredPhone.replace(/[\s\-\+]/g, '');
    if (normalized.startsWith('0')) normalized = normalized.slice(1);
    if (normalized.startsWith('27')) normalized = normalized.slice(2);
    if (normalized.length < 9) return false;
    const match = maskedPhone.match(/(\d{4})$/);
    if (match) return normalized.endsWith(match[1]);
    return true;
  };

  const handleSendOtp = async () => {
    setVerificationError(null);
    if (!phoneNumber || phoneNumber.replace(/\D/g, '').length < 9) { toast.error('Please enter a valid phone number'); return; }
    if (isLockedOut) { toast.error(`Too many attempts. Please try again in ${lockoutMinutes} minutes.`); return; }
    const maskedPhone = phoneVerificationContext?.maskedPhone;
    if (maskedPhone && !validatePhoneAgainstMask(phoneNumber, maskedPhone)) { setVerificationError(`Phone number doesn't match. Expected ending: ${maskedPhone.slice(-4)}.`); toast.error(`Phone number doesn't match. Expected ending: ${maskedPhone.slice(-4)}`); return; }
    setSendingOtp(true);
    try {
      const response = await api.post(`${API}/verification/phone/send-otp`, { phone_number: phoneNumber, expected_phone_masked: maskedPhone || null }, { withCredentials: true });
      setOtpSent(true); setResendCooldown(response.data.cooldown_seconds || 60); setRemainingOtpRequests(response.data.remaining_requests ?? 2); setOtpExpiresIn(response.data.expires_in_minutes || 10); setRemainingVerifyAttempts(5);
      toast.success(`Verification code sent! Expires in ${response.data.expires_in_minutes || 10} minutes.`);
    } catch (error) {
      const errorDetail = error.response?.data?.detail || 'Failed to send verification code';
      if (error.response?.status === 429) { if (errorDetail.includes('locked') || errorDetail.includes('Too many failed')) { setIsLockedOut(true); const minutes = errorDetail.match(/(\d+) minutes/); setLockoutMinutes(minutes ? parseInt(minutes[1]) : 30); } toast.error(errorDetail); }
      else if (errorDetail.includes("doesn't match")) { setVerificationError(errorDetail); toast.error('Phone number mismatch'); }
      else toast.error(errorDetail);
    } finally { setSendingOtp(false); }
  };

  const handleVerifyOtp = async () => {
    if (!otpCode || otpCode.length !== 6) { toast.error('Please enter the 6-digit code'); return; }
    if (isLockedOut) { toast.error(`Too many attempts. Please try again in ${lockoutMinutes} minutes.`); return; }
    setVerifyingOtp(true); setVerificationError(null);
    try {
      await api.post(`${API}/verification/phone/verify-otp`, { phone_number: phoneNumber, otp: otpCode }, { withCredentials: true });
      toast.success('Phone verified successfully!');
      const transactionRes = await api.get(`${API}/transactions/${transactionId}`, { withCredentials: true });
      setTransaction(transactionRes.data); setNeedsPhoneVerification(false); setVerificationError(null); setIsLockedOut(false);
      const userRes = await api.get(`${API}/auth/me`, { withCredentials: true }); setUser(userRes.data);
      toast.success('You have joined the transaction!');
    } catch (error) {
      const errorDetail = error.response?.data?.detail || 'Verification failed';
      if (error.response?.status === 429) { setIsLockedOut(true); const minutes = errorDetail.match(/(\d+) minutes/); setLockoutMinutes(minutes ? parseInt(minutes[1]) : 30); setVerificationError(errorDetail); toast.error(errorDetail); }
      else if (errorDetail.includes('expired')) { setOtpSent(false); setOtpCode(''); setVerificationError('Verification code expired. Please request a new code.'); toast.error('Code expired. Request a new one.'); }
      else if (errorDetail.includes('attempts remaining')) { const remaining = errorDetail.match(/(\d+) attempts/); if (remaining) setRemainingVerifyAttempts(parseInt(remaining[1])); setVerificationError(errorDetail); toast.error(errorDetail); }
      else if (errorDetail.includes('No verification code')) { setOtpSent(false); setOtpCode(''); toast.error('Please request a new verification code.'); }
      else { setVerificationError(errorDetail); toast.error(errorDetail); }
    } finally { setVerifyingOtp(false); }
  };

  const handleSellerConfirm = async () => {
    if (!window.confirm('Are you sure you want to confirm these transaction details?')) return;
    setSellerConfirming(true);
    try {
      const res = await api.post(`${API}/transactions/${transactionId}/seller-confirm`, { confirmed: true }, { withCredentials: true });
      toast.success('Transaction confirmed!'); fetchData();
    } catch (error) {
      const errMsg = parseErrorMessage(error);
      if (errMsg && errMsg.includes(BANKING_DETAILS_PROMPT)) {
        setProfileIncompleteError(BANKING_DETAILS_PROMPT);
        toast.error(BANKING_DETAILS_PROMPT);
      } else if (errMsg && errMsg.includes(PHONE_VERIFICATION_PROMPT)) {
        setProfileIncompleteError(PHONE_VERIFICATION_PROMPT);
        toast.error(PHONE_VERIFICATION_PROMPT);
      } else if (errMsg && errMsg.startsWith('MISSING_PROFILE:')) {
        const missing = errMsg.replace('MISSING_PROFILE: ', '');
        setProfileIncompleteError(missing);
        toast.error(`Complete your profile first: ${missing}`);
      } else { toast.error(errMsg || 'Failed to confirm transaction'); }
    } finally { setSellerConfirming(false); }
  };

  const handleBuyerConfirm = async () => {
    if (!window.confirm('Are you sure you want to confirm these transaction details?')) return;
    setConfirming(true);
    try { await api.post(`${API}/transactions/${transactionId}/buyer-confirm`, { confirmed: true }, { withCredentials: true }); toast.success('Transaction confirmed!'); fetchData(); }
    catch (error) { toast.error(parseErrorMessage(error) || 'Failed to confirm transaction'); }
    finally { setConfirming(false); }
  };

  const handleConfirmDelivery = async () => {
    if (!user?.phone_verified) {
      toast.info(PHONE_VERIFICATION_PROMPT);
      navigate('/verify/phone');
      return;
    }
    if (!window.confirm('Are you sure you want to confirm delivery and release the funds to the seller?')) return;
    setConfirming(true);
    try {
      await api.patch(`${API}/transactions/${transactionId}/delivery`, { delivery_confirmed: true }, { withCredentials: true });
      setDeliveryConfirmedLocally(true);
      setTransaction(prev => prev ? { ...prev, delivery_confirmed: true, payment_status: 'Payment processing' } : prev);
      toast.success(payoutSchedule.copy);
      fetchData();
    }
    catch (error) { if (error.response?.data?.detail === 'EMAIL_NOT_VERIFIED') { setEmailVerificationRequired(true); } else { toast.error(parseErrorMessage(error) || 'Failed to confirm delivery'); } }
    finally { setConfirming(false); }
  };

  const handleConfirmInstantRelease = async () => {
    if (!user?.phone_verified) {
      toast.info(PHONE_VERIFICATION_PROMPT);
      navigate('/verify/phone');
      return;
    }
    const readiness = payoutReadiness?.payout_ready ? payoutReadiness : await checkPayoutReadiness();
    if (readiness && !readiness.payout_ready) {
      toast.warning(readiness.issues?.join(', ') || 'Seller payout setup incomplete');
      return;
    }
    if (!window.confirm(`Confirm you are satisfied and want to release the funds to the seller? ${payoutSchedule.copy} This action cannot be undone.`)) return;
    setAcceptingDelivery(true);
    try {
      // Single merged buyer action: confirm the transaction details first (if the
      // buyer hasn't already — e.g. Smart Deals fund escrow without a separate
      // confirm step), then release the funds in the same click.
      if (!buyerConfirmed) {
        await api.post(`${API}/transactions/${transactionId}/buyer-confirm`, { confirmed: true }, { withCredentials: true });
      }
      await api.post(`${API}/tradesafe/release-instant/${transactionId}`, {}, { withCredentials: true });
      setDeliveryConfirmedLocally(true);
      setTransaction(prev => prev ? { ...prev, buyer_confirmed: true, delivery_confirmed: true, tradesafe_state: 'FUNDS_RELEASED', payment_status: 'Payment processing' } : prev);
      toast.success(payoutSchedule.copy);
      fetchData();
    }
    catch (error) { if (error.response?.data?.detail === 'EMAIL_NOT_VERIFIED') { setEmailVerificationRequired(true); } else { toast.error(parseErrorMessage(error) || 'Failed to release funds'); } }
    finally { setAcceptingDelivery(false); }
  };

  const handleDownloadPDF = async () => {
    try {
      const response = await api.get(`${API}/transactions/${transactionId}/agreement-pdf`, { withCredentials: true, responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a'); link.href = url; link.setAttribute('download', `TrustTrade_Agreement_${transactionId}.pdf`); document.body.appendChild(link); link.click(); link.parentNode.removeChild(link);
      toast.success('Agreement downloaded');
    } catch (error) { toast.error('Agreement not available yet'); }
  };

  const handleSyncStatus = async () => {
    if (!transaction.tradesafe_id) { toast.info('No payment linked to sync'); fetchData(); return; }
    setSyncing(true);
    try {
      const response = await api.post(`${API}/tradesafe/sync/${transactionId}`, {}, { withCredentials: true });
      if (response.data.state_changed) toast.success(`Status updated: ${response.data.new_payment_status}`); else toast.info('Status is up to date');
      fetchData();
    } catch (error) { toast.error(parseErrorMessage(error) || 'Failed to sync status'); fetchData(); }
    finally { setSyncing(false); }
  };

  const handleCreateEscrow = async (e) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    if (!user?.phone_verified) {
      toast.info(PHONE_VERIFICATION_PROMPT);
      navigate('/verify/phone');
      return;
    }
    if (!window.confirm('This will set up the protected payment. The buyer will then need to make payment. Proceed?')) return;
    setCreatingEscrow(true); toast.info('Setting up protected payment...');
    try {
      await api.post(`${API}/tradesafe/create-transaction`, { transaction_id: transactionId, fee_allocation: transaction.fee_allocation || 'SELLER_AGENT' }, { withCredentials: true });
      toast.success('Protected payment created! Buyer can now make payment.'); fetchData();
    } catch (error) { const errorMessage = error.response?.data?.detail ? parseErrorMessage(error) : 'Failed to start the transaction. Please try again.'; toast.error(errorMessage); }
    finally { setCreatingEscrow(false); }
  };

  const handleGetPaymentLink = async (e) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    if (!user?.phone_verified) {
      toast.info(PHONE_VERIFICATION_PROMPT);
      navigate('/verify/phone');
      return;
    }
    if (!selectedPaymentMethod) { toast.error('Please select a payment method first'); return; }
    setLoadingPaymentLink(true); toast.info('Loading payment page...');
    try {
      localStorage.setItem('lastPaymentTransactionRoute', `/transactions/${transactionId}`);
      sessionStorage.setItem('redirectAfterLogin', `/transactions/${transactionId}`);
      const response = await api.get(`${API}/tradesafe/payment-url/${transactionId}?payment_method=${selectedPaymentMethod}`, { withCredentials: true });
      setPaymentInfo(response.data);
      if (response.data.already_paid) { toast.success('This transaction has already been paid.'); setTransaction(prev => ({ ...prev, tradesafe_state: response.data.state, status: 'paid' })); return; }
      if (response.data.payment_link) {
        // Show the EXACT amount TradeSafe will charge (deposit value + bank fee) in a
        // styled confirmation before sending the buyer to the gateway.
        if (response.data.total_value != null) {
          setPayConfirm({ link: response.data.payment_link, total_value: response.data.total_value, processing_fee: response.data.processing_fee });
          return;
        }
        // No exact figure available — go straight to the gateway.
        localStorage.setItem(`tt_payment_initiated_${transactionId}`, String(Date.now()));
        setPaymentProcessing(true);
        const newWindow = window.open(response.data.payment_link, '_blank'); if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') window.location.href = response.data.payment_link; toast.success('Secure payment page opened.');
      }
      else if (response.data.eft_details) { setPaymentInfo(response.data); toast.info('EFT bank details ready — see below.'); }
      else { setPaymentInfo(response.data); toast.info('Payment deposit created.'); }
    } catch (error) { const errorMessage = error.response?.data?.detail ? parseErrorMessage(error) : 'Unable to process payment. Please try again.'; toast.error(errorMessage); }
    finally { setLoadingPaymentLink(false); }
  };

  // Confirmed in the payment modal — redirect to the secure gateway.
  const confirmAndPay = () => {
    const pc = payConfirm;
    if (!pc) return;
    setPayConfirm(null);
    localStorage.setItem(`tt_payment_initiated_${transactionId}`, String(Date.now()));
    setPaymentProcessing(true);
    const w = window.open(pc.link, '_blank');
    if (!w || w.closed || typeof w.closed === 'undefined') window.location.href = pc.link;
    toast.success('Secure payment page opened.');
  };

  const handleStartDelivery = async () => {
    if (!user?.phone_verified) {
      toast.info(PHONE_VERIFICATION_PROMPT);
      navigate('/verify/phone');
      return;
    }
    if (!window.confirm('Mark this item as dispatched/delivered?')) return;
    setStartingDelivery(true);
    try {
      await api.post(`${API}/tradesafe/start-delivery/${transactionId}`, {}, { withCredentials: true });
      setDispatchedLocally(true);
      setTransaction(prev => prev ? { ...prev, tradesafe_state: 'INITIATED', payment_status: 'Delivery in Progress', delivery_started_at: new Date().toISOString() } : prev);
      toast.success('Delivery marked — buyer has been notified.');
      await fetchData();
    }
    catch (error) { toast.error(parseErrorMessage(error) || 'Failed to start delivery.'); }
    finally { setStartingDelivery(false); }
  };

  const handleManualStartDelivery = async () => {
    if (!user?.phone_verified) {
      toast.info(PHONE_VERIFICATION_PROMPT);
      navigate('/verify/phone');
      return;
    }
    if (!window.confirm('MANUAL OVERRIDE: Mark as dispatched?')) return;
    setStartingDelivery(true);
    try {
      await api.post(`${API}/tradesafe/manual-start-delivery/${transactionId}`, {}, { withCredentials: true });
      setDispatchedLocally(true);
      setTransaction(prev => prev ? { ...prev, tradesafe_state: 'INITIATED', payment_status: 'Delivery in Progress', delivery_started_at: new Date().toISOString() } : prev);
      toast.success('Delivery marked — buyer has been notified.');
      await fetchData();
    }
    catch (error) { toast.error(parseErrorMessage(error) || 'Failed to start delivery.'); }
    finally { setStartingDelivery(false); }
  };

  const checkPayoutReadiness = async () => {
    if (!transactionId) return;
    setCheckingPayoutReadiness(true);
    try { const response = await api.get(`${API}/tradesafe/payout-readiness/${transactionId}`, { withCredentials: true }); setPayoutReadiness(response.data); return response.data; }
    catch (error) { const fallback = { payout_ready: null, issues: ['Could not verify payout readiness'] }; setPayoutReadiness(fallback); return fallback; }
    finally { setCheckingPayoutReadiness(false); }
  };

  const handleAcceptDelivery = async () => {
    console.log('[CONFIRM_RECEIPT] clicked', { transactionId, tradesafe_state: transaction?.tradesafe_state, payment_status: transaction?.payment_status, delivery_confirmed: transaction?.delivery_confirmed, phone_verified: user?.phone_verified });
    if (!user?.phone_verified) {
      console.warn('[CONFIRM_RECEIPT] blocked: phone not verified — redirecting to /verify/phone');
      toast.info(PHONE_VERIFICATION_PROMPT);
      navigate('/verify/phone');
      return;
    }
    const readiness = payoutReadiness?.payout_ready ? payoutReadiness : await checkPayoutReadiness();
    console.log('[CONFIRM_RECEIPT] payout readiness', readiness);
    if (readiness && !readiness.payout_ready) {
      const issues = readiness.issues?.join(', ') || 'Unknown issue';
      console.warn('[CONFIRM_RECEIPT] blocked: payout not ready', issues);
      toast.warning(issues);
      return;
    }
    if (!window.confirm(`Confirm you have received the item? This will release funds to the seller. ${payoutSchedule.copy} This action cannot be undone.`)) {
      console.log('[CONFIRM_RECEIPT] cancelled at confirm dialog');
      return;
    }
    setAcceptingDelivery(true);
    try {
      console.log('[CONFIRM_RECEIPT] POST /tradesafe/accept-delivery', transactionId);
      const res = await api.post(`${API}/tradesafe/accept-delivery/${transactionId}`, {}, { withCredentials: true });
      console.log('[CONFIRM_RECEIPT] accept-delivery OK', res?.data);
      setDeliveryConfirmedLocally(true);
      setTransaction(prev => prev ? { ...prev, delivery_confirmed: true, tradesafe_state: 'FUNDS_RELEASED', payment_status: 'Payment processing' } : prev);
      toast.success(payoutSchedule.copy);
      fetchData();
    }
    catch (error) {
      console.error('[CONFIRM_RECEIPT] accept-delivery FAILED', { status: error.response?.status, detail: error.response?.data?.detail, error });
      if (error.response?.data?.detail === 'EMAIL_NOT_VERIFIED') { setEmailVerificationRequired(true); } else { toast.error(parseErrorMessage(error) || 'Failed to confirm delivery.'); }
    }
    finally { setAcceptingDelivery(false); }
  };

  const handleManualAcceptDelivery = async () => {
    if (!user?.phone_verified) {
      toast.info(PHONE_VERIFICATION_PROMPT);
      navigate('/verify/phone');
      return;
    }
    const readiness = payoutReadiness?.payout_ready ? payoutReadiness : await checkPayoutReadiness();
    if (readiness && !readiness.payout_ready) {
      const issues = readiness.issues?.join(', ') || 'Unknown issue';
      toast.warning(issues);
      return;
    }
    if (!window.confirm(`MANUAL OVERRIDE: Confirm receipt and release funds to seller? ${payoutSchedule.copy}`)) return;
    setAcceptingDelivery(true);
    try { await api.post(`${API}/tradesafe/manual-accept-delivery/${transactionId}`, {}, { withCredentials: true }); toast.success(payoutSchedule.copy); fetchData(); }
    catch (error) { if (error.response?.data?.detail === 'EMAIL_NOT_VERIFIED') { setEmailVerificationRequired(true); } else { toast.error(parseErrorMessage(error) || 'Failed to confirm delivery.'); } }
    finally { setAcceptingDelivery(false); }
  };

  const handleSubmitRating = async () => {
    if (rating === 0) { toast.error('Please select a rating'); return; }
    setSubmittingRating(true);
    try { await api.post(`${API}/transactions/${transactionId}/rate`, { rating, review: review.trim() || null }, { withCredentials: true }); toast.success('Rating submitted!'); fetchData(); }
    catch (error) { toast.error(parseErrorMessage(error) || 'Failed to submit rating'); }
    finally { setSubmittingRating(false); }
  };

  // Skip the review prompt — recorded server-side so it never shows again.
  const handleSkipReview = async () => {
    setReviewSkipped(true);
    try { await api.post(`${API}/transactions/${transactionId}/review`, { skipped: true }, { withCredentials: true }); }
    catch (e) { /* non-blocking: the prompt is already hidden for this session */ }
  };

  const StarRating = ({ value, onSelect, onHover, readOnly = false, size = 'w-8 h-8' }) => (
    <div style={{ display: 'flex', gap: 4 }}>
      {[1,2,3,4,5].map((star) => (
        <button key={star} type="button" disabled={readOnly}
          onClick={() => !readOnly && onSelect && onSelect(star)}
          onMouseEnter={() => !readOnly && onHover && onHover(star)}
          onMouseLeave={() => !readOnly && onHover && onHover(0)}
          data-testid={`star-${star}`}
          style={{ background: 'none', border: 'none', cursor: readOnly ? 'default' : 'pointer', padding: 2, transition: 'transform 0.1s', transform: 'scale(1)' }}
        >
          <Star style={{ width: 24, height: 24, fill: star <= (readOnly ? value : (hoverRating || value)) ? '#fbbf24' : 'none', color: star <= (readOnly ? value : (hoverRating || value)) ? '#fbbf24' : '#475569' }} />
        </button>
      ))}
    </div>
  );

  const getEscrowStateBadge = (state) => {
    const variants = { 'CREATED': { bg: '#334155', text: '#94A3B8', label: 'Created' }, 'PENDING': { bg: 'rgba(245,158,11,0.14)', text: '#FBBF24', label: 'Pending' }, 'FUNDS_RECEIVED': { bg: 'rgba(16,185,129,0.14)', text: '#6EE7B7', label: 'Funds Secured' }, 'INITIATED': { bg: 'rgba(139,92,246,0.14)', text: '#C4B5FD', label: 'Delivery Started' }, 'SENT': { bg: 'rgba(59,130,246,0.14)', text: '#60A5FA', label: 'Item Sent' }, 'DELIVERED': { bg: 'rgba(245,158,11,0.14)', text: '#FBBF24', label: 'Awaiting Confirmation' }, 'FUNDS_RELEASED': { bg: 'rgba(16,185,129,0.14)', text: '#6EE7B7', label: 'Funds Released' }, 'EXPIRED': { bg: '#334155', text: '#94A3B8', label: 'Expired' }, 'DISPUTED': { bg: 'rgba(239,68,68,0.14)', text: '#F87171', label: 'Disputed' }, 'CANCELLED': { bg: 'rgba(239,68,68,0.14)', text: '#F87171', label: 'Cancelled' } };
    return variants[state] || { bg: '#334155', text: '#94A3B8', label: state };
  };

  const mapPaymentStatusToState = (paymentStatus, tradesafeState) => {
    const ps = (paymentStatus || '').toLowerCase(); const ts = (tradesafeState || '').toUpperCase();
    if (ps.includes('expired') || ts === 'EXPIRED') return 'EXPIRED';
    if (ts === 'FUNDS_RELEASED' || ps.includes('completed') || ps.includes('released')) return 'COMPLETED';
    if (ts === 'DELIVERED' || ps.includes('delivered')) return 'DELIVERED';
    if (ts === 'INITIATED' || ts === 'SENT' || ps.includes('delivery') || ps.includes('dispatched')) return 'DELIVERY_IN_PROGRESS';
    if (ts === 'FUNDS_RECEIVED' || ps.includes('escrow') || ps.includes('secured') || ps === 'paid') return 'PAYMENT_SECURED';
    if (ps.includes('awaiting') || ts === 'CREATED' || ts === 'PENDING') return 'AWAITING_PAYMENT';
    if (ps.includes('pending') || ps.includes('confirmation')) return 'PENDING_CONFIRMATION';
    if (ps.includes('dispute')) return 'DISPUTED';
    if (ps.includes('cancel')) return 'CANCELLED';
    if (ps.includes('refund')) return 'REFUNDED';
    return 'CREATED';
  };

  const getFeePayerLabel = (feeAllocation) => {
    if (!feeAllocation) return 'Seller pays fee';
    switch(feeAllocation.toUpperCase()) {
      case 'BUYER_AGENT': case 'BUYER': return 'Buyer pays fee';
      case 'SELLER_AGENT': case 'SELLER': return 'Seller pays fee';
      case 'SPLIT_AGENT': case 'BUYER_SELLER_AGENT': case 'SPLIT': return 'Fee split 50/50';
      default: return 'Seller pays fee';
    }
  };

  // ── Shared styles ──────────────────────────────────────────────────
  const S = {
    card: { background: '#243147', borderRadius: 14, border: '1px solid #334155', boxShadow: '0 1px 3px rgba(0,0,0,0.4)', overflow: 'hidden' },
    label: { fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' },
    sectionTitle: { fontSize: 15, fontWeight: 600, color: '#F8FAFC', margin: 0 },
    divider: { height: 1, background: '#334155', margin: '12px 0' },
    pill: (bg, color) => ({ display: 'inline-block', fontSize: 11, fontWeight: 500, padding: '2px 9px', borderRadius: 20, background: bg, color }),
    actionCard: (accent, bg) => ({
      background: bg, border: `1px solid ${accent}33`, borderLeft: `3px solid ${accent}`,
      borderRadius: 14, padding: '20px 22px',
      boxShadow: `0 2px 12px ${accent}11`,
    }),
    btn: (bg, color = '#fff') => ({
      display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 20px',
      borderRadius: 9, border: 'none', background: bg, color, fontSize: 13, fontWeight: 600,
      cursor: 'pointer', transition: 'opacity 0.15s', whiteSpace: 'nowrap',
    }),
    btnOutline: { display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 9, border: '1px solid #334155', background: '#1E293B', color: '#94A3B8', fontSize: 13, fontWeight: 500, cursor: 'pointer' },
    infoRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid #0F172A' },
  };

  // ── Loading ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0F172A' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 36, height: 36, border: '3px solid #10b981', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
          <p style={{ fontSize: 13, color: '#94A3B8' }}>Loading transaction…</p>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      </div>
    );
  }

  // ── Phone verification ──────────────────────────────────────────────
  if (needsPhoneVerification) {
    return (
      <DashboardLayout user={user}>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <div style={{ maxWidth: 440, margin: '40px auto', padding: '0 16px' }}>
          <div style={{ ...S.card, padding: '36px 32px' }}>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(59,130,246,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                <Phone size={24} color="#3b82f6" />
              </div>
              <h1 style={{ fontSize: 20, fontWeight: 700, color: '#F8FAFC', margin: '0 0 8px' }}>Verify Your Phone</h1>
              <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>This transaction was sent to a phone number. Verify to access it.</p>
            </div>

            {phoneVerificationContext && (
              <div style={{ background: '#0F172A', border: '1px solid #334155', borderRadius: 10, padding: '14px 16px', marginBottom: 20 }}>
                {phoneVerificationContext.itemDescription && <div style={S.infoRow}><span style={{ fontSize: 12, color: '#94a3b8' }}>Item</span><span style={{ fontSize: 13, fontWeight: 500, color: '#F8FAFC' }}>{phoneVerificationContext.itemDescription}</span></div>}
                {phoneVerificationContext.itemPrice > 0 && <div style={{ ...S.infoRow, borderBottom: 'none' }}><span style={{ fontSize: 12, color: '#94a3b8' }}>Amount</span><span style={{ fontSize: 14, fontWeight: 700, color: '#10b981' }}>R {phoneVerificationContext.itemPrice.toFixed(2)}</span></div>}
                {phoneVerificationContext.maskedPhone && <div style={{ paddingTop: 10, borderTop: '1px solid #334155', display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: 12, color: '#94a3b8' }}>Sent to</span><span style={{ fontSize: 13, fontFamily: 'monospace', fontWeight: 600, color: '#3b82f6' }}>{phoneVerificationContext.maskedPhone}</span></div>}
              </div>
            )}

            {verificationError && (
              <div style={{ background: 'rgba(239,68,68,0.14)', border: '1px solid rgba(239,68,68,0.30)', borderRadius: 10, padding: '12px 14px', marginBottom: 16, display: 'flex', gap: 10 }}>
                <AlertTriangle size={15} color="#ef4444" style={{ flexShrink: 0, marginTop: 1 }} />
                <p style={{ fontSize: 13, color: '#F87171', margin: 0 }}>{verificationError}</p>
              </div>
            )}
            {isLockedOut && (
              <div style={{ background: 'rgba(239,68,68,0.14)', border: '1px solid rgba(239,68,68,0.30)', borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
                <div style={{ display: 'flex', gap: 10 }}>
                  <Lock size={15} color="#ef4444" style={{ flexShrink: 0, marginTop: 1 }} />
                  <div><p style={{ fontSize: 13, fontWeight: 600, color: '#F87171', margin: '0 0 3px' }}>Account Temporarily Locked</p><p style={{ fontSize: 12, color: '#ef4444', margin: 0 }}>Try again in {lockoutMinutes} minutes.</p></div>
                </div>
              </div>
            )}

            {!otpSent ? (
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#E2E8F0', marginBottom: 8 }}>Phone Number</label>
                <div style={{ position: 'relative', marginBottom: 16 }}>
                  <Phone size={15} color="#94a3b8" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
                  <Input type="tel" placeholder="+27 82 123 4567" value={phoneNumber} onChange={(e) => { setPhoneNumber(e.target.value); if (verificationError?.includes("doesn't match")) setVerificationError(null); }} style={{ paddingLeft: 36 }} data-testid="phone-input" disabled={isLockedOut} />
                </div>
                {phoneVerificationContext?.maskedPhone && <p style={{ fontSize: 12, color: '#3b82f6', marginBottom: 16 }}>Enter the number matching: {phoneVerificationContext.maskedPhone}</p>}
                <button onClick={handleSendOtp} disabled={sendingOtp || !phoneNumber || isLockedOut} data-testid="send-otp-btn" style={{ ...S.btn('#3b82f6'), width: '100%', justifyContent: 'center', opacity: (sendingOtp || !phoneNumber || isLockedOut) ? 0.5 : 1 }}>
                  {sendingOtp ? <><Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> Sending…</> : isLockedOut ? `Locked — Try in ${lockoutMinutes}m` : 'Send Verification Code'}
                </button>
              </div>
            ) : (
              <div>
                <div style={{ background: 'rgba(16,185,129,0.14)', border: '1px solid rgba(16,185,129,0.30)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><CheckCircle2 size={14} color="#10b981" /><span style={{ fontSize: 13, color: '#6EE7B7' }}>Code sent to <strong>{phoneNumber}</strong></span></div>
                  <span style={{ fontSize: 12, color: '#34D399' }}>Expires {otpExpiresIn}m</span>
                </div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#E2E8F0', marginBottom: 8 }}>Verification Code</label>
                <Input type="text" placeholder="000000" value={otpCode} onChange={(e) => { setOtpCode(e.target.value.replace(/\D/g,'').slice(0,6)); if (verificationError?.includes('attempts')) setVerificationError(null); }} style={{ textAlign: 'center', fontSize: 22, letterSpacing: '0.3em', fontFamily: 'monospace', marginBottom: 4 }} maxLength={6} data-testid="otp-input" disabled={isLockedOut} />
                <p style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center', marginBottom: 16 }}>Code expires in {otpExpiresIn} minutes</p>
                {remainingVerifyAttempts < 5 && <p style={{ fontSize: 12, color: '#f59e0b', textAlign: 'center', marginBottom: 12 }}>{remainingVerifyAttempts} attempts remaining</p>}
                <button onClick={handleVerifyOtp} disabled={verifyingOtp || otpCode.length !== 6 || isLockedOut} data-testid="verify-otp-btn" style={{ ...S.btn('#10b981'), width: '100%', justifyContent: 'center', opacity: (verifyingOtp || otpCode.length !== 6 || isLockedOut) ? 0.5 : 1, marginBottom: 12 }}>
                  {verifyingOtp ? <><Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> Verifying…</> : isLockedOut ? `Locked — Try in ${lockoutMinutes}m` : 'Verify & Join Transaction'}
                </button>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <button onClick={() => { setOtpSent(false); setOtpCode(''); setVerificationError(null); }} disabled={isLockedOut} style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer' }}>Change number</button>
                  {resendCooldown > 0 ? <span style={{ color: '#94a3b8' }}>Resend in {resendCooldown}s</span> : remainingOtpRequests > 0 && !isLockedOut ? <button onClick={handleSendOtp} disabled={sendingOtp} style={{ background: 'none', border: 'none', color: '#3b82f6', fontWeight: 600, cursor: 'pointer' }}>Resend ({remainingOtpRequests} left)</button> : <span style={{ color: '#94a3b8', fontSize: 12 }}>No more requests</span>}
                </div>
              </div>
            )}

            <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid #334155' }}>
              <button onClick={() => navigate('/transactions')} style={{ ...S.btnOutline, width: '100%', justifyContent: 'center' }}>
                <ArrowLeft size={13} /> Back to My Transactions
              </button>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // ── Wrong account ───────────────────────────────────────────────────
  if (wrongAccount) {
    const handleLogout = async () => {
      try { await api.post('/auth/logout', {}, { withCredentials: true }); localStorage.removeItem('session_token'); window.location.href = '/login'; }
      catch (error) { window.location.href = '/login'; }
    };
    return (
      <DashboardLayout user={user}>
        <div style={{ maxWidth: 440, margin: '40px auto', padding: '0 16px' }}>
          <div style={{ ...S.card, padding: '36px 32px', textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(245,158,11,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
              <AlertTriangle size={24} color="#f59e0b" />
            </div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#F8FAFC', margin: '0 0 8px' }}>Wrong Account</h1>
            <p style={{ fontSize: 13, color: '#94A3B8', margin: '0 0 24px' }}>This transaction was sent to a different account.</p>
            <div style={{ background: '#0F172A', border: '1px solid #334155', borderRadius: 10, padding: '16px', textAlign: 'left', marginBottom: 20 }}>
              <div style={{ marginBottom: 12 }}><p style={{ ...S.label, marginBottom: 4 }}>Transaction sent to</p><p style={{ fontSize: 14, fontWeight: 600, color: '#F8FAFC', margin: 0 }}>{wrongAccount.expected}</p></div>
              <div style={{ paddingTop: 12, borderTop: '1px solid #334155' }}><p style={{ ...S.label, marginBottom: 4 }}>You are logged in as</p><p style={{ fontSize: 14, fontWeight: 600, color: '#F8FAFC', margin: 0 }}>{wrongAccount.current}</p></div>
            </div>
            <button onClick={handleLogout} style={{ ...S.btn('#3B82F6'), width: '100%', justifyContent: 'center', marginBottom: 10 }}>Log Out and Switch Account</button>
            <button onClick={() => navigate('/transactions')} style={{ ...S.btnOutline, width: '100%', justifyContent: 'center' }}>Continue as {wrongAccount.current?.split('@')[0]}</button>
            <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 14 }}>Log out and sign in with {wrongAccount.expected} to view this transaction.</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!transaction) return null;

  // ── Computed flags ──────────────────────────────────────────────────
  const isBuyer = user?.user_id === transaction.buyer_user_id || (user?.email && transaction.buyer_email && user.email.toLowerCase() === transaction.buyer_email.toLowerCase());
  const isSeller = user?.user_id === transaction.seller_user_id || (user?.email && transaction.seller_email && user.email.toLowerCase() === transaction.seller_email.toLowerCase());
  console.log('Role Detection:', { userEmail: user?.email, userId: user?.user_id, buyerEmail: transaction.buyer_email, buyerUserId: transaction.buyer_user_id, sellerEmail: transaction.seller_email, sellerUserId: transaction.seller_user_id, isBuyer, isSeller });

  // True when the seller can already receive payouts — don't nag them to "add banking
  // details". Accept any reliable signal: the backend's validated payout flag, the
  // completion flag, or a saved profile account (bank name + account number).
  const sellerHasBankingDetails = Boolean(
    user?.banking_account_valid ||
    user?.banking_details_completed ||
    (user?.banking_details?.bank_name && user?.banking_details?.account_number)
  );

  const hasEscrow = !!transaction.tradesafe_id;
  const escrowState = transaction.tradesafe_state;
  const buyerConfirmed = transaction.buyer_confirmed;
  const sellerConfirmed = transaction.seller_confirmed;
  const bothConfirmed = buyerConfirmed && sellerConfirmed;
  const uiState = resolveEscrowUiState(transaction);
  const flowType = getTransactionFlowType(transaction);
  const flowCopy = getFlowCopy(transaction);
  const transactionDisputes = [
    ...(Array.isArray(transaction.disputes) ? transaction.disputes : []),
    ...(transaction.dispute ? [transaction.dispute] : []),
  ];
  const activityEvents = buildTransactionActivity(transaction, {
    user,
    disputes: transactionDisputes,
    includeUpcoming: true,
    chronological: true,
  });
  const isDeliveryFlow = flowType === 'delivery';
  const isInstantFlow = flowType === 'instant';
  const isFinalized = ['COMPLETED', 'RELEASED'].includes(uiState.state);
  // One-time review prompt: show the rating form only until the user rates or skips.
  const reviewDismissed = reviewSkipped || (transaction.review_dismissed_by || []).includes(user?.user_id);
  const myRating = isBuyer ? transaction.buyer_rating : isSeller ? transaction.seller_rating : null;
  const counterpartyRating = isBuyer ? transaction.seller_rating : isSeller ? transaction.buyer_rating : null;
  const showReviewForm = isFinalized && (isBuyer || isSeller) && !myRating && !reviewDismissed;
  const showRatingCard = isFinalized && (myRating || counterpartyRating || showReviewForm);
  const isActionable = uiState.actionable && !uiState.terminal;
  const canBuyerConfirm = isActionable && isBuyer && !buyerConfirmed;
  const canSellerConfirm = isActionable && isSeller && !sellerConfirmed;
  const canFundEscrowSetup = isActionable && isBuyer && bothConfirmed && !hasEscrow && transaction.item_price >= 100;
  const sellerWaitingForBuyerFunding = isActionable && isSeller && bothConfirmed && !hasEscrow;
  const canMakePayment = isActionable && hasEscrow && isBuyer && !isSeller && bothConfirmed && (escrowState === 'CREATED' || escrowState === 'PENDING' || transaction.payment_status === 'Awaiting Payment');
  console.log('Payment Button Debug:', { hasEscrow, isBuyer, isSeller, escrowState, paymentStatus: transaction.payment_status, canMakePayment });
  const isAwaitingBuyerPayment = isActionable && hasEscrow && isSeller && !isBuyer && (escrowState === 'CREATED' || escrowState === 'PENDING' || transaction.payment_status === 'Awaiting Payment');
  const canStartDelivery = isActionable && !isInstantFlow && hasEscrow && isSeller &&
    ['FUNDS_RECEIVED', 'FUNDS_DEPOSITED'].includes(escrowState) && !transaction.delivery_confirmed;
  const deliveryMarkedStarted = !isInstantFlow && hasEscrow && isSeller && ['INITIATED', 'SENT', 'DELIVERED'].includes(escrowState) && !transaction.delivery_confirmed;
  const canManualStartDelivery = isActionable && !isInstantFlow && hasEscrow && isSeller &&
    (['Paid', 'Funds Secured'].includes(transaction.payment_status)) &&
    (['FUNDS_RECEIVED', 'FUNDS_DEPOSITED'].includes(escrowState)) &&
    !(['INITIATED', 'DELIVERED'].includes(escrowState));
  const canAcceptDeliveryTS = isActionable && !isInstantFlow && hasEscrow && isBuyer && ['INITIATED', 'SENT', 'DELIVERED'].includes(escrowState) && !transaction.delivery_confirmed;
  const canManualAcceptDelivery = isActionable && !isInstantFlow && hasEscrow && isBuyer && !transaction.delivery_confirmed && (transaction.payment_status === 'Delivery in Progress' || transaction.delivery_started_at || escrowState === 'INITIATED');
  const canConfirmDelivery = isActionable && isDeliveryFlow && !hasEscrow && isBuyer && !transaction.delivery_confirmed && transaction.payment_status === 'Paid';
  const canConfirmInstantRelease = isActionable && isInstantFlow && hasEscrow && isBuyer && escrowState === 'FUNDS_RECEIVED' && !transaction.delivery_confirmed;
  const buyerWaitingForSellerDispatch = !isInstantFlow && hasEscrow && isBuyer &&
    ['FUNDS_RECEIVED', 'FUNDS_DEPOSITED'].includes(escrowState) && !transaction.delivery_confirmed;
  const showPayoutTracker =
    transaction.payment_status === 'Bank settlement pending' ||
    transaction.payment_status === 'Payout Processing';
  const shareLink = transaction.share_code ? `${window.location.origin}/t/${transaction.share_code}` : null;
  const _fa = (transaction.fee_allocation || 'BUYER').toUpperCase();
  // Launch fee rule: courier delivery is a pass-through buyer cost, and the
  // TrustTrade fee is calculated on item value only.
  const courierDeliveryFee = Number(transaction.courier_fee || 0);
  const _courierTotal = courierDeliveryFee;
  const _ttFee = roundMoney(Math.max(Number(transaction.item_price || 0) * 0.02, 5));
  const { buyerFee: _buyerFee, sellerFee: _sellerFee } = splitTrustTradeFee(_ttFee, _fa);
  const totalSecurePayment = roundMoney(Number(transaction.item_price || 0) + _courierTotal + _buyerFee);
  const sellerReceivesAmount = roundMoney(Number(transaction.item_price || 0) - _sellerFee);
  const escrowBadge = getEscrowStateBadge(escrowState);
  const currentStatusLabel = uiState.label || escrowBadge.label || transaction.payment_status || 'Status pending';
  const currentStatusBg = uiState.bg || escrowBadge.bg || '#334155';
  const currentStatusColor = uiState.color || escrowBadge.text || '#94A3B8';
  const shareMessage = shareLink
    ? `I've created a secure TrustTrade protected payment for you. Click the link to view and confirm the transaction: ${shareLink}`
    : '';
  const whatsappShareHref = shareLink ? `https://wa.me/?text=${encodeURIComponent(shareMessage)}` : '';
  const fundsSecured = hasEscrow && (
    ['FUNDS_RECEIVED', 'FUNDS_DEPOSITED', 'INITIATED', 'SENT', 'DELIVERED', 'FUNDS_RELEASED'].includes(escrowState) ||
    ['Paid', 'Funds Secured', 'Delivery in Progress', 'Released'].includes(transaction.payment_status)
  );
  const nextStep = (() => {
    const base = {
      bg: 'rgba(59,130,246,0.14)',
      border: 'rgba(59,130,246,0.30)',
      color: '#60A5FA',
      titleColor: '#60A5FA',
      textColor: '#60A5FA',
      roleContext: isBuyer ? 'Buyer next step' : isSeller ? 'Seller next step' : 'Transaction status',
    };
    if (isFinalized) {
      return { ...base, bg: 'rgba(16,185,129,0.14)', border: 'rgba(16,185,129,0.30)', color: '#34D399', titleColor: '#6EE7B7', textColor: '#34D399', title: 'Funds released', description: payoutSchedule.shortCopy || 'Next payout release' };
    }
    if (isBuyer && (canFundEscrowSetup || canMakePayment)) {
      return { ...base, title: 'Your next step: Make payment', description: isDeliveryFlow ? 'Your payment is held securely until delivery is confirmed.' : 'Your payment is held securely until release conditions are met.' };
    }
    if (isSeller && (sellerWaitingForBuyerFunding || isAwaitingBuyerPayment)) {
      return { ...base, bg: 'rgba(245,158,11,0.14)', border: 'rgba(245,158,11,0.30)', color: '#FBBF24', titleColor: '#FBBF24', textColor: '#FBBF24', title: 'Waiting for buyer payment', description: 'Share this link with the buyer. You will be notified when funds are secured.' };
    }
    if (fundsSecured && isBuyer && !transaction.delivery_confirmed) {
      return { ...base, bg: 'rgba(16,185,129,0.14)', border: 'rgba(16,185,129,0.30)', color: '#34D399', titleColor: '#6EE7B7', textColor: '#34D399', title: 'Escrow funded', description: flowCopy.securedBuyer };
    }
    if (fundsSecured && isSeller && !transaction.delivery_confirmed) {
      return { ...base, bg: 'rgba(16,185,129,0.14)', border: 'rgba(16,185,129,0.30)', color: '#34D399', titleColor: '#6EE7B7', textColor: '#34D399', title: isDeliveryFlow ? 'Funds secured — deliver safely' : 'Funds secured in escrow', description: flowCopy.securedSeller };
    }
    return null;
  })();


  const handleCopyLink = async () => {
    if (!shareLink) return;
    try { await navigator.clipboard.writeText(shareLink); setCopied(true); toast.success('Link copied!'); setTimeout(() => setCopied(false), 2000); }
    catch (err) { toast.error('Failed to copy link'); }
  };

  const handleRefreshTracking = async () => {
    if (!transaction?.courier_waybill) return;
    setTrackingLoading(true);
    try {
      const res = await api.get(`/courier/track/${transaction.courier_waybill}`);
      setTrackingData(res.data);
      toast.success('Tracking updated');
    } catch {
      toast.error('Could not fetch tracking info');
    } finally {
      setTrackingLoading(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────
  return (
    <DashboardLayout user={user}>
      <PaymentConfirmModal
        open={!!payConfirm}
        amount={payConfirm?.total_value}
        processingFee={payConfirm?.processing_fee}
        onConfirm={confirmAndPay}
        onCancel={() => setPayConfirm(null)}
      />
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
        .td-tab{padding:9px 16px;border:none;background:transparent;font-size:13px;font-weight:500;color:#94A3B8;cursor:pointer;border-bottom:2px solid transparent;transition:all 0.15s}
        .td-tab.active{color:#F8FAFC;border-bottom-color:#F8FAFC;font-weight:600}
        .td-tab:hover{color:#F8FAFC}
        .pm-opt{border:1.5px solid #334155;borderRadius:12px;padding:14px 16px;cursor:pointer;transition:all 0.15s;background:#1E293B}
        .pm-opt:hover{border-color:#93c5fd}
        .pm-opt.selected{border-color:#3b82f6;background:rgba(59,130,246,0.14);box-shadow:0 0 0 3px rgba(59,130,246,0.08)}
        .action-btn:hover{opacity:0.88}
        .action-btn:active{opacity:0.75}
        html, body, #root { overflow-x: hidden; }
        .transaction-detail-shell { max-width: 1000px; width: 100%; min-width: 0; }
        .transaction-detail-grid { display: grid; grid-template-columns: minmax(0,1fr) minmax(260px,300px); gap: 20px; align-items: start; min-width: 0; }
        .transaction-detail-main, .transaction-detail-sidebar { min-width: 0; }
        .transaction-detail-sidebar { position: sticky; top: 80px; display: flex; flex-direction: column; gap: 14px; }
        .transaction-mobile-summary, .transaction-mobile-breakdown, .transaction-mobile-share { display: none; }
        .mobile-summary-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
        .mobile-summary-cell { min-width: 0; border: 1px solid #334155; background: #0F172A; border-radius: 9px; padding: 9px 10px; }
        .mobile-summary-value { display: block; margin-top: 3px; font-family: monospace; font-size: 13px; font-weight: 700; color: #F8FAFC; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .mobile-breakdown-row { display: flex; justify-content: space-between; gap: 12px; align-items: center; padding: 8px 0; border-bottom: 1px solid #334155; font-size: 13px; }
        .mobile-breakdown-total { margin-top: 10px; padding: 12px; border-radius: 10px; background: rgba(59,130,246,0.14); border: 1px solid rgba(59,130,246,0.30); display: flex; justify-content: space-between; gap: 12px; align-items: center; }
        .mobile-share-code-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; align-items: center; }
        @media (max-width: 768px) {
          .transaction-detail-shell { max-width: 100%; padding: 0 0 112px; }
          .transaction-detail-grid { grid-template-columns: minmax(0,1fr); gap: 16px; }
          .transaction-detail-sidebar { position: static; width: 100%; }
          .transaction-mobile-summary, .transaction-mobile-breakdown, .transaction-mobile-share { display: block; }
          .transaction-desktop-summary-card, .transaction-desktop-share-card, .transaction-desktop-parties-card { display: none !important; }
          .td-tab { padding: 9px 10px; font-size: 12px; white-space: nowrap; }
          /* Action buttons go full-width on mobile so they're always visible and tappable
             (an inline-flex/nowrap button could otherwise be clipped by overflow-x:hidden). */
          .action-btn { width: 100% !important; justify-content: center !important; white-space: normal !important; }
        }
        @media (max-width: 480px) {
          .transaction-detail-grid { gap: 14px; }
          .td-tab { padding: 8px 8px; font-size: 11px; }
          .pm-opt { padding: 12px 12px !important; }
          .td-parties-grid { grid-template-columns: 1fr !important; }
          .mobile-summary-grid { gap: 7px; }
          .mobile-summary-cell { padding: 8px 9px; }
          .mobile-summary-value { font-size: 12px; }
        }
      `}</style>

      <div className="transaction-detail-shell">
        {emailVerificationRequired && <EmailVerificationPrompt />}
        {/* Back */}
        <button onClick={() => navigate('/transactions')} data-testid="back-to-transactions-btn" style={{ ...S.btnOutline, marginBottom: 20 }}>
          <ArrowLeft size={13} /> Back
        </button>

        {/* Two-column */}
        <div className="transaction-detail-grid">

          {/* ── Left column ─────────────────────────────── */}
          <div className="transaction-detail-main" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            <CurrentStateHeader uiState={uiState} flowType={flowType} userRole={isBuyer ? 'buyer' : isSeller ? 'seller' : 'viewer'} paymentProcessing={paymentProcessing} />

            <div className="transaction-mobile-summary" style={{ ...S.card, padding: '12px 14px', border: '1px solid #334155' }}>
              <div className="mobile-summary-grid">
                {[
                  { label: 'Item value', value: `R ${Number(transaction.item_price || 0).toFixed(2)}` },
                  { label: 'Buyer pays total', value: `R ${totalSecurePayment.toFixed(2)}`, color: '#60A5FA' },
                  { label: 'Seller receives', value: `R ${sellerReceivesAmount.toFixed(2)}`, color: '#34D399' },
                ].map((row) => (
                  <div key={row.label} className="mobile-summary-cell">
                    <span style={{ ...S.label, fontSize: 10 }}>{row.label}</span>
                    <span className="mobile-summary-value" style={{ color: row.color || '#F8FAFC' }}>{row.value}</span>
                  </div>
                ))}
                <div className="mobile-summary-cell">
                  <span style={{ ...S.label, fontSize: 10 }}>Status</span>
                  <span
                    style={{
                      ...S.pill(currentStatusBg, currentStatusColor),
                      marginTop: 5,
                      maxWidth: '100%',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {currentStatusLabel}
                  </span>
                </div>
              </div>
            </div>

            <div className="transaction-mobile-breakdown" style={{ ...S.card, padding: '14px 16px', border: '1px solid rgba(59,130,246,0.14)' }}>
              <p style={{ ...S.label, marginBottom: 10 }}>Payment Breakdown</p>
              <div>
                {[
                  { label: 'Item price', value: `R ${Number(transaction.item_price || 0).toFixed(2)}` },
                  ...(courierDeliveryFee > 0 ? [{ label: 'Courier delivery fee', value: `R ${courierDeliveryFee.toFixed(2)}` }] : []),
                  { label: 'Buyer TrustTrade fee', value: `R ${_buyerFee.toFixed(2)}` },
                  { label: 'Seller TrustTrade fee', value: `R ${_sellerFee.toFixed(2)}` },
                ].map((row) => (
                  <div key={row.label} className="mobile-breakdown-row">
                    <span style={{ color: '#94A3B8' }}>{row.label}</span>
                    <span style={{ color: '#F8FAFC', fontWeight: 650, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{row.value}</span>
                  </div>
                ))}
              </div>
              <div className="mobile-breakdown-total">
                <span style={{ fontSize: 14, fontWeight: 800, color: '#60A5FA' }}>Buyer pays today</span>
                <span style={{ fontSize: 18, fontWeight: 900, color: '#60A5FA', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                  R {totalSecurePayment.toFixed(2)}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, paddingTop: 10, marginTop: 10, borderTop: '1px solid #334155', fontSize: 13 }}>
                <span style={{ color: '#94A3B8' }}>Seller receives</span>
                <span style={{ color: '#34D399', fontWeight: 800, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>R {sellerReceivesAmount.toFixed(2)}</span>
              </div>
              <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'flex-start', background: 'rgba(16,185,129,0.14)', border: '1px solid rgba(16,185,129,0.30)', borderRadius: 9, padding: '9px 10px' }}>
                <Shield size={14} color="#34D399" style={{ flexShrink: 0, marginTop: 1 }} />
                <p style={{ fontSize: 12, color: '#34D399', margin: 0, lineHeight: 1.45 }}>
                  Your money is held safely in escrow until delivery is confirmed.
                </p>
              </div>
            </div>

            {shareLink && (
              <div className="transaction-mobile-share" style={{ ...S.card, padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
                  <span style={S.label}>Share Code</span>
                  <Share2 size={12} color="#94a3b8" />
                </div>
                <div className="mobile-share-code-row">
                  <code style={{ minWidth: 0, fontSize: 13, fontFamily: 'monospace', fontWeight: 700, color: '#60A5FA', background: '#0F172A', padding: '8px 10px', borderRadius: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {transaction.share_code}
                  </code>
                  <button onClick={handleCopyLink} data-testid="copy-share-link-mobile-btn" style={{ ...S.btnOutline, padding: '8px 10px', flexShrink: 0 }}>
                    {copied ? <Check size={13} color="#10b981" /> : <Copy size={13} />}
                  </button>
                </div>
                <a
                  href={whatsappShareHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ marginTop: 8, background: '#25D366', color: 'white', padding: '9px 12px', display: 'inline-flex', width: '100%', alignItems: 'center', justifyContent: 'center', gap: 7, fontSize: 13, fontWeight: 700, borderRadius: 9, textDecoration: 'none' }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                  WhatsApp
                </a>
              </div>
            )}

            {/* Prominent "remind buyer to pay" — top of page, seller-only, only while waiting for payment. */}
            {(isAwaitingBuyerPayment || sellerWaitingForBuyerFunding) && shareLink && (() => {
              const buyerDisplayName = (transaction.buyer_name && transaction.buyer_name !== 'Pending')
                ? transaction.buyer_name
                : 'the buyer';
              const reminderText = `Hi ${buyerDisplayName}, just a reminder to complete payment for our TrustTrade-protected deal. Pay securely here: ${shareLink}`;
              return (
                <div style={{
                  background: 'linear-gradient(135deg, rgba(16,185,129,0.14) 0%, rgba(16,185,129,0.14) 100%)',
                  border: '1px solid #6ee7b7',
                  borderLeft: '4px solid #25D366',
                  borderRadius: 14,
                  padding: '16px 18px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: '#25D366', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 15, fontWeight: 700, color: '#6EE7B7', margin: '0 0 4px' }}>
                        Waiting for {buyerDisplayName} to pay
                      </p>
                      <p style={{ fontSize: 13, color: '#34D399', margin: 0, lineHeight: 1.5 }}>
                        Share the link via WhatsApp to remind them — funds are protected the moment they pay.
                      </p>
                    </div>
                  </div>
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(reminderText)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="remind-buyer-whatsapp-btn"
                    style={{
                      background: '#25D366',
                      color: 'white',
                      padding: '12px 16px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      fontSize: 14,
                      fontWeight: 700,
                      borderRadius: 10,
                      textDecoration: 'none',
                      boxShadow: '0 1px 3px rgba(37, 211, 102, 0.4)',
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                    Remind buyer to pay
                  </a>
                </div>
              );
            })()}

            {/* Step Progress */}
            <div style={{ ...S.card, padding: '18px 20px' }}>
              <StepProgressTracker transaction={transaction} />
            </div>

            <NextStepCard nextStep={nextStep} />

            {/* TrustTrade AI Check — quick warning banner for non-low risk */}
            {transaction.risk_level && transaction.risk_level !== 'low' && (
              <div style={{ ...S.actionCard(transaction.risk_level === 'high' ? '#ef4444' : '#f59e0b', transaction.risk_level === 'high' ? 'rgba(239,68,68,0.14)' : 'rgba(245,158,11,0.14)') }}>
                <div style={{ display: 'flex', gap: 10 }}>
                  <AlertTriangle size={16} color={transaction.risk_level === 'high' ? '#ef4444' : '#f59e0b'} style={{ flexShrink: 0, marginTop: 1 }} />
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 600, color: transaction.risk_level === 'high' ? '#F87171' : '#FBBF24', margin: '0 0 4px' }}>{transaction.risk_level === 'high' ? 'Proceed carefully' : 'Some things to check'}</p>
                    <p style={{ fontSize: 13, color: transaction.risk_level === 'high' ? '#F87171' : '#FBBF24', margin: 0 }}>Our AI spotted something worth a look. Take a moment to verify the other party before continuing.</p>
                  </div>
                </div>
              </div>
            )}

            {/* TrustTrade AI Check */}
            {!transaction.ai_fraud_analysis && !isFinalized && (
              <div style={{ background: '#0F172A', border: '1px solid #334155', borderRadius: 14, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <Loader2 size={14} color="#94a3b8" style={{ animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: '#94a3b8' }}>AI check in progress...</span>
              </div>
            )}
            {transaction.ai_fraud_analysis && (() => {
              const fa = transaction.ai_fraud_analysis;
              const riskPalette = {
                low:    { bg: 'rgba(16,185,129,0.14)', border: 'rgba(16,185,129,0.30)', heading: '#6EE7B7', badge: 'rgba(16,185,129,0.14)', badgeText: '#34D399' },
                medium: { bg: 'rgba(245,158,11,0.14)', border: 'rgba(245,158,11,0.30)', heading: '#FBBF24', badge: 'rgba(245,158,11,0.14)', badgeText: '#FBBF24' },
                high:   { bg: 'rgba(239,68,68,0.14)', border: 'rgba(239,68,68,0.30)', heading: '#F87171', badge: 'rgba(239,68,68,0.14)', badgeText: '#F87171' },
              };
              const riskLabel = {
                low:    'TrustTrade AI Check: Looks good ✓',
                medium: 'TrustTrade AI Check: Some things to check',
                high:   'TrustTrade AI Check: Proceed carefully',
              };
              const pal = riskPalette[fa.risk_level] || riskPalette.low;
              const label = riskLabel[fa.risk_level] || riskLabel.low;
              return (
                <div style={{
                  background: pal.bg, border: `1px solid ${pal.border}`,
                  borderLeft: `3px solid ${pal.badgeText}`, borderRadius: 14, padding: '16px 20px',
                }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: pal.heading, margin: '0 0 8px' }}>{label}</p>
                  {fa.summary && <p style={{ fontSize: 12, color: pal.heading, margin: '0 0 6px', lineHeight: 1.5 }}>{fa.summary}</p>}
                  {fa.flags && fa.flags.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
                      <span style={{ fontSize: 11, color: pal.heading, fontWeight: 500, width: '100%', marginBottom: 2 }}>Things to note:</span>
                      {fa.flags.map((f, i) => (
                        <span key={i} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: pal.badge, color: pal.badgeText, fontWeight: 500 }}>{f}</span>
                      ))}
                    </div>
                  )}
                  <p style={{ fontSize: 11, color: '#94a3b8', margin: '10px 0 0', lineHeight: 1.4 }}>
                    This is a guide, not a guarantee. Always use your own judgement.
                  </p>
                </div>
              );
            })()}

            {/* Confirmation status */}
            {!bothConfirmed && (
              <div style={{ ...S.card, padding: '18px 20px' }}>
                <p style={{ ...S.label, marginBottom: 12 }}>Confirmation Status</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {[{ name: transaction.buyer_name, role: 'Buyer', confirmed: buyerConfirmed, accent: '#3b82f6', bg: 'rgba(59,130,246,0.14)' }, { name: transaction.seller_name, role: 'Seller', confirmed: sellerConfirmed, accent: '#f97316', bg: 'rgba(245,158,11,0.14)' }].map(p => (
                    <div key={p.role} style={{ padding: '12px 14px', borderRadius: 10, background: p.confirmed ? 'rgba(16,185,129,0.14)' : '#0F172A', border: `1px solid ${p.confirmed ? 'rgba(16,185,129,0.30)' : '#334155'}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <div style={{ width: 26, height: 26, borderRadius: '50%', background: p.confirmed ? 'rgba(16,185,129,0.14)' : p.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <User size={12} color={p.confirmed ? '#10b981' : p.accent} />
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 500, color: '#94A3B8' }}>{p.role}</span>
                      </div>
                      <p style={{ fontSize: 13, fontWeight: 600, color: '#F8FAFC', margin: '0 0 6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</p>
                      <span style={{ ...S.pill(p.confirmed ? 'rgba(16,185,129,0.14)' : '#0F172A', p.confirmed ? '#34D399' : '#f59e0b'), fontSize: 10 }}>
                        {p.confirmed ? '✓ Confirmed' : 'Pending'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pre-release inspection countdown — shows the buyer (and seller) exactly
                when payment auto-releases, in plain English, after dispatch. */}
            <AutoReleaseCountdown transaction={transaction} isBuyer={isBuyer} isSeller={isSeller} />

            {isFinalized && (
              <>
                <FinalizedEscrowState transaction={transaction} uiState={uiState} payoutSchedule={payoutSchedule} />
                {showPayoutTracker
                  ? <PayoutTimelineTracker transaction={transaction} platformConfig={platformConfig} />
                  : <PayoutTimeline transaction={transaction} payoutSchedule={payoutSchedule} />
                }
              </>
            )}

            {!isFinalized && showPayoutTracker && (
              <PayoutTimelineTracker transaction={transaction} platformConfig={platformConfig} />
            )}

            {/* Seller preview: as soon as funds are in escrow ("Funds Secured" /
                "Payment Secured"), show an estimated payout date so the seller
                knows when to expect their money. Hidden once the post-release
                timeline takes over (isFinalized or showPayoutTracker). */}
            {isSeller && fundsSecured && !isFinalized && !showPayoutTracker && (
              <SellerExpectedPayoutCard transaction={transaction} platformConfig={platformConfig} />
            )}

            {/* Buyer confirm — hidden when the merged "Confirm & Release Payment"
                button is available (that single action confirms AND releases), so the
                buyer never sees two separate confirm buttons. */}
            {canBuyerConfirm && !canConfirmInstantRelease && (
              <div style={S.actionCard('#3b82f6', 'rgba(59,130,246,0.14)')}>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 9, background: 'rgba(59,130,246,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <CheckCircle2 size={18} color="#3b82f6" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: '#60A5FA', margin: '0 0 4px' }}>Action Required: Confirm Details</p>
                    <p style={{ fontSize: 13, color: '#3b82f6', margin: '0 0 14px' }}>Review the transaction details and confirm to proceed with protected payment.</p>
                    <button onClick={handleBuyerConfirm} disabled={confirming} data-testid="buyer-confirm-btn" className="action-btn" style={{ ...S.btn('#3b82f6'), opacity: confirming ? 0.6 : 1 }}>
                      {confirming ? <><Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> Confirming…</> : <><CheckCircle2 size={13} /> Confirm Transaction</>}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {isBuyer && !user?.phone_verified && (canFundEscrowSetup || canMakePayment || canAcceptDeliveryTS || canManualAcceptDelivery || canConfirmInstantRelease) && (
              <div style={S.actionCard('#3b82f6', 'rgba(59,130,246,0.14)')}>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 9, background: 'rgba(59,130,246,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Shield size={18} color="#3b82f6" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: '#60A5FA', margin: '0 0 4px' }}>{PHONE_VERIFICATION_PROMPT}</p>
                    <p style={{ fontSize: 13, color: '#60A5FA', margin: '0 0 14px' }}>Phone verification is required to continue with this transaction.</p>
                    <button onClick={() => navigate('/verify/phone')} className="action-btn" style={{ ...S.btn('#3b82f6') }}>
                      <Shield size={13} /> Verify Phone
                    </button>
                  </div>
                </div>
              </div>
            )}

            {isSeller && !sellerHasBankingDetails && (isFinalized || canStartDelivery || canManualStartDelivery || canAcceptDeliveryTS || canManualAcceptDelivery || canConfirmInstantRelease) && (
              <div style={S.actionCard('#f59e0b', 'rgba(245,158,11,0.14)')}>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 9, background: 'rgba(245,158,11,0.30)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Banknote size={18} color="#FBBF24" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: '#FBBF24', margin: '0 0 4px' }}>{BANKING_DETAILS_PROMPT}</p>
                    <p style={{ fontSize: 13, color: '#FBBF24', margin: '0 0 14px' }}>Add your banking details before funds are released so payouts can complete cleanly.</p>
                    <button onClick={() => navigate('/settings/banking')} className="action-btn" style={{ ...S.btn('#f59e0b') }}>
                      <Banknote size={13} /> Add banking details
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Seller confirm */}
            {canSellerConfirm && (
              <div style={S.actionCard('#f97316', 'rgba(245,158,11,0.14)')}>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 9, background: 'rgba(245,158,11,0.30)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <FileText size={18} color="#f97316" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: '#FBBF24', margin: '0 0 4px' }}>Action Required: Confirm Transaction</p>
                    <p style={{ fontSize: 13, color: '#FB923C', margin: '0 0 4px' }}>
                      {['SELLER_AGENT', 'SELLER'].includes(_fa) ? 'A 2% TrustTrade platform fee is deducted from your payout.' : ['BUYER_SELLER', 'SPLIT_AGENT', 'BUYER_SELLER_AGENT', 'SPLIT'].includes(_fa) ? 'The 2% TrustTrade platform fee is split — half from buyer, half deducted from your payout.' : 'A 2% TrustTrade platform fee is included in the buyer\'s payment. You receive the full item value.'} {BANKING_DETAILS_PROMPT}
                    </p>
                    <p style={{ fontSize: 13, fontWeight: 600, color: '#FBBF24', margin: '0 0 14px' }}>You'll receive R {sellerReceivesAmount.toFixed(2)}</p>
                    {profileIncompleteError && (
                      <div style={{ background: 'rgba(239,68,68,0.14)', border: '1px solid rgba(239,68,68,0.30)', borderRadius: 8, padding: '12px 14px', marginBottom: 14 }}>
                        <p style={{ fontSize: 13, fontWeight: 600, color: '#F87171', margin: '0 0 4px' }}>Complete your profile first</p>
                        <p style={{ fontSize: 12, color: '#ef4444', margin: '0 0 8px' }}>{profileIncompleteError}</p>
                        <div style={{ display: 'flex', gap: 10 }}>
                          <Link to="/verify/phone" style={{ fontSize: 12, color: '#F87171', fontWeight: 600 }}>Verify phone</Link>
                          <Link to="/settings/banking" style={{ fontSize: 12, color: '#F87171', fontWeight: 600 }}>Add banking details</Link>
                        </div>
                      </div>
                    )}
                    <button onClick={handleSellerConfirm} disabled={sellerConfirming} data-testid="seller-confirm-btn" className="action-btn" style={{ ...S.btn('#f97316'), opacity: sellerConfirming ? 0.6 : 1 }}>
                      {sellerConfirming ? <><Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> Confirming…</> : <><CheckCircle2 size={13} /> Confirm Fee Agreement</>}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Buyer fund escrow setup */}
            {canFundEscrowSetup && (
              <div style={S.actionCard('#10b981', 'rgba(16,185,129,0.14)')}>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 9, background: 'rgba(16,185,129,0.30)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Shield size={18} color="#34D399" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: '#6EE7B7', margin: '0 0 4px' }}>Your next step: Secure the payment</p>
                    <p style={{ fontSize: 13, color: '#34D399', margin: '0 0 14px' }}>{isDeliveryFlow ? 'Your payment is held safely and only released to the seller once you confirm delivery.' : 'Your payment is held safely and only released once all conditions are met.'}</p>
                    <button type="button" onClick={handleCreateEscrow} onTouchEnd={handleCreateEscrow} disabled={creatingEscrow} data-testid="create-escrow-btn" className="action-btn" style={{ ...S.btn('#10b981'), opacity: creatingEscrow ? 0.6 : 1 }}>
                      {creatingEscrow ? <><Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> Setting up protection...</> : <><Shield size={13} /> Set Up Protected Payment</>}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Seller waiting for buyer funding setup */}
            {sellerWaitingForBuyerFunding && (
              <div style={S.actionCard('#f59e0b', 'rgba(245,158,11,0.14)')}>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 9, background: 'rgba(245,158,11,0.30)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <CreditCard size={18} color="#FBBF24" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: '#FBBF24', margin: '0 0 4px' }}>Waiting for buyer to pay</p>
                    <p style={{ fontSize: 13, color: '#FBBF24', margin: '0 0 14px' }}>Share this link with the buyer. Your payout is guaranteed once payment is secured.</p>
                    <button type="button" onClick={handleCopyLink} className="action-btn" style={{ ...S.btn('#f59e0b'), opacity: 1 }}>
                      {copied ? <><Check size={13} /> Link copied</> : <><Copy size={13} /> Copy buyer link</>}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Make payment */}
            {/* Bug 2: buyer just paid — show processing state with active polling + manual refresh */}
            {paymentInfo?.eft_details && !fundsSecured && (
              <div style={{ ...S.card, padding: '22px 24px', marginBottom: 16, border: '1px solid rgba(59,130,246,0.30)' }} data-testid="eft-details-card">
                <p style={{ fontSize: 16, fontWeight: 700, color: '#F8FAFC', margin: '0 0 4px' }}>🏦 Pay via EFT bank transfer</p>
                <p style={{ fontSize: 13, color: '#94A3B8', margin: '0 0 16px' }}>{paymentInfo.eft_details.instructions}</p>
                {[
                  ['Bank', paymentInfo.eft_details.bank],
                  ['Account name', paymentInfo.eft_details.account_name],
                  ['Account number', paymentInfo.eft_details.account_number],
                  ['Branch code', paymentInfo.eft_details.branch_code],
                  ['Reference', paymentInfo.eft_details.reference],
                  ['Amount to pay', `R ${Number(paymentInfo.eft_details.amount ?? totalSecurePayment).toFixed(2)}`],
                ].map(([label, value]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #334155' }}>
                    <span style={{ fontSize: 12, color: '#94A3B8' }}>{label}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#F8FAFC', fontFamily: 'ui-monospace, monospace' }}>{value || '—'}</span>
                      {value && <button type="button" onClick={() => { navigator.clipboard.writeText(String(value)); toast.success('Copied'); }} style={{ fontSize: 11, color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Copy</button>}
                    </span>
                  </div>
                ))}
                <p style={{ fontSize: 12, color: '#FBBF24', background: 'rgba(245,158,11,0.14)', border: '1px solid rgba(245,158,11,0.30)', borderRadius: 8, padding: '10px 12px', marginTop: 14 }}>
                  Use the reference <strong>exactly as shown</strong>. Your transaction stays in <strong>Awaiting Payment</strong> until funds are confirmed (1–2 business days).
                </p>
              </div>
            )}

            {paymentProcessing && (
              <div style={S.actionCard('#3b82f6', 'rgba(59,130,246,0.14)')}>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 9, background: 'rgba(59,130,246,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Loader2 size={18} color="#3b82f6" style={{ animation: 'spin 0.8s linear infinite' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: '#60A5FA', margin: '0 0 4px' }}>Payment processing…</p>
                    <p style={{ fontSize: 13, color: '#60A5FA', margin: '0 0 14px' }}>Your payment is being confirmed, this usually takes less than a minute.</p>
                    <button type="button" onClick={handleSyncStatus} disabled={syncing} data-testid="refresh-status-btn" className="action-btn" style={{ ...S.btn('#3b82f6'), opacity: syncing ? 0.6 : 1 }}>
                      {syncing ? <><Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> Refreshing…</> : <><RefreshCw size={13} /> Refresh Status</>}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {canMakePayment && !paymentProcessing && (
              <div style={{ ...S.card, padding: '22px 24px' }}>
                <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 9, background: 'rgba(59,130,246,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <CreditCard size={18} color="#3b82f6" />
                  </div>
                  <div>
                    <p style={{ fontSize: 16, fontWeight: 700, color: '#F8FAFC', margin: '0 0 3px' }}>Secure Payment</p>
                    <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>{isDeliveryFlow ? 'Your payment is protected — seller receives funds only after you confirm delivery.' : 'Your payment is protected — seller receives funds only after release conditions are met.'}</p>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
                  {[
                    { id: 'eft', emoji: '🏦', label: 'EFT Bank Transfer', desc: 'Direct bank transfer', badge: 'Recommended', badgeColor: '#10b981', feeNote: 'No extra bank fee' },
                    { id: 'card', emoji: '💳', label: 'Credit / Debit Card', desc: 'Pay instantly with Visa or Mastercard', feeNote: '+2.5% bank processing fee' },
                    { id: 'ozow', emoji: '⚡', label: 'Ozow Instant EFT', desc: 'Fast instant payment from your bank app', feeNote: '+1.7% bank processing fee' },
                  ].map(pm => {
                    return (
                    <div key={pm.id} onClick={() => setSelectedPaymentMethod(pm.id)} data-testid={`payment-method-${pm.id}`} className={`pm-opt${selectedPaymentMethod === pm.id ? ' selected' : ''}`} style={{ border: `1.5px solid ${selectedPaymentMethod === pm.id ? '#3b82f6' : '#334155'}`, borderRadius: 12, padding: '14px 16px', cursor: 'pointer', transition: 'all 0.15s', background: selectedPaymentMethod === pm.id ? 'rgba(59,130,246,0.14)' : '#0F172A' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 20, height: 20, borderRadius: '50%', border: `2px solid ${selectedPaymentMethod === pm.id ? '#3b82f6' : '#475569'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {selectedPaymentMethod === pm.id && <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#3b82f6' }} />}
                        </div>
                        <span style={{ fontSize: 20 }}>{pm.emoji}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                            <span style={{ fontSize: 14, fontWeight: 600, color: '#F8FAFC' }}>{pm.label}</span>
                            {pm.badge && <span style={{ fontSize: 10, fontWeight: 700, background: 'rgba(16,185,129,0.14)', color: '#34D399', padding: '1px 7px', borderRadius: 20 }}>{pm.badge}</span>}
                          </div>
                          <span style={{ fontSize: 12, color: '#94A3B8', display: 'block' }}>{pm.desc}</span>
                          {pm.feeNote && <span style={{ fontSize: 11, color: '#64748B', display: 'block', marginTop: 2 }}>{pm.feeNote}</span>}
                        </div>
                      </div>
                    </div>
                    );
                  })}
                </div>

                {/* Price summary — item + TrustTrade fee (+ courier). The Total updates per
                    selected method with the ESTIMATED bank fee; the exact amount is confirmed
                    from TradeSafe in the modal right before paying. */}
                {(() => {
                  // Estimated bank processing fee per method (exact is confirmed at pay).
                  const PM_FEE_PCT = { eft: 0, card: 2.5, ozow: 1.7 };
                  const feePct = selectedPaymentMethod ? (PM_FEE_PCT[selectedPaymentMethod] ?? 0) : 0;
                  const estFee = Math.round(totalSecurePayment * (feePct / 100) * 100) / 100;
                  const estTotal = Math.round((totalSecurePayment + estFee) * 100) / 100;
                  return (
                    <div style={{ background: '#0F172A', border: '1px solid #334155', borderRadius: 12, padding: '16px 18px', marginBottom: 18 }}>
                      <p style={{ ...S.label, marginBottom: 12 }}>Payment Breakdown</p>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                        <span style={{ color: '#94A3B8' }}>Item Value (held securely)</span>
                        <span style={{ fontWeight: 500, color: '#F8FAFC' }}>R {transaction.item_price?.toFixed(2)}</span>
                      </div>
                      {_buyerFee > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                          <span style={{ color: '#94A3B8' }}>TrustTrade Platform Fee{['BUYER_SELLER','SPLIT_AGENT','BUYER_SELLER_AGENT','SPLIT'].includes(_fa) ? ' (2% split — your half)' : ' (2%)'}</span>
                          <span style={{ fontWeight: 500, color: '#F8FAFC' }}>R {_buyerFee?.toFixed(2)}</span>
                        </div>
                      )}
                      {_courierTotal > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                          <span style={{ color: '#94A3B8' }}>Courier Delivery</span>
                          <span style={{ fontWeight: 500, color: '#F8FAFC' }}>R {_courierTotal.toFixed(2)}</span>
                        </div>
                      )}
                      {feePct > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                          <span style={{ color: '#94A3B8' }}>Bank processing fee ({feePct}% est.)</span>
                          <span style={{ fontWeight: 500, color: '#F8FAFC' }}>R {estFee.toFixed(2)}</span>
                        </div>
                      )}
                      <div style={{ borderTop: '1px solid #334155', paddingTop: 10, marginTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: '#F8FAFC' }}>Total{feePct > 0 ? ' (est.)' : ''}</span>
                        <span style={{ fontSize: 16, fontWeight: 700, color: '#10b981' }}>R {estTotal.toFixed(2)}</span>
                      </div>
                      <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 8, lineHeight: 1.5 }}>
                        {feePct > 0
                          ? 'Estimated total — the exact bank fee is confirmed before you pay.'
                          : 'No extra bank fee for EFT.'}
                        {' '}{['SELLER_AGENT','SELLER'].includes(_fa) ? 'TrustTrade 2% fee is deducted from the seller\'s payout.' : ['BUYER_SELLER','SPLIT_AGENT','BUYER_SELLER_AGENT','SPLIT'].includes(_fa) ? 'TrustTrade 2% fee is split — half from buyer, half from seller.' : 'TrustTrade 2% platform fee is included. Seller receives the full item value.'}
                      </p>
                    </div>
                  );
                })()}

                <button type="button" onClick={handleGetPaymentLink} onTouchEnd={(e) => { e.preventDefault(); handleGetPaymentLink(e); }} disabled={loadingPaymentLink || !selectedPaymentMethod} data-testid="make-payment-btn" className="action-btn" style={{ ...S.btn(selectedPaymentMethod ? '#3b82f6' : '#94a3b8'), width: '100%', justifyContent: 'center', fontSize: 15, padding: '13px 20px', opacity: (loadingPaymentLink || !selectedPaymentMethod) ? 0.7 : 1 }}>
                  {loadingPaymentLink ? <><Loader2 size={15} style={{ animation: 'spin 0.8s linear infinite' }} /> Loading Payment Page...</> : selectedPaymentMethod ? <><CreditCard size={15} /> Pay Securely</> : <><CreditCard size={15} style={{ opacity: 0.5 }} /> Select a payment method</>}
                </button>
                <p style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center', marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                  <Shield size={11} /> Your payment is protected by TrustTrade
                </p>
              </div>
            )}

            {/* Seller awaiting payment — manual refresh fallback. The prominent
                WhatsApp reminder lives at the top of the page; this block just
                gives sellers a way to force a status refresh if they're impatient. */}
            {isAwaitingBuyerPayment && (() => {
              const buyerDisplayName = (transaction.buyer_name && transaction.buyer_name !== 'Pending')
                ? transaction.buyer_name
                : 'the buyer';
              return (
                <div style={S.actionCard('#f59e0b', 'rgba(245,158,11,0.14)')}>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <div style={{ width: 38, height: 38, borderRadius: 9, background: 'rgba(245,158,11,0.30)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <CreditCard size={18} color="#FBBF24" />
                    </div>
                    <div>
                      <p style={{ fontSize: 14, fontWeight: 600, color: '#FBBF24', margin: '0 0 4px' }}>Waiting for {buyerDisplayName} to pay</p>
                      <p style={{ fontSize: 13, color: '#FBBF24', margin: '0 0 10px' }}>This status updates automatically when payment clears. Use the WhatsApp reminder above to nudge them.</p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: '#FBBF24', marginBottom: 12 }}>
                        <Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> Waiting for buyer to pay...
                      </div>
                      <button type="button" onClick={handleSyncStatus} disabled={syncing} data-testid="refresh-status-btn-seller" className="action-btn" style={{ ...S.btn('#FBBF24'), opacity: syncing ? 0.6 : 1 }}>
                        {syncing ? <><Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> Refreshing…</> : <><RefreshCw size={13} /> Refresh Status</>}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Seller transaction complete success screen */}
            {isSeller && (isFinalized || deliveryConfirmedLocally) && (() => {
              const sellerAmount = sellerReceivesAmount;
              const fmtAmount = `R ${Number(sellerAmount).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
              return (
                <div style={{ ...S.actionCard('#10b981', 'rgba(16,185,129,0.14)'), padding: '20px 20px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 10 }}>
                    <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(16,185,129,0.30)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <CheckCircle2 size={28} color="#34D399" />
                    </div>
                    <p style={{ fontSize: 18, fontWeight: 700, color: '#6EE7B7', margin: 0 }}>Transaction Complete!</p>
                    <p style={{ fontSize: 14, color: '#34D399', margin: 0 }}>Your payment of <strong>{fmtAmount}</strong> is being processed by TrustTrade.</p>
                    <p style={{ fontSize: 13, color: '#34D399', background: 'rgba(16,185,129,0.14)', borderRadius: 8, padding: '8px 14px', margin: 0 }}>{payoutSchedule.copy}</p>
                  </div>
                </div>
              );
            })()}

            {/* Seller delivery success state */}
            {!isFinalized && !deliveryConfirmedLocally && (deliveryMarkedStarted || dispatchedLocally) && (
              <div style={S.actionCard('#10b981', 'rgba(16,185,129,0.14)')}>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 9, background: 'rgba(16,185,129,0.30)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <CheckCircle2 size={18} color="#34D399" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <p style={{ fontSize: 14, fontWeight: 600, color: '#6EE7B7', margin: 0 }}>Dispatched ✅</p>
                    </div>
                    <p style={{ fontSize: 13, color: '#34D399', margin: 0 }}>Delivery marked — buyer has been notified. Waiting for their confirmation.</p>
                  </div>
                </div>
              </div>
            )}

            {/* Seller start delivery */}
            {canStartDelivery && !dispatchedLocally && (
              <div style={S.actionCard('#8b5cf6', 'rgba(139,92,246,0.14)')}>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 9, background: 'rgba(139,92,246,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Truck size={18} color="#C4B5FD" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: '#C4B5FD', margin: '0 0 4px' }}>Funds Secured — Deliver Item</p>
                    <p style={{ fontSize: 13, color: '#C4B5FD', margin: '0 0 14px' }}>Payment received and held securely. Deliver the item to the buyer and mark as dispatched.</p>
                    <button onClick={handleStartDelivery} disabled={startingDelivery} data-testid="start-delivery-btn" className="action-btn" style={{ ...S.btn('#8b5cf6'), opacity: startingDelivery ? 0.6 : 1 }}>
                      {startingDelivery ? <><Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> Processing…</> : <><Truck size={13} /> Mark as Dispatched</>}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Manual start delivery */}
            {!canStartDelivery && canManualStartDelivery && !transaction.delivery_started_at && !dispatchedLocally && (
              <div style={S.actionCard('#f59e0b', 'rgba(245,158,11,0.14)')}>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 9, background: 'rgba(245,158,11,0.30)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Truck size={18} color="#FBBF24" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: '#FBBF24', margin: '0 0 4px' }}>Mark as Dispatched</p>
                    <p style={{ fontSize: 13, color: '#FBBF24', margin: '0 0 4px' }}>Payment appears received. Click to mark as dispatched.</p>
                    <p style={{ fontSize: 12, color: '#FBBF24', background: 'rgba(245,158,11,0.14)', padding: '6px 10px', borderRadius: 6, margin: '0 0 14px' }}><strong>Note:</strong> Use this if the normal flow isn't showing buttons correctly.</p>
                    <button onClick={handleManualStartDelivery} disabled={startingDelivery} data-testid="manual-start-delivery-btn" className="action-btn" style={{ ...S.btn('#f59e0b'), opacity: startingDelivery ? 0.6 : 1 }}>
                      {startingDelivery ? <><Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> Processing…</> : <><Truck size={13} /> Mark as Dispatched</>}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Buyer waiting for seller to dispatch */}
            {buyerWaitingForSellerDispatch && (() => {
              const dm = transaction.delivery_method;
              const heading = dm === 'bank_deposit'
                ? 'Waiting for seller to confirm handover'
                : dm === 'digital' || dm === 'instant' || dm === 'immediate'
                  ? 'Waiting for seller to deliver'
                  : 'Waiting for seller to dispatch';
              const body = dm === 'bank_deposit'
                ? 'Your payment is secured. The seller will confirm when the handover is arranged.'
                : dm === 'digital' || dm === 'instant' || dm === 'immediate'
                  ? 'Your payment is secured. The seller has been notified to deliver your item digitally.'
                  : 'Your payment is secured. The seller has been notified to dispatch your item.';
              const status = dm === 'bank_deposit'
                ? 'Awaiting seller handover confirmation...'
                : dm === 'digital' || dm === 'instant' || dm === 'immediate'
                  ? 'Awaiting digital delivery...'
                  : 'Awaiting seller dispatch...';
              return (
              <div style={S.actionCard('#f59e0b', 'rgba(245,158,11,0.14)')}>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 9, background: 'rgba(245,158,11,0.30)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Truck size={18} color="#FBBF24" />
                  </div>
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 600, color: '#FBBF24', margin: '0 0 4px' }}>{heading}</p>
                    <p style={{ fontSize: 13, color: '#FBBF24', margin: '0 0 10px' }}>{body}</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: '#FBBF24' }}>
                      <Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> {status}
                    </div>
                  </div>
                </div>
              </div>
              );
            })()}

            {/* Buyer accept delivery */}
            {canAcceptDeliveryTS && (
              <div style={S.actionCard('#10b981', 'rgba(16,185,129,0.14)')}>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 9, background: 'rgba(16,185,129,0.30)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <CheckCircle2 size={18} color="#34D399" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: '#6EE7B7', margin: '0 0 4px' }}>Confirm receipt</p>
                    <p style={{ fontSize: 13, color: '#34D399', margin: '0 0 4px' }}>Seller has dispatched. Confirm when you've received the item.</p>
                    <p style={{ fontSize: 12, color: '#34D399', background: 'rgba(16,185,129,0.14)', padding: '6px 10px', borderRadius: 6, margin: '0 0 14px' }}><strong>Important:</strong> Only confirm if satisfied. This cannot be undone.</p>
                    {payoutReadiness && !payoutReadiness.payout_ready && (
                      <div style={{ background: 'rgba(245,158,11,0.14)', border: '1px solid rgba(245,158,11,0.30)', borderRadius: 8, padding: '10px 12px', marginBottom: 12 }}>
                        <p style={{ fontSize: 13, fontWeight: 600, color: '#FBBF24', margin: '0 0 3px' }}>Seller Payout Setup Incomplete</p>
                        <p style={{ fontSize: 12, color: '#FBBF24', margin: 0 }}>{payoutReadiness.issues?.join('. ') || 'Seller must complete payout setup.'}</p>
                        {payoutReadiness.can_auto_sync && <p style={{ fontSize: 12, color: '#FBBF24', margin: '4px 0 0' }}>The system will attempt to sync automatically when you confirm.</p>}
                      </div>
                    )}
                    {checkingPayoutReadiness && <p style={{ fontSize: 12, color: '#94A3B8', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}><Loader2 size={12} style={{ animation: 'spin 0.8s linear infinite' }} /> Checking payout readiness…</p>}
                    <button onClick={handleAcceptDelivery} disabled={acceptingDelivery || checkingPayoutReadiness} data-testid="accept-delivery-btn" className="action-btn" style={{ ...S.btn('#10b981'), opacity: (acceptingDelivery || checkingPayoutReadiness) ? 0.6 : 1 }}>
                      {acceptingDelivery ? <><Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> Processing…</> : <><CheckCircle2 size={13} /> Confirm receipt</>}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Manual accept delivery */}
            {!canAcceptDeliveryTS && canManualAcceptDelivery && !transaction.delivery_confirmed && (
              <div style={S.actionCard('#10b981', 'rgba(16,185,129,0.14)')}>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 9, background: 'rgba(16,185,129,0.30)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <CheckCircle2 size={18} color="#34D399" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: '#6EE7B7', margin: '0 0 4px' }}>Confirm receipt</p>
                    <p style={{ fontSize: 13, color: '#34D399', margin: '0 0 14px' }}>{payoutSchedule.copy}</p>
                    {payoutReadiness && !payoutReadiness.payout_ready && (
                      <div style={{ background: 'rgba(245,158,11,0.14)', border: '1px solid rgba(245,158,11,0.30)', borderRadius: 8, padding: '10px 12px', marginBottom: 12 }}>
                        <p style={{ fontSize: 12, color: '#FBBF24', margin: 0 }}>{payoutReadiness.issues?.join('. ') || 'Seller must complete payout setup.'}</p>
                      </div>
                    )}
                    <button onClick={handleManualAcceptDelivery} disabled={acceptingDelivery || checkingPayoutReadiness} data-testid="manual-accept-delivery-btn" className="action-btn" style={{ ...S.btn('#10b981'), opacity: (acceptingDelivery || checkingPayoutReadiness) ? 0.6 : 1 }}>
                      {acceptingDelivery ? <><Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> Processing…</> : <><CheckCircle2 size={13} /> Confirm receipt</>}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Instant release — buyer confirms satisfaction and releases funds */}
            {canConfirmInstantRelease && (
              <div style={S.actionCard('#10b981', 'rgba(16,185,129,0.14)')}>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 9, background: 'rgba(16,185,129,0.30)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <CheckCircle2 size={18} color="#34D399" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 14, fontWeight: 700, color: '#6EE7B7', margin: '0 0 4px' }}>Confirm & Release Payment</p>
                    <p style={{ fontSize: 13, color: '#34D399', margin: '0 0 4px' }}>Your funds are secured in escrow. Once you confirm you are happy with what you received, the payment is released to the seller.</p>
                    <p style={{ fontSize: 12, color: '#34D399', background: 'rgba(16,185,129,0.14)', padding: '6px 10px', borderRadius: 6, margin: '0 0 14px' }}><strong>Important:</strong> Only confirm if you are satisfied. This cannot be undone.</p>
                    {payoutReadiness && !payoutReadiness.payout_ready && (
                      <div style={{ background: 'rgba(245,158,11,0.14)', border: '1px solid rgba(245,158,11,0.30)', borderRadius: 8, padding: '10px 12px', marginBottom: 12 }}>
                        <p style={{ fontSize: 13, fontWeight: 600, color: '#FBBF24', margin: '0 0 3px' }}>Seller Payout Setup Incomplete</p>
                        <p style={{ fontSize: 12, color: '#FBBF24', margin: 0 }}>{payoutReadiness.issues?.join('. ') || 'Seller must complete payout setup before funds can be released.'}</p>
                        {payoutReadiness.can_auto_sync && <p style={{ fontSize: 12, color: '#FBBF24', margin: '4px 0 0' }}>The system will attempt to sync automatically when you confirm.</p>}
                      </div>
                    )}
                    {checkingPayoutReadiness && <p style={{ fontSize: 12, color: '#94A3B8', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}><Loader2 size={12} style={{ animation: 'spin 0.8s linear infinite' }} /> Checking payout readiness…</p>}
                    <button onClick={handleConfirmInstantRelease} disabled={acceptingDelivery || checkingPayoutReadiness} data-testid="confirm-instant-release-btn" className="action-btn" style={{ ...S.btn('#10b981'), opacity: (acceptingDelivery || checkingPayoutReadiness) ? 0.6 : 1 }}>
                      {acceptingDelivery ? <><Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> Processing…</> : <><CheckCircle2 size={13} /> Confirm & Release Payment</>}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Legacy status hints */}
            {isActionable && !hasEscrow && sellerConfirmed && transaction.payment_status === 'Ready for Payment' && (
              <div style={S.actionCard('#3b82f6', 'rgba(59,130,246,0.14)')}>
                <p style={{ fontSize: 14, fontWeight: 600, color: '#60A5FA', margin: '0 0 4px' }}>Awaiting Payment</p>
                <p style={{ fontSize: 13, color: '#3b82f6', margin: 0 }}>{isBuyer ? 'Make payment to the escrow account.' : 'Waiting for buyer payment.'}</p>
              </div>
            )}
            {isActionable && !hasEscrow && transaction.payment_status === 'Paid' && !transaction.delivery_confirmed && (
              <div style={S.actionCard('#f59e0b', 'rgba(245,158,11,0.14)')}>
                <p style={{ fontSize: 14, fontWeight: 600, color: '#FBBF24', margin: '0 0 4px' }}>Payment Received — Awaiting Delivery</p>
                <p style={{ fontSize: 13, color: '#FBBF24', margin: 0 }}>{isSeller ? 'Deliver the item. Funds release from escrow after buyer confirmation.' : 'Payment held in escrow. Confirm delivery once received.'}</p>
              </div>
            )}

            {/* Tabs */}
            <div style={S.card}>
              <div style={{ display: 'flex', borderBottom: '1px solid #334155', padding: '0 8px' }}>
                {['overview', 'agreement', 'timeline', 'photos'].map(tab => (
                  <button key={tab} className={`td-tab${activeTab === tab ? ' active' : ''}`} onClick={() => setActiveTab(tab)}>
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </button>
                ))}
              </div>

              <div style={{ padding: '20px 22px' }}>
                {/* Overview tab */}
                {activeTab === 'overview' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div className="td-parties-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                      {[
                        { title: 'Buyer', icon: User, color: '#3b82f6', bg: 'rgba(59,130,246,0.14)', name: transaction.buyer_name, email: transaction.buyer_email, phone: transaction.buyer_phone, confirmed: buyerConfirmed, trust: transaction.buyer_trust },
                        { title: 'Seller', icon: User, color: '#f97316', bg: 'rgba(245,158,11,0.14)', name: transaction.seller_name, email: transaction.seller_email, phone: transaction.seller_phone, confirmed: sellerConfirmed, trust: transaction.seller_trust },
                      ].map(p => (
                        <div key={p.title} style={{ background: '#0F172A', borderRadius: 10, padding: '14px 16px', border: '1px solid #334155' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                            <div style={{ width: 28, height: 28, borderRadius: '50%', background: p.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <p.icon size={13} color={p.color} />
                            </div>
                            <span style={{ fontSize: 13, fontWeight: 600, color: '#F8FAFC' }}>{p.title}</span>
                            {p.confirmed && <CheckCircle2 size={13} color="#10b981" style={{ marginLeft: 'auto' }} />}
                          </div>
                          <p style={{ fontSize: 14, fontWeight: 600, color: '#F8FAFC', margin: '0 0 4px' }}>{p.name}</p>
                          {p.trust && (
                            <p style={{ fontSize: 12, fontWeight: 600, color: '#F8FAFC', margin: '0 0 4px' }}
                               title="Trust score · completed trades · valid disputes">
                              {p.trust.trust_score} trust · {p.trust.total_trades} {p.trust.total_trades === 1 ? 'trade' : 'trades'} · {p.trust.disputes} {p.trust.disputes === 1 ? 'dispute' : 'disputes'}
                            </p>
                          )}
                          {p.email && <p style={{ fontSize: 12, color: '#94A3B8', margin: 0 }}>{p.email}</p>}
                          {p.phone && <p style={{ fontSize: 12, color: '#94A3B8', margin: '2px 0 0', fontFamily: 'monospace' }}>{p.phone}</p>}
                          {transaction.invite_type === 'phone' && !p.email && !p.phone && <p style={{ fontSize: 12, color: '#3b82f6', margin: '2px 0 0' }}>Invited via phone</p>}
                        </div>
                      ))}
                    </div>

                    <div style={{ background: '#0F172A', borderRadius: 10, padding: '14px 16px', border: '1px solid #334155' }}>
                      <p style={{ ...S.label, marginBottom: 12 }}>Item Details</p>
                      <p style={{ fontSize: 14, color: '#E2E8F0', margin: '0 0 10px', lineHeight: 1.6 }}>{transaction.item_description}</p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {transaction.item_condition && <span style={S.pill('#334155', '#94A3B8')}>{transaction.item_condition}</span>}
                        {transaction.delivery_method && (
                          <span style={S.pill('rgba(59,130,246,0.14)', '#60A5FA')}>
                            {transaction.delivery_method === 'courier' ? 'Courier' : transaction.delivery_method === 'bank_deposit' ? 'Bank Deposit' : 'Digital'}
                          </span>
                        )}
                      </div>
                      {transaction.days_to_deliver != null && transaction.days_to_deliver !== '' && (
                        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 13, color: '#94A3B8' }}>Days to deliver</span>
                          <span style={{ fontSize: 13, fontWeight: 600, color: '#F8FAFC' }}>{transaction.days_to_deliver} {Number(transaction.days_to_deliver) === 1 ? 'day' : 'days'}</span>
                        </div>
                      )}
                      {transaction.known_issues && transaction.known_issues !== 'None' && (
                        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #334155' }}>
                          <p style={{ ...S.label, marginBottom: 4 }}>Known Issues</p>
                          <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>{transaction.known_issues}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Agreement tab */}
                {activeTab === 'agreement' && (
                  <div>
                    <p style={{ ...S.sectionTitle, marginBottom: 14 }}>Escrow Agreement</p>
                    {sellerConfirmed ? (
                      <div>
                        <p style={{ fontSize: 13, color: '#94A3B8', marginBottom: 14 }}>The escrow agreement has been generated and is available for download.</p>
                        <button onClick={handleDownloadPDF} data-testid="download-agreement-btn" style={{ ...S.btn('#3B82F6'), display: 'inline-flex' }}>
                          <Download size={13} /> Download Agreement (PDF)
                        </button>
                      </div>
                    ) : (
                      <p style={{ fontSize: 13, color: '#94a3b8' }}>Agreement will be available once the seller confirms the transaction details.</p>
                    )}
                  </div>
                )}

                {/* Timeline tab */}
                {activeTab === 'timeline' && (
                  <div>
                    <p style={{ ...S.sectionTitle, marginBottom: 20 }}>Transaction Progress</p>
                    <TransactionTimeline transaction={transaction} currentState={mapEscrowUiStateToTimelineState(uiState) || transaction.transaction_state || mapPaymentStatusToState(transaction.payment_status, transaction.tradesafe_state)} timeline={transaction.timeline} />
                    <div style={{ marginTop: 24 }}>
                      <p style={{ ...S.sectionTitle, marginBottom: 12 }}>Transaction Activity</p>
                      <TransactionActivityFeed events={activityEvents} />
                    </div>
                    {uiState.state === 'DELIVERED' && (
                      <div style={{ marginTop: 20, padding: '12px 16px', borderRadius: 8, backgroundColor: 'rgba(26,115,232,0.08)' }}>
                        <p style={{ margin: 0, fontSize: 13, color: '#60A5FA', fontWeight: 500 }}>
                          {isDeliveryFlow
                            ? `Funds release from escrow when buyer confirms receipt. ${payoutSchedule.copy}`
                            : `Funds release from escrow when release conditions are met. ${payoutSchedule.copy}`}
                        </p>
                      </div>
                    )}
                    <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid #334155' }}>
                      <p style={{ ...S.label, marginBottom: 12 }}>Event History</p>
                      <Timeline transaction={transaction} />
                    </div>
                  </div>
                )}

                {/* Photos tab */}
                {activeTab === 'photos' && (
                  <div>
                    <p style={{ ...S.sectionTitle, marginBottom: 16 }}>Item Photos</p>
                    {transaction.item_photos && transaction.item_photos.length > 0 ? (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
                        {transaction.item_photos.map((photo, index) => {
                          const isUrl = typeof photo === 'string' && photo.startsWith('http');
                          // Legacy photos saved as a bare filename live on Railway's
                          // ephemeral disk and no longer exist — show a clear placeholder
                          // instead of a broken image.
                          if (!isUrl) {
                            return (
                              <div key={index} style={{ borderRadius: 10, aspectRatio: '1', background: '#0F172A', border: '1px solid #334155', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 8, textAlign: 'center' }}>
                                <ImageIcon size={22} color="#475569" />
                                <span style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.4 }}>Photo no longer available</span>
                              </div>
                            );
                          }
                          return (
                            <div key={index} onClick={() => window.open(photo, '_blank')} style={{ borderRadius: 10, overflow: 'hidden', cursor: 'pointer', position: 'relative', aspectRatio: '1', background: '#334155' }}>
                              <img src={photo} alt={`Photo ${index + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                onError={(e) => { e.target.onerror = null; e.target.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect fill="%23243147" width="200" height="200"/><text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="%2394a3b8" font-size="13">Photo unavailable</text></svg>'; }} />
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div style={{ textAlign: 'center', padding: '40px 0' }}>
                        <ImageIcon size={36} color="#475569" style={{ marginBottom: 10 }} />
                        <p style={{ fontSize: 14, color: '#94a3b8' }}>No photos uploaded</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Legacy confirm delivery */}
            {canConfirmDelivery && (
              <div style={S.actionCard('#10b981', 'rgba(16,185,129,0.14)')}>
                <p style={{ fontSize: 15, fontWeight: 700, color: '#6EE7B7', margin: '0 0 6px' }}>Final Step: Confirm Delivery</p>
                <p style={{ fontSize: 13, color: '#34D399', margin: '0 0 14px' }}>{`Have you received the item and are satisfied? Confirming releases funds from escrow. ${payoutSchedule.copy} This cannot be undone.`}</p>
                <button onClick={handleConfirmDelivery} disabled={confirming} data-testid="confirm-delivery-btn" className="action-btn" style={{ ...S.btn('#10b981'), opacity: confirming ? 0.6 : 1 }}>
                  {confirming ? <><Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> Processing…</> : 'Confirm Delivery'}
                </button>
              </div>
            )}

            {/* Rating */}
            {showRatingCard && (
              <div style={{ ...S.card, padding: '22px 24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                  <Star size={16} color="#fbbf24" fill="#fbbf24" />
                  <p style={S.sectionTitle}>Rate This Transaction</p>
                </div>
                {isBuyer && transaction.buyer_rating ? (
                  <div><p style={{ fontSize: 13, color: '#94A3B8', marginBottom: 8 }}>Your rating for the seller:</p><StarRating value={transaction.buyer_rating} readOnly size="w-6 h-6" />{transaction.buyer_review && <p style={{ fontSize: 13, color: '#94A3B8', fontStyle: 'italic', marginTop: 8 }}>"{transaction.buyer_review}"</p>}</div>
                ) : isSeller && transaction.seller_rating ? (
                  <div><p style={{ fontSize: 13, color: '#94A3B8', marginBottom: 8 }}>Your rating for the buyer:</p><StarRating value={transaction.seller_rating} readOnly size="w-6 h-6" />{transaction.seller_review && <p style={{ fontSize: 13, color: '#94A3B8', fontStyle: 'italic', marginTop: 8 }}>"{transaction.seller_review}"</p>}</div>
                ) : showReviewForm ? (
                  <div>
                    <p style={{ fontSize: 13, color: '#94A3B8', marginBottom: 12 }}>{isBuyer ? 'Rate your experience with the seller:' : 'Rate your experience with the buyer:'}</p>
                    <div style={{ marginBottom: 14 }}><StarRating value={rating} onSelect={setRating} onHover={setHoverRating} /></div>
                    <label style={{ display: 'block', fontSize: 13, color: '#94A3B8', marginBottom: 6 }}>Review (optional)</label>
                    <Textarea placeholder="Share your experience…" value={review} onChange={(e) => setReview(e.target.value)} rows={3} data-testid="review-textarea" style={{ marginBottom: 12 }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <button onClick={handleSubmitRating} disabled={submittingRating || rating === 0} data-testid="submit-rating-btn" className="action-btn" style={{ ...S.btn('#3B82F6'), opacity: (submittingRating || rating === 0) ? 0.5 : 1 }}>
                        {submittingRating ? 'Submitting…' : 'Submit Rating'}
                      </button>
                      <button onClick={handleSkipReview} data-testid="skip-rating-btn" style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: 13, fontWeight: 500, cursor: 'pointer', padding: '8px 4px' }}>
                        Skip
                      </button>
                    </div>
                  </div>
                ) : null}
                {isBuyer && transaction.seller_rating && <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #334155' }}><p style={{ fontSize: 13, color: '#94A3B8', marginBottom: 8 }}>Seller's rating for you:</p><StarRating value={transaction.seller_rating} readOnly size="w-5 h-5" />{transaction.seller_review && <p style={{ fontSize: 13, color: '#94A3B8', fontStyle: 'italic', marginTop: 6 }}>"{transaction.seller_review}"</p>}</div>}
                {isSeller && transaction.buyer_rating && <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #334155' }}><p style={{ fontSize: 13, color: '#94A3B8', marginBottom: 8 }}>Buyer's rating for you:</p><StarRating value={transaction.buyer_rating} readOnly size="w-5 h-5" />{transaction.buyer_review && <p style={{ fontSize: 13, color: '#94A3B8', fontStyle: 'italic', marginTop: 6 }}>"{transaction.buyer_review}"</p>}</div>}
              </div>
            )}

            {/* Courier Tracking */}
            {COURIER_ENABLED && transaction.courier_waybill && (
              <div style={{ ...S.card, padding: '18px 20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Truck size={15} color="#3b82f6" />
                    <p style={S.sectionTitle}>Courier Tracking</p>
                  </div>
                  <button
                    onClick={handleRefreshTracking}
                    disabled={trackingLoading}
                    data-testid="refresh-tracking-btn"
                    style={{ ...S.btnOutline, padding: '5px 12px', fontSize: 12 }}
                  >
                    {trackingLoading
                      ? <><Loader2 size={11} style={{ animation: 'spin 0.8s linear infinite' }} /> Refreshing…</>
                      : <><RefreshCw size={11} /> Refresh Tracking</>}
                  </button>
                </div>

                <div style={{ background: '#0F172A', borderRadius: 8, padding: '8px 12px', marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={S.label}>Waybill</span>
                  <code style={{ fontSize: 13, fontFamily: 'monospace', fontWeight: 600, color: '#3b82f6' }}>{transaction.courier_waybill}</code>
                </div>

                {transaction.courier_tracking_url && (
                  <a
                    href={transaction.courier_tracking_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: '#3b82f6', textDecoration: 'none', marginBottom: 14 }}
                  >
                    <Truck size={12} /> Track on Courier Guy &rarr;
                  </a>
                )}

                {trackingData ? (
                  <>
                    <div style={{ marginBottom: 14 }}>
                      <p style={{ ...S.label, marginBottom: 6 }}>Current Status</p>
                      <span style={{ ...S.pill('rgba(59,130,246,0.14)', '#60A5FA'), fontSize: 12, fontWeight: 600 }}>
                        {trackingData.status || 'In transit'}
                      </span>
                      {trackingData.timestamp && (
                        <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>
                          Last update: {new Date(trackingData.timestamp).toLocaleString()}
                        </p>
                      )}
                    </div>

                    {trackingData.events && trackingData.events.length > 0 && (
                      <div>
                        <p style={{ ...S.label, marginBottom: 10 }}>History</p>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          {trackingData.events.slice(0, 6).map((evt, i, arr) => (
                            <div key={i} style={{ display: 'flex', gap: 12 }}>
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 3 }}>
                                <div style={{ width: 8, height: 8, borderRadius: '50%', background: i === 0 ? '#3b82f6' : '#475569', flexShrink: 0 }} />
                                {i < arr.length - 1 && <div style={{ width: 2, flex: 1, minHeight: 18, background: '#334155', margin: '3px 0' }} />}
                              </div>
                              <div style={{ paddingBottom: 10 }}>
                                <p style={{ fontSize: 13, color: '#F8FAFC', margin: '0 0 2px', fontWeight: i === 0 ? 600 : 400 }}>
                                  {evt.status || evt.description || 'Update'}
                                </p>
                                <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>
                                  {evt.created_at || evt.timestamp ? new Date(evt.created_at || evt.timestamp).toLocaleString() : ''}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <p style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center', padding: '10px 0 2px' }}>
                    Click Refresh to load tracking information.
                  </p>
                )}
              </div>
            )}

            {/* Raise dispute */}
            {isActionable && !transaction.delivery_confirmed && sellerConfirmed && (
              <div style={{ ...S.card, padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>Having issues with this transaction?</p>
                <button onClick={() => navigate('/disputes-dashboard', { state: { transactionId: transaction.transaction_id } })} style={{ ...S.btnOutline, fontSize: 12 }}>
                  <FileText size={12} /> Raise Dispute
                </button>
              </div>
            )}
          </div>
          {/* END left column */}

          {/* ── Sticky sidebar ──────────────────────────── */}
          <div className="transaction-detail-sidebar">

            {/* Deal summary */}
            <div className="transaction-desktop-summary-card" style={{ ...S.card, padding: '18px 20px' }}>
              <p style={{ ...S.label, marginBottom: 14 }}>Deal Summary</p>
              <p style={{ fontSize: 14, fontWeight: 600, color: '#F8FAFC', margin: '0 0 4px', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{transaction.item_description}</p>
              {transaction.item_condition && <span style={{ ...S.pill('#334155', '#94A3B8'), fontSize: 10, marginBottom: 14, display: 'inline-block' }}>{transaction.item_condition}</span>}
              <div style={{ borderTop: '1px solid #334155', paddingTop: 12, marginTop: 12 }}>
                {[
                  { label: 'Item Value', value: `R ${transaction.item_price.toFixed(2)}` },
                  ...(courierDeliveryFee > 0 ? [{ label: 'Courier Delivery', value: `R ${courierDeliveryFee.toFixed(2)}`, color: '#94A3B8' }] : []),
                  { label: 'Buyer TrustTrade Fee', value: `R ${_buyerFee.toFixed(2)}`, color: '#94A3B8' },
                  { label: 'Seller TrustTrade Fee', value: `R ${_sellerFee.toFixed(2)}`, color: '#94A3B8' },
                  { label: 'Buyer Pays Total', value: `R ${totalSecurePayment.toFixed(2)}`, color: '#60A5FA' },
                ].map(r => (
                  <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                    <span style={{ color: '#94a3b8' }}>{r.label}</span>
                    <span style={{ fontFamily: 'monospace', fontWeight: 500, color: r.color || '#F8FAFC' }}>{r.value}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, borderTop: '1px solid #334155' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#F8FAFC' }}>Seller Receives</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#10b981', fontFamily: 'monospace' }}>R {sellerReceivesAmount.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Share link */}
            {shareLink && (
              <div className="transaction-desktop-share-card" style={{ ...S.card, padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={S.label}>Share Code</span>
                  <Share2 size={12} color="#94a3b8" />
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <code style={{ flex: 1, fontSize: 13, fontFamily: 'monospace', fontWeight: 600, color: '#3b82f6', background: '#0F172A', padding: '6px 10px', borderRadius: 7, overflow: 'hidden', textOverflow: 'ellipsis' }}>{transaction.share_code}</code>
                  <button onClick={handleCopyLink} data-testid="copy-share-link-btn" style={{ ...S.btnOutline, padding: '6px 10px', flexShrink: 0 }}>
                    {copied ? <Check size={13} color="#10b981" /> : <Copy size={13} />}
                  </button>
                  <a
                    href={whatsappShareHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ background: '#25D366', color: 'white', padding: '6px 10px', display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, borderRadius: 4, textDecoration: 'none', flexShrink: 0 }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                    WhatsApp
                  </a>
                </div>
              </div>
            )}

            {/* Parties */}
            <div className="transaction-desktop-parties-card" style={{ ...S.card, padding: '14px 16px' }}>
              <p style={{ ...S.label, marginBottom: 12 }}>Parties</p>
              {[
                { name: transaction.buyer_name, role: 'Buyer', phone: transaction.buyer_phone, confirmed: buyerConfirmed, color: '#3b82f6', bg: 'rgba(59,130,246,0.14)', trust: transaction.buyer_trust },
                { name: transaction.seller_name, role: 'Seller', phone: transaction.seller_phone, confirmed: sellerConfirmed, color: '#f97316', bg: 'rgba(245,158,11,0.14)', trust: transaction.seller_trust },
              ].map((p, i) => (
                <div key={p.role} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: i === 0 ? 10 : 0 }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: p.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <User size={14} color={p.color} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: '#F8FAFC', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</p>
                    <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>{p.role}{p.phone && ' · via phone'}</p>
                    {p.trust && (
                      <p style={{ fontSize: 11, fontWeight: 600, color: '#94A3B8', margin: '2px 0 0' }}
                         title="Trust score · completed trades · valid disputes">
                        {p.trust.trust_score} trust · {p.trust.total_trades} {p.trust.total_trades === 1 ? 'trade' : 'trades'} · {p.trust.disputes} {p.trust.disputes === 1 ? 'dispute' : 'disputes'}
                      </p>
                    )}
                  </div>
                  {p.confirmed && <CheckCircle2 size={14} color="#10b981" />}
                </div>
              ))}
            </div>

            {/* Refresh */}
            <button onClick={handleSyncStatus} disabled={syncing} data-testid="refresh-transaction-btn" style={{ ...S.btnOutline, width: '100%', justifyContent: 'center' }}>
              {syncing ? <><Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> Syncing…</> : <><RefreshCw size={13} /> Refresh Status</>}
            </button>

            {/* Protection badge */}
            {hasEscrow && (
              <div style={{ background: isFinalized ? 'rgba(16,185,129,0.14)' : 'rgba(16,185,129,0.14)', border: `1px solid ${isFinalized ? 'rgba(16,185,129,0.30)' : 'rgba(16,185,129,0.30)'}`, borderRadius: 12, padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                  <Shield size={13} color={isFinalized ? '#34D399' : '#34D399'} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: isFinalized ? '#34D399' : '#6EE7B7' }}>{isFinalized ? 'Payment Complete' : 'Payment Protected'}</span>
                </div>
                <p style={{ fontSize: 11, color: '#34D399', fontFamily: 'monospace', margin: '0 0 8px' }}>Ref: {transaction.tradesafe_id?.slice(0, 14)}…</p>
                <span style={{ ...S.pill(uiState.bg || getEscrowStateBadge(escrowState).bg, uiState.color || getEscrowStateBadge(escrowState).text), fontSize: 11 }}>
                  {uiState.label || getEscrowStateBadge(escrowState).label}
                </span>
              </div>
            )}

            {/* Trust signal strip */}
            {!isFinalized && (
              <div style={{ borderRadius: 10, border: '1px solid #334155', padding: '12px 14px', background: '#0F172A' }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 8px' }}>How you're protected</p>
                {[
                  { icon: Shield, text: 'Funds held securely until both parties confirm' },
                  { icon: CheckCircle2, text: 'Seller paid only after you confirm receipt' },
                  { icon: Lock, text: '256-bit encrypted payments' },
                ].map(({ icon: Icon, text }) => (
                  <div key={text} style={{ display: 'flex', alignItems: 'flex-start', gap: 7, marginBottom: 6 }}>
                    <Icon size={11} color="#10b981" style={{ marginTop: 1, flexShrink: 0 }} />
                    <span style={{ fontSize: 11, color: '#94A3B8', lineHeight: 1.4 }}>{text}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* END sidebar */}

        </div>
      </div>
    </DashboardLayout>
  );
}

export default TransactionDetail;
