import mongoose, { Document, Schema } from 'mongoose';

export interface ILocation {
  type: string;
  coordinates: [number, number]; // [longitude, latitude]
  address: string;
}

export interface IRide extends Document {
  user: mongoose.Types.ObjectId;
  captain?: mongoose.Types.ObjectId;
  pickupLocation: ILocation;
  destination: ILocation;
  pickupTime: Date;
  destinationReachTime?: Date;
  amount: number;
  paymentStatus: 'pending' | 'completed' | 'failed' | 'refunded';
  rating?: number;
  status: 'pending' | 'accepted' | 'ongoing' | 'completed' | 'cancelled';
  distance?: number;
  duration?: number;
}

const locationSchema = new Schema<ILocation>({
  type: {
    type: String,
    enum: ['Point'],
    default: 'Point'
  },
  coordinates: {
    type: [Number],
    required: true,
    validate: {
      validator: function(v: number[]) {
        return v.length === 2 && v[0] >= -180 && v[0] <= 180 && v[1] >= -90 && v[1] <= 90;
      },
      message: 'Invalid coordinates format'
    }
  },
  address: {
    type: String,
    required: true
  }
}, { _id: false });

const rideSchema = new Schema<IRide>({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  captain: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  pickupLocation: {
    type: locationSchema,
    required: true
  },
  destination: {
    type: locationSchema,
    required: true
  },
  pickupTime: {
    type: Date,
    required: true
  },
  destinationReachTime: {
    type: Date
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'refunded'],
    default: 'pending'
  },
  rating: {
    type: Number,
    min: 1,
    max: 5
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'ongoing', 'completed', 'cancelled'],
    default: 'pending'
  },
  distance: {
    type: Number,
    min: 0
  },
  duration: {
    type: Number,
    min: 0
  }
}, { timestamps: true });

// Index for geospatial queries
rideSchema.index({ 'pickupLocation.coordinates': '2dsphere' });
rideSchema.index({ 'destination.coordinates': '2dsphere' });

// Index for common queries
rideSchema.index({ user: 1, createdAt: -1 });
rideSchema.index({ captain: 1, createdAt: -1 });
rideSchema.index({ status: 1 });

export const Ride = mongoose.model<IRide>('Ride', rideSchema);
