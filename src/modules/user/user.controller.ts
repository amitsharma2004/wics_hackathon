import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { User } from './user.model.js';
import { logger } from '../../config/logger.js';
import { isAllowedEmailDomain, getAllowedDomains } from '../../utils/emailValidator.js';

const generateTokens = (userId: string) => {
  const accessToken = jwt.sign({ id: userId }, process.env.JWT_SECRET as string, { expiresIn: '15m' });
  const refreshToken = jwt.sign({ id: userId }, process.env.JWT_REFRESH_SECRET as string, { expiresIn: '7d' });
  return { accessToken, refreshToken };
};

export const register = async (req: Request, res: Response) => {
  try {
    const { name, email, password } = req.body;

    if (!isAllowedEmailDomain(email)) {
      const allowedDomains = getAllowedDomains();
      return res.status(403).json({ 
        message: `Email domain not allowed. Please use an email from: ${allowedDomains.join(', ')}` 
      });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const user = await User.create({ name, email, password });
    const { accessToken, refreshToken } = generateTokens(user._id.toString());

    user.refreshToken = refreshToken;
    await user.save();

    res.status(201).json({ 
      accessToken, 
      refreshToken,
      user: { id: user._id, name: user.name, email: user.email } 
    });
  } catch (error) {
    logger.error(`Register error: ${error}`);
    res.status(500).json({ message: 'Server error' });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const { accessToken, refreshToken } = generateTokens(user._id.toString());

    user.refreshToken = refreshToken;
    await user.save();

    res.json({ 
      accessToken, 
      refreshToken,
      user: { id: user._id, name: user.name, email: user.email } 
    });
  } catch (error) {
    logger.error(`Login error: ${error}`);
    res.status(500).json({ message: 'Server error' });
  }
};

export const logout = async (req: Request, res: Response) => {
  try {
    await User.findByIdAndUpdate(req.user?.id, { refreshToken: null });
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    logger.error(`Logout error: ${error}`);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getUser = async (req: Request, res: Response) => {
  try {
    const user = await User.findById(req.user?.id).select('-password -refreshToken');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    logger.error(`Get user error: ${error}`);
    res.status(500).json({ message: 'Server error' });
  }
};

export const updateProfile = async (req: Request, res: Response) => {
  try {
    const { name, email } = req.body;
    const user = await User.findByIdAndUpdate(
      req.user?.id,
      { name, email },
      { new: true, runValidators: true }
    ).select('-password -refreshToken');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    logger.error(`Update profile error: ${error}`);
    res.status(500).json({ message: 'Server error' });
  }
};

export const refreshToken = async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({ message: 'Refresh token required' });
    }

    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET as string) as { id: string };
    const user = await User.findById(decoded.id);

    if (!user || user.refreshToken !== refreshToken) {
      return res.status(403).json({ message: 'Invalid refresh token' });
    }

    const { accessToken, refreshToken: newRefreshToken } = generateTokens(user._id.toString());

    user.refreshToken = newRefreshToken;
    await user.save();

    res.json({ accessToken, refreshToken: newRefreshToken });
  } catch (error) {
    logger.error(`Refresh token error: ${error}`);
    res.status(403).json({ message: 'Invalid refresh token' });
  }
};
