import { Response } from 'express';
import jwt from 'jsonwebtoken';
import { IUser } from './user.model.js';
import { AuthRequest } from '../../middleware/auth.middleware.js';

export const googleCallback = (req: AuthRequest, res: Response) => {
  const user = req.user as unknown as IUser;
  
  if (!user) {
    return res.redirect(`${process.env.FRONTEND_URL}/login?error=authentication_failed`);
  }

  const accessToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET as string, { expiresIn: '15m' });
  const refreshToken = jwt.sign({ id: user._id }, process.env.JWT_REFRESH_SECRET as string, { expiresIn: '7d' });

  res.redirect(`${process.env.FRONTEND_URL}/auth/callback?accessToken=${accessToken}&refreshToken=${refreshToken}`);
};

export const authFailure = (req: AuthRequest, res: Response) => {
  res.redirect(`${process.env.FRONTEND_URL}/login?error=authentication_failed`);
};
