const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

// Token management
const TOKEN_KEY = 'auth_token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token) => localStorage.setItem(TOKEN_KEY, token);
export const removeToken = () => localStorage.removeItem(TOKEN_KEY);

// API request helper
const apiRequest = async (endpoint, options = {}) => {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const config = {
    ...options,
    headers,
  };

  try {
    const response = await fetch(`${API_URL}${endpoint}`, config);

    // Handle non-JSON responses (like 204 No Content)
    if (response.status === 204) {
      return null;
    }

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `HTTP error! status: ${response.status}`);
    }

    return data;
  } catch (error) {
    console.error('API request error:', error);
    throw error;
  }
};

// Authentication API
export const authAPI = {
  register: async (email, password, name = '') => {
    const data = await apiRequest('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    });
    if (data.token) {
      setToken(data.token);
    }
    return data;
  },

  login: async (email, password) => {
    const data = await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (data.token) {
      setToken(data.token);
    }
    return data;
  },

  logout: () => {
    removeToken();
  },

  getCurrentUser: async () => {
    return apiRequest('/auth/me');
  },

  updatePassword: async (currentPassword, newPassword) => {
    return apiRequest('/auth/update-password', {
      method: 'PUT',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  },
};

// Clients API
export const clientsAPI = {
  getAll: async (search = '', limit = null) => {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (limit) params.append('limit', limit);
    const query = params.toString() ? `?${params.toString()}` : '';
    return apiRequest(`/clients${query}`);
  },

  getById: async (id) => {
    return apiRequest(`/clients/${id}`);
  },

  getNextId: async () => {
    return apiRequest('/clients/next-id');
  },

  create: async (clientData) => {
    return apiRequest('/clients', {
      method: 'POST',
      body: JSON.stringify(clientData),
    });
  },

  update: async (id, clientData) => {
    return apiRequest(`/clients/${id}`, {
      method: 'PUT',
      body: JSON.stringify(clientData),
    });
  },

  delete: async (id) => {
    return apiRequest(`/clients/${id}`, {
      method: 'DELETE',
    });
  },

  batchCreate: async (clients) => {
    return apiRequest('/clients/batch', {
      method: 'POST',
      body: JSON.stringify({ clients }),
    });
  },
};

// Suppliers API
export const suppliersAPI = {
  getAll: async (search = '', limit = null) => {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (limit) params.append('limit', limit);
    const query = params.toString() ? `?${params.toString()}` : '';
    return apiRequest(`/suppliers${query}`);
  },

  getById: async (id) => {
    return apiRequest(`/suppliers/${id}`);
  },

  create: async (supplierData) => {
    return apiRequest('/suppliers', {
      method: 'POST',
      body: JSON.stringify(supplierData),
    });
  },

  update: async (id, supplierData) => {
    return apiRequest(`/suppliers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(supplierData),
    });
  },

  delete: async (id) => {
    return apiRequest(`/suppliers/${id}`, {
      method: 'DELETE',
    });
  },
};

// Stock API
export const stockAPI = {
  getAll: async (search = '', limit = null) => {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (limit) params.append('limit', limit);
    const query = params.toString() ? `?${params.toString()}` : '';
    return apiRequest(`/stock${query}`);
  },

  getById: async (id) => {
    return apiRequest(`/stock/${id}`);
  },

  create: async (stockData) => {
    return apiRequest('/stock', {
      method: 'POST',
      body: JSON.stringify(stockData),
    });
  },

  update: async (id, stockData) => {
    return apiRequest(`/stock/${id}`, {
      method: 'PUT',
      body: JSON.stringify(stockData),
    });
  },

  delete: async (id) => {
    return apiRequest(`/stock/${id}`, {
      method: 'DELETE',
    });
  },

  batchCreate: async (items) => {
    return apiRequest('/stock/batch', {
      method: 'POST',
      body: JSON.stringify({ items }),
    });
  },
};

// Documents API
export const documentsAPI = {
  getAll: async (type = null, status = null, limit = null) => {
    const params = new URLSearchParams();
    if (type) params.append('type', type);
    if (status) params.append('status', status);
    if (limit) params.append('limit', limit);
    const query = params.toString() ? `?${params.toString()}` : '';
    return apiRequest(`/documents${query}`);
  },

  getById: async (id) => {
    return apiRequest(`/documents/${id}`);
  },

  getNextNumber: async (type) => {
    return apiRequest(`/documents/next-number/${type}`);
  },

  create: async (documentData) => {
    return apiRequest('/documents', {
      method: 'POST',
      body: JSON.stringify(documentData),
    });
  },

  update: async (id, documentData) => {
    return apiRequest(`/documents/${id}`, {
      method: 'PUT',
      body: JSON.stringify(documentData),
    });
  },

  delete: async (id) => {
    return apiRequest(`/documents/${id}`, {
      method: 'DELETE',
    });
  },

  convertToInvoice: async (id, newDocumentNumber = null) => {
    const body = newDocumentNumber ? { newDocumentNumber } : {};
    return apiRequest(`/documents/${id}/convert`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  batchCreate: async (documents) => {
    return apiRequest('/documents/batch', {
      method: 'POST',
      body: JSON.stringify({ documents }),
    });
  },
};

// Payments API
export const paymentsAPI = {
  getAll: async (clientId = null, limit = null) => {
    const params = new URLSearchParams();
    if (clientId) params.append('clientId', clientId);
    if (limit) params.append('limit', limit);
    const query = params.toString() ? `?${params.toString()}` : '';
    return apiRequest(`/payments${query}`);
  },

  getById: async (id) => {
    return apiRequest(`/payments/${id}`);
  },

  create: async (paymentData) => {
    return apiRequest('/payments', {
      method: 'POST',
      body: JSON.stringify(paymentData),
    });
  },

  update: async (id, paymentData) => {
    return apiRequest(`/payments/${id}`, {
      method: 'PUT',
      body: JSON.stringify(paymentData),
    });
  },

  delete: async (id) => {
    return apiRequest(`/payments/${id}`, {
      method: 'DELETE',
    });
  },
};

// Expenses API
export const expensesAPI = {
  getAll: async (category = null, limit = null) => {
    const params = new URLSearchParams();
    if (category) params.append('category', category);
    if (limit) params.append('limit', limit);
    const query = params.toString() ? `?${params.toString()}` : '';
    return apiRequest(`/expenses${query}`);
  },

  getById: async (id) => {
    return apiRequest(`/expenses/${id}`);
  },

  create: async (expenseData) => {
    return apiRequest('/expenses', {
      method: 'POST',
      body: JSON.stringify(expenseData),
    });
  },

  update: async (id, expenseData) => {
    return apiRequest(`/expenses/${id}`, {
      method: 'PUT',
      body: JSON.stringify(expenseData),
    });
  },

  delete: async (id) => {
    return apiRequest(`/expenses/${id}`, {
      method: 'DELETE',
    });
  },
};

// Settings API
export const settingsAPI = {
  get: async () => {
    return apiRequest('/settings');
  },

  update: async (settingsData) => {
    return apiRequest('/settings', {
      method: 'PUT',
      body: JSON.stringify(settingsData),
    });
  },
};

export default {
  auth: authAPI,
  clients: clientsAPI,
  suppliers: suppliersAPI,
  stock: stockAPI,
  documents: documentsAPI,
  payments: paymentsAPI,
  expenses: expensesAPI,
  settings: settingsAPI,
};
