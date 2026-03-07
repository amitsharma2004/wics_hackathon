import { Router } from 'express';
import { createRide, getRide, getUserRides, cancelRide } from './ride.controller.js';
import { sendRideRequest } from './ride.request.controller.js';
import { calculateETA, searchAddress, reverseGeocode } from './ride.eta.controller.js';
import { verifyToken } from '../../middleware/auth.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { createRideSchema } from './ride.validation.js';

const router = Router();

// All ride routes require authentication
router.use(verifyToken);

// Ride CRUD
router.post('/', validate(createRideSchema), createRide);
router.post('/request', sendRideRequest);
router.get('/', getUserRides);
router.get('/:id', getRide);
router.patch('/:id/cancel', cancelRide);

// ETA and Geocoding (proxy endpoints to avoid rate limiting)
router.post('/calculate-eta', calculateETA);
router.get('/search-address', searchAddress);
router.get('/reverse-geocode', reverseGeocode);

export default router;
