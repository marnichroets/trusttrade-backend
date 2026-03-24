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
    // Skip auth check if returning from OAuth callback
    if (window.location.hash?.includes('session_id=')) {
      console.log('ProtectedRoute: OAuth callback detected, skipping auth check');
      return;
    }

    const checkAuth = async () => {
      console.log('ProtectedRoute: Checking authentication...');
      try {
        // Add timeout to prevent infinite loading
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        const response = await axios.get(`${API}/auth/me`, {
          withCredentials: true,
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        console.log('ProtectedRoute: User authenticated:', response.data?.email);
        setUser(response.data);
        setIsAuthenticated(true);
      } catch (error) {
        console.log('ProtectedRoute: Not authenticated, error:', error.response?.status || error.name);
        setIsAuthenticated(false);
      }
    };

    checkAuth();
  }, [location.pathname]); // Re-check on route change

  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    // Store current path for redirect after login
    const currentPath = location.pathname + location.search;
    if (currentPath !== '/' && currentPath !== '/dashboard') {
      sessionStorage.setItem('redirectAfterLogin', currentPath);
    }
    
    // Redirect to landing page
    navigate('/', { replace: true });
    return null;
  }

  return children;
}

export default ProtectedRoute;
