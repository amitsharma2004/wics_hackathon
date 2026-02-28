import Joi from 'joi';

// Vehicle Schema
const vehicleSchema = Joi.object({
  model: Joi.string().min(2).max(50).required()
    .messages({
      'string.empty': 'Vehicle model is required',
      'string.min': 'Vehicle model must be at least 2 characters',
      'string.max': 'Vehicle model must not exceed 50 characters'
    }),
  color: Joi.string().min(2).max(30).required()
    .messages({
      'string.empty': 'Vehicle color is required'
    }),
  licensePlate: Joi.string()
    .pattern(/^[A-Z0-9\s-]{4,15}$/)
    .required()
    .messages({
      'string.pattern.base': 'Invalid license plate format',
      'string.empty': 'License plate is required'
    }),
  type: Joi.string()
    .valid('Mini', 'Sedan', 'SUV')
    .required()
    .messages({
      'any.only': 'Vehicle type must be Mini, Sedan, or SUV',
      'string.empty': 'Vehicle type is required'
    })
});

// Create Driver Schema
export const createDriverSchema = Joi.object({
  licenseNumber: Joi.string()
    .pattern(/^[A-Z0-9]{6,20}$/)
    .required()
    .messages({
      'string.pattern.base': 'Invalid license number format',
      'string.empty': 'License number is required'
    }),
  vehicle: vehicleSchema.required()
});

// Update Driver Schema (all fields optional)
export const updateDriverSchema = Joi.object({
  licenseNumber: Joi.string().pattern(/^[A-Z0-9]{6,20}$/),
  vehicle: vehicleSchema,
  currentLocation: Joi.object({
    coordinates: Joi.array()
      .items(Joi.number())
      .length(2)
      .required()
  }),
  isOnline: Joi.boolean(),
  isAvailable: Joi.boolean()
}).min(1);

// Update Driver Status Schema
export const updateDriverStatusSchema = Joi.object({
  isOnline: Joi.boolean(),
  isAvailable: Joi.boolean()
}).min(1);

// Update Location Schema
export const updateLocationSchema = Joi.object({
  coordinates: Joi.array()
    .items(Joi.number())
    .length(2)
    .required()
    .messages({
      'array.length': 'Coordinates must contain exactly 2 numbers [longitude, latitude]'
    }),
  socketId: Joi.string().optional()
});

// Verify Driver Schema (admin use)
export const verifyDriverSchema = Joi.object({
  isVerified: Joi.boolean().required()
});

// Block Driver Schema (admin use)
export const blockDriverSchema = Joi.object({
  isBlocked: Joi.boolean().required(),
  reason: Joi.string().min(10).max(500)
});
