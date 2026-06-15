import mongoose, { Schema, Document } from 'mongoose';

// 1. TypeScript Interface for a Single Comment
export interface IComment extends Document {
  user: mongoose.Types.ObjectId;
  text: string;
  createdAt: Date;
  updatedAt: Date;
}

// 2. TypeScript Interface for the Main Post
export interface IPost extends Document {
  user: mongoose.Types.ObjectId;
  content: string;
  category: 'Discussion' | 'Academic' | 'Event' | 'Announcement';
  upvotes: mongoose.Types.ObjectId[];
  comments: IComment[];
  createdAt: Date;
  updatedAt: Date;
}

// 3. Mongoose Schema for the Embedded Comment
const CommentSchema: Schema = new Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User', // Links to our User model
    },
    text: {
      type: String,
      required: [true, 'Comment text is required'],
      trim: true,
      maxlength: [500, 'Comment cannot be more than 500 characters'],
    },
  },
  { timestamps: true }
);

// 4. Mongoose Schema for the Main Post
const PostSchema: Schema = new Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User', // Links the post to the original author
    },
    content: {
      type: String,
      required: [true, 'Post content is required'],
      trim: true,
      maxlength: [2000, 'Post cannot be more than 2000 characters'],
    },
    category: {
      type: String,
      enum: ['Discussion', 'Academic', 'Event', 'Announcement'],
      default: 'Discussion',
    },
    // Upvotes is an array of User IDs. This guarantees a user can only vote once.
    upvotes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    // Embeds the comments directly inside the post for optimized querying
    comments: [CommentSchema],
  },
  {
    timestamps: true, // Automatically manages createdAt and updatedAt
  }
);

// 5. Export the Model
export default mongoose.model<IPost>('Post', PostSchema);