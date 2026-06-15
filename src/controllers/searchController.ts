import { Request, Response } from 'express';
import User from '../models/User';
import Post from '../models/Post';
import Resource from '../models/Resource';
import Complaint from '../models/Complaint';

// @desc    Global Search across all modules
// @route   GET /api/v1/search?q=...
export const globalSearch = async (req: Request | any, res: Response): Promise<void> => {
  try {
    const query = req.query.q as string;
    
    if (!query) {
      res.status(200).json({ success: true, data: { users: [], posts: [], resources: [], complaints: [] } });
      return;
    }

    // Create a case-insensitive regular expression for partial matching
    const regex = new RegExp(query, 'i');

    // Run all 4 database queries IN PARALLEL for maximum speed!
    const [users, posts, resources, complaints] = await Promise.all([
      User.find({ $or: [{ firstName: regex }, { lastName: regex }] }).select('firstName lastName avatarUrl department').limit(3),
      Post.find({ $or: [{ title: regex }, { content: regex }] }).select('title').limit(3),
      Resource.find({ $or: [{ title: regex }, { course: regex }] }).select('title type').limit(3),
      Complaint.find({ title: regex }).select('title status').limit(3)
    ]);

    res.status(200).json({
      success: true,
      data: { users, posts, resources, complaints }
    });
  } catch (error: any) {
    console.error("Global Search Error:", error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};