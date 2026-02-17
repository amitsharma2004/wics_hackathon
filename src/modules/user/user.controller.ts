import { Response } from 'express';
import jwt from 'jsonwebtoken';
import { User } from './user.model.js';
import { logger } from '../../config/logger.js';
import { isAllowedEmailDomain, getAllowedDomains } from '../../utils/emailValidator.js';
import { AuthRequest } from '../../middleware/auth.middleware.js';

const generateTokens = (userId: string) => {
  const accessToken = jwt.sign({ id: userId }, process.env.JWT_SECRET as string, { expiresIn: '15m' });
  const refreshToken = jwt.sign({ id: userId }, process.env.JWT_REFRESH_SECRET as string, { expiresIn: '7d' });
  return { accessToken, refreshToken };
};

export const register = async (req: AuthRequest, res: Response) => {
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

    // Set tokens in cookies
    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000 // 15 minutes
    });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.status(201).json({ 
      accessToken, 
      refreshToken,
      user: { id: user._id, name: user.name, email: user.email, locationAccessGranted: user.locationAccessGranted } 
    });
  } catch (error) {
    logger.error(`Register error: ${error}`);
    res.status(500).json({ message: 'Server error' });
  }
};

export const login = async (req: AuthRequest, res: Response) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const { accessToken, refreshToken } = generateTokens(user._id.toString());

    user.refreshToken = refreshToken;
    await user.save();

    // Set tokens in cookies
    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000 // 15 minutes
    });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.json({ 
      accessToken, 
      refreshToken,
      user: { id: user._id, name: user.name, email: user.email, locationAccessGranted: user.locationAccessGranted } 
    });
  } catch (error) {
    logger.error(`Login error: ${error}`);
    res.status(500).json({ message: 'Server error' });
  }
};

export const logout = async (req: AuthRequest, res: Response) => {
  try {
    await User.findByIdAndUpdate(req.userId, { refreshToken: null });
    
    // Clear cookies
    res.clearCookie('accessToken');
    res.clearCookie('refreshToken');
    
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    logger.error(`Logout error: ${error}`);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getUser = async (req: AuthRequest, res: Response) => {
  try {
    const user = await User.findById(req.userId).select('-password -refreshToken');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    logger.error(`Get user error: ${error}`);
    res.status(500).json({ message: 'Server error' });
  }
};

export const updateProfile = async (req: AuthRequest, res: Response) => {
  try {
    const { name, email } = req.body;
    const user = await User.findByIdAndUpdate(
      req.userId,
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

export const updateLocationAccess = async (req: AuthRequest, res: Response) => {
  try {
    const { locationAccessGranted, locationPreference } = req.body;

    const updateData: any = {};
    if (locationAccessGranted !== undefined) updateData.locationAccessGranted = locationAccessGranted;
    if (locationPreference !== undefined) updateData.locationPreference = locationPreference;

    const user = await User.findByIdAndUpdate(
      req.userId,
      updateData,
      { new: true }
    ).select('-password -refreshToken');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    logger.info(`Location access updated for user: ${req.userId} - Granted: ${locationAccessGranted}, Preference: ${locationPreference}`);
    res.json({ 
      message: 'Location access updated', 
      locationAccessGranted: user.locationAccessGranted,
      locationPreference: user.locationPreference
    });
  } catch (error) {
    logger.error(`Update location access error: ${error}`);
    res.status(500).json({ message: 'Server error' });
  }
};

export const refreshToken = async (req: AuthRequest, res: Response) => {
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

    // Update cookies with new tokens
    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000 // 15 minutes
    });

    res.cookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.json({ accessToken, refreshToken: newRefreshToken });
  } catch (error) {
    logger.error(`Refresh token error: ${error}`);
    res.status(403).json({ message: 'Invalid refresh token' });
  }
};
