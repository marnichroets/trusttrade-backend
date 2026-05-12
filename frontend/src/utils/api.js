import axios from 'axios';

// Support both env var names for flexibility (Railway uses REACT_APP_API_URL)
const API_URL = process.env.REACT_APP_API_URL || process.env.REACT_APP_BACKEND_URL;

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
    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor to handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // 401s are handled by ProtectedRoute — don't clear token here
    return Promise.reject(error);
  }
);

export default api;
export { API_URL };
