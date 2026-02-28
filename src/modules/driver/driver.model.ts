import mongoose, { Document, Schema } from 'mongoose';

export interface IVehicle {
  model: string;
  color: string;
  licensePlate: string;
  type: 'Mini' | 'Sedan' | 'SUV';
}

export interface IDriver extends Document {
  user: mongoose.Types.ObjectId;
  isVerified: boolean;
  isBlocked: boolean;
  licenseNumber: string;
  vehicle: IVehicle;
  totalRides: number;
  completedRides: number;
  cancelledRides: number;
  averageRating: number;
  totalRatings: number;
  currentLocation?: {
    type: string;
    coordinates: [number, number];
  };
  h3Index?: string;
  isOnline: boolean;
  isAvailable: boolean;
}

const vehicleSchema = new Schema<IVehicle>({
  model: { type: String, required: true },
  color: { type: String, required: true },
  licensePlate: { 
    type: String, 
    required: true,
    uppercase: true,
    trim: true
  },
  type: { 
    type: String, 
    enum: ['Mini', 'Sedan', 'SUV'],
    required: true
  }
}, { _id: false });

const driverSchema = new Schema<IDriver>({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  isBlocked: {
    type: Boolean,
    default: false
  },
  licenseNumber: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true
  },
  vehicle: {
    type: vehicleSchema,
    required: true
  },
  totalRides: {
    type: Number,
    default: 0,
    min: 0
  },
  completedRides: {
    type: Number,
    default: 0,
    min: 0
  },
  cancelledRides: {
    type: Number,
    default: 0,
    min: 0
  },
  averageRating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },
  totalRatings: {
    type: Number,
    default: 0,
    min: 0
  },
  currentLocation: {
    type: {
      type: String,
      enum: ['Point']
    },
    coordinates: {
      type: [Number]
    }
  },
  h3Index: {
    type: String,
    index: true
  },
  isOnline: {
    type: Boolean,
    default: false
  },
  isAvailable: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

// Index for geospatial queries (sparse: only index documents with currentLocation)
driverSchema.index({ currentLocation: '2dsphere' }, { sparse: true });

// Index for common queries
driverSchema.index({ isVerified: 1, isBlocked: 1, isOnline: 1, isAvailable: 1 });
driverSchema.index({ licenseNumber: -1 });
driverSchema.index({ 'vehicle.licensePlate': 1 });
driverSchema.index({ 'vehicle.type': 1 });

export const Driver = mongoose.model<IDriver>('Driver', driverSchema);