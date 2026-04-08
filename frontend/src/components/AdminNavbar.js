import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X, LogOut, Activity } from 'lucide-react';

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
    <nav className="sticky top-0 z-50 bg-white border-b border-slate-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-20">
          {/* Logo */}
          <div className="flex items-center gap-6">
            <Link to="/admin" className="flex items-center gap-3">
              <img src="/trusttrade-logo.png" alt="TrustTrade" className="h-16 md:h-20 object-contain" />
              <span className="text-xs text-blue-600 font-semibold px-2 py-1 bg-blue-50 rounded border border-blue-200">Admin</span>
            </Link>
            
            {/* Desktop Nav */}
            <div className="hidden md:flex items-center gap-1">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  to={link.href}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1 ${
                    isActive(link)
                      ? 'text-blue-600 bg-blue-50'
                      : 'text-slate-600 hover:text-blue-600 hover:bg-slate-50'
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
                <span className="text-slate-600 text-sm">{user.name}</span>
              </div>
            )}
            
            {onLogout && (
              <button
                onClick={onLogout}
                className="hidden md:flex items-center gap-1 text-slate-500 hover:text-red-600 text-sm transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Logout
              </button>
            )}
            
            {/* Mobile menu button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 text-slate-600"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>
      
      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-slate-200 bg-white">
          <div className="px-4 py-3 space-y-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                to={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`block px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 ${
                  isActive(link)
                    ? 'text-blue-600 bg-blue-50'
                    : 'text-slate-600 hover:text-blue-600 hover:bg-slate-50'
                }`}
              >
                {link.icon && <link.icon className="w-4 h-4" />}
                {link.label}
              </Link>
            ))}
            {user && (
              <div className="pt-3 mt-3 border-t border-slate-200">
                <p className="px-3 py-1 text-slate-500 text-sm">{user.name}</p>
                {onLogout && (
                  <button
                    onClick={onLogout}
                    className="flex items-center gap-2 px-3 py-2 text-slate-500 hover:text-red-600 text-sm w-full"
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

export default AdminNavbar;

// Breadcrumbs component
export function Breadcrumbs({ items }) {
  return (
    <nav className="flex items-center space-x-2 text-sm text-slate-500 mb-4">
      {items.map((item, index) => (
        <span key={index} className="flex items-center">
          {index > 0 && <span className="mx-2">/</span>}
          {item.href ? (
            <a href={item.href} className="hover:text-blue-600">{item.label}</a>
          ) : (
            <span className="text-slate-700 font-medium">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
