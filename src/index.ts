import dotenv from 'dotenv';
import express, { Request, Response } from 'express';
import { createServer } from 'http';
import cors from 'cors';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import { connectDB } from './config/database.js';
import { logger } from './config/logger.js';
import passport from './config/passport.js';
import userRoutes from './modules/user/user.routes.js';
import { locationSyncService } from './services/locationSyncService.js';
import { socketService } from './services/socketService.js';

dotenv.config();
const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 3000;

// CORS configuration
app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
  exposedHeaders: ['Set-Cookie'],
  preflightContinue: false,
  optionsSuccessStatus: 204
}));


app.use(express.json());
app.use(cookieParser());

app.use(
  session({
    secret: process.env.SESSION_SECRET as string,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000
    }
  })
);

app.use(passport.initialize());
app.use(passport.session());

app.get('/', (req: Request, res: Response) => {
  res.json({ message: 'API is running' });
});

app.use('/api/users', userRoutes);

import rideRoutes from './modules/ride/ride.routes.js';
app.use('/api/rides', rideRoutes);

import driverRoutes from './modules/driver/driver.routes.js';
app.use('/api/drivers', driverRoutes);

import adminRoutes from './modules/admin/admin.routes.js';
app.use('/api/admin', adminRoutes);

// Start server
const startServer = async () => {
  try {
    await connectDB();
    
    // Initialize Socket.IO
    socketService.initialize(httpServer);
    logger.info('Socket.IO service initialized');
    
    // Start location sync cron job (runs every 5 minutes)
    locationSyncService.start('*/5 * * * *');
    logger.info('Location sync service started');
    
    httpServer.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
    });
  } catch (error) {
    logger.error(`Failed to start server: ${error}`);
    process.exit(1);
  }
};

startServer();

process.on('SIGTERM', () => {
  logger.info('Server stopped: SIGTERM received');
  locationSyncService.stop();
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('Server stopped: SIGINT received (Ctrl+C)');
  locationSyncService.stop();
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  logger.error('Server stopped: Uncaught exception', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Server stopped: Unhandled promise rejection', { reason, promise });
  process.exit(1);
});
