import mongoose, { Schema, Document } from 'mongoose';

export interface IOtp extends Document {
  email: string;
  otp: string;
  createdAt: Date;
}

const otpSchema: Schema = new Schema({
  email: { type: String, required: true },
  otp: { type: String, required: true },
  createdAt: { type: Date, default: Date.now, expires: 600 } // 🚀 Auto-deletes after 600 seconds (10 mins)
});

export default mongoose.models.Otp || mongoose.model<IOtp>('Otp', otpSchema);