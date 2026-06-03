import { useState } from 'react';
import { Lightbulb, X, Send, Check } from 'lucide-react';
import api from '../utils/api';

/**
 * Subtle, always-visible feedback button (bottom-right). Opens a simple
 * "What can we improve?" form that emails the admin. Never blocks the page.
 */
export default function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);

  const submit = async () => {
    const msg = message.trim();
    if (!msg) return;
    setSending(true);
    setError(null);
    try {
      await api.post('/feedback', { message: msg, page: window.location.pathname });
      setSent(true);
      setMessage('');
      setTimeout(() => { setOpen(false); setSent(false); }, 1600);
    } catch (e) {
      setError('Could not send. Please try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      {/* Launcher — subtle, stacked above the support-chat button */}
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Send feedback"
        title="What can we improve?"
        style={{
          position: 'fixed', right: 23, bottom: 128, zIndex: 1001,
          width: 40, height: 40, borderRadius: '50%', cursor: 'pointer',
          background: '#fff', border: '1px solid #e2e8f0', color: '#30363D',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 2px 10px rgba(15,23,42,0.12)',
        }}
      >
        {open ? <X size={18} /> : <Lightbulb size={18} />}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: 'fixed', right: 23, bottom: 176, zIndex: 1001, width: 300, maxWidth: 'calc(100vw - 46px)',
          background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14,
          boxShadow: '0 12px 32px rgba(15,23,42,0.18)', padding: 16,
        }}>
          {sent ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 4px', color: '#2EA043', fontSize: 14, fontWeight: 600 }}>
              <Check size={18} /> Thanks for the feedback!
            </div>
          ) : (
            <>
              <p style={{ fontSize: 14, fontWeight: 700, color: '#0D1117', margin: '0 0 8px' }}>What can we improve?</p>
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="Tell us what's working or what's not…"
                rows={4}
                style={{
                  width: '100%', boxSizing: 'border-box', resize: 'vertical', minHeight: 84,
                  border: '1px solid #e2e8f0', borderRadius: 10, padding: '9px 11px',
                  fontSize: 13, fontFamily: 'inherit', color: '#0D1117', outline: 'none',
                }}
              />
              {error && <p style={{ fontSize: 12, color: '#DA3633', margin: '6px 0 0' }}>{error}</p>}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
                <button onClick={() => setOpen(false)}
                  style={{ background: 'transparent', border: '1px solid #e2e8f0', borderRadius: 9, padding: '8px 12px', fontSize: 13, color: '#6E7681', cursor: 'pointer' }}>
                  Cancel
                </button>
                <button onClick={submit} disabled={sending || !message.trim()}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    background: '#0284C7', border: 'none', borderRadius: 9, padding: '8px 14px',
                    fontSize: 13, fontWeight: 600, color: '#fff',
                    cursor: (sending || !message.trim()) ? 'not-allowed' : 'pointer',
                    opacity: (sending || !message.trim()) ? 0.6 : 1,
                  }}>
                  <Send size={13} /> {sending ? 'Sending…' : 'Send'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
