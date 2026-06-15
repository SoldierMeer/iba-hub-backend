import mongoose, { Schema, Document } from 'mongoose'; // 👈 FIXED: Changed 'express' to 'mongoose'

export interface IConnection extends Document {
    sender: mongoose.Types.ObjectId;
    receiver: mongoose.Types.ObjectId;
    status: 'pending' | 'accepted' | 'rejected';
}

const ConnectionSchema: Schema = new Schema({
    sender: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    receiver: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'accepted', 'rejected'],
        default: 'pending'
    },
}, { timestamps: true });

export default mongoose.model<IConnection>('Connection', ConnectionSchema);