import mongoose, { Schema, Document } from 'mongoose';

export interface IForumReply extends Document {
  post: mongoose.Types.ObjectId;
  author: mongoose.Types.ObjectId;
  content: string;
  upvotes: mongoose.Types.ObjectId[];
  isAcceptedAnswer: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ForumReplySchema: Schema = new Schema(
  {
    post: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ForumPost',
      required: true,
    },
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    content: {
      type: String,
      required: [true, 'Reply content cannot be empty'],
    },
    upvotes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    // Allows the original poster to mark a reply as the "correct" solution
    isAcceptedAnswer: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

export default mongoose.model<IForumReply>('ForumReply', ForumReplySchema);