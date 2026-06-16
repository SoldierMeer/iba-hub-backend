import mongoose, { Schema, Document } from 'mongoose';
import bcrypt from 'bcryptjs';

// 1. TypeScript Interface for the User
export interface IUser extends Document {
  firstName: string;
  lastName: string;
  bio?: string;
  about?: string;
  skills?: string[];
  isAlumni?: boolean;
  graduationYear?: number;
  batch?: string;
  currentPosition?: string;
  email: string;
  password?: string; // Optional because OAuth users might not have one
  department: string;
  semester: string;
  section: string;
  connections?: mongoose.Types.ObjectId[];
  avatarUrl: string;
  bannerUrl?: string;
  linkedin?: string; // 🚀 ADDED LINKEDIN
  instagram?: string; // 🚀 ADDED INSTAGRAM
  role: 'student' | 'moderator' | 'admin';
  contributorPoints: number;
  isOnline: boolean;
  mutedUsers: string[];
  matchPassword(enteredPassword: string): Promise<boolean>;
}

// 2. Mongoose Schema Definition
const UserSchema: Schema = new Schema(
  {
    firstName: {
      type: String,
      required: [true, 'First name is required'],
      trim: true,
    },
    lastName: {
      type: String,
      required: [true, 'Last name is required'],
      trim: true,
    },
    bio: {
        type: String,
        maxLength: [150, 'Bio cannot exceed 150 characters'],
        default: 'IBA Student', // Default text for new users
    },
    about: {
        type: String,
        maxLength: [500, 'About cannot exceed 500 characters'],
        default: '',
    },
    skills: {
        type: [String], // Array of strings
        default: [],
    },
    isAlumni: {
        type: Boolean,
        default: false,
    },
    graduationYear: {
        type: Number, // Auto-calculated from email (e.g., 2027)
    },
    batch: {
        type: String, // e.g., "2023" (Admission year)
    },
    currentPosition: {
        type: String, // e.g., "Software Engineer at Google"
        default: "",
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
        'Please add a valid email address',
      ],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [6, 'Password must be at least 6 characters'],
      select: false, // Prevents password from being returned in API queries by default
    },
    department: {
      type: String,
      required: [true, 'Department is required'],
      enum: ['Computer Science', 'Software Engineering', 'BBA', 'Accounting & Finance', 'Mathematics', 'Other'],
      default: 'Computer Science',
    },
    semester: {
      type: String,
      enum: ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', 'Graduated'],
      default: '1st',
    },
    section: {
        type: String,
        // 🚀 FIXED: Added empty string '' for Alumni who don't have a section
        enum: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', ''],
        default: 'A',
      },
    connections: [{
        type: Schema.Types.ObjectId,
        ref: 'User'
    }],
    avatarUrl: {
      type: String,
      default: 'https://ui-avatars.com/api/?name=Student&background=0D8ABC&color=fff',
    },
    bannerUrl: { 
        type: String,
        default: '',
    },
    // 👇 ADDED SOCIAL LINKS TO DATABASE SCHEMA
    linkedin: {
        type: String,
        default: '',
    },
    instagram: {
        type: String,
        default: '',
    },
    github: {           // 🚀 ADD GITHUB HERE
      type: String,
      default: '',
    },
    role: {
      type: String,
      enum: ['student', 'moderator', 'admin'],
      default: 'student',
    },
    contributorPoints: {
      type: Number,
      default: 0, // Used for the "Top Contributors" leaderboard
    },
    isOnline: {
      type: Boolean,
      default: false, // Used for the "Peer Connect" chat green dot
    },
    mutedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    blockedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  },
  {
    timestamps: true, // Automatically adds createdAt and updatedAt
  }
);

// 3. Pre-Save Hook: Hash the password before saving to the database
UserSchema.pre('save', async function () {
    // If password is not modified, move on (prevents double hashing)
    if (!this.isModified('password')) {
      return;
    }
  
    // Generate salt and hash the password
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password as string, salt);
  });

// 4. Instance Method: Compare entered password with hashed password
UserSchema.methods.matchPassword = async function (enteredPassword: string): Promise<boolean> {
  return await bcrypt.compare(enteredPassword, this.password);
};

// 5. Export the Model
export default mongoose.model<IUser>('User', UserSchema);