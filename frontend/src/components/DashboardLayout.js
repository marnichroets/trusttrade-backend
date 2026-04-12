import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Plus, FileText, AlertCircle, LogOut, Settings, User, Activity, Shield } from 'lucide-react';
import { Button } from './ui/button';
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
    { icon: AlertCircle, label: 'Disputes', path: '/disputes' },
    { icon: Activity, label: 'Live Activity', path: '/activity' },
    { icon: User, label: 'My Profile', path: '/profile' },
  ];

  if (user?.is_admin) {
    navItems.push({ icon: Settings, label: 'Admin Dashboard', path: '/admin' });
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top Navigation Bar - Compact */}
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-14">
            {/* Logo - Clean branded logo */}
            <NavLink to="/dashboard" className="flex items-center hover:opacity-80 transition-opacity">
              <TrustLogo size="small" />
            </NavLink>
            
            {/* User Info + Logout */}
            <div className="flex items-center gap-3">
              <NavLink to="/profile" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                {user?.picture ? (
                  <img
                    src={user.picture}
                    alt={user.name}
                    className="w-8 h-8 rounded-full border border-slate-200"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
                    <User className="w-4 h-4 text-slate-600" />
                  </div>
                )}
                <div className="hidden sm:block text-right">
                  <p className="text-sm font-medium text-slate-900 leading-tight" data-testid="user-name">{user?.name}</p>
                  <p className="text-xs text-slate-500">{user?.email}</p>
                </div>
              </NavLink>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogout}
                data-testid="logout-btn"
                className="text-slate-500 hover:text-slate-900 h-8 w-8 p-0"
              >
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex gap-6">
          {/* Sidebar Navigation - Compact */}
          <aside className="hidden lg:block w-56 flex-shrink-0">
            <nav className="bg-white rounded-lg border border-slate-200 p-3 sticky top-20">
              <ul className="space-y-1">
                {navItems.map((item) => (
                  <li key={item.path}>
                    <NavLink
                      to={item.path}
                      data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                      className={({ isActive }) =>
                        `flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                          isActive
                            ? 'bg-slate-900 text-white'
                            : item.highlight
                            ? 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                        }`
                      }
                    >
                      <item.icon className="w-4 h-4" />
                      {item.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </nav>
          </aside>

          {/* Mobile Navigation - Bottom Bar */}
          <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-50">
            <div className="flex justify-around items-center h-14">
              {navItems.slice(0, 4).map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  data-testid={`mobile-nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                  className={({ isActive }) =>
                    `flex flex-col items-center justify-center gap-0.5 px-3 py-1.5 ${
                      isActive ? 'text-blue-600' : 'text-slate-400'
                    }`
                  }
                >
                  <item.icon className="w-5 h-5" />
                  <span className="text-[10px] font-medium">{item.label.split(' ')[0]}</span>
                </NavLink>
              ))}
            </div>
          </div>

          {/* Main Content */}
          <main className="flex-1 min-w-0 pb-20 lg:pb-0">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}

export default DashboardLayout;
