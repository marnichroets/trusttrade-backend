import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../utils/api';

function ProtectedRoute({ children }) {
  const [isAuthenticated, setIsAuthenticated] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (window.location.hash?.includes('session_id=')) return;

    const token = localStorage.getItem('session_token');
    console.log('ProtectedRoute: Checking auth, token exists:', !!token);

    api.get('/auth/me')
      .then(res => {
        console.log('ProtectedRoute: Auth success, user:', res.data?.email);
        if (res.data?.user_id) setIsAuthenticated(true);
        else setIsAuthenticated(false);
      })
      .catch((err) => {
        console.log('ProtectedRoute: Auth failed:', err.response?.status);
        localStorage.removeItem('session_token');
        setIsAuthenticated(false);
      });
  }, [location.pathname]);

  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    console.log('ProtectedRoute: Not authenticated, redirecting to /');
    navigate('/', { replace: true });
    return null;
  }

  return children;
}

export default ProtectedRoute;
