import mongoose, { Document, Schema } from 'mongoose';

export interface ISavedAddress {
  label: string;
  address: string;
  coordinates: [number, number];
}

export interface IPaymentInfo {
  cardBrand?: string;
  cardLastFour?: string;
  walletBalance: number;
  upiId?: string;
  bankAccountNumber?: string;
  ifscCode?: string;
}

export interface IDriver extends Document {
  user: mongoose.Types.ObjectId;
  isVerified: boolean;
  isBlocked: boolean;
  licenseNumber: string;
  licenseImageUrl: string;
  licenseExpiryDate: Date;
  totalRides: number;
  completedRides: number;
  cancelledRides: number;
  averageRating: number;
  totalRatings: number;
  savedAddresses: ISavedAddress[];
  paymentInfo: IPaymentInfo;
  currentLocation?: {
    type: string;
    coordinates: [number, number];
  };
  isOnline: boolean;
  isAvailable: boolean;
  verificationDocuments?: {
    aadharImageUrl?: string;
    panImageUrl?: string;
    photoUrl?: string;
  };
}

const savedAddressSchema = new Schema<ISavedAddress>({
  label: { type: String, required: true },
  address: { type: String, required: true },
  coordinates: {
    type: [Number],
    required: true,
    validate: {
      validator: function(v: number[]) {
        return v.length === 2 && v[0] >= -180 && v[0] <= 180 && v[1] >= -90 && v[1] <= 90;
      },
      message: 'Invalid coordinates format'
    }
  }
}, { _id: false });

const paymentInfoSchema = new Schema<IPaymentInfo>({
  cardBrand: { type: String },
  cardLastFour: { type: String, maxlength: 4 },
  walletBalance: { type: Number, default: 0, min: 0 },
  upiId: { type: String },
  bankAccountNumber: { type: String },
  ifscCode: { type: String }
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
    unique: true
  },
  licenseImageUrl: {
    type: String,
    required: true
  },
  licenseExpiryDate: {
    type: Date,
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
  savedAddresses: {
    type: [savedAddressSchema],
    default: []
  },
  paymentInfo: {
    type: paymentInfoSchema,
    default: () => ({ walletBalance: 0 })
  },
  currentLocation: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number]
    }
  },
  isOnline: {
    type: Boolean,
    default: false
  },
  isAvailable: {
    type: Boolean,
    default: false
  },
  verificationDocuments: {
    aadharImageUrl: { type: String },
    panImageUrl: { type: String },
    photoUrl: { type: String }
  }
}, { timestamps: true });

// Index for geospatial queries
driverSchema.index({ currentLocation: '2dsphere' });

// Index for common queries
driverSchema.index({ user: 1 });
driverSchema.index({ isVerified: 1, isBlocked: 1, isOnline: 1, isAvailable: 1 });
driverSchema.index({ licenseNumber: 1 });

export const Driver = mongoose.model<IDriver>('Driver', driverSchema);
