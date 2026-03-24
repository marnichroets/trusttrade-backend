import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X, LogOut, Shield, Activity } from 'lucide-react';
import TrustTradeLogo from './TrustTradeLogo';

export function AdminNavbar({ user, onLogout }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  
  const navLinks = [
    { href: '/admin', label: 'Dashboard', exact: true },
    { href: '/admin/monitoring', label: 'Monitoring', icon: Activity },
    { href: '/admin/transactions', label: 'Transactions' },
    { href: '/admin/users', label: 'Users' },
    { href: '/admin/disputes', label: 'Disputes' },
  ];
  
  const isActive = (link) => {
    if (link.exact) {
      return location.pathname === link.href;
    }
    return location.pathname.startsWith(link.href);
  };

  return (
    <nav className="sticky top-0 z-50" style={{ backgroundColor: '#1a2942' }}>
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-14">
          {/* Logo */}
          <div className="flex items-center gap-6">
            <Link to="/admin" className="flex items-center gap-2">
              <TrustTradeLogo size="sm" showText={false} clickable={false} />
              <span className="text-white font-bold text-lg">TrustTrade</span>
              <span className="text-xs text-emerald-400 font-medium px-2 py-0.5 bg-emerald-500/20 rounded">Admin</span>
            </Link>
            
            {/* Desktop Nav */}
            <div className="hidden md:flex items-center gap-1">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  to={link.href}
                  className={`px-3 py-2 rounded text-sm font-medium transition-colors flex items-center gap-1 ${
                    isActive(link)
                      ? 'text-white bg-white/20'
                      : 'text-white/70 hover:text-white hover:bg-white/10'
                  }`}
                >
                  {link.icon && <link.icon className="w-4 h-4" />}
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
          
          {/* Right side */}
          <div className="flex items-center gap-4">
            {user && (
              <div className="hidden md:flex items-center gap-3">
                <span className="text-white/70 text-sm">{user.name}</span>
              </div>
            )}
            
            {onLogout && (
              <button
                onClick={onLogout}
                className="hidden md:flex items-center gap-1 text-white/70 hover:text-white text-sm transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Logout
              </button>
            )}
            
            {/* Mobile menu button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 text-white"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>
      
      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-white/10" style={{ backgroundColor: '#1a2942' }}>
          <div className="px-4 py-3 space-y-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                to={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`block px-3 py-2 rounded text-sm font-medium flex items-center gap-2 ${
                  isActive(link)
                    ? 'text-white bg-white/20'
                    : 'text-white/70 hover:text-white hover:bg-white/10'
                }`}
              >
                {link.icon && <link.icon className="w-4 h-4" />}
                {link.label}
              </Link>
            ))}
            {user && (
              <div className="pt-3 mt-3 border-t border-white/10">
                <p className="px-3 py-1 text-white/70 text-sm">{user.name}</p>
                {onLogout && (
                  <button
                    onClick={onLogout}
                    className="flex items-center gap-2 px-3 py-2 text-white/70 hover:text-white text-sm w-full"
                  >
                    <LogOut className="w-4 h-4" />
                    Logout
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}

export function Breadcrumbs({ items }) {
  return (
    <nav className="flex items-center gap-2 text-sm mb-6" style={{ color: '#6c757d' }}>
      {items.map((item, index) => (
        <span key={index} className="flex items-center gap-2">
          {index > 0 && (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          )}
          {item.href ? (
            <Link to={item.href} className="hover:underline hover:text-[#212529]">
              {item.label}
            </Link>
          ) : (
            <span style={{ color: '#212529' }} className="font-medium">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

export default AdminNavbar;
