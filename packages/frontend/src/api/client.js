const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

/**
 * Get the current user's auth token from localStorage
 */
const getAuthToken = () => {
  const token = localStorage.getItem('token');
  if (!token) {
    throw new Error('No authenticated user');
  }
  return token;
};

/**
 * Make an authenticated API request
 */
const apiRequest = async (endpoint, options = {}) => {
  try {
    const token = getAuthToken();

    const defaultHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        ...defaultHeaders,
        ...options.headers
      }
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('API request error:', error);
    throw error;
  }
};

// ==================== Clients API ====================

export const clientsApi = {
  getAll: (params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    return apiRequest(`/clients${queryString ? `?${queryString}` : ''}`);
  },

  getById: (id) => {
    return apiRequest(`/clients/${id}`);
  },

  getNextId: () => {
    return apiRequest('/clients/next-id');
  },

  create: (clientData) => {
    return apiRequest('/clients', {
      method: 'POST',
      body: JSON.stringify(clientData)
    });
  },

  update: (id, clientData) => {
    return apiRequest(`/clients/${id}`, {
      method: 'PUT',
      body: JSON.stringify(clientData)
    });
  },

  delete: (id) => {
    return apiRequest(`/clients/${id}`, {
      method: 'DELETE'
    });
  },

  batchImport: (clients) => {
    return apiRequest('/clients/batch', {
      method: 'POST',
      body: JSON.stringify({ clients })
    });
  }
};

// ==================== Stock API ====================

export const stockApi = {
  getAll: (params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    return apiRequest(`/stock${queryString ? `?${queryString}` : ''}`);
  },

  getById: (id) => {
    return apiRequest(`/stock/${id}`);
  },

  create: (stockData) => {
    return apiRequest('/stock', {
      method: 'POST',
      body: JSON.stringify(stockData)
    });
  },

  update: (id, stockData) => {
    return apiRequest(`/stock/${id}`, {
      method: 'PUT',
      body: JSON.stringify(stockData)
    });
  },

  delete: (id) => {
    return apiRequest(`/stock/${id}`, {
      method: 'DELETE'
    });
  },

  batchImport: (items) => {
    return apiRequest('/stock/batch', {
      method: 'POST',
      body: JSON.stringify({ items })
    });
  }
};

// ==================== Documents API (Proformas & Invoices) ====================

export const documentsApi = {
  getAll: (params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    return apiRequest(`/documents${queryString ? `?${queryString}` : ''}`);
  },

  getById: (id) => {
    return apiRequest(`/documents/${id}`);
  },

  create: (documentData) => {
    return apiRequest('/documents', {
      method: 'POST',
      body: JSON.stringify(documentData)
    });
  },

  update: (id, documentData) => {
    return apiRequest(`/documents/${id}`, {
      method: 'PUT',
      body: JSON.stringify(documentData)
    });
  },

  delete: (id) => {
    return apiRequest(`/documents/${id}`, {
      method: 'DELETE'
    });
  },

  convertToInvoice: (id, newDocumentNumber) => {
    return apiRequest(`/documents/${id}/convert`, {
      method: 'POST',
      body: JSON.stringify({ newDocumentNumber })
    });
  }
};

// ==================== Payments API ====================

export const paymentsApi = {
  getAll: (params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    return apiRequest(`/payments${queryString ? `?${queryString}` : ''}`);
  },

  getById: (id) => {
    return apiRequest(`/payments/${id}`);
  },

  create: (paymentData) => {
    return apiRequest('/payments', {
      method: 'POST',
      body: JSON.stringify(paymentData)
    });
  },

  update: (id, paymentData) => {
    return apiRequest(`/payments/${id}`, {
      method: 'PUT',
      body: JSON.stringify(paymentData)
    });
  },

  delete: (id) => {
    return apiRequest(`/payments/${id}`, {
      method: 'DELETE'
    });
  }
};

// ==================== Expenses API ====================

export const expensesApi = {
  getAll: (params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    return apiRequest(`/expenses${queryString ? `?${queryString}` : ''}`);
  },

  getById: (id) => {
    return apiRequest(`/expenses/${id}`);
  },

  create: (expenseData) => {
    return apiRequest('/expenses', {
      method: 'POST',
      body: JSON.stringify(expenseData)
    });
  },

  update: (id, expenseData) => {
    return apiRequest(`/expenses/${id}`, {
      method: 'PUT',
      body: JSON.stringify(expenseData)
    });
  },

  delete: (id) => {
    return apiRequest(`/expenses/${id}`, {
      method: 'DELETE'
    });
  }
};

// ==================== Settings API ====================

export const settingsApi = {
  get: () => {
    return apiRequest('/settings');
  },

  update: (settingsData) => {
    return apiRequest('/settings', {
      method: 'PUT',
      body: JSON.stringify(settingsData)
    });
  }
};

// ==================== Auth API ====================

export const authApi = {
  verify: async () => {
    const token = await getAuthToken();
    const response = await fetch(`${API_BASE_URL}/auth/verify`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      throw new Error('Token verification failed');
    }

    return await response.json();
  }
};
