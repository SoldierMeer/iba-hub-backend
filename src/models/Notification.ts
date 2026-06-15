import mongoose, { Schema, Document } from 'mongoose';

export interface INotification extends Document {
  recipient: mongoose.Types.ObjectId;
  sender?: mongoose.Types.ObjectId; // Optional: A system alert might not have a sender
  type: 'upvote' | 'comment' | 'status_change' | 'message' | 'system' | 'connection' | 'forum_reply'; // 👈 ADDED NEW TYPES
  content: string; // e.g., "Abdullah commented on your complaint"
  link: string; // Where the frontend should redirect when clicked (e.g., '/voice')
  isRead: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema: Schema = new Schema(
  {
    recipient: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true, // Speeds up fetching notifications for a specific user
    },
    sender: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    type: {
      type: String,
      enum: ['upvote', 'comment', 'status_change', 'message', 'system', 'connection', 'forum_reply'], // 👈 ADDED NEW TYPES
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    link: {
      type: String,
      default: '/', // Default fallback link
    },
    isRead: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

export default mongoose.model<INotification>('Notification', NotificationSchema);