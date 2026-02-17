import { Response } from 'express';
import jwt from 'jsonwebtoken';
import { IUser, User } from './user.model.js';
import { AuthRequest } from '../../middleware/auth.middleware.js';
import redis from '../../config/redis.js';
import { logger } from '../../config/logger.js';

const USER_CACHE_TTL = 900; // 15 minutes
const USER_CACHE_PREFIX = 'user:';

export const googleCallback = async (req: AuthRequest, res: Response) => {
  const user = req.user as unknown as IUser;
  
  if (!user) {
    return res.redirect(`${process.env.FRONTEND_URL}/login?error=authentication_failed`);
  }

  const accessToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET as string, { expiresIn: '15m' });
  const refreshToken = jwt.sign({ id: user._id }, process.env.JWT_REFRESH_SECRET as string, { expiresIn: '7d' });

  // Cache user data in Redis
  try {
    const userCache = await User.findById(user._id).select('-password -refreshToken').lean();
    if (userCache) {
      await redis.setex(`${USER_CACHE_PREFIX}${user._id}`, USER_CACHE_TTL, JSON.stringify(userCache));
      logger.info(`User ${user._id} cached in Redis after OAuth login`);
    }
  } catch (error) {
    logger.error(`Error caching user after OAuth: ${error}`);
  }

  res.redirect(`${process.env.FRONTEND_URL}/auth/callback?accessToken=${accessToken}&refreshToken=${refreshToken}`);
};

export const authFailure = (req: AuthRequest, res: Response) => {
  res.redirect(`${process.env.FRONTEND_URL}/login?error=authentication_failed`);
};
