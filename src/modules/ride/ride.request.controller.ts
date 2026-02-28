import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth.middleware.js';
import { logger } from '../../config/logger.js';
import { socketService } from '../../services/socketService.js';
import { v4 as uuidv4 } from 'uuid';
import { User } from '../user/user.model.js';

/**
 * Send ride request to nearby drivers
 */
export const sendRideRequest = async (req: AuthRequest, res: Response) => {
  try {
    const { driverIds, pickup, destination, fare, distance } = req.body;

    if (!driverIds || !Array.isArray(driverIds) || driverIds.length === 0) {
      return res.status(400).json({ message: 'Driver IDs are required' });
    }

    if (!pickup || !destination) {
      return res.status(400).json({ message: 'Pickup and destination are required' });
    }

    const requestId = uuidv4();
    const riderId = req.userId!;
    const rider = await User.findById(riderId).select('name').lean();
    const riderName = rider?.name || 'Rider';

    const rideRequest = {
      requestId,
      riderId,
      riderName,
      pickup: {
        address: pickup.address,
        coordinates: pickup.coordinates as [number, number]
      },
      destination: {
        address: destination.address,
        coordinates: destination.coordinates as [number, number]
      },
      fare: fare || 0,
      distance: distance || 0,
      expiresAt: Date.now() + 15000 // 15 seconds
    };

    // Send ride request to drivers via socket
    const result = await socketService.sendRideRequestToDrivers(driverIds, rideRequest);

    logger.info(`Ride request ${requestId} sent to ${result.sent.length} drivers`);

    res.json({
      success: true,
      requestId,
      sent: result.sent.length,
      failed: result.failed.length,
      message: `Ride request sent to ${result.sent.length} drivers`,
      expiresIn: 15
    });
  } catch (error) {
    logger.error(`Send ride request error: ${error}`);
    res.status(500).json({ message: 'Failed to send ride request' });
  }
};
