import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();
  const hasRedirected = useRef(false);

  // Check localStorage directly as a sync fallback
  const token = localStorage.getItem('session_token');
  const userData = localStorage.getItem('user_data');
  const hasLocalAuth = !!(token && userData);

  // Effective auth = context OR localStorage (handles race conditions)
  const effectivelyAuthenticated = isAuthenticated || hasLocalAuth;

  console.log('[PROTECTED_ROUTE] loading:', loading, 'contextAuth:', isAuthenticated, 'localAuth:', hasLocalAuth);

  useEffect(() => {
    // Don't redirect while loading
    if (loading) return;
    
    // Don't redirect if authenticated
    if (effectivelyAuthenticated) return;
    
    // Don't redirect multiple times
    if (hasRedirected.current) return;
    
    console.log('[PROTECTED_ROUTE] Not authenticated, redirecting to /');
    hasRedirected.current = true;
    navigate('/', { replace: true });
  }, [loading, effectivelyAuthenticated, navigate]);

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

  // If authenticated, render children
  if (effectivelyAuthenticated) {
    return children;
  }

  // Not authenticated - return null while redirect happens
  return null;
}

export default ProtectedRoute;
