import axios from 'axios';

const API_URL = process.env.REACT_APP_BACKEND_URL;

// Create axios instance with default config
const api = axios.create({
  baseURL: `${API_URL}/api`,
  withCredentials: true,
});

// Request interceptor to add Authorization header from localStorage
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('session_token');
    console.log('[API] Request interceptor:', config.method?.toUpperCase(), config.url);
    console.log('[API] Token from localStorage:', token ? token.substring(0, 20) + '...' : 'NULL');
    
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
      console.log('[API] Authorization header added');
    } else {
      console.log('[API] No token - request will use cookies only');
    }
    return config;
  },
  (error) => {
    console.error('[API] Request interceptor error:', error);
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
    console.error('[API] Response error:', error.response?.status, error.config?.url);
    if (error.response?.status === 401) {
      console.log('[API] 401 Unauthorized - clearing localStorage token');
      localStorage.removeItem('session_token');
    }
    return Promise.reject(error);
  }
);

export default api;
export { API_URL };
