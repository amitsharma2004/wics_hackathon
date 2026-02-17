import Joi from 'joi';

// Saved Address Schema
const savedAddressSchema = Joi.object({
  label: Joi.string().min(2).max(50).required(),
  address: Joi.string().min(5).max(200).required(),
  coordinates: Joi.array()
    .items(Joi.number())
    .length(2)
    .required()
    .messages({
      'array.length': 'Coordinates must contain exactly 2 numbers [longitude, latitude]'
    })
});

// Payment Info Schema
const paymentInfoSchema = Joi.object({
  cardBrand: Joi.string().valid('Visa', 'Mastercard', 'RuPay', 'AmEx'),
  cardLastFour: Joi.string().length(4).pattern(/^\d+$/),
  walletBalance: Joi.number().min(0).default(0),
  upiId: Joi.string().pattern(/^[\w.-]+@[\w.-]+$/),
  bankAccountNumber: Joi.string().min(9).max(18).pattern(/^\d+$/),
  ifscCode: Joi.string().length(11).pattern(/^[A-Z]{4}0[A-Z0-9]{6}$/)
});

// Verification Documents Schema
const verificationDocumentsSchema = Joi.object({
  aadharImageUrl: Joi.string().uri(),
  panImageUrl: Joi.string().uri(),
  photoUrl: Joi.string().uri()
});

// Create Driver Schema
export const createDriverSchema = Joi.object({
  licenseNumber: Joi.string()
    .pattern(/^[A-Z]{2}[0-9]{13}$/)
    .required()
    .messages({
      'string.pattern.base': 'Invalid license number format (e.g., DL1234567890123)'
    }),
  licenseImageUrl: Joi.string().uri().required(),
  licenseExpiryDate: Joi.date().greater('now').required(),
  savedAddresses: Joi.array().items(savedAddressSchema).default([]),
  paymentInfo: paymentInfoSchema.default({ walletBalance: 0 }),
  verificationDocuments: verificationDocumentsSchema
});

// Update Driver Schema (all fields optional)
export const updateDriverSchema = Joi.object({
  licenseNumber: Joi.string().pattern(/^[A-Z]{2}[0-9]{13}$/),
  licenseImageUrl: Joi.string().uri(),
  licenseExpiryDate: Joi.date().greater('now'),
  savedAddresses: Joi.array().items(savedAddressSchema),
  paymentInfo: paymentInfoSchema,
  currentLocation: Joi.object({
    coordinates: Joi.array()
      .items(Joi.number())
      .length(2)
      .required()
  }),
  isOnline: Joi.boolean(),
  isAvailable: Joi.boolean(),
  verificationDocuments: verificationDocumentsSchema
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
    })
});

// Add Saved Address Schema
export const addSavedAddressSchema = savedAddressSchema;

// Update Payment Info Schema
export const updatePaymentInfoSchema = paymentInfoSchema.min(1);

// Verify Driver Schema (admin use)
export const verifyDriverSchema = Joi.object({
  isVerified: Joi.boolean().required()
});

// Block Driver Schema (admin use)
export const blockDriverSchema = Joi.object({
  isBlocked: Joi.boolean().required(),
  reason: Joi.string().min(10).max(500)
});
