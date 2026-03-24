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
  const { login } = useAuth();
  const hasProcessed = useRef(false);
  const [status, setStatus] = useState('Processing...');

  useEffect(() => {
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
        console.log('[AuthCallback] URL hash:', hash);
        
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

        console.log('[AuthCallback] API response status:', response.status);
        
        const data = response.data;
        const token = data.session_token;
        
        console.log('[AuthCallback] User:', data.email);
        console.log('[AuthCallback] Token received:', token ? 'YES' : 'NO');

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

        // Use AuthContext login function to update global state
        console.log('[AuthCallback] Calling login()...');
        login(userData, token);
        
        // Verify it worked
        const storedToken = localStorage.getItem('session_token');
        console.log('[AuthCallback] Token in localStorage after login:', storedToken ? 'YES' : 'NO');

        setStatus('Login successful!');
        toast.success(`Welcome, ${userData.name || userData.email}!`);

        // Clear URL hash
        window.history.replaceState(null, '', window.location.pathname);

        // Determine redirect
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

        console.log('[AuthCallback] Navigating to:', destination);
        console.log('[AuthCallback] ========== END ==========');
        
        // Navigate immediately - state is already updated
        navigate(destination, { replace: true });

      } catch (error) {
        console.error('[AuthCallback] Error:', error);
        console.error('[AuthCallback] Error response:', error.response?.data);
        setStatus('Authentication failed');
        toast.error(`Login failed: ${error.response?.data?.detail || error.message}`);
        navigate('/', { replace: true });
      }
    };

    processSession();
  }, [navigate, location.hash, login]);

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
