import cron, { ScheduledTask } from 'node-cron';
import redis from '../config/redis.js';
import { Driver } from '../modules/driver/driver.model.js';
import { logger } from '../config/logger.js';

const ACTIVE_LOCATIONS_KEY = 'drivers:locations:active';
const PROCESSING_LOCATIONS_KEY = 'drivers:locations:processing';
const LOCATION_PREFIX = 'driver:location:';

interface DriverLocation {
  driverId: string;
  userId: string;
  coordinates: [number, number];
  h3Index: string;
  timestamp: string;
  isOnline: boolean;
  isAvailable: boolean;
}

/**
 * Location Sync Service
 * Periodically syncs driver locations from Redis to MongoDB
 */
class LocationSyncService {
  private isRunning: boolean = false;
  private cronJob: ScheduledTask | null = null;

  /**
   * Start the cron job
   * Runs every 5 minutes by default
   */
  start(cronExpression: string = '*/5 * * * *') {
    if (this.cronJob) {
      logger.warn('Location sync cron job is already running');
      return;
    }

    this.cronJob = cron.schedule(cronExpression, async () => {
      await this.syncLocations();
    });

    logger.info(`Location sync cron job started with schedule: ${cronExpression}`);
  }

  /**
   * Stop the cron job
   */
  stop() {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      logger.info('Location sync cron job stopped');
    }
  }

  /**
   * Main sync function
   * 1. Rename active set to processing
   * 2. New updates go to active set
   * 3. Process the processing set
   * 4. Save to MongoDB
   * 5. Flush processing set on success, merge on failure
   */
  async syncLocations(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Location sync already in progress, skipping this run');
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();
    logger.info('Starting location sync from Redis to MongoDB');

    try {
      // Step 1: Rename active set to processing
      // This atomically moves all current location keys to processing
      const activeKeys = await redis.smembers(ACTIVE_LOCATIONS_KEY);
      
      if (activeKeys.length === 0) {
        logger.info('No active locations to sync');
        this.isRunning = false;
        return;
      }

      logger.info(`Found ${activeKeys.length} driver locations to sync`);

      // Move keys to processing set
      const pipeline = redis.pipeline();
      activeKeys.forEach(driverId => {
        pipeline.sadd(PROCESSING_LOCATIONS_KEY, driverId);
        pipeline.srem(ACTIVE_LOCATIONS_KEY, driverId);
      });
      await pipeline.exec();

      logger.info('Moved active locations to processing set');

      // Step 2: Fetch location data for all drivers in processing
      const locationData: Map<string, DriverLocation> = new Map();
      
      for (const driverId of activeKeys) {
        const locationKey = `${LOCATION_PREFIX}${driverId}`;
        const data = await redis.get(locationKey);
        
        if (data) {
          try {
            const location: DriverLocation = JSON.parse(data);
            locationData.set(driverId, location);
          } catch (error) {
            logger.error(`Failed to parse location data for driver ${driverId}: ${error}`);
          }
        }
      }

      logger.info(`Retrieved ${locationData.size} valid location records`);

      // Step 3: Save to MongoDB
      const updatePromises: Promise<any>[] = [];
      const successfulUpdates: string[] = [];
      const failedUpdates: string[] = [];

      for (const [driverId, location] of locationData.entries()) {
        const updatePromise = Driver.findByIdAndUpdate(
          driverId,
          {
            currentLocation: {
              type: 'Point',
              coordinates: location.coordinates
            },
            h3Index: location.h3Index,
            isOnline: location.isOnline,
            isAvailable: location.isAvailable
          },
          { new: false }
        )
          .then(() => {
            successfulUpdates.push(driverId);
            logger.debug(`Successfully updated location for driver ${driverId}`);
          })
          .catch((error) => {
            failedUpdates.push(driverId);
            logger.error(`Failed to update location for driver ${driverId}: ${error}`);
          });

        updatePromises.push(updatePromise);
      }

      // Wait for all updates to complete
      await Promise.all(updatePromises);

      logger.info(`MongoDB update complete: ${successfulUpdates.length} successful, ${failedUpdates.length} failed`);

      // Step 4: Handle processing set based on results
      if (failedUpdates.length === 0) {
        // All updates successful - flush processing set
        await redis.del(PROCESSING_LOCATIONS_KEY);
        logger.info('All updates successful, flushed processing set');
      } else {
        // Some updates failed - merge processing back to active
        await this.mergeProcessingToActive(failedUpdates);
        logger.warn(`Merged ${failedUpdates.length} failed updates back to active set`);
      }

      const duration = Date.now() - startTime;
      logger.info(`Location sync completed in ${duration}ms`);

    } catch (error) {
      logger.error(`Location sync failed: ${error}`);
      
      // On critical error, merge processing back to active
      try {
        await this.mergeProcessingToActive();
        logger.info('Merged processing set back to active due to error');
      } catch (mergeError) {
        logger.error(`Failed to merge processing set: ${mergeError}`);
      }
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Merge processing set back to active set
   * If a driver exists in both, keep the one from active (newer)
   */
  private async mergeProcessingToActive(specificDrivers?: string[]): Promise<void> {
    try {
      const processingKeys = specificDrivers || await redis.smembers(PROCESSING_LOCATIONS_KEY);
      
      if (processingKeys.length === 0) {
        return;
      }

      const pipeline = redis.pipeline();

      for (const driverId of processingKeys) {
        // Check if driver exists in active set
        const existsInActive = await redis.sismember(ACTIVE_LOCATIONS_KEY, driverId);
        
        if (existsInActive) {
          // Driver has newer location in active, discard processing version
          logger.debug(`Driver ${driverId} has newer location in active, keeping active version`);
          pipeline.srem(PROCESSING_LOCATIONS_KEY, driverId);
        } else {
          // Move from processing to active
          pipeline.sadd(ACTIVE_LOCATIONS_KEY, driverId);
          pipeline.srem(PROCESSING_LOCATIONS_KEY, driverId);
        }
      }

      await pipeline.exec();
      logger.info(`Merged ${processingKeys.length} drivers from processing to active`);

    } catch (error) {
      logger.error(`Error merging processing to active: ${error}`);
      throw error;
    }
  }

  /**
   * Add driver to active set when location is updated
   */
  async addToActiveSet(driverId: string): Promise<void> {
    try {
      await redis.sadd(ACTIVE_LOCATIONS_KEY, driverId);
    } catch (error) {
      logger.error(`Failed to add driver ${driverId} to active set: ${error}`);
    }
  }

  /**
   * Get sync status
   */
  getStatus(): { isRunning: boolean; cronActive: boolean } {
    return {
      isRunning: this.isRunning,
      cronActive: this.cronJob !== null
    };
  }

  /**
   * Manual trigger for sync (for testing or admin purposes)
   */
  async triggerManualSync(): Promise<void> {
    logger.info('Manual location sync triggered');
    await this.syncLocations();
  }
}

// Export singleton instance
export const locationSyncService = new LocationSyncService();
