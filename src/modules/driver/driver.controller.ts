import { Request, Response } from 'express';
import { Driver } from './driver.model.js';
import { User } from '../user/user.model.js';
import { logger } from '../../config/logger.js';
import { AuthRequest } from '../../middleware/auth.middleware.js';
import redis from '../../config/redis.js';
import { sendEmail, emailTemplates } from '../../config/nodemailer.js';
import { getCell } from '../../config/h3.js';
import { locationSyncService } from '../../services/locationSyncService.js';

// ─── Helper: Batch ETA using OSRM Table API ──────────────────────────────────
// Instead of 1 HTTP call per driver, this sends ALL drivers in a single request
// e.g. 10 drivers = 1 HTTP call instead of 10
async function getBatchETAs(
  userLng: number,
  userLat: number,
  drivers: Array<{ driverId: string; lng: number; lat: number }>
): Promise<Map<string, { eta: number | null; routeDistance: number | null }>> {
  const results = new Map<string, { eta: number | null; routeDistance: number | null }>();

  if (drivers.length === 0) return results;

  try {
    // Format: user location first (index 0), then all drivers
    // e.g. "lng1,lat1;lng2,lat2;lng3,lat3"
    const userCoord = `${userLng},${userLat}`;
    const driverCoords = drivers.map(d => `${d.lng},${d.lat}`).join(';');
    const allCoords = `${userCoord};${driverCoords}`;

    // sources=1,2,3... (driver indices) → destinations=0 (user index)
    const driverIndices = drivers.map((_, i) => i + 1).join(',');

    const osrmResponse = await fetch(
      `https://router.project-osrm.org/table/v1/driving/${allCoords}?sources=${driverIndices}&destinations=0&annotations=duration,distance`
    );

    if (!osrmResponse.ok) throw new Error(`OSRM table API failed: ${osrmResponse.status}`);

    const osrmData: any = await osrmResponse.json();

    if (osrmData.code === 'Ok') {
      drivers.forEach((driver, i) => {
        const duration = osrmData.durations?.[i]?.[0]; // seconds
        const distance = osrmData.distances?.[i]?.[0]; // meters
        results.set(driver.driverId, {
          eta: duration != null ? Math.round(duration / 60) : null,
          routeDistance: distance != null ? Math.round(distance) : null
        });
      });
    }
  } catch (error) {
    logger.warn(`Batch OSRM error, falling back to straight-line estimates: ${error}`);
    // Fallback: estimate ETA for all drivers using straight-line distance
    drivers.forEach(driver => {
      results.set(driver.driverId, { eta: null, routeDistance: null });
    });
  }

  return results;
}

// ─── Helper: Cache drivers to Redis ──────────────────────────────────────────
async function cacheDriversToRedis(
  drivers: Array<{
    driverId: string;
    userId: string;
    lng: number;
    lat: number;
    h3Index: string;
    isOnline: boolean;
    isAvailable: boolean;
  }>
) {
  await Promise.all(
    drivers.map(async (d) => {
      try {
        const locationData = {
          driverId: d.driverId,
          userId: d.userId,
          coordinates: [d.lng, d.lat],
          h3Index: d.h3Index,
          socketId: null,
          timestamp: new Date().toISOString(),
          isOnline: d.isOnline,
          isAvailable: d.isAvailable
        };

        await redis.setex(`driver:location:${d.driverId}`, 300, JSON.stringify(locationData));
        await redis.sadd(`h3:drivers:${d.h3Index}`, d.driverId);
        await redis.expire(`h3:drivers:${d.h3Index}`, 300);
        await redis.geoadd('drivers:locations', d.lng, d.lat, d.driverId);
      } catch (err) {
        logger.error(`Failed to cache driver ${d.driverId}: ${err}`);
      }
    })
  );
}

// ─── Create new driver ────────────────────────────────────────────────────────
export const createDriver = async (req: Request, res: Response) => {
  logger.info('Creating new driver...');
  try {
    const { licenseNumber, vehicle } = req.body;
    const userId = (req as AuthRequest).userId;

    if (!vehicle || !vehicle.model || !vehicle.color || !vehicle.licensePlate || !vehicle.type) {
      return res.status(400).json({ message: 'Complete vehicle information is required' });
    }

    if (!['Mini', 'Sedan', 'SUV'].includes(vehicle.type)) {
      return res.status(400).json({ message: 'Invalid vehicle type. Must be Mini, Sedan, or SUV' });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.role === 'admin') return res.status(403).json({ message: 'Admins cannot become drivers' });

    const existingDriver = await Driver.findOne({ user: userId });
    if (existingDriver) return res.status(400).json({ message: 'Driver profile already exists' });

    const existingLicense = await Driver.findOne({ licenseNumber });
    if (existingLicense) return res.status(400).json({ message: 'License number already registered' });

    const existingPlate = await Driver.findOne({ 'vehicle.licensePlate': vehicle.licensePlate.toUpperCase() });
    if (existingPlate) return res.status(400).json({ message: 'License plate already registered' });

    const driver = await Driver.create({
      user: userId,
      licenseNumber,
      vehicle: {
        model: vehicle.model,
        color: vehicle.color,
        licensePlate: vehicle.licensePlate.toUpperCase(),
        type: vehicle.type
      }
    });

    user.role = user.role === 'rider' ? 'both' : 'driver';
    await user.save();
    await driver.populate('user', 'name email phoneNumber');

    logger.info(`Driver profile created: ${driver._id} for user: ${userId}`);
    res.status(201).json(driver);
  } catch (error) {
    logger.error(`Create driver error: ${error}`);
    res.status(500).json({ message: 'Failed to create driver profile' });
  }
};

// ─── Get driver profile ───────────────────────────────────────────────────────
export const getDriver = async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthRequest).userId;
    const driver = await Driver.findOne({ user: userId }).populate('user', 'name email phoneNumber profileImageUrl');

    if (!driver) return res.status(404).json({ message: 'Driver profile not found' });

    res.json(driver);
  } catch (error) {
    logger.error(`Get driver error: ${error}`);
    res.status(500).json({ message: 'Failed to get driver profile' });
  }
};

// ─── Get driver by ID ─────────────────────────────────────────────────────────
export const getDriverById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const driver = await Driver.findById(id).populate('user', 'name email phoneNumber profileImageUrl');

    if (!driver) return res.status(404).json({ message: 'Driver not found' });

    res.json(driver);
  } catch (error) {
    logger.error(`Get driver by ID error: ${error}`);
    res.status(500).json({ message: 'Failed to get driver' });
  }
};

// ─── Update driver profile ────────────────────────────────────────────────────
export const updateDriver = async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthRequest).userId;
    const updateData = req.body;

    const driver = await Driver.findOne({ user: userId });
    if (!driver) return res.status(404).json({ message: 'Driver profile not found' });
    if (driver.isBlocked) return res.status(403).json({ message: 'Driver account is blocked. Cannot update profile.' });

    if (updateData.licenseNumber && updateData.licenseNumber !== driver.licenseNumber) {
      const existingLicense = await Driver.findOne({ licenseNumber: updateData.licenseNumber });
      if (existingLicense) return res.status(400).json({ message: 'License number already registered' });
    }

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

// ─── Delete driver profile ────────────────────────────────────────────────────
export const deleteDriver = async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthRequest).userId;
    const driver = await Driver.findOne({ user: userId });

    if (!driver) return res.status(404).json({ message: 'Driver profile not found' });
    if (driver.isOnline || driver.isAvailable) {
      return res.status(400).json({ message: 'Cannot delete profile while online or available. Please go offline first.' });
    }

    await Driver.findByIdAndDelete(driver._id);

    const user = await User.findById(userId);
    if (user) {
      user.role = 'rider';
      await user.save();
    }

    logger.info(`Driver profile deleted: ${driver._id} for user: ${userId}`);
    res.json({ message: 'Driver profile deleted successfully' });
  } catch (error) {
    logger.error(`Delete driver error: ${error}`);
    res.status(500).json({ message: 'Failed to delete driver profile' });
  }
};

// ─── Block/Unblock driver (Admin only) ───────────────────────────────────────
export const blockDriver = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { isBlocked, reason } = req.body;

    const driver = await Driver.findById(id);
    if (!driver) return res.status(404).json({ message: 'Driver not found' });

    driver.isBlocked = isBlocked;
    if (isBlocked) {
      driver.isOnline = false;
      driver.isAvailable = false;
    }

    await driver.save();

    logger.info(`Driver ${isBlocked ? 'blocked' : 'unblocked'}: ${driver._id}. Reason: ${reason || 'N/A'}`);
    res.json({ message: `Driver ${isBlocked ? 'blocked' : 'unblocked'} successfully`, driver });
  } catch (error) {
    logger.error(`Block driver error: ${error}`);
    res.status(500).json({ message: 'Failed to update driver block status' });
  }
};

// ─── Verify driver (Admin only) ───────────────────────────────────────────────
export const verifyDriver = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { isVerified } = req.body;

    const driver = await Driver.findById(id).populate('user', 'name email');
    if (!driver) return res.status(404).json({ message: 'Driver not found' });

    driver.isVerified = isVerified;
    await driver.save();

    if (isVerified && driver.user) {
      const user = driver.user as any;
      sendEmail(user.email, emailTemplates.driverVerified(user.name)).catch(error => {
        logger.error(`Failed to send verification email to ${user.email}: ${error}`);
      });
    }

    logger.info(`Driver verification updated: ${driver._id} - Verified: ${isVerified}`);
    res.json({ message: `Driver ${isVerified ? 'verified' : 'unverified'} successfully`, driver });
  } catch (error) {
    logger.error(`Verify driver error: ${error}`);
    res.status(500).json({ message: 'Failed to update driver verification status' });
  }
};

// ─── Update driver status ─────────────────────────────────────────────────────
export const updateDriverStatus = async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthRequest).userId;
    const { isOnline, isAvailable } = req.body;

    const driver = await Driver.findOne({ user: userId });
    if (!driver) return res.status(404).json({ message: 'Driver profile not found' });
    if (driver.isBlocked) return res.status(403).json({ message: 'Driver account is blocked' });
    if (!driver.isVerified) return res.status(403).json({ message: 'Driver account is not verified yet' });

    if (isOnline !== undefined) driver.isOnline = isOnline;
    if (isAvailable !== undefined) driver.isAvailable = isAvailable;
    if (isOnline === false) driver.isAvailable = false;

    await driver.save();

    logger.info(`Driver status updated: ${driver._id} - Online: ${driver.isOnline}, Available: ${driver.isAvailable}`);
    res.json({ message: 'Status updated successfully', isOnline: driver.isOnline, isAvailable: driver.isAvailable });
  } catch (error) {
    logger.error(`Update driver status error: ${error}`);
    res.status(500).json({ message: 'Failed to update driver status' });
  }
};

// ─── Update driver location ───────────────────────────────────────────────────
export const updateDriverLocation = async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthRequest).userId;
    const { coordinates, socketId } = req.body;

    if (!coordinates || coordinates.length !== 2) {
      return res.status(400).json({ message: 'Valid coordinates [longitude, latitude] are required' });
    }

    const driver = await Driver.findOne({ user: userId });
    if (!driver) return res.status(404).json({ message: 'Driver profile not found' });
    if (!driver.isVerified) return res.status(403).json({ message: 'Driver account is not verified' });

    const [longitude, latitude] = coordinates;
    const h3Index = getCell(latitude, longitude);

    const locationData = JSON.stringify({
      driverId: driver._id,
      userId,
      coordinates,
      h3Index,
      socketId: socketId || null,
      timestamp: new Date().toISOString(),
      isOnline: driver.isOnline,
      isAvailable: driver.isAvailable
    });

    await redis.setex(`driver:location:${driver._id}`, 300, locationData);
    await redis.geoadd('drivers:locations', coordinates[0], coordinates[1], driver._id.toString());
    await redis.sadd(`h3:drivers:${h3Index}`, driver._id.toString());
    await redis.expire(`h3:drivers:${h3Index}`, 300);
    await locationSyncService.addToActiveSet(driver._id.toString());

    const updateCount = await redis.incr(`driver:update_count:${driver._id}`);
    if (updateCount % 10 === 0 || !driver.currentLocation) {
      driver.currentLocation = { type: 'Point', coordinates };
      driver.h3Index = h3Index;
      await driver.save();
      await redis.del(`driver:update_count:${driver._id}`);
    }

    res.json({ message: 'Location updated successfully', stored: 'redis', h3Index, ttl: 300 });
  } catch (error) {
    logger.error(`Update driver location error: ${error}`);
    res.status(500).json({ message: 'Failed to update location' });
  }
};

// ─── Get nearby drivers (GeoRadius) ──────────────────────────────────────────
export const getNearbyDrivers = async (req: Request, res: Response) => {
  try {
    const { longitude, latitude, maxDistance = 5000 } = req.query;

    if (!longitude || !latitude) {
      return res.status(400).json({ message: 'Longitude and latitude are required' });
    }

    const lng = parseFloat(longitude as string);
    const lat = parseFloat(latitude as string);
    const radius = parseInt(maxDistance as string);

    const nearbyDriverIds = await redis.georadius('drivers:locations', lng, lat, radius, 'm', 'WITHDIST', 'ASC');

    if (!nearbyDriverIds || nearbyDriverIds.length === 0) return res.json([]);

    // ✅ Batch fetch all location data from Redis
    const locationResults = await Promise.all(
      (nearbyDriverIds as Array<[string, string]>).map(async ([driverId, distance]) => {
        const locationData = await redis.get(`driver:location:${driverId}`);
        if (!locationData) return null;
        const location = JSON.parse(locationData);
        if (!location.isOnline || !location.isAvailable) return null;
        return { driverId, distance: parseFloat(distance), location };
      })
    );

    const validLocations = locationResults.filter(d => d !== null);
    if (validLocations.length === 0) return res.json([]);

    // ✅ Batch fetch all driver details in one MongoDB query
    const driverIds = validLocations.map(d => d!.driverId);
    const drivers = await Driver.find({ _id: { $in: driverIds }, isVerified: true, isBlocked: false })
      .populate('user', 'name phoneNumber profileImageUrl')
      .select('isVerified isBlocked averageRating totalRides');

    const driverMap = new Map(drivers.map(d => [d._id.toString(), d]));

    const validDrivers = validLocations
      .map(d => {
        const driver = driverMap.get(d!.driverId);
        if (!driver) return null;
        return { driver, distance: d!.distance, lastUpdate: d!.location.timestamp };
      })
      .filter(d => d !== null);

    res.json(validDrivers);
  } catch (error) {
    logger.error(`Get nearby drivers error: ${error}`);
    res.status(500).json({ message: 'Failed to get nearby drivers' });
  }
};

// ─── Get nearby drivers by H3 ─────────────────────────────────────────────────
export const getNearbyDriversByH3 = async (req: Request, res: Response) => {
  try {
    const { longitude, latitude } = req.query;
    const userId = (req as AuthRequest).userId;

    if (!longitude || !latitude) {
      return res.status(400).json({ message: 'Longitude and latitude are required' });
    }

    const lng = parseFloat(longitude as string);
    const lat = parseFloat(latitude as string);
    const MAX_RINGS = 30;
    const MAX_DISTANCE_KM = 10;
    const MIN_DRIVERS_THRESHOLD = 5;
    const EARLY_STOP_RADIUS = 15;
    const REDIS_DATA_FRESHNESS_THRESHOLD = 300;

    const currentUserDriver = await Driver.findOne({ user: userId });
    const currentDriverId = currentUserDriver?._id.toString();
    const centerH3Index = getCell(lat, lng);
    const h3 = await import('h3-js');

    // ============ REDIS PATH ============
    let accumulatedDrivers: any[] = [];

    for (let k = 0; k <= MAX_RINGS; k++) {
      const cellsAtRing = h3.default.gridDisk(centerH3Index, k);

      // Collect all driver IDs in this ring
      const driverIds = new Set<string>();
      for (const cell of cellsAtRing) {
        const driversInCell = await redis.smembers(`h3:drivers:${cell}`);
        driversInCell.forEach(id => {
          if (id !== currentDriverId) driverIds.add(id);
        });
      }

      if (driverIds.size === 0) {
        if (accumulatedDrivers.length >= MIN_DRIVERS_THRESHOLD && k >= EARLY_STOP_RADIUS) break;
        continue;
      }

      // ✅ Batch fetch all location data from Redis
      const locationResults = await Promise.all(
        Array.from(driverIds).map(async (driverId) => {
          const locationData = await redis.get(`driver:location:${driverId}`);
          if (!locationData) return null;

          const location = JSON.parse(locationData);
          const locationAge = (Date.now() - new Date(location.timestamp).getTime()) / 1000;

          if (locationAge > REDIS_DATA_FRESHNESS_THRESHOLD || !location.isOnline || !location.isAvailable) {
            return null;
          }

          return { driverId, location };
        })
      );

      const validLocations = locationResults.filter(item => item !== null);
      if (validLocations.length === 0) {
        if (accumulatedDrivers.length >= MIN_DRIVERS_THRESHOLD && k >= EARLY_STOP_RADIUS) break;
        continue;
      }

      // ✅ Batch MongoDB query - one call for all drivers at this ring
      const driverIdsToFetch = validLocations.map(item => item!.driverId);
      const drivers = await Driver.find({
        _id: { $in: driverIdsToFetch },
        isVerified: true,
        isBlocked: false
      })
        .populate('user', 'name phoneNumber profileImageUrl')
        .select('isVerified isBlocked averageRating totalRides h3Index vehicle user')
        .lean();

      const driverMap = new Map(drivers.map(d => [(d as any)._id.toString(), d]));

      // ✅ Batch OSRM - ONE HTTP call for all drivers at this ring
      const driverCoords = validLocations
        .map(item => {
          const driver = driverMap.get(item!.driverId);
          if (!driver) return null;
          const [driverLng, driverLat] = item!.location.coordinates;
          return { driverId: item!.driverId, lng: driverLng, lat: driverLat };
        })
        .filter(Boolean) as Array<{ driverId: string; lng: number; lat: number }>;

      const etaMap = await getBatchETAs(lng, lat, driverCoords);

      const driversData = validLocations.map(item => {
        const { driverId, location } = item!;
        const driver = driverMap.get(driverId);
        if (!driver) return null;

        const [driverLng, driverLat] = location.coordinates;
        const straightLineDistance = h3.default.greatCircleDistance(
          [lat, lng],
          [driverLat, driverLng],
          'km'
        );

        const etaData = etaMap.get(driverId);
        // Fallback to straight-line estimate if OSRM failed for this driver
        const eta = etaData?.eta ?? Math.round((straightLineDistance / 30) * 60);
        const routeDistance = etaData?.routeDistance ?? null;

        return {
          driver,
          distance: straightLineDistance * 1000,
          routeDistance,
          eta,
          h3Index: location.h3Index,
          ringLevel: k,
          lastUpdate: location.timestamp,
          source: 'redis'
        };
      }).filter(d => d !== null);

      accumulatedDrivers.push(...driversData);

      if (accumulatedDrivers.length >= MIN_DRIVERS_THRESHOLD && k >= EARLY_STOP_RADIUS) break;
    }

    // Return Redis results if found
    if (accumulatedDrivers.length > 0) {
      const sortedDrivers = accumulatedDrivers.sort((a, b) => {
        if (a!.eta && b!.eta) return a!.eta - b!.eta;
        return a!.distance - b!.distance;
      });

      return res.json({
        drivers: sortedDrivers,
        searchRadius: sortedDrivers[sortedDrivers.length - 1]?.ringLevel || 0,
        totalDriversFound: sortedDrivers.length,
        dataSource: 'redis'
      });
    }

    // ============ MONGODB FALLBACK ============
    logger.info('Redis empty, falling back to MongoDB');

    const driversFromMongo = await Driver.find({
      isOnline: true,
      isAvailable: true,
      isVerified: true,
      isBlocked: false,
      currentLocation: { $exists: true },
      _id: { $ne: currentDriverId }
    })
      .populate('user', 'name phoneNumber profileImageUrl')
      .select('currentLocation h3Index averageRating totalRides vehicle user isOnline isAvailable')
      .lean();

    if (driversFromMongo.length === 0) {
      return res.json({
        drivers: [],
        searchRadius: MAX_RINGS,
        message: 'No drivers available in your area',
        dataSource: 'mongodb'
      });
    }

    // Filter by max distance
    const nearbyDrivers = driversFromMongo
      .map((driver: any) => {
        if (!driver.currentLocation?.coordinates) return null;

        const [driverLng, driverLat] = driver.currentLocation.coordinates;
        const straightLineDistance = h3.default.greatCircleDistance(
          [lat, lng],
          [driverLat, driverLng],
          'km'
        );

        if (straightLineDistance > MAX_DISTANCE_KM) return null;

        const driverH3 = driver.h3Index || getCell(driverLat, driverLng);
        const ringLevel = h3.default.gridDistance(centerH3Index, driverH3);

        return {
          driver,
          driverId: driver._id.toString(),
          driverLng,
          driverLat,
          driverH3,
          straightLineDistance,
          distance: straightLineDistance * 1000,
          ringLevel
        };
      })
      .filter(Boolean) as any[];

    if (nearbyDrivers.length === 0) {
      return res.json({
        drivers: [],
        searchRadius: MAX_RINGS,
        message: 'No drivers available in your area',
        dataSource: 'mongodb'
      });
    }

    // Limit to top drivers before making OSRM call
    const topDrivers = nearbyDrivers
      .sort((a: any, b: any) => a.straightLineDistance - b.straightLineDistance)
      .slice(0, MIN_DRIVERS_THRESHOLD * 2);

    // ✅ Batch OSRM for MongoDB drivers too - ONE HTTP call
    const mongoDriverCoords = topDrivers.map((d: any) => ({
      driverId: d.driverId,
      lng: d.driverLng,
      lat: d.driverLat
    }));

    const etaMap = await getBatchETAs(lng, lat, mongoDriverCoords);

    const validDrivers = topDrivers.map((driverData: any) => {
      const etaData = etaMap.get(driverData.driverId);
      const eta = etaData?.eta ?? Math.round((driverData.straightLineDistance / 30) * 60);
      const routeDistance = etaData?.routeDistance ?? null;

      return {
        driver: driverData.driver,
        distance: driverData.distance,
        routeDistance,
        eta,
        h3Index: driverData.driverH3,
        ringLevel: driverData.ringLevel,
        lastUpdate: new Date().toISOString(),
        source: 'mongodb'
      };
    }).sort((a: any, b: any) => {
      if (a.eta && b.eta) return a.eta - b.eta;
      return a.distance - b.distance;
    });

    // ✅ Cache to Redis ONCE after filtering (not twice)
    await cacheDriversToRedis(
      topDrivers.map((d: any) => ({
        driverId: d.driverId,
        userId: d.driver.user._id.toString(),
        lng: d.driverLng,
        lat: d.driverLat,
        h3Index: d.driverH3,
        isOnline: d.driver.isOnline,    // ✅ real values from DB, not hardcoded
        isAvailable: d.driver.isAvailable
      }))
    );

    logger.info(`Cached ${topDrivers.length} drivers to Redis from MongoDB fallback`);

    return res.json({
      drivers: validDrivers,
      searchRadius: MAX_RINGS,
      dataSource: 'mongodb',
      cached: topDrivers.length,
      message: `${topDrivers.length} drivers cached to Redis`
    });

  } catch (error) {
    logger.error(`Get nearby drivers by H3 error: ${error}`);
    res.status(500).json({ message: 'Failed to get nearby drivers' });
  }
};