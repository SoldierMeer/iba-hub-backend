import mongoose, { Schema, Document } from 'mongoose';

export interface IAnnouncement extends Document {
  message: string;
  priority: 'Urgent' | 'General' | 'Department';
  author: mongoose.Types.ObjectId;
  createdAt: Date;
}

const AnnouncementSchema: Schema = new Schema({
  message: { type: String, required: true },
  priority: { type: String, enum: ['Urgent', 'General', 'Department'], default: 'General' },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

export default mongoose.model<IAnnouncement>('Announcement', AnnouncementSchema);