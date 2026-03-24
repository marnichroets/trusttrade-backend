import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    console.log('[ProtectedRoute] Check - loading:', loading, 'isAuthenticated:', isAuthenticated);
    
    if (!loading && !isAuthenticated) {
      console.log('[ProtectedRoute] Not authenticated, redirecting to /');
      navigate('/', { replace: true });
    }
  }, [loading, isAuthenticated, navigate]);

  // Show loading while checking auth
  if (loading) {
    console.log('[ProtectedRoute] Loading...');
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-500 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  // Not authenticated
  if (!isAuthenticated) {
    console.log('[ProtectedRoute] Not authenticated, returning null');
    return null;
  }

  // Authenticated - render children
  console.log('[ProtectedRoute] Authenticated, rendering children');
  return children;
}

export default ProtectedRoute;
