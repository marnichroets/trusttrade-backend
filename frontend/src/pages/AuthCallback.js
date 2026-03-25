import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function AuthCallback() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, isAuthenticated } = useAuth();
  const hasProcessed = useRef(false);
  const [status, setStatus] = useState('Processing...');

  useEffect(() => {
    // If already authenticated, go to dashboard
    if (isAuthenticated) {
      console.log('[AuthCallback] Already authenticated, redirecting to dashboard');
      navigate('/dashboard', { replace: true });
      return;
    }

    // Strict guard against double-processing
    if (hasProcessed.current) {
      console.log('[AuthCallback] Already processed, skipping');
      return;
    }
    hasProcessed.current = true;

    const processSession = async () => {
      try {
        console.log('[AuthCallback] ========== START ==========');
        setStatus('Extracting session...');
        
        const hash = location.hash;
        const params = new URLSearchParams(hash.substring(1));
        const sessionId = params.get('session_id');

        if (!sessionId) {
          console.error('[AuthCallback] No session_id in URL');
          toast.error('No session ID found');
          navigate('/', { replace: true });
          return;
        }

        console.log('[AuthCallback] Session ID:', sessionId.substring(0, 15) + '...');
        setStatus('Authenticating...');

        // Exchange session_id for user data
        const response = await axios.post(
          `${API}/auth/session`,
          { session_id: sessionId },
          { withCredentials: true }
        );

        const data = response.data;
        const token = data.session_token;
        
        console.log('[TOKEN_PRESENT]', token ? 'YES' : 'NO');

        if (!token) {
          console.error('[AuthCallback] No token in response!');
          toast.error('Authentication error');
          navigate('/', { replace: true });
          return;
        }

        // Create user object
        const userData = {
          user_id: data.user_id,
          email: data.email,
          name: data.name,
          is_admin: data.is_admin,
          picture: data.picture,
        };

        // Store in localStorage FIRST before calling login
        localStorage.setItem('session_token', token);
        localStorage.setItem('user_data', JSON.stringify(userData));

        // Call login() - this updates context state
        login(userData, token);
        
        // Verify localStorage was set
        const storedToken = localStorage.getItem('session_token');
        console.log('[AuthCallback] Verified localStorage token:', storedToken ? 'YES' : 'NO');

        setStatus('Login successful!');
        toast.success(`Welcome, ${userData.name || userData.email}!`);

        // Clear URL hash to prevent re-processing
        window.history.replaceState(null, '', window.location.pathname);

        // Determine redirect destination
        const pendingShareCode = sessionStorage.getItem('pendingShareCode');
        const redirectAfterLogin = sessionStorage.getItem('redirectAfterLogin');
        
        let destination = '/dashboard';
        if (pendingShareCode) {
          sessionStorage.removeItem('pendingShareCode');
          destination = `/t/${pendingShareCode}`;
        } else if (redirectAfterLogin) {
          sessionStorage.removeItem('redirectAfterLogin');
          destination = redirectAfterLogin;
        }

        console.log('[NAVIGATE_CALLED] destination:', destination);
        console.log('[AuthCallback] ========== END ==========');
        
        // Navigate to dashboard
        navigate(destination, { replace: true });

      } catch (error) {
        console.error('[AuthCallback] Error:', error);
        setStatus('Authentication failed');
        toast.error(`Login failed: ${error.response?.data?.detail || error.message}`);
        navigate('/', { replace: true });
      }
    };

    processSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]); // Only depend on isAuthenticated for early redirect

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-white">
      <div className="text-center">
        <img src="/trusttrade-logo.png" alt="TrustTrade" className="h-16 mx-auto mb-6 object-contain" />
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-slate-600">{status}</p>
      </div>
    </div>
  );
}

export default AuthCallback;
