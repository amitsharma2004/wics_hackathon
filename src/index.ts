import dotenv from 'dotenv';
import express, { Request, Response } from 'express';
import session from 'express-session';
import { connectDB } from './config/database.js';
import { logger } from './config/logger.js';
import passport from './config/passport.js';
import userRoutes from './modules/user/user.routes.js';

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

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

// Start server
const startServer = async () => {
  try {
    await connectDB();
    app.listen(PORT, () => {
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
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('Server stopped: SIGINT received (Ctrl+C)');
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
