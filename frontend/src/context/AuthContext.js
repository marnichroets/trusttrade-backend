import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../utils/api';

const AuthContext = createContext(null);

// Initialize state synchronously from localStorage to prevent flash
const getInitialState = () => {
  const token = localStorage.getItem('session_token');
  const storedUser = localStorage.getItem('user_data');
  
  if (token && storedUser) {
    try {
      const userData = JSON.parse(storedUser);
      console.log('[AuthContext] Initial state from localStorage:', userData.email);
      return { user: userData, isAuthenticated: true };
    } catch (e) {
      console.error('[AuthContext] Failed to parse stored user');
    }
  }
  return { user: null, isAuthenticated: false };
};

export function AuthProvider({ children }) {
  // Initialize synchronously from localStorage
  const initialState = getInitialState();
  const [user, setUser] = useState(initialState.user);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(initialState.isAuthenticated);

  // Verify auth state on mount (background validation)
  useEffect(() => {
    console.log('[AuthContext] Initializing - pre-loaded auth:', !!localStorage.getItem('session_token'));
    verifyAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const verifyAuth = async () => {
    const token = localStorage.getItem('session_token');
    const storedUser = localStorage.getItem('user_data');
    
    console.log('[AuthContext] Verifying - Token exists:', !!token);
    console.log('[AuthContext] Verifying - Stored user exists:', !!storedUser);

    if (!token) {
      console.log('[AuthContext] No token - user not authenticated');
      setUser(null);
      setIsAuthenticated(false);
      setLoading(false);
      return;
    }

    // We have a token - verify with API in background
    try {
      console.log('[AuthContext] Verifying token with API...');
      const response = await api.get('/auth/me');
      
      if (response.data?.user_id) {
        console.log('[AuthContext] Token valid, user:', response.data.email);
        const userData = {
          user_id: response.data.user_id,
          email: response.data.email,
          name: response.data.name,
          is_admin: response.data.is_admin,
          picture: response.data.picture,
        };
        setUser(userData);
        setIsAuthenticated(true);
        localStorage.setItem('user_data', JSON.stringify(userData));
      } else {
        throw new Error('Invalid response');
      }
    } catch (error) {
      console.error('[AuthContext] Token validation failed:', error.response?.status || error.message);
      // Only clear if it's a 401 (invalid token), not network errors
      if (error.response?.status === 401) {
        console.log('[AuthContext] Clearing invalid token');
        localStorage.removeItem('session_token');
        localStorage.removeItem('user_data');
        setUser(null);
        setIsAuthenticated(false);
      }
      // If network error but we have stored user, keep them logged in
    } finally {
      setLoading(false);
    }
  };

  // Login function - called after successful OAuth
  const login = useCallback((userData, token) => {
    console.log('[AuthContext] Login called for:', userData.email);
    console.log('[AuthContext] Token:', token ? token.substring(0, 15) + '...' : 'NONE');
    
    // Store in localStorage
    localStorage.setItem('session_token', token);
    localStorage.setItem('user_data', JSON.stringify(userData));
    
    // Update state
    setUser(userData);
    setIsAuthenticated(true);
    
    console.log('[AuthContext] Login complete - isAuthenticated:', true);
  }, []);

  // Logout function
  const logout = useCallback(async () => {
    console.log('[AuthContext] Logout called');
    
    try {
      await api.post('/auth/logout');
    } catch (error) {
      console.error('[AuthContext] Logout API error:', error);
    }
    
    // Clear everything
    localStorage.removeItem('session_token');
    localStorage.removeItem('user_data');
    setUser(null);
    setIsAuthenticated(false);
    
    console.log('[AuthContext] Logout complete');
  }, []);

  // Refresh user data from API
  const refreshUser = useCallback(async () => {
    console.log('[AuthContext] Refreshing user data...');
    try {
      const response = await api.get('/auth/me');
      if (response.data?.user_id) {
        const userData = {
          user_id: response.data.user_id,
          email: response.data.email,
          name: response.data.name,
          is_admin: response.data.is_admin,
          picture: response.data.picture,
        };
        setUser(userData);
        localStorage.setItem('user_data', JSON.stringify(userData));
        return userData;
      }
    } catch (error) {
      console.error('[AuthContext] Refresh failed:', error);
    }
    return null;
  }, []);

  const value = {
    user,
    loading,
    isAuthenticated,
    login,
    logout,
    refreshUser,
  };

  console.log('[AuthContext] Render - loading:', loading, 'isAuthenticated:', isAuthenticated, 'user:', user?.email);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;
