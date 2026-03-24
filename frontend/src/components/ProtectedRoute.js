import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../utils/api';

function ProtectedRoute({ children }) {
  const [isAuthenticated, setIsAuthenticated] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Skip if this is the auth callback page processing
    if (window.location.hash?.includes('session_id=')) {
      console.log('[PROTECTED] Skipping - auth callback in progress');
      return;
    }

    const checkAuth = async () => {
      const token = localStorage.getItem('session_token');
      console.log('[PROTECTED] Step 1: Checking auth for path:', location.pathname);
      console.log('[PROTECTED] Step 2: Token in localStorage:', token ? token.substring(0, 20) + '...' : 'NULL');

      try {
        console.log('[PROTECTED] Step 3: Calling GET /api/auth/me...');
        const res = await api.get('/auth/me');
        console.log('[PROTECTED] Step 4: API Response status:', res.status);
        console.log('[PROTECTED] Step 5: User data:', res.data?.email, 'user_id:', res.data?.user_id);
        
        if (res.data?.user_id) {
          console.log('[PROTECTED] Step 6: Auth SUCCESS - user authenticated');
          setIsAuthenticated(true);
        } else {
          console.log('[PROTECTED] Step 6: Auth FAILED - no user_id in response');
          setIsAuthenticated(false);
        }
      } catch (err) {
        console.error('[PROTECTED] Step 4: API Error:', err.response?.status, err.response?.data);
        console.log('[PROTECTED] Clearing localStorage token');
        localStorage.removeItem('session_token');
        setIsAuthenticated(false);
      }
    };

    checkAuth();
  }, [location.pathname]);

  if (isAuthenticated === null) {
    console.log('[PROTECTED] Rendering: Loading spinner (auth check in progress)');
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    console.log('[PROTECTED] Rendering: NOT authenticated - redirecting to /');
    navigate('/', { replace: true });
    return null;
  }

  console.log('[PROTECTED] Rendering: Authenticated - showing children');
  return children;
}

export default ProtectedRoute;
