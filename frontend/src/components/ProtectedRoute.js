import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();
  const hasRedirected = useRef(false);

  // Check localStorage as fallback for race condition after AuthCallback
  const token = localStorage.getItem('session_token');
  const hasToken = !!token;

  useEffect(() => {
    if (loading) return;
    // If context says not authenticated BUT localStorage has token, don't redirect yet
    // This handles the race condition after AuthCallback stores token
    if (isAuthenticated || hasToken) return;
    if (hasRedirected.current) return;
    hasRedirected.current = true;
    navigate('/', { replace: true });
  }, [loading, isAuthenticated, hasToken, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  // Allow render if context authenticated OR localStorage has token
  if (!isAuthenticated && !hasToken) return null;

  return children;
}

export default ProtectedRoute;
