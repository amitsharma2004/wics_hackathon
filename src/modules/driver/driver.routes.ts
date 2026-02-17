import { Router } from 'express';
import {
  createDriver,
  getDriver,
  getDriverById,
  updateDriver,
  deleteDriver,
  blockDriver,
  verifyDriver,
  updateDriverStatus,
  updateDriverLocation,
  getNearbyDrivers
} from './driver.controller.js';
import { verifyToken, verifyAdmin } from '../../middleware/auth.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import {
  createDriverSchema,
  updateDriverSchema,
  blockDriverSchema,
  verifyDriverSchema,
  updateDriverStatusSchema,
  updateLocationSchema
} from './driver.validation.js';

const router = Router();

router.get('/nearby', getNearbyDrivers);

router.post('/', verifyToken, validate(createDriverSchema), createDriver);
router.get('/me', verifyToken, getDriver);
router.put('/', verifyToken, validate(updateDriverSchema), updateDriver);
router.delete('/', verifyToken, deleteDriver);

router.patch('/status', verifyToken, validate(updateDriverStatusSchema), updateDriverStatus);
router.patch('/location', verifyToken, validate(updateLocationSchema), updateDriverLocation);

router.get('/:id', verifyToken, getDriverById);

router.patch('/admin/:id/verify', verifyToken, verifyAdmin, validate(verifyDriverSchema), verifyDriver);
router.patch('/admin/:id/block', verifyToken, verifyAdmin, validate(blockDriverSchema), blockDriver);

export default router;