import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import api from '../utils/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const initialized = useRef(false);
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  // Validate token with backend on mount
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const validateToken = async () => {
      const token = localStorage.getItem('session_token');
      
      if (!token) {
        setIsAuthenticated(false);
        setUser(null);
        setLoading(false);
        return;
      }

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
          setIsAuthenticated(true);
          localStorage.setItem('user_data', JSON.stringify(userData));
        } else {
          throw new Error('Invalid response');
        }
      } catch (error) {
        localStorage.removeItem('session_token');
        localStorage.removeItem('user_data');
        setUser(null);
        setIsAuthenticated(false);
      }
      // ALWAYS set loading to false
      setLoading(false);
    };

    // Timeout to guarantee loading exits
    const timeout = setTimeout(() => {
      setLoading(false);
    }, 5000);

    validateToken().finally(() => clearTimeout(timeout));
  }, []);

  // Login: store token and validate with backend
  const login = useCallback(async (userData, token) => {
    console.log('[AUTH] Login called for:', userData.email);
    
    // Store token
    localStorage.setItem('session_token', token);
    localStorage.setItem('user_data', JSON.stringify(userData));
    
    // Set state - token is already validated by AuthCallback
    setUser(userData);
    setIsAuthenticated(true);
    setLoading(false);
    
    console.log('[AUTH] Login complete');
  }, []);

  // Logout
  const logout = useCallback(async () => {
    console.log('[AUTH] Logout called');
    
    try {
      await api.post('/auth/logout');
    } catch (error) {
      // Ignore
    }
    
    localStorage.removeItem('session_token');
    localStorage.removeItem('user_data');
    setUser(null);
    setIsAuthenticated(false);
    
    console.log('[AUTH] Logout complete');
  }, []);

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
      console.error('[AUTH] Refresh failed:', error);
    }
    return null;
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, isAuthenticated, login, logout, refreshUser }}>
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
