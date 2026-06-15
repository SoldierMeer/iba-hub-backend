import mongoose, { Document, Schema } from 'mongoose';

export interface IReport extends Document {
  reporter: mongoose.Types.ObjectId;
  reportedUser: mongoose.Types.ObjectId;
  reason: string;
  status: 'pending' | 'resolved';
  evidenceUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ReportSchema: Schema = new Schema({
  reporter: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  reportedUser: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  reason: { 
    type: String, 
    required: true 
  },
  status: { 
    type: String, 
    enum: ['pending', 'resolved'], 
    default: 'pending' 
  },
  evidenceUrl: {
    type: String,
    default: null
  }
}, { timestamps: true });

export default mongoose.model<IReport>('Report', ReportSchema);