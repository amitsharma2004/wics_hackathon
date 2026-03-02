import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { socketClient } from '../utils/socketClient';

interface SocketContextType {
  // Connection state
  isConnected: boolean;
  socketId: string | null;
  
  // Socket methods
  connect: (token: string) => void;
  disconnect: () => void;
  registerUser: (role: string, coordinates?: [number, number]) => void;
  updateLocation: (coordinates: [number, number]) => void;
  
  // Ride request methods (for riders)
  onRideAccepted: (callback: (data: any) => void) => void;
  onRideRequestExpired: (callback: (data: any) => void) => void;
  
  // Ride request methods (for drivers)
  onRideRequest: (callback: (data: any) => void) => void;
  acceptRide: (requestId: string) => void;
  rejectRide: (requestId: string) => void;
  onRideAcceptSuccess: (callback: (data: any) => void) => void;
  onRideAcceptFailed: (callback: (data: any) => void) => void;
  onRideRequestCancelled: (callback: (data: any) => void) => void;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within SocketProvider');
  }
  return context;
};

interface SocketProviderProps {
  children: ReactNode;
}

export const SocketProvider = ({ children }: SocketProviderProps) => {
  const [isConnected, setIsConnected] = useState(false);
  const [socketId, setSocketId] = useState<string | null>(null);

  // Connect to socket
  const connect = useCallback((token: string) => {
    socketClient.connect(token);
    
    // Listen for connection
    const socket = socketClient.getSocket();
    if (socket) {
      socket.on('connect', () => {
        setIsConnected(true);
        setSocketId(socket.id || null);
        console.log('Socket connected:', socket.id);
      });

      socket.on('disconnect', () => {
        setIsConnected(false);
        setSocketId(null);
        console.log('Socket disconnected');
      });

      socket.on('connect_error', (error: any) => {
        console.error('Socket connection error:', error.message);
        setIsConnected(false);
      });
    }
  }, []);

  // Disconnect socket
  const disconnect = useCallback(() => {
    socketClient.disconnect();
    setIsConnected(false);
    setSocketId(null);
  }, []);

  // Register user with socket
  const registerUser = useCallback((role: string, coordinates?: [number, number]) => {
    socketClient.registerUser(role, coordinates);
  }, []);

  // Update location
  const updateLocation = useCallback((coordinates: [number, number]) => {
    socketClient.updateLocation(coordinates);
  }, []);

  // Ride request listeners (for riders)
  const onRideAccepted = useCallback((callback: (data: any) => void) => {
    socketClient.onRideAccepted(callback);
  }, []);

  const onRideRequestExpired = useCallback((callback: (data: any) => void) => {
    socketClient.onRideRequestExpired(callback);
  }, []);

  // Ride request methods (for drivers)
  const onRideRequest = useCallback((callback: (data: any) => void) => {
    socketClient.onRideRequest(callback);
  }, []);

  const acceptRide = useCallback((requestId: string) => {
    socketClient.acceptRide(requestId);
  }, []);

  const rejectRide = useCallback((requestId: string) => {
    socketClient.rejectRide(requestId);
  }, []);

  const onRideAcceptSuccess = useCallback((callback: (data: any) => void) => {
    socketClient.onRideAcceptSuccess(callback);
  }, []);

  const onRideAcceptFailed = useCallback((callback: (data: any) => void) => {
    socketClient.onRideAcceptFailed(callback);
  }, []);

  const onRideRequestCancelled = useCallback((callback: (data: any) => void) => {
    socketClient.onRideRequestCancelled(callback);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  const value: SocketContextType = {
    isConnected,
    socketId,
    connect,
    disconnect,
    registerUser,
    updateLocation,
    onRideAccepted,
    onRideRequestExpired,
    onRideRequest,
    acceptRide,
    rejectRide,
    onRideAcceptSuccess,
    onRideAcceptFailed,
    onRideRequestCancelled,
  };

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
};
