import { useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';

/**
 * Custom hook to automatically initialize socket connection
 * Call this in any component that needs socket functionality
 */
export const useSocketInit = () => {
  const { isAuthenticated } = useAuth();
  const { connect, isConnected } = useSocket();

  useEffect(() => {
    if (isAuthenticated && !isConnected) {
      // Try to get token from cookies first, fallback to localStorage
      let token = document.cookie
        .split('; ')
        .find(row => row.startsWith('accessToken='))
        ?.split('=')[1];

      if (!token) {
        token = localStorage.getItem('accessToken') || "";
      }

      if (token) {
        connect(token);
      }
    }
  }, [isAuthenticated, isConnected, connect]);

  return { isConnected };
};
