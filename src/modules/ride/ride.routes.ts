import { Router } from 'express';
import { createRide, getRide, getUserRides, cancelRide } from './ride.controller.js';
import { sendRideRequest } from './ride.request.controller.js';
import { verifyToken } from '../../middleware/auth.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { createRideSchema } from './ride.validation.js';

const router = Router();

// All ride routes require authentication
router.use(verifyToken);

router.post('/', validate(createRideSchema), createRide);
router.post('/request', sendRideRequest);
router.get('/', getUserRides);
router.get('/:id', getRide);
router.patch('/:id/cancel', cancelRide);

export default router;
