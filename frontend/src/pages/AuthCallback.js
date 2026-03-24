import { useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function AuthCallback() {
  const navigate = useNavigate();
  const location = useLocation();
  const hasProcessed = useRef(false);

  useEffect(() => {
    // CRITICAL: Use useRef to prevent double processing in StrictMode
    if (hasProcessed.current) return;
    hasProcessed.current = true;

    const processSession = async () => {
      try {
        console.log('[AUTH] Step 1: Processing session...');
        console.log('[AUTH] Current URL hash:', location.hash);
        
        // Extract session_id from URL fragment
        const hash = location.hash;
        const params = new URLSearchParams(hash.substring(1));
        const sessionId = params.get('session_id');

        console.log('[AUTH] Step 2: Extracted session_id:', sessionId ? sessionId.substring(0, 20) + '...' : 'NULL');

        if (!sessionId) {
          console.error('[AUTH] ERROR: No session ID found in URL');
          toast.error('No session ID found');
          navigate('/', { replace: true });
          return;
        }

        console.log('[AUTH] Step 3: Calling POST /api/auth/session...');
        
        // Exchange session_id for user data
        const response = await axios.post(
          `${API}/auth/session`,
          { session_id: sessionId },
          { withCredentials: true }
        );

        console.log('[AUTH] Step 4: API Response received');
        console.log('[AUTH] Response status:', response.status);
        console.log('[AUTH] Response data keys:', Object.keys(response.data));
        
        const user = response.data;
        console.log('[AUTH] Step 5: User email:', user.email);
        console.log('[AUTH] Step 5: Has session_token in response:', !!user.session_token);
        
        // Store session token in localStorage as fallback for cookie issues
        if (user.session_token) {
          localStorage.setItem('session_token', user.session_token);
          console.log('[AUTH] Step 6: Token stored in localStorage');
          console.log('[AUTH] Verification - localStorage token:', localStorage.getItem('session_token')?.substring(0, 20) + '...');
        } else {
          console.error('[AUTH] ERROR: No session_token in API response!');
          console.log('[AUTH] Full response data:', JSON.stringify(user, null, 2));
        }
        
        toast.success(`Welcome, ${user.name || user.email}!`);

        // Small delay to ensure localStorage is persisted before navigation
        await new Promise(resolve => setTimeout(resolve, 100));

        // Check for redirect paths in order of priority
        const pendingShareCode = sessionStorage.getItem('pendingShareCode');
        const redirectAfterLogin = sessionStorage.getItem('redirectAfterLogin');
        
        console.log('[AUTH] Step 7: Determining redirect...');
        console.log('[AUTH] pendingShareCode:', pendingShareCode);
        console.log('[AUTH] redirectAfterLogin:', redirectAfterLogin);
        
        // Final verification before redirect
        const verifyToken = localStorage.getItem('session_token');
        console.log('[AUTH] Final token verification:', verifyToken ? 'EXISTS' : 'MISSING');
        
        // Clear the hash from URL before navigating to prevent re-triggering auth
        window.history.replaceState(null, '', window.location.pathname);
        
        if (pendingShareCode) {
          sessionStorage.removeItem('pendingShareCode');
          console.log('[AUTH] Step 8: Redirecting to share code:', pendingShareCode);
          navigate(`/t/${pendingShareCode}`, { replace: true });
        } else if (redirectAfterLogin) {
          sessionStorage.removeItem('redirectAfterLogin');
          console.log('[AUTH] Step 8: Redirecting to stored path:', redirectAfterLogin);
          navigate(redirectAfterLogin, { replace: true });
        } else {
          console.log('[AUTH] Step 8: Redirecting to /dashboard');
          navigate('/dashboard', { replace: true });
        }
      } catch (error) {
        console.error('[AUTH] ERROR in processSession:', error);
        console.error('[AUTH] Error response:', error.response?.data);
        console.error('[AUTH] Error status:', error.response?.status);
        toast.error(`Authentication failed: ${error.response?.data?.detail || error.message}`);
        navigate('/', { replace: true });
      }
    };

    processSession();
  }, [navigate, location.hash]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-white">
      <div className="text-center">
        <img src="/trusttrade-logo.png" alt="TrustTrade" className="h-16 mx-auto mb-6 object-contain" />
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-slate-600">Signing you in...</p>
      </div>
    </div>
  );
}

export default AuthCallback;
