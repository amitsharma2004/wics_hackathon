import mongoose from 'mongoose';
import { Driver } from '../modules/driver/driver.model.js';
import { logger } from '../config/logger.js';
import dotenv from 'dotenv';

dotenv.config();

async function fixDriverGeoIndex() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI as string);
    logger.info('Connected to MongoDB');

    // Drop the problematic index
    try {
      await Driver.collection.dropIndex('currentLocation_2dsphere');
      logger.info('Dropped old currentLocation_2dsphere index');
    } catch (error: any) {
      if (error.code === 27) {
        logger.info('Index does not exist, skipping drop');
      } else {
        throw error;
      }
    }

    // Remove currentLocation field from documents that have empty coordinates
    const result = await Driver.updateMany(
      { 
        $or: [
          { 'currentLocation.coordinates': { $exists: false } },
          { 'currentLocation.coordinates': [] },
          { 'currentLocation.coordinates': null }
        ]
      },
      { 
        $unset: { currentLocation: '' } 
      }
    );

    logger.info(`Updated ${result.modifiedCount} driver documents`);

    // Recreate the index as sparse
    await Driver.collection.createIndex(
      { currentLocation: '2dsphere' },
      { sparse: true }
    );
    logger.info('Created new sparse 2dsphere index on currentLocation');

    logger.info('Migration completed successfully');
    process.exit(0);
  } catch (error) {
    logger.error(`Migration failed: ${error}`);
    process.exit(1);
  }
}

fixDriverGeoIndex();
