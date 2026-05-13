import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import { Mail, RefreshCw, Loader2, CheckCircle } from 'lucide-react';

export default function EmailVerificationPrompt() {
  const { user } = useAuth();
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const handleResend = async () => {
    if (!user?.email || loading || cooldown > 0) return;
    setLoading(true);
    try {
      await api.post('/auth/resend-verification', { email: user.email });
      setSent(true);
      setCooldown(120);
    } catch {
      setSent(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: 12,
      background: '#fffbeb',
      border: '1px solid #fde68a',
      borderRadius: 10,
      padding: '14px 16px',
      marginBottom: 20,
    }}>
      <Mail size={18} color="#d97706" style={{ flexShrink: 0, marginTop: 1 }} />
      <div style={{ flex: 1 }}>
        <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600, color: '#78350f' }}>
          Verify your email to continue
        </p>
        <p style={{ margin: '0 0 10px', fontSize: 13, color: '#92400e', lineHeight: 1.5 }}>
          Check your inbox for the verification link.
        </p>
        {sent ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#15803d' }}>
            <CheckCircle size={14} />
            Verification email sent — check your inbox.
          </div>
        ) : (
          <button
            type="button"
            onClick={handleResend}
            disabled={loading || cooldown > 0}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: 'none',
              border: '1px solid #d97706',
              borderRadius: 6,
              padding: '5px 12px',
              fontSize: 13,
              fontWeight: 500,
              color: '#b45309',
              cursor: loading || cooldown > 0 ? 'not-allowed' : 'pointer',
              opacity: loading || cooldown > 0 ? 0.6 : 1,
              fontFamily: 'inherit',
            }}
          >
            {loading
              ? <Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} />
              : <RefreshCw size={13} />}
            {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend verification email'}
          </button>
        )}
      </div>
    </div>
  );
}
