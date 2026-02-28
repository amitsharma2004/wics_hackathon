import { Router } from 'express';
import { getLocationSyncStatus, triggerLocationSync } from './admin.controller.js';
import { verifyToken, verifyAdmin } from '../../middleware/auth.middleware.js';

const router = Router();

// Admin routes - require admin authentication
router.get('/location-sync/status', verifyToken, verifyAdmin, getLocationSyncStatus);
router.post('/location-sync/trigger', verifyToken, verifyAdmin, triggerLocationSync);

export default router;
