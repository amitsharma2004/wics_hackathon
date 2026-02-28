import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../modules/user/user.model.js';
import { logger } from '../config/logger.js';

export interface AuthRequest extends Request {
  userId?: string;
  userRole?: string;
}

const extractToken = (req: Request): string | null => {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
        return authHeader.substring(7);
    }
    return req.cookies?.accessToken || null;
};

export const verifyToken = (req: Request, res: Response, next: NextFunction) => {
  // Check for token in Authorization header first
  logger.info ('validating request...');
  logger.info (req.cookies.accessToken);
  let token = extractToken (req);
  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as { id: string };
    (req as AuthRequest).userId = decoded.id;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};

export const verifyAdmin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.userId;

    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin privileges required.' });
    }

    authReq.userRole = user.role;
    next();
  } catch (error) {
    return res.status(500).json({ message: 'Failed to verify admin status' });
  }
};
