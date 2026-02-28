import { io, Socket } from 'socket.io-client';

const SOCKET_URL = 'http://localhost:3000';

class SocketClient {
  private socket: Socket | null = null;
  private isConnected: boolean = false;

  /**
   * Connect to socket server
   */
  connect(token: string) {
    if (this.socket?.connected) {
      console.log('Socket already connected');
      return;
    }

    this.socket = io(SOCKET_URL, {
      auth: {
        token
      },
      transports: ['websocket', 'polling']
    });

    this.socket.on('connect', () => {
      this.isConnected = true;
      console.log('Socket connected:', this.socket?.id);
    });

    this.socket.on('disconnect', () => {
      this.isConnected = false;
      console.log('Socket disconnected');
    });

    this.socket.on('error', (error: any) => {
      console.error('Socket error:', error);
    });

    this.socket.on('user:registered', (data: any) => {
      console.log('User registered on socket:', data);
    });
  }

  /**
   * Register user with role and location
   */
  registerUser(role: string, coordinates?: [number, number]) {
    if (!this.socket) {
      console.error('Socket not initialized');
      return;
    }

    this.socket.emit('user:register', {
      role,
      coordinates
    });
  }

  /**
   * Update user location
   */
  updateLocation(coordinates: [number, number]) {
    if (!this.socket) {
      console.error('Socket not initialized');
      return;
    }

    this.socket.emit('location:update', { coordinates });
  }

  /**
   * Listen for ride requests (for drivers)
   */
  onRideRequest(callback: (request: any) => void) {
    if (!this.socket) {
      console.error('Socket not initialized');
      return;
    }

    this.socket.on('ride:request', callback);
  }

  /**
   * Accept ride request (for drivers)
   */
  acceptRide(requestId: string) {
    if (!this.socket) {
      console.error('Socket not initialized');
      return;
    }

    this.socket.emit('ride:accept', { requestId });
  }

  /**
   * Reject ride request (for drivers)
   */
  rejectRide(requestId: string) {
    if (!this.socket) {
      console.error('Socket not initialized');
      return;
    }

    this.socket.emit('ride:reject', { requestId });
  }

  /**
   * Listen for ride accepted (for riders)
   */
  onRideAccepted(callback: (data: any) => void) {
    if (!this.socket) {
      console.error('Socket not initialized');
      return;
    }

    this.socket.on('ride:accepted', callback);
  }

  /**
   * Listen for ride request expired (for riders)
   */
  onRideRequestExpired(callback: (data: any) => void) {
    if (!this.socket) {
      console.error('Socket not initialized');
      return;
    }

    this.socket.on('ride:request:expired', callback);
  }

  /**
   * Listen for ride request cancelled (for drivers)
   */
  onRideRequestCancelled(callback: (data: any) => void) {
    if (!this.socket) {
      console.error('Socket not initialized');
      return;
    }

    this.socket.on('ride:request:cancelled', callback);
  }

  /**
   * Listen for ride accept success (for drivers)
   */
  onRideAcceptSuccess(callback: (data: any) => void) {
    if (!this.socket) {
      console.error('Socket not initialized');
      return;
    }

    this.socket.on('ride:accept:success', callback);
  }

  /**
   * Listen for ride accept failed (for drivers)
   */
  onRideAcceptFailed(callback: (data: any) => void) {
    if (!this.socket) {
      console.error('Socket not initialized');
      return;
    }

    this.socket.on('ride:accept:failed', callback);
  }

  /**
   * Disconnect socket
   */
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
      console.log('Socket disconnected manually');
    }
  }

  /**
   * Check if connected
   */
  getConnectionStatus(): boolean {
    return this.isConnected;
  }

  /**
   * Get socket instance
   */
  getSocket(): Socket | null {
    return this.socket;
  }
}

export const socketClient = new SocketClient();
