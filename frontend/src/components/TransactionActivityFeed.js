import {
  Activity,
  AlertTriangle,
  Banknote,
  CheckCircle2,
  Circle,
  FileText,
  ShieldCheck,
  Truck,
  UserCheck,
} from 'lucide-react';
import { V } from './DashboardLayout';

const toneMap = {
  green: { color: '#3FB950', bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.32)' },
  blue: { color: '#38bdf8', bg: 'rgba(56,189,248,0.12)', border: 'rgba(56,189,248,0.32)' },
  amber: { color: '#D29922', bg: 'rgba(245,158,11,0.13)', border: 'rgba(245,158,11,0.34)' },
  red: { color: '#F85149', bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.34)' },
  slate: { color: '#8B949E', bg: 'rgba(148,163,184,0.1)', border: 'rgba(148,163,184,0.24)' },
};

const icons = {
  activity: Activity,
  alert: AlertTriangle,
  banknote: Banknote,
  check: CheckCircle2,
  file: FileText,
  shield: ShieldCheck,
  truck: Truck,
  user: UserCheck,
};

function formatActivityTime(value) {
  if (!value) return 'Pending';
  return new Date(value).toLocaleString('en-ZA', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusCopy(status) {
  if (status === 'completed') return 'Completed';
  if (status === 'current') return 'Current';
  return 'Upcoming';
}

export function ActivityEmptyState({ title = 'No recent activity', body = "You're all caught up" }) {
  return (
    <div style={{ minHeight: 150, display: 'grid', placeItems: 'center', textAlign: 'center', border: `1px solid ${V.border}`, background: 'rgba(255,255,255,0.025)', borderRadius: 8, padding: 20 }}>
      <div>
        <CheckCircle2 size={30} color={V.success} style={{ margin: '0 auto 10px' }} />
        <p style={{ margin: 0, color: V.text, fontWeight: 800 }}>{title}</p>
        <p style={{ margin: '5px 0 0', color: V.sub, fontSize: 12 }}>{body}</p>
      </div>
    </div>
  );
}

export function TransactionActivityFeed({ events, onOpenEvent, compact = false, showTransaction = false }) {
  if (!events?.length) return <ActivityEmptyState />;

  return (
    <div style={{ display: 'grid', gap: compact ? 8 : 10, minWidth: 0 }}>
      {events.map((event, index) => {
        const tone = toneMap[event.tone] || toneMap.slate;
        const Icon = icons[event.icon] || Activity;
        const isUpcoming = event.status === 'upcoming';
        const isCurrent = event.status === 'current';

        return (
          <button
            key={`${event.id}-${index}`}
            type="button"
            onClick={() => onOpenEvent?.(event)}
            className="tt-activity-row"
            style={{
              width: '100%',
              display: 'grid',
              gridTemplateColumns: compact ? '30px minmax(0,1fr)' : '38px minmax(0,1fr)',
              gap: compact ? 9 : 12,
              alignItems: 'start',
              border: `1px solid ${isCurrent ? tone.border : V.border}`,
              background: isCurrent ? tone.bg : 'rgba(255,255,255,0.025)',
              borderRadius: 8,
              padding: compact ? '10px 11px' : '12px 13px',
              color: 'inherit',
              textAlign: 'left',
              cursor: onOpenEvent ? 'pointer' : 'default',
              minWidth: 0,
              opacity: isUpcoming ? 0.72 : 1,
              transition: 'transform 0.16s ease, border-color 0.16s ease, background 0.16s ease',
            }}
          >
            <div style={{ position: 'relative', display: 'grid', placeItems: 'center' }}>
              <div style={{ width: compact ? 30 : 36, height: compact ? 30 : 36, display: 'grid', placeItems: 'center', borderRadius: '50%', border: `1px solid ${tone.border}`, background: tone.bg }}>
                {isUpcoming ? <Circle size={compact ? 14 : 16} color={tone.color} /> : <Icon size={compact ? 14 : 16} color={tone.color} />}
              </div>
              {isCurrent && (
                <span style={{ position: 'absolute', right: 0, top: 0, width: 8, height: 8, borderRadius: '50%', background: tone.color, boxShadow: `0 0 16px ${tone.color}` }} />
              )}
            </div>

            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', minWidth: 0 }}>
                <p style={{ margin: 0, color: V.text, fontSize: compact ? 12 : 13, fontWeight: 850, overflowWrap: 'anywhere' }}>
                  {event.title}
                </p>
                <span style={{ color: tone.color, background: tone.bg, border: `1px solid ${tone.border}`, borderRadius: 999, padding: '2px 6px', fontSize: 9, fontFamily: V.mono, fontWeight: 900, textTransform: 'uppercase' }}>
                  {statusCopy(event.status)}
                </span>
              </div>
              <p style={{ margin: '4px 0 0', color: V.sub, fontSize: compact ? 11 : 12, lineHeight: 1.45, overflowWrap: 'anywhere' }}>
                {event.detail}
              </p>
              {showTransaction && (
                <p style={{ margin: '5px 0 0', color: V.dim, fontSize: 10, fontFamily: V.mono, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {event.shareCode || event.transactionId || 'Transaction'} / {event.item}
                </p>
              )}
              {!compact && (
                <p style={{ margin: '5px 0 0', color: event.timestamp ? V.sub : V.dim, fontSize: 10, fontFamily: V.mono, fontWeight: 800 }}>
                  {formatActivityTime(event.timestamp)}
                </p>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

export default TransactionActivityFeed;
