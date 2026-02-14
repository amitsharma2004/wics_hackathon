import Joi from 'joi';

const locationSchema = Joi.object({
  coordinates: Joi.array()
    .items(Joi.number())
    .length(2)
    .required()
    .messages({
      'array.length': 'Coordinates must contain exactly 2 numbers [longitude, latitude]'
    }),
  address: Joi.string().required()
});

export const createRideSchema = Joi.object({
  pickupLocation: locationSchema.required(),
  destination: locationSchema.required(),
  pickupTime: Joi.date().iso().min('now').required(),
  amount: Joi.number().min(0).required()
});
