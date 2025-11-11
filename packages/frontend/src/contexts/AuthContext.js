import React, { createContext, useState, useEffect, useContext } from 'react';
import { authAPI, getToken } from '../services/api';

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Check if user is already logged in on mount
  useEffect(() => {
    const checkAuth = async () => {
      const token = getToken();
      if (token) {
        try {
          const response = await authAPI.getCurrentUser();
          setUser(response.user);
        } catch (err) {
          console.error('Failed to get current user:', err);

          // Only logout on authentication errors (401/403), not network errors
          // This prevents logging out users when backend is temporarily unavailable
          if (err.message && (err.message.includes('401') || err.message.includes('Unauthorized') || err.message.includes('403'))) {
            console.log('Authentication failed, logging out');
            authAPI.logout();
            setUser(null);
          } else {
            // Network error or server error - keep user logged in
            // They can retry by navigating or refreshing
            console.log('Network/server error, keeping user logged in with cached token');
            // Try to decode the token to get basic user info
            try {
              const tokenParts = token.split('.');
              if (tokenParts.length === 3) {
                const payload = JSON.parse(atob(tokenParts[1]));
                setUser({
                  id: payload.userId,
                  email: payload.email,
                  _cachedFromToken: true
                });
              }
            } catch (decodeErr) {
              console.error('Failed to decode token:', decodeErr);
            }
          }
        }
      }
      setLoading(false);
    };

    checkAuth();
  }, []);

  const login = async (email, password) => {
    try {
      setError(null);
      const response = await authAPI.login(email, password);
      setUser(response.user);
      return { success: true };
    } catch (err) {
      const errorMessage = err.message || 'Failed to log in';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const register = async (email, password, name = '') => {
    try {
      setError(null);
      const response = await authAPI.register(email, password, name);
      setUser(response.user);
      return { success: true };
    } catch (err) {
      const errorMessage = err.message || 'Failed to register';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const logout = () => {
    authAPI.logout();
    setUser(null);
  };

  const value = {
    user,
    loading,
    error,
    login,
    register,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
