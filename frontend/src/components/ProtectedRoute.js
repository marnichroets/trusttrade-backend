import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../utils/api';

function ProtectedRoute({ children }) {
  const [isAuthenticated, setIsAuthenticated] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();
  const checkInProgress = useRef(false);

  useEffect(() => {
    // Skip if auth callback is in progress
    if (window.location.hash?.includes('session_id=')) {
      console.log('[PROTECTED] Auth callback detected, skipping check');
      return;
    }

    // Prevent duplicate checks
    if (checkInProgress.current) {
      console.log('[PROTECTED] Check already in progress, skipping');
      return;
    }

    const checkAuth = async () => {
      checkInProgress.current = true;
      
      console.log('[PROTECTED] ========== AUTH CHECK START ==========');
      console.log('[PROTECTED] Path:', location.pathname);
      
      // First, check localStorage for quick validation
      const token = localStorage.getItem('session_token');
      const userDataStr = localStorage.getItem('user_data');
      
      console.log('[PROTECTED] Token in localStorage:', token ? 'YES (' + token.substring(0, 15) + '...)' : 'NO');
      console.log('[PROTECTED] User data in localStorage:', userDataStr ? 'YES' : 'NO');

      if (!token) {
        console.log('[PROTECTED] No token found - user not authenticated');
        setIsAuthenticated(false);
        checkInProgress.current = false;
        return;
      }

      // Token exists, verify it's still valid with the API
      try {
        console.log('[PROTECTED] Verifying token with API...');
        const res = await api.get('/auth/me');
        
        console.log('[PROTECTED] API response status:', res.status);
        console.log('[PROTECTED] API response user:', res.data?.email);
        
        if (res.data?.user_id) {
          console.log('[PROTECTED] Auth VALID - user authenticated');
          // Update stored user data
          localStorage.setItem('user_data', JSON.stringify({
            user_id: res.data.user_id,
            email: res.data.email,
            name: res.data.name,
            is_admin: res.data.is_admin
          }));
          setIsAuthenticated(true);
        } else {
          console.log('[PROTECTED] Auth INVALID - no user_id in response');
          localStorage.removeItem('session_token');
          localStorage.removeItem('user_data');
          setIsAuthenticated(false);
        }
      } catch (err) {
        console.error('[PROTECTED] API error:', err.response?.status, err.message);
        // Only clear token on 401, not on network errors
        if (err.response?.status === 401) {
          console.log('[PROTECTED] 401 - clearing stored auth');
          localStorage.removeItem('session_token');
          localStorage.removeItem('user_data');
        }
        setIsAuthenticated(false);
      } finally {
        checkInProgress.current = false;
        console.log('[PROTECTED] ========== AUTH CHECK END ==========');
      }
    };

    checkAuth();
  }, [location.pathname]);

  // Loading state
  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-500 text-sm">Checking authentication...</p>
        </div>
      </div>
    );
  }

  // Not authenticated - redirect to home
  if (!isAuthenticated) {
    console.log('[PROTECTED] Not authenticated - redirecting to /');
    navigate('/', { replace: true });
    return null;
  }

  // Authenticated - render children
  console.log('[PROTECTED] Authenticated - rendering page');
  return children;
}

export default ProtectedRoute;
