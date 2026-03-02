import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function ProtectedRoute({ children }) {
  const [isAuthenticated, setIsAuthenticated] = useState(null);
  const [user, setUser] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // CRITICAL: Skip auth check if returning from OAuth callback
    // AuthCallback will exchange the session_id and establish the session first.
    if (window.location.hash?.includes('session_id=')) {
      return;
    }

    // If user data passed from AuthCallback, skip auth check
    if (location.state?.user) {
      const userData = location.state.user;
      setUser(userData);
      setIsAuthenticated(true);
      
      // Check terms but don't redirect if on terms page
      if (!userData.terms_accepted && !location.pathname.includes('/terms')) {
        navigate('/terms', { replace: true, state: { user: userData } });
      }
      return;
    }

    const checkAuth = async () => {
      try {
        const response = await axios.get(`${API}/auth/me`, {
          withCredentials: true
        });
        const userData = response.data;
        setUser(userData);
        setIsAuthenticated(true);
        
        // Check if user has accepted terms (unless already on terms page)
        if (!userData.terms_accepted && !location.pathname.includes('/terms')) {
          navigate('/terms', { replace: true, state: { user: userData } });
        }
      } catch (error) {
        setIsAuthenticated(false);
        navigate('/', { replace: true });
      }
    };

    checkAuth();
  }, [navigate, location.state]);

  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return children;
}

export default ProtectedRoute;