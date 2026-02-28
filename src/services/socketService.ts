import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import jwt from 'jsonwebtoken';
import redis from '../config/redis.js';
import { logger } from '../config/logger.js';
import { getCell } from '../config/h3.js';
import { Driver } from '../modules/driver/driver.model.js';

interface SocketUser {
  userId: string;
  role: 'rider' | 'driver' | 'both' | 'admin';
  socketId: string;
}

interface RideRequest {
  requestId: string;
  riderId: string;
  riderName: string;
  pickup: {
    address: string;
    coordinates: [number, number];
  };
  destination: {
    address: string;
    coordinates: [number, number];
  };
  fare: number;
  distance: number;
  expiresAt: number;
}

class SocketService {
  private io: SocketIOServer | null = null;
  private connectedUsers: Map<string, SocketUser> = new Map();

  /**
   * Initialize Socket.IO server
   */
  initialize(httpServer: HTTPServer) {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: 'http://localhost:5173',
        credentials: true,
        methods: ['GET', 'POST']
      }
    });

    this.io.use(this.authenticateSocket.bind(this));
    this.io.on('connection', this.handleConnection.bind(this));

    logger.info('Socket.IO server initialized');
  }

  /**
   * Authenticate socket connection using JWT
   */
  private async authenticateSocket(socket: Socket, next: (err?: Error) => void) {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];

      if (!token) {
        return next(new Error('Authentication token required'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as { id: string };
      (socket as any).userId = decoded.id;

      next();
    } catch (error) {
      logger.error(`Socket authentication error: ${error}`);
      next(new Error('Invalid token'));
    }
  }

  /**
   * Handle new socket connection
   */
  private async handleConnection(socket: Socket) {
    const userId = (socket as any).userId;
    logger.info(`User connected: ${userId}, Socket: ${socket.id}`);

    // Store socket connection
    socket.on('user:register', async (data: { role: string; h3Cell?: string; coordinates?: [number, number] }) => {
      await this.registerUser(socket, userId, data);
    });

    // Update user location
    socket.on('location:update', async (data: { coordinates: [number, number] }) => {
      await this.updateUserLocation(socket, userId, data.coordinates);
    });

    // Driver accepts ride request
    socket.on('ride:accept', async (data: { requestId: string }) => {
      await this.handleRideAccept(socket, userId, data.requestId);
    });

    // Driver rejects ride request
    socket.on('ride:reject', async (data: { requestId: string }) => {
      await this.handleRideReject(socket, userId, data.requestId);
    });

    // Handle disconnection
    socket.on('disconnect', async () => {
      await this.handleDisconnect(socket, userId);
    });
  }

  /**
   * Register user with socket connection
   */
  private async registerUser(socket: Socket, userId: string, data: { role: string; coordinates?: [number, number] }) {
    try {
      const socketUser: SocketUser = {
        userId,
        role: data.role as any,
        socketId: socket.id
      };

      this.connectedUsers.set(userId, socketUser);

      // Store basic socket info in Redis with TTL (1 hour)
      const redisKey = `socket:user:${userId}`;
      await redis.setex(redisKey, 3600, JSON.stringify(socketUser));

      // If driver, update the existing driver location key with socket ID
      if ((data.role === 'driver' || data.role === 'both') && data.coordinates) {
        const driver = await Driver.findOne({ user: userId });
        
        if (driver) {
          const [longitude, latitude] = data.coordinates;
          const h3Index = getCell(latitude, longitude);

          // Update existing driver location key with socket ID
          const locationKey = `driver:location:${driver._id}`;
          const existingData = await redis.get(locationKey);
          
          let locationData;
          if (existingData) {
            // Update existing location data with socket ID
            locationData = JSON.parse(existingData);
            locationData.socketId = socket.id;
          } else {
            // Create new location data
            locationData = {
              driverId: driver._id,
              userId: userId,
              coordinates: data.coordinates,
              h3Index: h3Index,
              socketId: socket.id,
              timestamp: new Date().toISOString(),
              isOnline: driver.isOnline,
              isAvailable: driver.isAvailable
            };
          }

          await redis.setex(locationKey, 300, JSON.stringify(locationData)); // 5 minutes TTL

          // Add to H3 index set
          await redis.sadd(`h3:drivers:${h3Index}`, driver._id.toString());
          await redis.expire(`h3:drivers:${h3Index}`, 300);

          logger.info(`Driver registered: ${userId}, Socket: ${socket.id}, H3: ${h3Index}`);
        }
      }

      logger.info(`User registered: ${userId}, Role: ${data.role}`);
      socket.emit('user:registered', { success: true, socketId: socket.id });
    } catch (error) {
      logger.error(`Error registering user: ${error}`);
      socket.emit('error', { message: 'Failed to register user' });
    }
  }

  /**
   * Update user location and H3 cell
   */
  private async updateUserLocation(socket: Socket, userId: string, coordinates: [number, number]) {
    try {
      const [lng, lat] = coordinates;
      const h3Cell = getCell(lat, lng);

      const user = this.connectedUsers.get(userId);
      if (!user) {
        logger.warn(`User ${userId} not found in connected users`);
        return;
      }

      // If driver, update the existing driver location key with new coordinates and socket ID
      if (user.role === 'driver' || user.role === 'both') {
        const driver = await Driver.findOne({ user: userId });
        
        if (driver) {
          const locationKey = `driver:location:${driver._id}`;
          const existingData = await redis.get(locationKey);
          
          let oldH3Cell: string | undefined;
          if (existingData) {
            const parsed = JSON.parse(existingData);
            oldH3Cell = parsed.h3Index;
          }

          // Update location data with socket ID
          const locationData = {
            driverId: driver._id,
            userId: userId,
            coordinates: coordinates,
            h3Index: h3Cell,
            socketId: socket.id,
            timestamp: new Date().toISOString(),
            isOnline: driver.isOnline,
            isAvailable: driver.isAvailable
          };

          await redis.setex(locationKey, 300, JSON.stringify(locationData)); // 5 minutes TTL

          // Update H3 index sets if cell changed
          if (oldH3Cell && oldH3Cell !== h3Cell) {
            await redis.srem(`h3:drivers:${oldH3Cell}`, driver._id.toString());
          }
          await redis.sadd(`h3:drivers:${h3Cell}`, driver._id.toString());
          await redis.expire(`h3:drivers:${h3Cell}`, 300);

          logger.debug(`Driver location updated: ${userId}, H3: ${h3Cell}`);
        }
      }
    } catch (error) {
      logger.error(`Error updating user location: ${error}`);
    }
  }

  /**
   * Send ride request to specific drivers
   */
  async sendRideRequestToDrivers(driverIds: string[], rideRequest: RideRequest): Promise<{ sent: string[]; failed: string[] }> {
    const sent: string[] = [];
    const failed: string[] = [];

    if (!this.io) {
      logger.error('Socket.IO not initialized');
      return { sent, failed };
    }

    // Store ride request in Redis with 15 second TTL
    const requestKey = `ride:request:${rideRequest.requestId}`;
    await redis.setex(requestKey, 15, JSON.stringify(rideRequest));

    for (const driverId of driverIds) {
      try {
        // Get driver location data which includes socket ID
        const locationKey = `driver:location:${driverId}`;
        const locationData = await redis.get(locationKey);
        
        if (!locationData) {
          logger.warn(`Driver ${driverId} location not found`);
          failed.push(driverId);
          continue;
        }

        const driverLocation = JSON.parse(locationData);
        
        // Check if driver has socket ID and is available
        if (!driverLocation.socketId || !driverLocation.isOnline || !driverLocation.isAvailable) {
          logger.warn(`Driver ${driverId} not available for ride requests`);
          failed.push(driverId);
          continue;
        }

        // Send ride request via socket
        this.io.to(driverLocation.socketId).emit('ride:request', {
          ...rideRequest,
          expiresIn: 15 // seconds
        });

        // Track sent request
        await redis.sadd(`ride:request:${rideRequest.requestId}:sent`, driverId);
        await redis.expire(`ride:request:${rideRequest.requestId}:sent`, 20);

        sent.push(driverId);
        logger.info(`Ride request sent to driver ${driverId} via socket ${driverLocation.socketId}`);
      } catch (error) {
        logger.error(`Failed to send ride request to driver ${driverId}: ${error}`);
        failed.push(driverId);
      }
    }

    // Set expiration timer
    setTimeout(async () => {
      await this.expireRideRequest(rideRequest.requestId);
    }, 15000);

    return { sent, failed };
  }

  /**
   * Handle ride request expiration
   */
  private async expireRideRequest(requestId: string) {
    try {
      const requestKey = `ride:request:${requestId}`;
      const requestData = await redis.get(requestKey);

      if (requestData) {
        const request: RideRequest = JSON.parse(requestData);
        
        // Notify rider that request expired
        const riderData = await redis.get(`socket:user:${request.riderId}`);
        if (riderData && this.io) {
          const rider: SocketUser = JSON.parse(riderData);
          this.io.to(rider.socketId).emit('ride:request:expired', {
            requestId,
            message: 'No drivers accepted the ride request'
          });
        }

        // Clean up Redis
        await redis.del(requestKey);
        await redis.del(`ride:request:${requestId}:sent`);
        
        logger.info(`Ride request ${requestId} expired`);
      }
    } catch (error) {
      logger.error(`Error expiring ride request: ${error}`);
    }
  }

  /**
   * Handle driver accepting ride
   */
  private async handleRideAccept(socket: Socket, driverId: string, requestId: string) {
    try {
      const requestKey = `ride:request:${requestId}`;
      const requestData = await redis.get(requestKey);

      if (!requestData) {
        socket.emit('ride:accept:failed', { message: 'Ride request expired or not found' });
        return;
      }

      const request: RideRequest = JSON.parse(requestData);

      // Check if already accepted by another driver
      const acceptedKey = `ride:request:${requestId}:accepted`;
      const alreadyAccepted = await redis.get(acceptedKey);

      if (alreadyAccepted) {
        socket.emit('ride:accept:failed', { message: 'Ride already accepted by another driver' });
        return;
      }

      // Mark as accepted
      await redis.setex(acceptedKey, 60, driverId);

      // Notify rider
      const riderData = await redis.get(`socket:user:${request.riderId}`);
      if (riderData && this.io) {
        const rider: SocketUser = JSON.parse(riderData);
        const driverData = this.connectedUsers.get(driverId);
        
        this.io.to(rider.socketId).emit('ride:accepted', {
          requestId,
          driverId,
          driverName: driverData?.userId || 'Driver',
          message: 'Driver accepted your ride request'
        });
      }

      // Notify driver
      socket.emit('ride:accept:success', {
        requestId,
        rideDetails: request
      });

      // Notify other drivers that ride was taken
      const sentDrivers = await redis.smembers(`ride:request:${requestId}:sent`);
      for (const otherDriverId of sentDrivers) {
        if (otherDriverId !== driverId) {
          const otherDriverData = await redis.get(`socket:user:${otherDriverId}`);
          if (otherDriverData && this.io) {
            const otherDriver: SocketUser = JSON.parse(otherDriverData);
            this.io.to(otherDriver.socketId).emit('ride:request:cancelled', {
              requestId,
              reason: 'Accepted by another driver'
            });
          }
        }
      }

      // Clean up
      await redis.del(requestKey);
      await redis.del(`ride:request:${requestId}:sent`);

      logger.info(`Ride request ${requestId} accepted by driver ${driverId}`);
    } catch (error) {
      logger.error(`Error handling ride accept: ${error}`);
      socket.emit('error', { message: 'Failed to accept ride' });
    }
  }

  /**
   * Handle driver rejecting ride
   */
  private async handleRideReject(socket: Socket, driverId: string, requestId: string) {
    try {
      // Remove driver from sent list
      await redis.srem(`ride:request:${requestId}:sent`, driverId);
      
      socket.emit('ride:reject:success', { requestId });
      logger.info(`Driver ${driverId} rejected ride request ${requestId}`);
    } catch (error) {
      logger.error(`Error handling ride reject: ${error}`);
    }
  }

  /**
   * Handle user disconnection
   */
  private async handleDisconnect(socket: Socket, userId: string) {
    try {
      const user = this.connectedUsers.get(userId);
      
      if (user) {
        // If driver, remove socket ID from location data but keep location
        if (user.role === 'driver' || user.role === 'both') {
          const driver = await Driver.findOne({ user: userId });
          
          if (driver) {
            const locationKey = `driver:location:${driver._id}`;
            const locationData = await redis.get(locationKey);
            
            if (locationData) {
              const parsed = JSON.parse(locationData);
              // Remove socket ID but keep location data
              parsed.socketId = null;
              await redis.setex(locationKey, 300, JSON.stringify(parsed));
            }
          }
        }

        // Remove socket user data from Redis
        await redis.del(`socket:user:${userId}`);

        // Remove from memory
        this.connectedUsers.delete(userId);
      }

      logger.info(`User disconnected: ${userId}, Socket: ${socket.id}`);
    } catch (error) {
      logger.error(`Error handling disconnect: ${error}`);
    }
  }

  /**
   * Get Socket.IO instance
   */
  getIO(): SocketIOServer | null {
    return this.io;
  }
}

export const socketService = new SocketService();