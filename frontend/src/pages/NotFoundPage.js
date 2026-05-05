import { useNavigate } from 'react-router-dom';
import { V } from '../components/DashboardLayout';

export default function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <div style={{
      minHeight: '100vh',
      background: V.bg,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: V.sans,
      padding: '24px',
      textAlign: 'center',
    }}>
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0) rotate(0deg); }
          10% { transform: translateX(-4px) rotate(-3deg); }
          20% { transform: translateX(4px) rotate(3deg); }
          30% { transform: translateX(-4px) rotate(-2deg); }
          40% { transform: translateX(4px) rotate(2deg); }
          50% { transform: translateX(-2px) rotate(-1deg); }
          60% { transform: translateX(2px) rotate(1deg); }
          70% { transform: translateX(-1px); }
          80% { transform: translateX(1px); }
        }
        @keyframes glow-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
          50% { box-shadow: 0 0 20px 4px rgba(239, 68, 68, 0.15); }
        }
        .lock-icon { animation: shake 0.6s ease 0.5s both; }
        .error-container { animation: glow-pulse 3s ease infinite; }
      `}</style>

      {/* Lock icon container */}
      <div
        className="error-container"
        style={{
          width: 80, height: 80,
          borderRadius: 8,
          background: 'rgba(239,68,68,0.06)',
          border: '1px solid rgba(239,68,68,0.25)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 32,
        }}
      >
        <svg
          className="lock-icon"
          width="36" height="36"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#EF4444"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          <circle cx="12" cy="16" r="1" fill="#EF4444" />
        </svg>
      </div>

      {/* 404 */}
      <p style={{
        fontSize: 11, fontWeight: 700,
        color: '#EF4444',
        fontFamily: V.mono, letterSpacing: '0.2em',
        margin: '0 0 8px',
      }}>
        404 · ACCESS DENIED
      </p>

      <h1 style={{
        fontSize: 28, fontWeight: 800,
        color: V.text,
        margin: '0 0 12px',
        letterSpacing: '-0.02em',
      }}>
        Page not found
      </h1>

      <p style={{
        fontSize: 14, color: V.sub,
        maxWidth: 320, lineHeight: 1.6,
        margin: '0 0 32px',
      }}>
        The page you're looking for doesn't exist or has been moved.
        Double-check the URL or return to safety.
      </p>

      {/* Divider */}
      <div style={{
        width: 40, height: 1,
        background: 'rgba(239,68,68,0.3)',
        marginBottom: 32,
      }} />

      {/* Actions */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
        <button
          onClick={() => navigate('/')}
          style={{
            padding: '10px 24px', borderRadius: 4,
            border: '1px solid rgba(0,209,255,0.3)',
            background: 'rgba(0,209,255,0.08)',
            color: '#00D1FF', fontSize: 13, fontWeight: 600,
            cursor: 'pointer', fontFamily: V.sans,
          }}
        >
          Go Home
        </button>
        <button
          onClick={() => navigate(-1)}
          style={{
            padding: '10px 24px', borderRadius: 4,
            border: `1px solid ${V.border}`,
            background: 'transparent',
            color: V.sub, fontSize: 13,
            cursor: 'pointer', fontFamily: V.sans,
          }}
        >
          Go Back
        </button>
      </div>

      {/* Footer hint */}
      <p style={{
        position: 'fixed', bottom: 24,
        fontSize: 10, color: 'rgba(255,255,255,0.12)',
        fontFamily: V.mono, letterSpacing: '0.1em',
        margin: 0,
      }}>
        TRUSTTRADE · SECURE VAULT
      </p>
    </div>
  );
}
