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
          // If authentication fails, clear token and logout
          if (err.message && (err.message.includes('401') || err.message.includes('Unauthorized') || err.message.includes('403'))) {
            authAPI.logout();
            setUser(null);
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
