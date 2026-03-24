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
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Clear invalid token
      localStorage.removeItem('session_token');
      // Optionally redirect to login
      // window.location.href = '/';
    }
    return Promise.reject(error);
  }
);

export default api;
export { API_URL };
