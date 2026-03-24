import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function AuthCallback() {
  const navigate = useNavigate();
  const location = useLocation();
  const hasProcessed = useRef(false);
  const [status, setStatus] = useState('Processing...');

  useEffect(() => {
    if (hasProcessed.current) {
      console.log('[AUTH] Already processed, skipping');
      return;
    }
    hasProcessed.current = true;

    const processSession = async () => {
      try {
        console.log('[AUTH] ========== AUTH CALLBACK START ==========');
        setStatus('Extracting session...');
        
        const hash = location.hash;
        console.log('[AUTH] URL hash:', hash);
        
        const params = new URLSearchParams(hash.substring(1));
        const sessionId = params.get('session_id');

        if (!sessionId) {
          console.error('[AUTH] No session_id in URL');
          toast.error('No session ID found');
          navigate('/', { replace: true });
          return;
        }

        console.log('[AUTH] Session ID found:', sessionId.substring(0, 15) + '...');
        setStatus('Authenticating...');

        // Exchange session_id for user data
        const response = await axios.post(
          `${API}/auth/session`,
          { session_id: sessionId },
          { withCredentials: true }
        );

        console.log('[AUTH] API Response status:', response.status);
        console.log('[AUTH] API Response keys:', Object.keys(response.data));
        
        const userData = response.data;
        const token = userData.session_token;
        
        console.log('[AUTH] User email:', userData.email);
        console.log('[AUTH] Token received:', token ? 'YES (' + token.substring(0, 15) + '...)' : 'NO!');

        if (!token) {
          console.error('[AUTH] CRITICAL: No session_token in response!');
          console.error('[AUTH] Full response:', JSON.stringify(userData));
          toast.error('Authentication error: No token received');
          navigate('/', { replace: true });
          return;
        }

        // Store token in localStorage
        localStorage.setItem('session_token', token);
        
        // Also store basic user info for quick access
        localStorage.setItem('user_data', JSON.stringify({
          user_id: userData.user_id,
          email: userData.email,
          name: userData.name,
          is_admin: userData.is_admin
        }));
        
        // Verify storage
        const storedToken = localStorage.getItem('session_token');
        const storedUser = localStorage.getItem('user_data');
        
        console.log('[AUTH] Token stored:', storedToken ? 'YES' : 'NO');
        console.log('[AUTH] User stored:', storedUser ? 'YES' : 'NO');
        
        if (!storedToken) {
          console.error('[AUTH] CRITICAL: localStorage.setItem failed!');
          toast.error('Failed to save login session');
          navigate('/', { replace: true });
          return;
        }

        setStatus('Login successful!');
        toast.success(`Welcome, ${userData.name || userData.email}!`);

        // Clear the URL hash
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

        console.log('[AUTH] Navigating to:', destination);
        console.log('[AUTH] ========== AUTH CALLBACK END ==========');
        
        // Small delay to ensure storage is persisted
        setTimeout(() => {
          navigate(destination, { replace: true });
        }, 50);

      } catch (error) {
        console.error('[AUTH] ERROR:', error);
        console.error('[AUTH] Error response:', error.response?.data);
        setStatus('Authentication failed');
        toast.error(`Login failed: ${error.response?.data?.detail || error.message}`);
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
        <p className="text-slate-600">{status}</p>
      </div>
    </div>
  );
}

export default AuthCallback;
