import mongoose, { Schema, Document } from 'mongoose';

export interface IMessage extends Document {
  sender: mongoose.Types.ObjectId;
  receiver: mongoose.Types.ObjectId;
  text: string;
  mediaUrl?: string;
  isRead: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const MessageSchema: Schema = new Schema(
  {
    sender: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    receiver: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    text: {
      type: String,
      default: '', // Removed 'required' so users can send JUST an image
      trim: true,
    },
    mediaUrl: {
      type: String,
      default: '', // Added to store the Base64 image attachments
    },
    isRead: {
      type: Boolean,
      default: false, // We can use this later for "Read" receipts!
    },
  },
  { timestamps: true }
);

// We add an index to make fetching 1-on-1 chat history lightning fast
MessageSchema.index({ sender: 1, receiver: 1 });

export default mongoose.model<IMessage>('Message', MessageSchema);