import axios from 'axios';

const API_URL = process.env.REACT_APP_BACKEND_URL;

console.log('[API] Initializing with base URL:', API_URL);

// Create axios instance with default config
const api = axios.create({
  baseURL: `${API_URL}/api`,
  withCredentials: true,
  timeout: 30000,
});

// Request interceptor to add Authorization header from localStorage
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('session_token');
    
    console.log('[API] Request:', config.method?.toUpperCase(), config.url);
    console.log('[API] Token:', token ? 'Present (' + token.substring(0, 15) + '...)' : 'Not found');
    
    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }
    
    return config;
  },
  (error) => {
    console.error('[API] Request error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor to handle auth errors
api.interceptors.response.use(
  (response) => {
    console.log('[API] Response:', response.status, response.config.url);
    return response;
  },
  (error) => {
    const status = error.response?.status;
    const url = error.config?.url;
    console.error('[API] Error:', status, url, error.message);
    
    if (status === 401) {
      console.log('[API] 401 Unauthorized - token may be invalid');
      // Don't clear token here - let ProtectedRoute handle it
    }
    
    return Promise.reject(error);
  }
);

export default api;
export { API_URL };
