import express from 'express';
import dotenv from 'dotenv';
import session from 'express-session';
import { Request, Response } from 'express';
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
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
  })
);

app.use(passport.initialize());
app.use(passport.session());

app.get('/', (req: Request, res: Response) => {
  res.json({ message: 'API is running' });
});

app.use('/api/users', userRoutes);

connectDB().then(() => {
  app.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
  });
});
