const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

// Token management
const TOKEN_KEY = 'auth_token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token) => localStorage.setItem(TOKEN_KEY, token);
export const removeToken = () => localStorage.removeItem(TOKEN_KEY);

// Retry helper with exponential backoff
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const apiRequest = async (endpoint, options = {}, retryCount = 0) => {
  const MAX_RETRIES = 3;
  const INITIAL_RETRY_DELAY = 1000; // 1 second

  // Don't send token for public endpoints (login, register)
  const isPublicEndpoint = endpoint === '/auth/login' || endpoint === '/auth/register';
  
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  // Only add Authorization header if token exists AND it's not a public endpoint
  if (token && !isPublicEndpoint) {
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

    // Handle 429 (Too Many Requests) with retry logic
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      const retryDelay = retryAfter 
        ? parseInt(retryAfter) * 1000 
        : INITIAL_RETRY_DELAY * Math.pow(2, retryCount);

      if (retryCount < MAX_RETRIES) {
        console.warn(`Rate limited (429). Retrying in ${retryDelay}ms... (attempt ${retryCount + 1}/${MAX_RETRIES})`);
        await sleep(retryDelay);
        return apiRequest(endpoint, options, retryCount + 1);
      } else {
        // Max retries reached - read response body once
        let errorMessage = 'Too many requests. Please wait a moment and try again.';
        try {
          const contentType = response.headers.get('content-type');
          const text = await response.text();
          if (contentType && contentType.includes('application/json')) {
            const data = JSON.parse(text);
            errorMessage = data.error || data.message || errorMessage;
          } else if (text && text.trim()) {
            errorMessage = text;
          }
        } catch (parseError) {
          // If we can't parse the error, use default message
          console.error('Error parsing 429 response:', parseError);
        }
        throw new Error(errorMessage);
      }
    }

    // Read response body once
    const contentType = response.headers.get('content-type');
    let responseText;
    let data;
    
    try {
      responseText = await response.text();
      
      // Try to parse JSON, but handle non-JSON responses gracefully
      if (contentType && contentType.includes('application/json')) {
        data = responseText ? JSON.parse(responseText) : null;
      } else {
        // Non-JSON response
        if (!response.ok) {
          // For error responses, use the text as error message
          throw new Error(responseText || `HTTP error! status: ${response.status}`);
        }
        // For successful non-JSON responses, return the text
        return responseText;
      }
    } catch (parseError) {
      // If JSON parsing fails and it's an error response, use text as error
      if (!response.ok) {
        throw new Error(responseText || `HTTP error! status: ${response.status}`);
      }
      throw parseError;
    }

    if (!response.ok) {
      const errorMessage = data?.error || data?.message || `HTTP error! status: ${response.status}`;
      
      // Handle 401 Unauthorized - clear token if it's invalid
      if (response.status === 401) {
        // Only remove token if it's not a public endpoint (login/register)
        // For public endpoints, 401 means invalid credentials, not invalid token
        if (!isPublicEndpoint) {
          removeToken();
          throw new Error('Session expired. Please log in again.');
        } else {
          // For login/register, the error message is about invalid credentials
          throw new Error(errorMessage);
        }
      }
      
      throw new Error(errorMessage);
    }

    return data;
  } catch (error) {
    // Don't log retry attempts as errors
    if (error.message && !error.message.includes('Too many requests')) {
      console.error('API request error:', error);
    }
    throw error;
  }
};

// Authentication API
export const authAPI = {
  register: async (email, password, name = '') => {
    // Clear any existing token before register attempt to avoid conflicts
    removeToken();
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
    // Clear any existing token before login attempt to avoid conflicts
    removeToken();
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
  getAll: async (search = '', limit = 50, page = 1) => {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (limit) params.append('limit', limit);
    if (page) params.append('page', page);
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
  getAll: async (search = '', limit = 50, page = 1) => {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (limit) params.append('limit', limit);
    if (page) params.append('page', page);
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
  getAll: async (type = null, status = null, limit = 50, page = 1, search = '', includeItems = false) => {
    const params = new URLSearchParams();
    if (type) params.append('type', type);
    if (status) params.append('status', status);
    if (limit) params.append('limit', limit);
    if (page) params.append('page', page);
    if (search) params.append('search', search);
    if (includeItems) params.append('includeItems', 'true');
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
  getAll: async (clientId = null, limit = 50, page = 1, search = '') => {
    const params = new URLSearchParams();
    if (clientId) params.append('clientId', clientId);
    if (limit) params.append('limit', limit);
    if (page) params.append('page', page);
    if (search) params.append('search', search);
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

// Admin API
export const adminAPI = {
  getUsers: async () => {
    return apiRequest('/admin/users');
  },

  getStats: async () => {
    return apiRequest('/admin/stats');
  },

  getUserDetails: async (userId) => {
    return apiRequest(`/admin/users/${userId}`);
  },

  updateUserPassword: async (userId, newPassword) => {
    return apiRequest(`/admin/users/${userId}/password`, {
      method: 'PUT',
      body: JSON.stringify({ newPassword }),
    });
  },

  deleteUser: async (userId) => {
    return apiRequest(`/admin/users/${userId}?confirm=true`, {
      method: 'DELETE',
    });
  },

  getUnusedStock: async (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/admin/unused/stock${query ? `?${query}` : ''}`);
  },

  getUnusedClients: async (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/admin/unused/clients${query ? `?${query}` : ''}`);
  },

  deleteUnusedStock: async (ids) => {
    return apiRequest('/admin/unused/stock', {
      method: 'DELETE',
      body: JSON.stringify({ ids }),
    });
  },

  deleteUnusedClients: async (ids) => {
    return apiRequest('/admin/unused/clients', {
      method: 'DELETE',
      body: JSON.stringify({ ids }),
    });
  },

  getDocuments: async (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/admin/documents${query ? `?${query}` : ''}`);
  },

  deleteDocuments: async (ids) => {
    return apiRequest('/admin/documents', {
      method: 'DELETE',
      body: JSON.stringify({ ids }),
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
