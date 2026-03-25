import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();
  const hasRedirected = useRef(false);

  console.log('[PROTECTED] loading:', loading, 'isAuthenticated:', isAuthenticated);

  useEffect(() => {
    // Wait for auth check to complete
    if (loading) return;
    
    // Already authenticated - do nothing
    if (isAuthenticated) return;
    
    // Prevent multiple redirects
    if (hasRedirected.current) return;
    hasRedirected.current = true;
    
    console.log('[PROTECTED] Not authenticated, redirecting to /');
    navigate('/', { replace: true });
  }, [loading, isAuthenticated, navigate]);

  // Show loading while auth is being validated
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  // Not authenticated - show nothing while redirect happens
  if (!isAuthenticated) {
    return null;
  }

  // Authenticated - render children
  return children;
}

export default ProtectedRoute;
