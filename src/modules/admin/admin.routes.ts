import { Router } from 'express';
import { getLocationSyncStatus, triggerLocationSync, getPendingDrivers } from './admin.controller.js';
import { verifyToken, verifyAdmin } from '../../middleware/auth.middleware.js';
import { verifyDriver, blockDriver } from '../driver/driver.controller.js';
import { validate } from '../../middleware/validate.middleware.js';
import { verifyDriverSchema, blockDriverSchema } from '../driver/driver.validation.js';

const router = Router();

// Admin routes - require admin authentication
router.get('/location-sync/status', verifyToken, verifyAdmin, getLocationSyncStatus);
router.post('/location-sync/trigger', verifyToken, verifyAdmin, triggerLocationSync);

// Driver management routes (specific paths before dynamic :id)
router.get('/drivers/pending', verifyToken, verifyAdmin, getPendingDrivers);
router.patch('/drivers/:id/verify', verifyToken, verifyAdmin, validate(verifyDriverSchema), verifyDriver);
router.patch('/drivers/:id/block', verifyToken, verifyAdmin, validate(blockDriverSchema), blockDriver);

export default router;
