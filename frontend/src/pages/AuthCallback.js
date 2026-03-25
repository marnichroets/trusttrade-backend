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
    if (hasProcessed.current) return;
    hasProcessed.current = true;

    const timeout = setTimeout(() => {
      localStorage.removeItem('session_token');
      localStorage.removeItem('user_data');
      window.location.href = '/';
    }, 10000);

    const processSession = async () => {
      try {
        const hash = location.hash;
        const params = new URLSearchParams(hash.substring(1));
        const sessionId = params.get('session_id');

        if (!sessionId) {
          clearTimeout(timeout);
          window.location.href = '/';
          return;
        }

        setStatus('Authenticating...');

        const response = await axios.post(
          `${API}/auth/session`,
          { session_id: sessionId },
          { withCredentials: true }
        );

        const token = response.data.session_token;
        if (!token) {
          clearTimeout(timeout);
          window.location.href = '/';
          return;
        }

        localStorage.setItem('session_token', token);

        const meResponse = await axios.get(`${API}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (!meResponse.data?.user_id) {
          throw new Error('Validation failed');
        }

        const userData = {
          user_id: meResponse.data.user_id,
          email: meResponse.data.email,
          name: meResponse.data.name,
          is_admin: meResponse.data.is_admin,
          picture: meResponse.data.picture,
        };

        localStorage.setItem('user_data', JSON.stringify(userData));
        
        clearTimeout(timeout);
        
        // Call login to update context
        await login(userData, token);
        
        toast.success(`Welcome, ${userData.name || userData.email}!`);
        
        // Use window.location for full page load - ensures AuthContext re-initializes with token
        window.location.href = '/dashboard';

      } catch (error) {
        console.error('[CALLBACK] Error:', error);
        clearTimeout(timeout);
        localStorage.removeItem('session_token');
        localStorage.removeItem('user_data');
        window.location.href = '/';
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
