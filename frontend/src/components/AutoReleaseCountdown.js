import { useState, useEffect } from 'react';
import { Clock, ShieldCheck, AlertTriangle } from 'lucide-react';

const API_BASE = process.env.REACT_APP_API_URL || 'https://trusttrade-backend-production-3efa.up.railway.app';

// Plain South African English, no jargon. Shows the buyer (and seller) exactly when
// the payment auto-releases, with a live countdown. Only renders after dispatch and
// before release.
export default function AutoReleaseCountdown({ transaction, isBuyer, isSeller }) {
  const [now, setNow] = useState(Date.now());
  const [reporting, setReporting] = useState(false);
  const [reported, setReported] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const dispatched = transaction.delivery_started_at || transaction.dispatched_at;
  const released = transaction.release_status === 'Released'
    || ['Released', 'Completed'].includes(transaction.payment_status);
  const blocked = transaction.has_dispute || transaction.buyer_reported_problem || reported;

  if (!dispatched || !transaction.auto_release_at || released || blocked) return null;

  const releaseAt = new Date(transaction.auto_release_at).getTime();
  const msLeft = releaseAt - now;
  if (Number.isNaN(releaseAt)) return null;

  const days = Math.floor(msLeft / 86400000);
  const hours = Math.floor((msLeft % 86400000) / 3600000);
  const minutes = Math.floor((msLeft % 3600000) / 60000);

  const dateLabel = new Date(releaseAt).toLocaleString('en-ZA', {
    timeZone: 'Africa/Johannesburg',
    weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const timeLabel = new Date(releaseAt).toLocaleString('en-ZA', {
    timeZone: 'Africa/Johannesburg', hour: '2-digit', minute: '2-digit', hour12: false,
  });

  // "tomorrow" / "today" / weekday for the seller line
  const sastKey = (ms) => new Date(ms).toLocaleDateString('en-ZA', { timeZone: 'Africa/Johannesburg' });
  let relDay = new Date(releaseAt).toLocaleDateString('en-ZA', { timeZone: 'Africa/Johannesburg', weekday: 'long' });
  if (sastKey(releaseAt) === sastKey(now)) relDay = 'today';
  else if (sastKey(releaseAt) === sastKey(now + 86400000)) relDay = 'tomorrow';

  const countdownText = msLeft <= 0
    ? 'Releasing now'
    : days >= 1
      ? `${days} day${days === 1 ? '' : 's'} left to inspect your order`
      : hours >= 1
        ? `${hours} hour${hours === 1 ? '' : 's'} left to inspect your order`
        : `${Math.max(1, minutes)} minute${minutes === 1 ? '' : 's'} left to inspect your order`;

  const urgent = msLeft > 0 && msLeft <= 3600000;      // ≤ 1 hour
  const soon = msLeft > 3600000 && msLeft <= 86400000; // ≤ 24 hours

  const reportProblem = async () => {
    const token = transaction.confirm_receipt_token;
    if (!token) return;
    setReporting(true);
    try {
      await fetch(`${API_BASE}/api/transactions/confirm/${token}/report`, { method: 'POST' });
      setReported(true);
    } catch (e) {
      // best-effort; the dispute flow remains available below
    } finally {
      setReporting(false);
    }
  };

  const accent = urgent ? '#dc2626' : soon ? '#f59e0b' : '#10b981';
  const bg = urgent ? '#fef2f2' : soon ? '#fffbeb' : '#f0fdf4';
  const border = urgent ? '#fecaca' : soon ? '#fde68a' : '#bbf7d0';

  return (
    <div style={{ background: bg, border: `1px solid ${border}`, borderLeft: `3px solid ${accent}`, borderRadius: 14, padding: '18px 20px', marginBottom: 14 }} data-testid="auto-release-countdown">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 12 }}>
        <p style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          {urgent ? <AlertTriangle size={16} color={accent} /> : isSeller ? <ShieldCheck size={16} color={accent} /> : <Clock size={16} color={accent} />}
          {isSeller ? 'Your payment is protected' : countdownText}
        </p>
        {msLeft > 0 && (
          <span style={{ background: '#fff', border: `1px solid ${border}`, borderRadius: 99, padding: '5px 12px', fontSize: 12, fontWeight: 700, color: accent, whiteSpace: 'nowrap' }}>
            {days >= 1 ? `${days}d ${hours}h` : hours >= 1 ? `${hours}h ${minutes}m` : `${minutes}m`}
          </span>
        )}
      </div>

      {isSeller ? (
        <p style={{ fontSize: 14, color: '#334155', margin: 0, lineHeight: 1.5 }}>
          If the buyer does nothing, you will be paid automatically on <strong>{dateLabel}</strong>.
          {relDay === 'tomorrow' && <> Payment releasing tomorrow at {timeLabel}.</>}
        </p>
      ) : urgent ? (
        <p style={{ fontSize: 14, color: '#334155', margin: 0, lineHeight: 1.5 }}>
          ⚠️ Payment releases in {minutes >= 1 ? `${minutes} minute${minutes === 1 ? '' : 's'}` : 'less than a minute'} — tap below if there is a problem.
        </p>
      ) : (
        <p style={{ fontSize: 14, color: '#334155', margin: 0, lineHeight: 1.5 }}>
          Your seller has shipped your order. You have time to report a problem. If you do nothing,
          payment is automatically sent to the seller on <strong>{dateLabel}</strong>.
        </p>
      )}

      {isBuyer && !isSeller && transaction.confirm_receipt_token && (
        <button
          onClick={reportProblem}
          disabled={reporting}
          style={{ marginTop: 12, background: '#fff', border: `1px solid ${urgent ? '#fca5a5' : '#cbd5e1'}`, color: urgent ? '#dc2626' : '#475569', borderRadius: 9, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
        >
          {reporting ? 'Reporting…' : 'There is a problem with my order'}
        </button>
      )}
    </div>
  );
}
