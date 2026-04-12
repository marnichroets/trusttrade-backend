import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import api from '../utils/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // Track if we've initialized to prevent re-runs
  const initialized = useRef(false);
  
  // Initialize state synchronously from localStorage
  const [user, setUser] = useState(() => {
    const storedUser = localStorage.getItem('user_data');
    if (storedUser) {
      try {
        return JSON.parse(storedUser);
      } catch (e) {
        return null;
      }
    }
    return null;
  });
  
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    const token = localStorage.getItem('session_token');
    const storedUser = localStorage.getItem('user_data');
    return !!(token && storedUser);
  });
  
  const [loading, setLoading] = useState(true);

  // Initialize ONCE on mount
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    
    // CRITICAL: If returning from OAuth callback, skip the /me check.
    // AuthCallback will exchange the session_id and establish the session first.
    if (window.location.hash?.includes('session_id=')) {
      console.log('[AUTH] Skipping /me check - OAuth callback in progress');
      setLoading(false);
      return;
    }
    
    const token = localStorage.getItem('session_token');
    console.log('[AUTH_STATE_INITIALIZED] token:', token ? 'YES' : 'NO', 'isAuthenticated:', !!(token && localStorage.getItem('user_data')));
    
    if (!token) {
      setLoading(false);
      return;
    }

    // Verify token in background
    api.get('/auth/me')
      .then(response => {
        if (response.data?.user_id) {
          console.log('[TOKEN_VALID] user:', response.data.email);
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
        }
      })
      .catch(error => {
        console.log('[TOKEN_INVALID]', error.response?.status || error.message);
        if (error.response?.status === 401) {
          localStorage.removeItem('session_token');
          localStorage.removeItem('user_data');
          setUser(null);
          setIsAuthenticated(false);
        }
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  // Login function - called after successful OAuth
  const login = useCallback((userData, token) => {
    console.log('[LOGIN_CALLED] user:', userData.email);
    
    // Store in localStorage FIRST
    localStorage.setItem('session_token', token);
    localStorage.setItem('user_data', JSON.stringify(userData));
    
    // Then update state
    setUser(userData);
    setIsAuthenticated(true);
    setLoading(false);
    
    console.log('[LOGIN_COMPLETE] isAuthenticated: true');
  }, []);

  // Logout function
  const logout = useCallback(async () => {
    console.log('[LOGOUT_CALLED]');
    
    try {
      await api.post('/auth/logout');
    } catch (error) {
      // Ignore logout API errors
    }
    
    localStorage.removeItem('session_token');
    localStorage.removeItem('user_data');
    setUser(null);
    setIsAuthenticated(false);
    
    console.log('[LOGOUT_COMPLETE]');
  }, []);

  // Refresh user data from API
  const refreshUser = useCallback(async () => {
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
      console.error('[REFRESH_FAILED]', error);
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

