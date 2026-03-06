/**
 * API Configuration
 * 
 * This file centralizes all API URLs for the application.
 * Uses environment variables for production deployment.
 */

// Get API URL from environment variable or use localhost for development
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

// Socket.IO uses the same URL as the API
export const SOCKET_URL = API_URL;

// API endpoints
export const API_ENDPOINTS = {
  // Auth
  LOGIN: `${API_URL}/api/users/login`,
  REGISTER: `${API_URL}/api/users/register`,
  LOGOUT: `${API_URL}/api/users/logout`,
  ME: `${API_URL}/api/users/me`,
  LOCATION_ACCESS: `${API_URL}/api/users/location-access`,
  
  // OAuth
  GOOGLE_AUTH: `${API_URL}/api/users/auth/google`,
  GOOGLE_CALLBACK: `${API_URL}/api/users/auth/google/callback`,
  
  // Driver
  DRIVER_ME: `${API_URL}/api/drivers/me`,
  DRIVER_CREATE: `${API_URL}/api/drivers`,
  DRIVER_STATUS: `${API_URL}/api/drivers/status`,
  DRIVER_LOCATION: `${API_URL}/api/drivers/location`,
  
  // Rides
  RIDE_REQUEST: `${API_URL}/api/rides/request`,
  RIDE_HISTORY: `${API_URL}/api/rides/user`,
  
  // Admin
  ADMIN_PENDING_DRIVERS: `${API_URL}/api/admin/drivers/pending`,
  ADMIN_VERIFY_DRIVER: (driverId: string) => `${API_URL}/api/admin/drivers/${driverId}/verify`,
  ADMIN_BLOCK_DRIVER: (driverId: string) => `${API_URL}/api/admin/drivers/${driverId}/block`,
  
  // Health
  HEALTH: `${API_URL}/health`,
};

// Helper function to make authenticated requests
export const fetchWithAuth = async (url: string, options: RequestInit = {}) => {
  const token = localStorage.getItem('accessToken');
  
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  
  // Add Authorization header if token exists
  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }
  
  return fetch(url, {
    ...options,
    credentials: 'include',
    headers,
  });
};
