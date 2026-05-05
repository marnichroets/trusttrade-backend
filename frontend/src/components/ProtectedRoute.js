import { useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function ProtectedRoute({ children }) {
  const { isAuthenticated, loading, needsOnboarding } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const hasRedirected = useRef(false);

  // Check localStorage directly as fallback (handles race conditions)
  const token = localStorage.getItem('session_token');
  const userData = localStorage.getItem('user_data');
  const hasLocalAuth = !!(token && userData);

  console.log('[PROTECTED_ROUTE_RENDERED] loading:', loading, 'isAuthenticated:', isAuthenticated, 'hasLocalAuth:', hasLocalAuth);

  useEffect(() => {
    // Don't redirect while loading
    if (loading) return;

    // Not authenticated → go to login
    if (!isAuthenticated && !hasLocalAuth) {
      if (hasRedirected.current) return;
      console.log('[PROTECTED_ROUTE_REDIRECT] Not authenticated, redirecting to /login');
      hasRedirected.current = true;
      navigate('/login', { replace: true });
      return;
    }

    // Authenticated but onboarding incomplete → go to /onboarding (but not if already there)
    if (needsOnboarding && location.pathname !== '/onboarding') {
      navigate('/onboarding', { replace: true });
    }
  }, [loading, isAuthenticated, hasLocalAuth, needsOnboarding, location.pathname, navigate]);

  // Show loading spinner while auth is being checked
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-500 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  // If authenticated via context OR localStorage, render children
  if (isAuthenticated || hasLocalAuth) {
    return children;
  }

  // Not authenticated - return null (redirect will happen via useEffect)
  return null;
}

export default ProtectedRoute;

