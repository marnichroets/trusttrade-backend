import { Lock } from 'lucide-react';

/**
 * Dark-themed in-page payment confirmation. Shows the EXACT amount TradeSafe will
 * charge (with the bank processing fee) before redirecting to the payment partner.
 *
 * Props:
 *   open          - whether to render
 *   amount        - exact total to charge (number)
 *   processingFee - bank fee portion (number|null) — subtitle hidden if absent/0
 *   onConfirm     - called when the user confirms (redirect to the gateway)
 *   onCancel      - called to dismiss
 */
export default function PaymentConfirmModal({ open, amount, processingFee, onConfirm, onCancel }) {
  if (!open) return null;
  const fmt = v => `R${Number(v || 0).toFixed(2)}`;
  const fee = processingFee != null ? Number(processingFee) : null;
  const hasFee = fee != null && fee > 0;

  return (
    <div
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(2,6,23,0.72)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        backdropFilter: 'blur(2px)',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        style={{
          width: '100%', maxWidth: 380, background: '#243147', border: '1px solid #334155',
          borderRadius: 16, padding: '26px 22px', boxShadow: '0 16px 48px rgba(0,0,0,0.55)',
          textAlign: 'center',
        }}
      >
        <p style={{ fontSize: 12, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 16px' }}>
          Confirm Payment
        </p>

        <p style={{ fontSize: 36, fontWeight: 800, color: '#F8FAFC', margin: 0, fontFamily: 'ui-monospace, monospace', letterSpacing: '-0.02em' }}>
          {fmt(amount)}
        </p>
        <p style={{ fontSize: 13, color: '#94A3B8', margin: '6px 0 22px', minHeight: 18 }}>
          {hasFee ? `Includes ${fmt(fee)} bank processing fee` : ''}
        </p>

        <button
          onClick={onConfirm}
          data-testid="confirm-pay-btn"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            width: '100%', background: '#10B981', color: '#ffffff', border: 'none',
            borderRadius: 10, padding: '13px 18px', fontSize: 15, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          <Lock size={15} /> Pay {fmt(amount)} securely
        </button>

        <button
          onClick={onCancel}
          style={{
            width: '100%', marginTop: 10, background: 'transparent', color: '#94A3B8',
            border: '1px solid #334155', borderRadius: 10, padding: '11px 18px',
            fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          Cancel
        </button>

        <p style={{ fontSize: 11, color: '#64748B', margin: '14px 0 0', lineHeight: 1.5 }}>
          You will be redirected to our secure payment partner.
        </p>
      </div>
    </div>
  );
}
