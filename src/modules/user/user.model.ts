import mongoose, { Document, Schema } from 'mongoose';
import bcrypt from 'bcryptjs';

export interface IUser extends Document {
  name: string;
  email: string;
  password: string;
  refreshToken?: string;
  googleId?: string;
  locationAccessGranted?: boolean;
  locationPreference: 'accepted' | 'denied' | 'not_set';
  currentLocation?: {
    type: string;
    coordinates: [number, number];
  };
  role: 'rider' | 'driver' | 'both' | 'admin';
  phoneNumber?: string;
  profileImageUrl?: string;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const userSchema = new Schema<IUser>({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  refreshToken: { type: String },
  googleId: { type: String },
  locationAccessGranted: { type: Boolean, default: false },
  locationPreference: {
    type: String,
    enum: ['accepted', 'denied', 'not_set'],
    default: 'not_set'
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
  role: {
    type: String,
    enum: ['rider', 'driver', 'both', 'admin'],
    default: 'rider'
  },
  phoneNumber: { type: String },
  profileImageUrl: { type: String }
}, { timestamps: true });

userSchema.index({ 'currentLocation': '2dsphere' });

userSchema.pre('save', async function() {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 10);
});

userSchema.methods.comparePassword = async function(candidatePassword: string): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

export const User = mongoose.model<IUser>('User', userSchema);