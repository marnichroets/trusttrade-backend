import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function ProtectedRoute({ children }) {
  const { isAuthenticated, loading, user } = useAuth();
  const navigate = useNavigate();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    // Double-check localStorage as fallback for race conditions
    const token = localStorage.getItem('session_token');
    const userData = localStorage.getItem('user_data');
    
    console.log('[ProtectedRoute] Check - loading:', loading, 'isAuthenticated:', isAuthenticated);
    console.log('[ProtectedRoute] localStorage token:', token ? 'YES' : 'NO');
    console.log('[ProtectedRoute] localStorage user:', userData ? 'YES' : 'NO');
    
    // If context says not loading and not authenticated, but localStorage has token,
    // wait a moment for context to sync (race condition from AuthCallback)
    if (!loading && !isAuthenticated && token && userData) {
      console.log('[ProtectedRoute] Race condition detected - token exists but context not synced, waiting...');
      // Give context a moment to sync from AuthCallback's login() call
      const timer = setTimeout(() => {
        setChecked(true);
      }, 100);
      return () => clearTimeout(timer);
    }
    
    if (!loading) {
      setChecked(true);
    }
  }, [loading, isAuthenticated]);

  useEffect(() => {
    // Only redirect after we've fully checked
    if (checked && !loading && !isAuthenticated) {
      // Final check - if localStorage still has valid token, don't redirect
      const token = localStorage.getItem('session_token');
      const userData = localStorage.getItem('user_data');
      
      if (token && userData) {
        console.log('[ProtectedRoute] Token still in localStorage after check - not redirecting');
        return;
      }
      
      console.log('[ProtectedRoute] Not authenticated after full check, redirecting to /');
      navigate('/', { replace: true });
    }
  }, [checked, loading, isAuthenticated, navigate]);

  // Show loading while checking auth
  if (loading || !checked) {
    console.log('[ProtectedRoute] Loading... (loading:', loading, ', checked:', checked, ')');
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-500 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  // Check both context AND localStorage for authentication
  const token = localStorage.getItem('session_token');
  const userData = localStorage.getItem('user_data');
  const effectivelyAuthenticated = isAuthenticated || (token && userData);

  // Not authenticated
  if (!effectivelyAuthenticated) {
    console.log('[ProtectedRoute] Not authenticated, returning null');
    return null;
  }

  // Authenticated - render children
  console.log('[ProtectedRoute] Authenticated, rendering children');
  return children;
}

export default ProtectedRoute;
