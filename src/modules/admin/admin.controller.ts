import { Request, Response } from 'express';
import { locationSyncService } from '../../services/locationSyncService.js';
import { logger } from '../../config/logger.js';
import { Driver } from '../driver/driver.model.js';

// Get location sync status
export const getLocationSyncStatus = async (req: Request, res: Response) => {
  try {
    const status = locationSyncService.getStatus();
    res.json({
      status: 'success',
      data: status
    });
  } catch (error) {
    logger.error(`Get location sync status error: ${error}`);
    res.status(500).json({ message: 'Failed to get sync status' });
  }
};

// Manually trigger location sync
export const triggerLocationSync = async (req: Request, res: Response) => {
  try {
    logger.info('Manual location sync triggered by admin');
    
    // Trigger sync in background
    locationSyncService.triggerManualSync().catch(error => {
      logger.error(`Manual sync failed: ${error}`);
    });

    res.json({
      status: 'success',
      message: 'Location sync triggered successfully'
    });
  } catch (error) {
    logger.error(`Trigger location sync error: ${error}`);
    res.status(500).json({ message: 'Failed to trigger sync' });
  }
};

// Get pending drivers (unverified and non-blocked)
export const getPendingDrivers = async (req: Request, res: Response) => {
  logger.info ('fetching drivers...')
  try {
    const pendingDrivers = await Driver.find({
      isVerified: false,
      isBlocked: false
    })
      .populate('user', 'name email phoneNumber')
      .sort({ createdAt: -1 }); // Most recent first

    logger.info(`Fetched ${pendingDrivers.length} pending drivers`);
    res.json(pendingDrivers);
  } catch (error) {
    logger.error(`Get pending drivers error: ${error}`);
    res.status(500).json({ message: 'Failed to fetch pending drivers' });
  }
};