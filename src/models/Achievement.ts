import mongoose, { Schema, Document } from 'mongoose';

export interface IAchievement extends Document {
  author: mongoose.Types.ObjectId;
  title: string; 
  description: string;
  category: 'Job' | 'Internship' | 'Certificate' | 'Award' | 'Alumni Update' | 'Other';
  mediaUrl?: string;
  reactions: { user: mongoose.Types.ObjectId, type: string }[];
  createdAt: Date;
  updatedAt: Date;
}

const AchievementSchema: Schema = new Schema({
  author: { 
    type: Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  title: { 
    type: String, 
    required: [true, 'Please provide a title for your achievement'] 
  },
  description: { 
    type: String, 
    required: [true, 'Please describe your achievement'] 
  },
  category: { 
    type: String, 
    enum: ['Job', 'Internship', 'Certificate', 'Award', 'Alumni Update', 'Other'],
    required: true 
  },
  mediaUrl: { 
    type: String,
    default: '' 
  },
  reactions: [{
    user: { type: Schema.Types.ObjectId, ref: 'User' },
    type: { type: String, enum: ['Like', 'Celebrate', 'Support', 'Insightful'] }
  }]
}, { timestamps: true });

export default mongoose.model<IAchievement>('Achievement', AchievementSchema);