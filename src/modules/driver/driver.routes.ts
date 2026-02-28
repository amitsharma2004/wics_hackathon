import { Router } from 'express';
import {
  createDriver,
  getDriver,
  getDriverById,
  updateDriver,
  deleteDriver,
  updateDriverStatus,
  updateDriverLocation,
  getNearbyDrivers,
  getNearbyDriversByH3
} from './driver.controller.js';
import { verifyToken } from '../../middleware/auth.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import {
  createDriverSchema,
  updateDriverSchema,
  updateDriverStatusSchema,
  updateLocationSchema
} from './driver.validation.js';

const router = Router();

// Public routes (specific paths first)
router.get('/nearby', getNearbyDrivers);
router.get('/nearby-h3', getNearbyDriversByH3);

// Driver routes (specific paths before dynamic :id)
router.post('/', verifyToken, validate(createDriverSchema), createDriver);
router.get('/me', verifyToken, getDriver);
router.put('/', verifyToken, validate(updateDriverSchema), updateDriver);
router.delete('/', verifyToken, deleteDriver);

router.patch('/status', verifyToken, validate(updateDriverStatusSchema), updateDriverStatus);
router.patch('/location', verifyToken, validate(updateLocationSchema), updateDriverLocation);

// Dynamic routes last (catches anything not matched above)
router.get('/:id', verifyToken, getDriverById);

export default router;