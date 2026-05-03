import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Plus, FileText, AlertCircle, LogOut, Settings, User, Activity, Shield, Briefcase, ChevronRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import TrustLogo from './TrustLogo';

function DashboardLayout({ children, user }) {
  const navigate = useNavigate();
  const { logout } = useAuth();

  const handleLogout = async () => {
    try {
      await logout();
      toast.success('Logged out successfully');
      navigate('/');
    } catch (error) {
      console.error('Logout error:', error);
      toast.error('Failed to logout');
    }
  };

  const navItems = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard' },
    { icon: Plus, label: 'New Transaction', path: '/transactions/new', highlight: true },
    { icon: FileText, label: 'My Transactions', path: '/transactions' },
    { icon: AlertCircle, label: 'Disputes', path: '/disputes-dashboard' },
    { icon: Briefcase, label: 'Smart Deals', path: '/smart-deals' },
    { icon: Activity, label: 'Live Activity', path: '/activity' },
    { icon: User, label: 'My Profile', path: '/profile' },
  ];

  if (user?.is_admin) {
    navItems.push({ icon: Settings, label: 'Admin Dashboard', path: '/admin' });
  }

  const userInitials = user?.name
    ? user.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
    : '?';

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f8fafc', fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif" }}>

      {/* ── Sidebar ─────────────────────────────────────── */}
      <aside style={{
        width: 240,
        flexShrink: 0,
        background: 'linear-gradient(180deg, #0f1729 0%, #111827 60%, #0d1520 100%)',
        display: 'flex',
        flexDirection: 'column',
        position: 'fixed',
        top: 0,
        left: 0,
        height: '100vh',
        zIndex: 40,
        borderRight: '1px solid rgba(255,255,255,0.04)',
      }} className="hidden lg:flex">

        {/* Logo */}
        <div style={{ padding: '24px 20px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <NavLink to="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: 'linear-gradient(135deg, #10b981, #059669)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 12px rgba(16,185,129,0.3)',
              flexShrink: 0,
            }}>
              <Shield size={16} color="#fff" />
            </div>
            <span style={{ color: '#fff', fontWeight: 700, fontSize: 15, letterSpacing: '-0.01em' }}>TrustTrade</span>
          </NavLink>
        </div>

        {/* Nav Items */}
        <nav style={{ flex: 1, padding: '12px 10px', overflowY: 'auto' }}>
          <div style={{ marginBottom: 6, padding: '0 8px' }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Menu
            </span>
          </div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {navItems.map((item) => (
              <li key={item.path}>
                <NavLink
                  to={item.path}
                  data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                  style={({ isActive }) => ({
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '9px 10px', borderRadius: 8,
                    fontSize: 13, fontWeight: isActive ? 600 : 400,
                    color: isActive ? '#fff' : 'rgba(255,255,255,0.55)',
                    background: isActive
                      ? 'rgba(16,185,129,0.15)'
                      : item.highlight && !isActive
                      ? 'rgba(59,130,246,0.1)'
                      : 'transparent',
                    borderLeft: isActive ? '2px solid #10b981' : '2px solid transparent',
                    textDecoration: 'none',
                    transition: 'all 0.15s ease',
                    cursor: 'pointer',
                  })}
                >
                  {({ isActive }) => (
                    <>
                      <item.icon size={15} color={isActive ? '#10b981' : item.highlight ? '#60a5fa' : 'rgba(255,255,255,0.45)'} />
                      <span style={{ flex: 1 }}>{item.label}</span>
                      {item.highlight && (
                        <span style={{
                          fontSize: 9, fontWeight: 700, background: '#3b82f6',
                          color: '#fff', padding: '1px 5px', borderRadius: 4,
                          letterSpacing: '0.04em', textTransform: 'uppercase',
                        }}>New</span>
                      )}
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        {/* User section at bottom */}
        <div style={{ padding: '12px 10px 20px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px', borderRadius: 10,
            background: 'rgba(255,255,255,0.04)',
            marginBottom: 8,
            cursor: 'pointer',
          }} onClick={() => navigate('/profile')}>
            {user?.picture ? (
              <img src={user.picture} alt={user?.name} style={{ width: 32, height: 32, borderRadius: '50%', border: '1.5px solid rgba(255,255,255,0.15)', flexShrink: 0 }} />
            ) : (
              <div style={{
                width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 700, color: '#fff',
              }}>{userInitials}</div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p data-testid="user-name" style={{ fontSize: 12, fontWeight: 600, color: '#fff', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {user?.name || 'User'}
              </p>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {user?.email}
              </p>
            </div>
            <ChevronRight size={14} color="rgba(255,255,255,0.25)" />
          </div>
          <button
            data-testid="logout-btn"
            onClick={handleLogout}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 10px', borderRadius: 8, border: 'none',
              background: 'rgba(239,68,68,0.08)', color: 'rgba(239,68,68,0.7)',
              fontSize: 12, fontWeight: 500, cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.15)'; e.currentTarget.style.color = '#ef4444'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; e.currentTarget.style.color = 'rgba(239,68,68,0.7)'; }}
          >
            <LogOut size={13} />
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Main ────────────────────────────────────────── */}
      <div style={{ flex: 1, marginLeft: 0, display: 'flex', flexDirection: 'column' }} className="lg:ml-60">

        {/* Top bar */}
        <header style={{
          height: 56, background: '#fff', borderBottom: '1px solid #f1f5f9',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 24px', position: 'sticky', top: 0, zIndex: 30,
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}>
          {/* Mobile logo */}
          <div className="flex lg:hidden items-center gap-2">
            <div style={{ width: 28, height: 28, borderRadius: 7, background: 'linear-gradient(135deg,#10b981,#059669)', display:'flex',alignItems:'center',justifyContent:'center' }}>
              <Shield size={14} color="#fff" />
            </div>
            <span style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>TrustTrade</span>
          </div>
          <div className="hidden lg:block" />

          {/* Right side */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <NavLink to="/profile" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
              {user?.picture ? (
                <img src={user.picture} alt={user?.name} style={{ width: 30, height: 30, borderRadius: '50%', border: '1.5px solid #e2e8f0' }} />
              ) : (
                <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'linear-gradient(135deg,#3b82f6,#1d4ed8)', display:'flex',alignItems:'center',justifyContent:'center', fontSize:11, fontWeight:700, color:'#fff' }}>
                  {userInitials}
                </div>
              )}
              <span className="hidden sm:block" style={{ fontSize: 13, fontWeight: 500, color: '#0f172a' }}>{user?.name}</span>
            </NavLink>
          </div>
        </header>

        {/* Content */}
        <main style={{ flex: 1, padding: '24px', paddingBottom: 80 }} className="lg:pb-6">
          {children}
        </main>
      </div>

      {/* ── Mobile bottom nav ───────────────────────────── */}
      <nav className="lg:hidden" style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
        background: '#0f1729', borderTop: '1px solid rgba(255,255,255,0.08)',
        display: 'flex', justifyContent: 'space-around', alignItems: 'center',
        height: 60, padding: '0 8px',
      }}>
        {navItems.slice(0, 4).map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            data-testid={`mobile-nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
            style={({ isActive }) => ({
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
              padding: '6px 12px', borderRadius: 8, textDecoration: 'none',
              color: isActive ? '#10b981' : 'rgba(255,255,255,0.4)',
              transition: 'color 0.15s',
            })}
          >
            <item.icon size={18} />
            <span style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {item.label.split(' ')[0]}
            </span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

export default DashboardLayout;
