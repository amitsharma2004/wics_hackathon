import { Response } from 'express';
import { Ride } from './ride.model.js';
import { logger } from '../../config/logger.js';
import { AuthRequest } from '../../middleware/auth.middleware.js';

export const createRide = async (req: AuthRequest, res: Response) => {
  try {
    const { pickupLocation, destination, pickupTime, amount } = req.body;

    const ride = await Ride.create({
      user: req.userId,
      pickupLocation,
      destination,
      pickupTime,
      amount,
      status: 'pending',
      paymentStatus: 'pending'
    });

    await ride.populate('user', 'name email');

    logger.info(`Ride created: ${ride._id} by user: ${req.userId}`);
    res.status(201).json(ride);
  } catch (error) {
    logger.error(`Create ride error: ${error}`);
    res.status(500).json({ message: 'Failed to create ride' });
  }
};

export const getRide = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const ride = await Ride.findById(id)
      .populate('user', 'name email')
      .populate('captain', 'name email');

    if (!ride) {
      return res.status(404).json({ message: 'Ride not found' });
    }

    // Check if user is authorized to view this ride
    if (ride.user._id.toString() !== req.userId && ride.captain?._id.toString() !== req.userId) {
      return res.status(403).json({ message: 'Not authorized to view this ride' });
    }

    res.json(ride);
  } catch (error) {
    logger.error(`Get ride error: ${error}`);
    res.status(500).json({ message: 'Failed to get ride' });
  }
};

export const getUserRides = async (req: AuthRequest, res: Response) => {
  try {
    const rides = await Ride.find({ user: req.userId })
      .populate('captain', 'name email')
      .sort({ createdAt: -1 });

    res.json(rides);
  } catch (error) {
    logger.error(`Get user rides error: ${error}`);
    res.status(500).json({ message: 'Failed to get rides' });
  }
};

export const cancelRide = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const ride = await Ride.findById(id);

    if (!ride) {
      return res.status(404).json({ message: 'Ride not found' });
    }

    // Check if user is authorized to cancel this ride
    if (ride.user.toString() !== req.userId) {
      return res.status(403).json({ message: 'Not authorized to cancel this ride' });
    }

    // Check if ride can be cancelled
    if (ride.status === 'completed' || ride.status === 'cancelled') {
      return res.status(400).json({ message: `Cannot cancel ${ride.status} ride` });
    }

    ride.status = 'cancelled';
    await ride.save();

    logger.info(`Ride cancelled: ${ride._id} by user: ${req.userId}`);
    res.json({ message: 'Ride cancelled successfully', ride });
  } catch (error) {
    logger.error(`Cancel ride error: ${error}`);
    res.status(500).json({ message: 'Failed to cancel ride' });
  }
};
