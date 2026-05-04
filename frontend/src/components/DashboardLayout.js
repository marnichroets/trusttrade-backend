import { useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Plus, FileText, AlertCircle, LogOut, Settings, User, Activity, Shield, Briefcase } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';

export const V = {
  bg:      '#0A0E14',
  surface: '#1C2128',
  border:  '#2D333B',
  accent:  '#00D1FF',
  success: '#00FFA3',
  error:   '#FF3B30',
  warn:    '#F0B429',
  text:    '#E6EDF3',
  sub:     '#8B949E',
  dim:     '#4A5568',
  mono:    "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
  sans:    "'Space Grotesk', -apple-system, BlinkMacSystemFont, sans-serif",
};

function DashboardLayout({ children, user, loading = false }) {
  const navigate = useNavigate();
  const { logout } = useAuth();

  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap';
    document.head.appendChild(link);
    return () => { if (document.head.contains(link)) document.head.removeChild(link); };
  }, []);

  const handleLogout = async () => {
    try {
      await logout();
      toast.success('Signed out');
      navigate('/login');
    } catch {
      toast.error('Failed to sign out');
    }
  };

  const navItems = [
    { icon: LayoutDashboard, label: 'Dashboard',       path: '/dashboard' },
    { icon: Plus,            label: 'New Transaction', path: '/transactions/new', highlight: true },
    { icon: FileText,        label: 'My Transactions', path: '/transactions' },
    { icon: AlertCircle,     label: 'Disputes',        path: '/disputes-dashboard' },
    { icon: Briefcase,       label: 'Smart Deals',     path: '/smart-deals' },
    { icon: Activity,        label: 'Live Activity',   path: '/activity' },
    { icon: User,            label: 'My Profile',      path: '/profile' },
  ];

  if (user?.is_admin) {
    navItems.push({ icon: Settings, label: 'Admin Dashboard', path: '/admin' });
  }

  const userInitials = user?.name
    ? user.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
    : '??';

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: V.bg, fontFamily: V.sans, color: V.text }}>

      {/* ── Global styles ── */}
      <style>{`
        *, *::before, *::after { box-sizing: border-box; }

        body {
          background: ${V.bg};
          color: ${V.text};
          font-family: ${V.sans};
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }

        @keyframes vaultProgress {
          0%   { left: -40%; width: 40%; }
          60%  { left: 60%;  width: 40%; }
          100% { left: 100%; width: 40%; }
        }
        @keyframes vaultPulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.3; }
        }
        @keyframes vaultSpin {
          to { transform: rotate(360deg); }
        }
        @keyframes vaultFadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: none; }
        }

        /* Scrollbar */
        ::-webkit-scrollbar        { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track  { background: ${V.bg}; }
        ::-webkit-scrollbar-thumb  { background: ${V.border}; border-radius: 2px; }
        ::-webkit-scrollbar-thumb:hover { background: ${V.dim}; }

        /* Sidebar layout */
        .vault-sidebar {
          width: 220px;
          position: fixed;
          top: 0; left: 0;
          height: 100vh;
          display: flex;
          flex-direction: column;
          background: ${V.bg};
          border-right: 1px solid ${V.border};
          z-index: 40;
          overflow: hidden;
        }
        .vault-main {
          margin-left: 220px;
          flex: 1;
          display: flex;
          flex-direction: column;
          min-width: 0;
        }
        @media (max-width: 1023px) {
          .vault-sidebar { display: none !important; }
          .vault-main { margin-left: 0 !important; }
        }

        /* Vault table hover */
        .vault-tr:hover td { background: rgba(255,255,255,0.025) !important; }

        /* Vault row hover (non-table) */
        .vault-row:hover { background: rgba(255,255,255,0.03) !important; }

        /* Vault button hover — neon outline */
        .vault-btn {
          transition: border-color 0.12s, color 0.12s, background 0.12s !important;
        }
        .vault-btn:hover:not(:disabled) {
          border-color: ${V.accent} !important;
          color: ${V.accent} !important;
        }
        .vault-btn-primary:hover:not(:disabled) {
          background: rgba(0,209,255,0.12) !important;
          border-color: ${V.accent} !important;
          color: ${V.accent} !important;
        }
        .vault-btn-danger:hover:not(:disabled) {
          border-color: ${V.error} !important;
          color: ${V.error} !important;
        }
        .vault-btn-success:hover:not(:disabled) {
          border-color: ${V.success} !important;
          color: ${V.success} !important;
        }

        /* Input focus */
        .vault-input:focus {
          outline: none;
          border-color: ${V.accent} !important;
          box-shadow: 0 0 0 2px rgba(0,209,255,0.12);
        }
      `}</style>

      {/* ── Linear progress bar ── */}
      {loading && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0,
          height: 2, zIndex: 9999,
          background: V.border, overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', top: 0, height: '100%', width: '40%',
            background: `linear-gradient(90deg, transparent, ${V.accent}, transparent)`,
            animation: 'vaultProgress 1.4s ease-in-out infinite',
          }} />
        </div>
      )}

      {/* ── Sidebar (desktop) ── */}
      <aside className="vault-sidebar">
        {/* Logo */}
        <div style={{ padding: '18px 14px 14px', borderBottom: `1px solid ${V.border}` }}>
          <NavLink to="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
            <div style={{
              width: 30, height: 30, borderRadius: 4,
              border: `1px solid rgba(0,209,255,0.4)`,
              background: 'rgba(0,209,255,0.06)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <Shield size={14} color={V.accent} />
            </div>
            <div style={{ lineHeight: 1 }}>
              <div style={{
                color: V.text, fontWeight: 700, fontSize: 14,
                letterSpacing: '0.06em', textTransform: 'uppercase',
              }}>
                TrustTrade
              </div>
              <div style={{
                color: V.dim, fontSize: 9, letterSpacing: '0.14em',
                fontFamily: V.mono, textTransform: 'uppercase', marginTop: 2,
              }}>
                SECURE VAULT
              </div>
            </div>
          </NavLink>
        </div>

        {/* Nav items */}
        <nav style={{ flex: 1, padding: '12px 10px 8px', overflowY: 'auto', minHeight: 0 }}>
          <div style={{ padding: '0 6px 8px' }}>
            <span style={{
              fontSize: 10, fontWeight: 600,
              color: V.dim, letterSpacing: '0.12em',
              textTransform: 'uppercase', fontFamily: V.mono,
            }}>
              NAV
            </span>
          </div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {navItems.map((item) => (
              <li key={item.path}>
                <NavLink
                  to={item.path}
                  data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                  style={({ isActive }) => ({
                    display: 'flex', alignItems: 'center', gap: 9,
                    padding: '7px 10px', marginBottom: 1,
                    fontSize: 13, fontWeight: isActive ? 600 : 400,
                    color: isActive ? V.text : V.sub,
                    background: isActive ? 'rgba(0,209,255,0.06)' : 'transparent',
                    borderLeft: `2px solid ${isActive ? V.accent : 'transparent'}`,
                    borderRadius: '0 3px 3px 0',
                    textDecoration: 'none',
                    transition: 'color 0.1s, background 0.1s',
                    cursor: 'pointer',
                    letterSpacing: '-0.01em',
                  })}
                >
                  {({ isActive }) => (
                    <>
                      <item.icon
                        size={13}
                        color={isActive ? V.accent : V.dim}
                        style={{ flexShrink: 0 }}
                      />
                      <span style={{ flex: 1 }}>{item.label}</span>
                      {item.highlight && !isActive && (
                        <span style={{
                          fontSize: 8, fontWeight: 700,
                          color: V.accent,
                          border: `1px solid rgba(0,209,255,0.3)`,
                          background: 'rgba(0,209,255,0.08)',
                          padding: '1px 5px', borderRadius: 2,
                          letterSpacing: '0.1em', textTransform: 'uppercase',
                          fontFamily: V.mono,
                        }}>
                          NEW
                        </span>
                      )}
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        {/* User card + logout */}
        <div style={{ padding: '10px 10px 16px', borderTop: `1px solid ${V.border}` }}>
          <div
            onClick={() => navigate('/profile')}
            className="vault-btn"
            style={{
              display: 'flex', alignItems: 'center', gap: 9,
              padding: '8px 10px', marginBottom: 8,
              border: `1px solid ${V.border}`, borderRadius: 3,
              cursor: 'pointer', background: 'transparent',
            }}
          >
            {user?.picture ? (
              <img
                src={user.picture}
                alt={user?.name}
                style={{ width: 28, height: 28, borderRadius: 2, border: `1px solid ${V.border}`, flexShrink: 0, objectFit: 'cover' }}
              />
            ) : (
              <div style={{
                width: 28, height: 28, borderRadius: 2, flexShrink: 0,
                background: 'rgba(0,209,255,0.08)',
                border: `1px solid rgba(0,209,255,0.2)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 700, color: V.accent,
                fontFamily: V.mono, letterSpacing: '0.02em',
              }}>
                {userInitials}
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p
                data-testid="user-name"
                style={{
                  fontSize: 12, fontWeight: 600, color: V.text,
                  margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}
              >
                {user?.name || 'User'}
              </p>
              <p style={{
                fontSize: 10, color: V.sub, margin: 0,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                fontFamily: V.mono,
              }}>
                {user?.email}
              </p>
            </div>
          </div>

          <button
            data-testid="logout-btn"
            onClick={handleLogout}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 8,
              padding: '9px 12px', borderRadius: 4,
              border: `1px solid rgba(255,59,48,0.4)`,
              background: 'rgba(255,59,48,0.08)',
              color: V.error,
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
              fontFamily: V.sans,
              transition: 'background 0.12s, border-color 0.12s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(255,59,48,0.16)';
              e.currentTarget.style.borderColor = V.error;
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'rgba(255,59,48,0.08)';
              e.currentTarget.style.borderColor = 'rgba(255,59,48,0.4)';
            }}
          >
            <LogOut size={14} />
            Sign Out
          </button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <div className="vault-main">
        {/* Mobile header */}
        <header
          className="flex lg:hidden"
          style={{
            height: 48, background: V.bg,
            borderBottom: `1px solid ${V.border}`,
            alignItems: 'center', justifyContent: 'space-between',
            padding: '0 16px',
            position: 'sticky', top: 0, zIndex: 30,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Shield size={14} color={V.accent} />
            <span style={{ fontWeight: 700, fontSize: 13, color: V.text, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              TrustTrade
            </span>
          </div>
          <div>
            {user?.picture ? (
              <img src={user.picture} alt={user?.name} style={{ width: 26, height: 26, borderRadius: 2, border: `1px solid ${V.border}` }} />
            ) : (
              <div style={{
                width: 26, height: 26, borderRadius: 2,
                background: 'rgba(0,209,255,0.08)', border: `1px solid rgba(0,209,255,0.2)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 9, fontWeight: 700, color: V.accent, fontFamily: V.mono,
              }}>
                {userInitials}
              </div>
            )}
          </div>
        </header>

        {/* Page content */}
        <main style={{ flex: 1, padding: '24px', paddingBottom: 80, background: V.bg }} className="lg:pb-6">
          {children}
        </main>
      </div>

      {/* ── Mobile bottom nav ── */}
      <nav
        className="lg:hidden"
        style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
          background: V.surface, borderTop: `1px solid ${V.border}`,
          display: 'flex', justifyContent: 'space-around', alignItems: 'center',
          height: 56, padding: '0 8px',
        }}
      >
        {navItems.slice(0, 4).map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            data-testid={`mobile-nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
            style={({ isActive }) => ({
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
              padding: '6px 10px', textDecoration: 'none',
              color: isActive ? V.accent : V.sub,
              transition: 'color 0.1s',
            })}
          >
            <item.icon size={15} />
            <span style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: V.mono }}>
              {item.label.split(' ')[0]}
            </span>
          </NavLink>
        ))}
        <button
          data-testid="mobile-logout-btn"
          onClick={handleLogout}
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
            padding: '6px 10px', background: 'none', border: 'none',
            cursor: 'pointer', color: V.error, transition: 'color 0.1s',
          }}
        >
          <LogOut size={15} />
          <span style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: V.mono }}>
            Sign Out
          </span>
        </button>
      </nav>
    </div>
  );
}

export default DashboardLayout;
