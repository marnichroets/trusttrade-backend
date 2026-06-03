import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';

const API_BASE = process.env.REACT_APP_API_URL || 'https://trusttrade-backend-production-3efa.up.railway.app';

// Public landing page for the one-tap SMS confirm link. No login required — the
// unguessable token in the URL is the authorisation. Mobile-first, plain English.
export default function ConfirmReceipt() {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [txn, setTxn] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null); // 'confirmed' | 'reported'

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/transactions/confirm/${token}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(body.detail || 'This link is invalid or has expired.');
        } else {
          setTxn(await res.json());
        }
      } catch (e) {
        setError('Could not load this order. Please check your connection and try again.');
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const post = async (path, doneState) => {
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/api/transactions/confirm/${token}${path}`, { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setError(body.detail || 'Something went wrong. Please try again.'); return; }
      setDone(doneState);
    } catch (e) {
      setError('Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const wrap = { minHeight: '100vh', background: '#E6EDF3', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: 'system-ui, sans-serif' };
  const card = { background: '#fff', borderRadius: 16, boxShadow: '0 4px 24px rgba(15,23,42,0.08)', padding: 26, maxWidth: 440, width: '100%' };
  const btn = (bg, color = '#fff') => ({ width: '100%', padding: '14px 16px', borderRadius: 12, border: 'none', background: bg, color, fontSize: 16, fontWeight: 700, cursor: 'pointer', marginTop: 12 });

  const dateLabel = txn?.auto_release_at
    ? new Date(txn.auto_release_at).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hour12: false })
    : null;

  if (loading) return <div style={wrap}><div style={card}><p style={{ textAlign: 'center', color: '#6E7681' }}>Loading your order…</p></div></div>;

  if (error) return (
    <div style={wrap}><div style={card}>
      <h2 style={{ margin: '0 0 8px', color: '#0D1117' }}>TrustTrade</h2>
      <p style={{ color: '#30363D', lineHeight: 1.5 }}>{error}</p>
    </div></div>
  );

  if (done === 'confirmed') return (
    <div style={wrap}><div style={{ ...card, textAlign: 'center' }}>
      <div style={{ fontSize: 44 }}>✅</div>
      <h2 style={{ margin: '8px 0', color: '#0D1117' }}>Thank you!</h2>
      <p style={{ color: '#30363D', lineHeight: 1.5 }}>Your payment has been released to {txn?.seller_name || 'the seller'}. You can close this page.</p>
    </div></div>
  );

  if (done === 'reported') return (
    <div style={wrap}><div style={{ ...card, textAlign: 'center' }}>
      <div style={{ fontSize: 44 }}>🛟</div>
      <h2 style={{ margin: '8px 0', color: '#0D1117' }}>We're on it</h2>
      <p style={{ color: '#30363D', lineHeight: 1.5 }}>Your payment is on hold and our team will help you sort this out. Check your email for the next steps.</p>
    </div></div>
  );

  if (txn?.released) return (
    <div style={wrap}><div style={{ ...card, textAlign: 'center' }}>
      <div style={{ fontSize: 44 }}>✅</div>
      <h2 style={{ margin: '8px 0', color: '#0D1117' }}>All done</h2>
      <p style={{ color: '#30363D', lineHeight: 1.5 }}>This payment has already been released. Nothing more to do — you can close this page.</p>
    </div></div>
  );

  return (
    <div style={wrap}>
      <div style={card}>
        <p style={{ fontSize: 12, fontWeight: 800, color: '#1F6FEB', letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 6px' }}>TrustTrade</p>
        <h2 style={{ margin: '0 0 4px', color: '#0D1117' }}>Did you receive your order?</h2>
        <p style={{ color: '#30363D', lineHeight: 1.5, margin: '0 0 16px' }}>
          {txn?.item_description ? <strong>{txn.item_description}</strong> : 'Your order'} from {txn?.seller_name || 'the seller'}.
        </p>

        {dateLabel && (
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12, padding: '12px 14px', marginBottom: 4 }}>
            <p style={{ margin: 0, fontSize: 13, color: '#166534', lineHeight: 1.5 }}>
              If you do nothing, your payment releases automatically on <strong>{dateLabel}</strong>.
            </p>
          </div>
        )}

        <button style={btn('#3FB950')} disabled={busy} onClick={() => post('', 'confirmed')}>
          {busy ? 'Please wait…' : '✓ Yes, I received it — release payment'}
        </button>
        <button style={btn('#fff', '#DA3633')} disabled={busy} onClick={() => post('/report', 'reported')}>
          ⚠ There is a problem with my order
        </button>
        <p style={{ fontSize: 12, color: '#8B949E', textAlign: 'center', marginTop: 14 }}>
          Only confirm once you actually have your order in hand.
        </p>
      </div>
    </div>
  );
}
