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
    // Process exactly once
    if (hasProcessed.current) return;
    hasProcessed.current = true;

    const processSession = async () => {
      try {
        console.log('[CALLBACK] Start processing');
        
        const hash = location.hash;
        const params = new URLSearchParams(hash.substring(1));
        const sessionId = params.get('session_id');

        if (!sessionId) {
          console.log('[CALLBACK] No session_id');
          toast.error('No session ID found');
          navigate('/', { replace: true });
          return;
        }

        setStatus('Authenticating...');

        // Exchange session_id for user data - this validates with Emergent Auth
        const response = await axios.post(
          `${API}/auth/session`,
          { session_id: sessionId },
          { withCredentials: true }
        );

        const data = response.data;
        const token = data.session_token;

        if (!token) {
          console.log('[CALLBACK] No token in response');
          toast.error('Authentication error');
          navigate('/', { replace: true });
          return;
        }

        console.log('[CALLBACK] Got token, validating with /auth/me');

        // Store token first
        localStorage.setItem('session_token', token);

        // Validate token is working by calling /auth/me
        const meResponse = await axios.get(`${API}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (!meResponse.data?.user_id) {
          throw new Error('Token validation failed');
        }

        console.log('[CALLBACK] Token validated, user:', meResponse.data.email);

        const userData = {
          user_id: meResponse.data.user_id,
          email: meResponse.data.email,
          name: meResponse.data.name,
          is_admin: meResponse.data.is_admin,
          picture: meResponse.data.picture,
        };

        // Now call login to update context state
        await login(userData, token);

        // Clear URL hash
        window.history.replaceState(null, '', window.location.pathname);

        setStatus('Success!');
        toast.success(`Welcome, ${userData.name || userData.email}!`);

        // Get redirect destination
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

        console.log('[CALLBACK] Navigating to:', destination);
        navigate(destination, { replace: true });

      } catch (error) {
        console.error('[CALLBACK] Error:', error);
        localStorage.removeItem('session_token');
        localStorage.removeItem('user_data');
        setStatus('Authentication failed');
        toast.error('Login failed');
        navigate('/', { replace: true });
      }
    };

    processSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
