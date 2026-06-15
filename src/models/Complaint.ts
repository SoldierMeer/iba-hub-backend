import mongoose, { Schema, Document } from 'mongoose';

// 1. Define the Comment Interface for nested discussions
interface IComment {
    user: mongoose.Types.ObjectId;
    text: string;
    upvotes?: mongoose.Types.ObjectId[]; // 👈 ADD THIS LINE
    createdAt: Date;
}

// 2. Define the main Complaint Interface
export interface IComplaint extends Document {
  author: mongoose.Types.ObjectId;
  isAnonymous: boolean;
  title: string;
  description: string;
  category: 'Transport' | 'Hostel' | 'IT Support' | 'Academics' | 'Cafeteria' | 'Finance' | 'General';
  department: string;
  mediaUrl?: string;
  upvotes: mongoose.Types.ObjectId[]; // Array of user IDs who upvoted
  status: 'Pending' | 'Under Review' | 'In Progress' | 'Resolved' | 'Declined';
  officialResponse?: string; // Where admins/council can post the final verdict
  comments: IComment[];
  createdAt: Date;
  updatedAt: Date;
}

// 3. Create the Schema
const ComplaintSchema: Schema = new Schema({
  author: { 
    type: Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  isAnonymous: {
    type: Boolean,
    default: false
  },
  title: { 
    type: String, 
    required: [true, 'Please provide a title for this issue'],
    trim: true,
    maxlength: [100, 'Title cannot be more than 100 characters']
  },
  description: { 
    type: String, 
    required: [true, 'Please describe the issue in detail'] 
  },
  category: { 
    type: String, 
    enum: ['Transport', 'Hostel', 'IT Support', 'Academics', 'Cafeteria', 'Finance', 'General'],
    default: 'General'
  },
  department: {  // 👈 ADD THIS
    type: String,
    default: 'Global'
  },
  mediaUrl: { 
    type: String,
    default: '' 
  },
  upvotes: [{ 
    type: Schema.Types.ObjectId, 
    ref: 'User' 
  }],
  status: {
    type: String,
    enum: ['Pending', 'Under Review', 'In Progress', 'Resolved', 'Declined'],
    default: 'Pending'
  },
  moderationStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  officialResponse: {
    type: String,
    default: ''
  },
  // Nested array for the discussion thread
  comments: [{
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true },
    upvotes: [{ type: Schema.Types.ObjectId, ref: 'User' }], // 👈 ADD THIS LINE
    createdAt: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

export default mongoose.model<IComplaint>('Complaint', ComplaintSchema);