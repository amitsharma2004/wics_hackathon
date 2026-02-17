import { Request, Response } from 'express';
import { Driver } from './driver.model.js';
import { User } from '../user/user.model.js';
import { logger } from '../../config/logger.js';
import { AuthRequest } from '../../middleware/auth.middleware.js';
import redis from '../../config/redis.js';
import { sendEmail, emailTemplates } from '../../config/nodemailer.js';
import { getCell } from '../../config/h3.js';

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

    const driver = await Driver.findById(id).populate('user', 'name email');

    if (!driver) {
      return res.status(404).json({ message: 'Driver not found' });
    }

    driver.isVerified = isVerified;
    await driver.save();

    // Send verification email if driver is verified
    if (isVerified && driver.user) {
      const user = driver.user as any;
      sendEmail(user.email, emailTemplates.driverVerified(user.name)).catch(error => {
        logger.error(`Failed to send verification email to ${user.email}: ${error}`);
      });
    }

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

// Update driver location (stores in Redis for real-time tracking)
export const updateDriverLocation = async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthRequest).userId;
    const { coordinates } = req.body; // [longitude, latitude]

    if (!coordinates || coordinates.length !== 2) {
      return res.status(400).json({ message: 'Valid coordinates [longitude, latitude] are required' });
    }

    const driver = await Driver.findOne({ user: userId });

    if (!driver) {
      return res.status(404).json({ message: 'Driver profile not found' });
    }

    if (!driver.isVerified) {
      return res.status(403).json({ message: 'Driver account is not verified' });
    }

    // Calculate H3 index for the location
    const [longitude, latitude] = coordinates;
    const h3Index = getCell(latitude, longitude);

    // Store location in Redis with TTL (expires in 5 minutes if not updated)
    const locationKey = `driver:location:${driver._id}`;
    const locationData = JSON.stringify({
      driverId: driver._id,
      userId: userId,
      coordinates: coordinates,
      h3Index: h3Index,
      timestamp: new Date().toISOString(),
      isOnline: driver.isOnline,
      isAvailable: driver.isAvailable
    });

    await redis.setex(locationKey, 300, locationData); // 5 minutes TTL

    // Also add to Redis geospatial index for nearby driver queries
    await redis.geoadd(
      'drivers:locations',
      coordinates[0], // longitude
      coordinates[1], // latitude
      driver._id.toString()
    );

    // Store in Redis H3 index set for efficient spatial queries
    await redis.sadd(`h3:drivers:${h3Index}`, driver._id.toString());
    await redis.expire(`h3:drivers:${h3Index}`, 300); // 5 minutes TTL

    // Update MongoDB location less frequently (every 10th update or when status changes)
    const updateCount = await redis.incr(`driver:update_count:${driver._id}`);
    
    if (updateCount % 10 === 0 || !driver.currentLocation) {
      driver.currentLocation = {
        type: 'Point',
        coordinates
      };
      driver.h3Index = h3Index;
      await driver.save();
      await redis.del(`driver:update_count:${driver._id}`);
    }

    res.json({ 
      message: 'Location updated successfully',
      stored: 'redis',
      h3Index: h3Index,
      ttl: 300
    });
  } catch (error) {
    logger.error(`Update driver location error: ${error}`);
    res.status(500).json({ message: 'Failed to update location' });
  }
};

// Get nearby drivers (uses Redis for real-time locations)
export const getNearbyDrivers = async (req: Request, res: Response) => {
  try {
    const { longitude, latitude, maxDistance = 5000 } = req.query;

    if (!longitude || !latitude) {
      return res.status(400).json({ message: 'Longitude and latitude are required' });
    }

    const lng = parseFloat(longitude as string);
    const lat = parseFloat(latitude as string);
    const radius = parseInt(maxDistance as string);

    // Get nearby drivers from Redis geospatial index
    const nearbyDriverIds = await redis.georadius(
      'drivers:locations',
      lng,
      lat,
      radius,
      'm', // meters
      'WITHDIST',
      'ASC'
    );

    if (!nearbyDriverIds || nearbyDriverIds.length === 0) {
      return res.json([]);
    }

    // Fetch driver details from Redis cache
    const driversData = await Promise.all(
      (nearbyDriverIds as Array<[string, string]>).map(async ([driverId, distance]) => {
        const locationKey = `driver:location:${driverId}`;
        const locationData = await redis.get(locationKey);
        
        if (!locationData) return null;

        const location = JSON.parse(locationData);
        
        // Only return online and available drivers
        if (!location.isOnline || !location.isAvailable) return null;

        // Fetch driver details from MongoDB
        const driver = await Driver.findById(driverId)
          .populate('user', 'name phoneNumber profileImageUrl')
          .select('isVerified isBlocked averageRating totalRides');

        if (!driver || driver.isBlocked || !driver.isVerified) return null;

        return {
          driver,
          distance: parseFloat(distance),
          lastUpdate: location.timestamp
        };
      })
    );

    // Filter out null values and return
    const validDrivers = driversData.filter(d => d !== null);

    res.json(validDrivers);
  } catch (error) {
    logger.error(`Get nearby drivers error: ${error}`);
    res.status(500).json({ message: 'Failed to get nearby drivers' });
  }
};


// Get nearby drivers using H3 index (efficient spatial queries)
export const getNearbyDriversByH3 = async (req: Request, res: Response) => {
  try {
    const { longitude, latitude } = req.query;

    if (!longitude || !latitude) {
      return res.status(400).json({ message: 'Longitude and latitude are required' });
    }

    const lng = parseFloat(longitude as string);
    const lat = parseFloat(latitude as string);
    const maxRadius = 5; // Maximum number of rings to search

    // Get H3 index for the search location
    const centerH3Index = getCell(lat, lng);
    const h3 = await import('h3-js');

    // Scan incrementally from radius 0 to maxRadius
    for (let k = 0; k <= maxRadius; k++) {
      logger.info(`Scanning H3 ring ${k} for nearby drivers`);
      
      // Get cells at current ring
      const cellsAtRing = h3.default.gridDisk(centerH3Index, k);
      
      // Fetch drivers from cells at this ring
      const driverIds = new Set<string>();
      
      for (const cell of cellsAtRing) {
        const driversInCell = await redis.smembers(`h3:drivers:${cell}`);
        driversInCell.forEach(id => driverIds.add(id));
      }

      if (driverIds.size === 0) {
        logger.info(`No drivers found at ring ${k}, continuing to next ring`);
        continue;
      }

      logger.info(`Found ${driverIds.size} potential drivers at ring ${k}`);

      // Fetch driver details
      const driversData = await Promise.all(
        Array.from(driverIds).map(async (driverId) => {
          const locationKey = `driver:location:${driverId}`;
          const locationData = await redis.get(locationKey);
          
          if (!locationData) return null;

          const location = JSON.parse(locationData);
          
          // Only return online and available drivers
          if (!location.isOnline || !location.isAvailable) return null;

          // Fetch driver details from MongoDB
          const driver = await Driver.findById(driverId)
            .populate('user', 'name phoneNumber profileImageUrl')
            .select('isVerified isBlocked averageRating totalRides h3Index');

          if (!driver || driver.isBlocked || !driver.isVerified) return null;

          // Calculate straight-line distance
          const [driverLng, driverLat] = location.coordinates;
          const straightLineDistance = h3.default.greatCircleDistance(
            [lat, lng],
            [driverLat, driverLng],
            'km'
          );

          // Calculate ETA using OSRM API
          // TODO: Setup OSRM server locally for South Asia region for better performance and reliability
          // Current implementation uses public OSRM server which may have rate limits
          let eta = null;
          let routeDistance = null;

          try {
            const osrmResponse = await fetch(
              `https://router.project-osrm.org/route/v1/driving/${driverLng},${driverLat};${lng},${lat}?overview=false`
            );
            
            if (osrmResponse.ok) {
              const osrmData: any = await osrmResponse.json();
              if (osrmData.code === 'Ok' && osrmData.routes && osrmData.routes.length > 0) {
                const route = osrmData.routes[0];
                eta = Math.round(route.duration / 60); // Convert seconds to minutes
                routeDistance = Math.round(route.distance); // Distance in meters
              }
            }
          } catch (osrmError) {
            logger.warn(`OSRM API error for driver ${driverId}: ${osrmError}`);
            // Fallback: Estimate ETA based on straight-line distance (assuming 30 km/h average speed)
            eta = Math.round((straightLineDistance / 30) * 60);
          }

          return {
            driver,
            distance: straightLineDistance * 1000, // Convert to meters
            routeDistance: routeDistance,
            eta: eta, // ETA in minutes
            h3Index: location.h3Index,
            ringLevel: k,
            lastUpdate: location.timestamp
          };
        })
      );

      // Filter out null values and sort by ETA (or distance if ETA not available)
      const validDrivers = driversData
        .filter(d => d !== null)
        .sort((a, b) => {
          // Sort by ETA first, then by distance
          if (a!.eta && b!.eta) {
            return a!.eta - b!.eta;
          }
          return a!.distance - b!.distance;
        });

      // If we found drivers at this ring, return them
      if (validDrivers.length > 0) {
        logger.info(`Returning ${ validDrivers.length } drivers from ring ${k}`);
        return res.json({
          drivers: validDrivers,
          searchRadius: k,
          totalCellsScanned: cellsAtRing.length
        });
      }
    }

    // No drivers found within maxRadius
    logger.info(`No drivers found within ${maxRadius} rings`);
    res.json({
      drivers: [],
      searchRadius: maxRadius,
      message: 'No drivers available in your area'
    });
  } catch (error) {
    logger.error(`Get nearby drivers by H3 error: ${error}`);
    res.status(500).json({ message: 'Failed to get nearby drivers' });
  }
};