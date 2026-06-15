import mongoose, { Schema, Document } from 'mongoose';

export interface IResource extends Document {
  uploader: mongoose.Types.ObjectId;
  title: string;
  description: string;
  courseCode: string;
  department: string;
  fileUrl: string; // The URL (Cloudinary, Firebase, or Google Drive download link)
  fileName: string;
  fileSize: string; 
  fileType: string; 
  // 🚀 3-TIER STORAGE ARCHITECTURE ADDITIONS
  storageProvider: 'cloudinary' | 'firebase' | 'google_drive' | 'legacy'; 
  driveId?: string; // Optional (only exists if provider is google_drive)
  downloads: number; 
  upvotes: number;
  status: 'pending' | 'approved' | 'rejected'; // <-- Caught this from your schema!
  createdAt: Date;
  updatedAt: Date;
}


const ResourceSchema: Schema = new Schema(
  {
    uploader: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
    title: {
      type: String,
      required: [true, 'Resource title is required'],
      trim: true,
    },
    description: {
      type: String,
      required: [true, 'Resource description is required'],
      maxlength: [500, 'Description cannot exceed 500 characters'],
    },
    courseCode: {
      type: String,
      required: [true, 'Course code is required (e.g., CSC-101)'],
      uppercase: true,
      trim: true,
    },
    department: {
      type: String,
      required: true,
      enum: ['Computer Science', 'Software Engineering', 'BBA', 'Accounting & Finance', 'Mathematics', 'Other'],
    },
    fileUrl: {
      type: String,
      required: [true, 'File URL is required'], // 💡 Will hold Firebase link, Cloudinary link, or standard Drive download URL
    },
    fileName: { 
      type: String,
      required: [true, 'File name is required'],
    },
    fileSize: { 
      type: String,
      default: 'Unknown Size',
    },
    fileType: {
      type: String,
      enum: ['pdf', 'image', 'document', 'other', 'link', 'zip', 'ppt','txt', 'PDF', 'Image', 'Document', 'Link', 'Zip', 'PPT', 'TXT'],
      default: 'Document',
    },
    // 🚀 3-TIER STORAGE ARCHITECTURE ADDITIONS
    storageProvider: {
      type: String,
      enum: ['cloudinary', 'firebase', 'google_drive', 'legacy'],
      default: 'legacy', // 💡 Ensures old uploads keep working seamlessly
    },
    driveId: {
      type: String, // 💡 Only populated if storageProvider is 'google_drive'
      trim: true,
    },
    downloads: { 
      type: Number,
      default: 0,
    },
    upvotes: {
      type: Number,
      default: 0,
    },
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending',
    },
  },
  { timestamps: true }
);


export default mongoose.model<IResource>('Resource', ResourceSchema);