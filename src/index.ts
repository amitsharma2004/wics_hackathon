import express from 'express';
import dotenv from 'dotenv';
import { Request, Response } from 'express';
import { connectDB } from './config/database.js';
import { logger } from './config/logger.js';
import userRoutes from './modules/user/user.routes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get('/', (req: Request, res: Response) => {
  res.json({ message: 'API is running' });
});

app.use('/api/users', userRoutes);

connectDB().then(() => {
  app.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
  });
});
