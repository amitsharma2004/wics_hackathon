import { Router } from 'express';
import passport from 'passport';
import { register, login, logout, getUser, updateProfile, refreshToken } from './user.controller.js';
import { googleCallback, authFailure } from './oauth.controller.js';
import { verifyToken } from '../../middleware/auth.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { registerSchema, loginSchema, updateProfileSchema } from './user.validation.js';

const router = Router();

router.post('/register', validate(registerSchema), register);
router.post('/login', validate(loginSchema), login);
router.post('/refresh-token', refreshToken);
router.post('/logout', verifyToken, logout);
router.get('/me', verifyToken, getUser);
router.put('/profile', verifyToken, validate(updateProfileSchema), updateProfile);

// OAuth routes
router.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
router.get('/auth/google/callback', 
  passport.authenticate('google', { failureRedirect: '/api/users/auth/failure' }),
  googleCallback
);
router.get('/auth/failure', authFailure);

export default router;
