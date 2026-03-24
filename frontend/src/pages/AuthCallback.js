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
        console.log('AuthCallback: Processing session...');
        
        // Extract session_id from URL fragment
        const hash = location.hash;
        const params = new URLSearchParams(hash.substring(1));
        const sessionId = params.get('session_id');

        if (!sessionId) {
          console.error('AuthCallback: No session ID found');
          toast.error('No session ID found');
          navigate('/', { replace: true });
          return;
        }

        console.log('AuthCallback: Exchanging session_id for user data...');
        
        // Exchange session_id for user data
        const response = await axios.post(
          `${API}/auth/session`,
          { session_id: sessionId },
          { withCredentials: true }
        );

        const user = response.data;
        console.log('AuthCallback: User authenticated:', user.email);
        
        toast.success(`Welcome, ${user.name || user.email}!`);

        // Check for redirect paths in order of priority
        const pendingShareCode = sessionStorage.getItem('pendingShareCode');
        const redirectAfterLogin = sessionStorage.getItem('redirectAfterLogin');
        
        if (pendingShareCode) {
          sessionStorage.removeItem('pendingShareCode');
          console.log('AuthCallback: Redirecting to share code:', pendingShareCode);
          navigate(`/t/${pendingShareCode}`, { replace: true });
        } else if (redirectAfterLogin) {
          sessionStorage.removeItem('redirectAfterLogin');
          console.log('AuthCallback: Redirecting to stored path:', redirectAfterLogin);
          navigate(redirectAfterLogin, { replace: true });
        } else {
          console.log('AuthCallback: Redirecting to dashboard');
          navigate('/dashboard', { replace: true, state: { user } });
        }
      } catch (error) {
        console.error('Auth callback error:', error);
        console.error('Error details:', error.response?.data);
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
