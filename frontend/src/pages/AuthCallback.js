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
    // Strict guard against double-processing
    if (hasProcessed.current) {
      console.log('[AuthCallback] Already processed, skipping');
      return;
    }
    hasProcessed.current = true;

    const processSession = async () => {
      try {
        console.log('[AuthCallback] ========== START ==========');
        console.log('[AuthCallback] Full URL:', window.location.href);
        console.log('[AuthCallback] Hash:', location.hash);
        console.log('[AuthCallback] Search:', location.search);
        setStatus('Extracting session...');

        const hash = location.hash;
        const hashParams = hash ? new URLSearchParams(hash.substring(1)) : new URLSearchParams();
        const searchParams = new URLSearchParams(location.search);

        // Check for error in URL (direct Google OAuth failure redirect)
        const error = searchParams.get('error');
        if (error) {
          console.error('[AuthCallback] OAuth error:', error);
          toast.error('Google sign-in failed. Please try again or sign in with email.');
          navigate('/login', { replace: true, state: { error: 'Google sign-in failed. Please try again.' } });
          return;
        }

        // ── Direct Google OAuth flow: session_token in hash ──────────────────
        const directToken = hashParams.get('session_token');
        if (directToken) {
          console.log('[AuthCallback] Direct Google OAuth token found');
          setStatus('Authenticating...');

          // Clear the hash immediately to avoid token in browser history
          window.history.replaceState(null, '', window.location.pathname);

          // Fetch user data from the backend using the token
          const meResp = await axios.get(`${API}/auth/me`, {
            headers: { Authorization: `Bearer ${directToken}` },
            withCredentials: true,
          });

          const data = meResp.data;
          const token = directToken;

          localStorage.setItem('session_token', token);
          const userData = {
            user_id: data.user_id,
            email: data.email,
            name: data.name,
            is_admin: data.is_admin,
            picture: data.picture,
          };
          localStorage.setItem('user_data', JSON.stringify(userData));
          login(userData, token);

          setStatus('Login successful!');
          toast.success(`Welcome, ${userData.name || userData.email}!`);
          window.location.replace('/dashboard');
          return;
        }

        // ── Legacy Emergent Auth flow: session_id in hash/query ──────────────
        let sessionId = hashParams.get('session_id') || searchParams.get('session_id');

        if (!sessionId) {
          console.error('[AuthCallback] No session_id or session_token in URL');
          toast.error('Google sign-in failed. No session found.');
          navigate('/login', { replace: true, state: { error: 'Google sign-in failed. Please try again.' } });
          return;
        }

        console.log('[AuthCallback] Session ID:', sessionId.substring(0, 15) + '...');
        setStatus('Authenticating...');

        console.log('[GOOGLE_AUTH] Exchanging session_id with backend...');
        const response = await axios.post(
          `${API}/auth/google/callback`,
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

        // Write to localStorage FIRST before anything else
        localStorage.setItem('session_token', token);
        localStorage.setItem('user_data', JSON.stringify(userData));

        // Verify both values exist
        const storedToken = localStorage.getItem('session_token');
        const storedUser = localStorage.getItem('user_data');
        
        if (!storedToken || !storedUser) {
          console.error('[AuthCallback] localStorage write failed');
          toast.error('Failed to save login session');
          navigate('/', { replace: true });
          return;
        }

        console.log('[AuthCallback] localStorage verified:', storedToken ? 'YES' : 'NO');

        // Call login() to keep context in sync
        login(userData, token);

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
        
        // Navigate using replace to prevent back-button issues
        window.location.replace(destination);

      } catch (error) {
        console.error('[AuthCallback] Error:', error);
        setStatus('Authentication failed');
        toast.error(`Login failed: ${error.response?.data?.detail || error.message}`);
        navigate('/', { replace: true });
      }
    };

    processSession();
  }, []); // Empty dependency array - run only once on mount

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-white">
      <div className="text-center">
        <img src="/trusttrade-logo-final.png" alt="TrustTrade" className="h-14 mx-auto mb-6 object-contain" />
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-slate-600">{status}</p>
        <p className="text-sm text-slate-400 mt-2">Signing you in...</p>
      </div>
    </div>
  );
}

export default AuthCallback;