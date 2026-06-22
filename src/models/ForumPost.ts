import mongoose, { Schema, Document } from 'mongoose';

export interface IForumPost extends Document {
  title: string;
  content: string;
  category: string; // <-- ADDED
  author: mongoose.Types.ObjectId;
  tags: string[];
  upvotes: mongoose.Types.ObjectId[];
  upvotesCount: number;
  replyCount: number;
  createdAt: Date;
  updatedAt: Date;
  hasAcceptedAnswer: boolean;
}

const ForumPostSchema: Schema = new Schema(
  {
    title: {
      type: String,
      required: [true, 'Please add a title for your query'],
      trim: true,
      maxlength: [150, 'Title cannot be more than 150 characters'],
    },
    content: {
      type: String,
      required: [true, 'Please add some details to your query'],
    },
    category: { // <-- ADDED
      type: String,
      default: 'General',
      enum: ['Academics & Courses', 'Campus & Hostel', 'Admissions & Finance', 'Societies & Events', 'Career & Internships', 'Alumni Network', 'General Discussion'],
      index: true
    },
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    tags: {
      type: [String],
      // e.g., ['Typescript', 'Next.js', 'Debugging']
      default: [], 
    },
    upvotes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    upvotesCount: { // <-- NEW
        type: Number,
        default: 0,
    },
    // Keeping a manual count makes fetching the main feed much faster 
    // than querying the Replies collection every time.
    replyCount: {
      type: Number,
      default: 0,
    },
    hasAcceptedAnswer: { // <-- Add to schema
        type: Boolean,
        default: false,
    },
  },
  { timestamps: true }
);

export default mongoose.model<IForumPost>('ForumPost', ForumPostSchema);