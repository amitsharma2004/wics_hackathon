import { Request, Response } from 'express';
import { Driver } from './driver.model.js';
import { User } from '../user/user.model.js';
import { logger } from '../../config/logger.js';
import { AuthRequest } from '../../middleware/auth.middleware.js';

// Create new driver
export const createDriver = async (req: Request, res: Response) => {
  try {
    const { licenseNumber, licenseImageUrl, licenseExpiryDate, savedAddresses, paymentInfo, verificationDocuments } = req.body;
    const userId = (req as AuthRequest).userId;

    // Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if driver profile already exists
    const existingDriver = await Driver.findOne({ user: userId });
    if (existingDriver) {
      return res.status(400).json({ message: 'Driver profile already exists' });
    }

    // Check if license number is already registered
    const existingLicense = await Driver.findOne({ licenseNumber });
    if (existingLicense) {
      return res.status(400).json({ message: 'License number already registered' });
    }

    // Create driver profile
    const driver = await Driver.create({
      user: userId,
      licenseNumber,
      licenseImageUrl,
      licenseExpiryDate,
      savedAddresses: savedAddresses || [],
      paymentInfo: paymentInfo || { walletBalance: 0 },
      verificationDocuments
    });

    // Update user role to driver or both
    if (user.role === 'rider') {
      user.role = 'both';
    } else {
      user.role = 'driver';
    }
    await user.save();

    await driver.populate('user', 'name email phoneNumber');

    logger.info(`Driver profile created: ${driver._id} for user: ${userId}`);
    res.status(201).json(driver);
  } catch (error) {
    logger.error(`Create driver error: ${error}`);
    res.status(500).json({ message: 'Failed to create driver profile' });
  }
};

// Get driver profile
export const getDriver = async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthRequest).userId;

    const driver = await Driver.findOne({ user: userId }).populate('user', 'name email phoneNumber profileImageUrl');

    if (!driver) {
      return res.status(404).json({ message: 'Driver profile not found' });
    }

    res.json(driver);
  } catch (error) {
    logger.error(`Get driver error: ${error}`);
    res.status(500).json({ message: 'Failed to get driver profile' });
  }
};

// Get driver by ID (for admin or public view)
export const getDriverById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const driver = await Driver.findById(id).populate('user', 'name email phoneNumber profileImageUrl');

    if (!driver) {
      return res.status(404).json({ message: 'Driver not found' });
    }

    res.json(driver);
  } catch (error) {
    logger.error(`Get driver by ID error: ${error}`);
    res.status(500).json({ message: 'Failed to get driver' });
  }
};

// Update driver profile
export const updateDriver = async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthRequest).userId;
    const updateData = req.body;

    const driver = await Driver.findOne({ user: userId });

    if (!driver) {
      return res.status(404).json({ message: 'Driver profile not found' });
    }

    // Check if driver is blocked
    if (driver.isBlocked) {
      return res.status(403).json({ message: 'Driver account is blocked. Cannot update profile.' });
    }

    // If updating license number, check if it's already taken
    if (updateData.licenseNumber && updateData.licenseNumber !== driver.licenseNumber) {
      const existingLicense = await Driver.findOne({ licenseNumber: updateData.licenseNumber });
      if (existingLicense) {
        return res.status(400).json({ message: 'License number already registered' });
      }
    }

    // Update driver
    Object.assign(driver, updateData);
    await driver.save();

    await driver.populate('user', 'name email phoneNumber');

    logger.info(`Driver profile updated: ${driver._id}`);
    res.json(driver);
  } catch (error) {
    logger.error(`Update driver error: ${error}`);
    res.status(500).json({ message: 'Failed to update driver profile' });
  }
};

// Delete driver profile
export const deleteDriver = async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthRequest).userId;

    const driver = await Driver.findOne({ user: userId });

    if (!driver) {
      return res.status(404).json({ message: 'Driver profile not found' });
    }

    // Check if driver has active rides
    if (driver.isOnline || driver.isAvailable) {
      return res.status(400).json({ message: 'Cannot delete profile while online or available. Please go offline first.' });
    }

    await Driver.findByIdAndDelete(driver._id);

    // Update user role
    const user = await User.findById(userId);
    if (user) {
      if (user.role === 'both') {
        user.role = 'rider';
      } else {
        user.role = 'rider';
      }
      await user.save();
    }

    logger.info(`Driver profile deleted: ${driver._id} for user: ${userId}`);
    res.json({ message: 'Driver profile deleted successfully' });
  } catch (error) {
    logger.error(`Delete driver error: ${error}`);
    res.status(500).json({ message: 'Failed to delete driver profile' });
  }
};

// Block/Unblock driver (Admin only)
export const blockDriver = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { isBlocked, reason } = req.body;

    const driver = await Driver.findById(id);

    if (!driver) {
      return res.status(404).json({ message: 'Driver not found' });
    }

    driver.isBlocked = isBlocked;

    // If blocking, set driver offline and unavailable
    if (isBlocked) {
      driver.isOnline = false;
      driver.isAvailable = false;
    }

    await driver.save();

    logger.info(`Driver ${isBlocked ? 'blocked' : 'unblocked'}: ${driver._id}. Reason: ${reason || 'N/A'}`);
    res.json({ 
      message: `Driver ${isBlocked ? 'blocked' : 'unblocked'} successfully`,
      driver 
    });
  } catch (error) {
    logger.error(`Block driver error: ${error}`);
    res.status(500).json({ message: 'Failed to update driver block status' });
  }
};

// Verify driver (Admin only)
export const verifyDriver = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { isVerified } = req.body;

    const driver = await Driver.findById(id);

    if (!driver) {
      return res.status(404).json({ message: 'Driver not found' });
    }

    driver.isVerified = isVerified;
    await driver.save();

    logger.info(`Driver verification updated: ${driver._id} - Verified: ${isVerified}`);
    res.json({ 
      message: `Driver ${isVerified ? 'verified' : 'unverified'} successfully`,
      driver 
    });
  } catch (error) {
    logger.error(`Verify driver error: ${error}`);
    res.status(500).json({ message: 'Failed to update driver verification status' });
  }
};

// Update driver status (online/available)
export const updateDriverStatus = async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthRequest).userId;
    const { isOnline, isAvailable } = req.body;

    const driver = await Driver.findOne({ user: userId });

    if (!driver) {
      return res.status(404).json({ message: 'Driver profile not found' });
    }

    if (driver.isBlocked) {
      return res.status(403).json({ message: 'Driver account is blocked' });
    }

    if (!driver.isVerified) {
      return res.status(403).json({ message: 'Driver account is not verified yet' });
    }

    if (isOnline !== undefined) driver.isOnline = isOnline;
    if (isAvailable !== undefined) driver.isAvailable = isAvailable;

    // If going offline, set unavailable as well
    if (isOnline === false) {
      driver.isAvailable = false;
    }

    await driver.save();

    logger.info(`Driver status updated: ${driver._id} - Online: ${driver.isOnline}, Available: ${driver.isAvailable}`);
    res.json({ 
      message: 'Status updated successfully',
      isOnline: driver.isOnline,
      isAvailable: driver.isAvailable
    });
  } catch (error) {
    logger.error(`Update driver status error: ${error}`);
    res.status(500).json({ message: 'Failed to update driver status' });
  }
};

// Update driver location
export const updateDriverLocation = async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthRequest).userId;
    const { coordinates } = req.body;

    const driver = await Driver.findOne({ user: userId });

    if (!driver) {
      return res.status(404).json({ message: 'Driver profile not found' });
    }

    driver.currentLocation = {
      type: 'Point',
      coordinates
    };

    await driver.save();

    res.json({ message: 'Location updated successfully' });
  } catch (error) {
    logger.error(`Update driver location error: ${error}`);
    res.status(500).json({ message: 'Failed to update location' });
  }
};

// Get nearby drivers
export const getNearbyDrivers = async (req: Request, res: Response) => {
  try {
    const { longitude, latitude, maxDistance = 5000 } = req.query;

    if (!longitude || !latitude) {
      return res.status(400).json({ message: 'Longitude and latitude are required' });
    }

    const drivers = await Driver.find({
      isVerified: true,
      isBlocked: false,
      isOnline: true,
      isAvailable: true,
      currentLocation: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [parseFloat(longitude as string), parseFloat(latitude as string)]
          },
          $maxDistance: parseInt(maxDistance as string)
        }
      }
    }).populate('user', 'name phoneNumber profileImageUrl');

    res.json(drivers);
  } catch (error) {
    logger.error(`Get nearby drivers error: ${error}`);
    res.status(500).json({ message: 'Failed to get nearby drivers' });
  }
};
