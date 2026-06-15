import { Request, Response } from 'express';
import Resource from '../models/Resource';
import Complaint from '../models/Complaint';
import Announcement from '../models/Announcement';
import Notification from '../models/Notification';  
import { AuthRequest } from '../middleware/authMiddleware';
import User from '../models/User';

// @desc    Get all pending items for moderation
// @route   GET /api/v1/admin/pending
// @access  Private/Admin
export const getPendingModeration = async (req: Request, res: Response): Promise<void> => {
  try {
    const pendingResources = await Resource.find({ status: 'pending' })
      .populate('uploader', 'firstName lastName')
      .sort({ createdAt: -1 })
      .lean();

    const pendingComplaints = await Complaint.find({ moderationStatus: 'pending' })
      .populate('author', 'firstName lastName')
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({ 
      success: true, 
      data: {
        resources: pendingResources,
        complaints: pendingComplaints
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Approve or Reject a Resource
// @route   PUT /api/v1/admin/resources/:id/moderate
// @access  Private/Admin
export const moderateResource = async (req: Request, res: Response): Promise<void> => {
    try {
      const { action } = req.body; 
      
      if (!['approved', 'rejected'].includes(action)) {
        res.status(400).json({ success: false, message: 'Invalid action. Use approved or rejected' });
        return;
      }
  
      const resource = await Resource.findByIdAndUpdate(
        req.params.id, 
        { status: action }, 
        { new: true }
      ).populate('uploader', '_id firstName'); // 🚀 Populate uploader to get their ID
  
      if (!resource) {
        res.status(404).json({ success: false, message: 'Resource not found' });
        return;
      }
  
      // 🚀 CREATE AND EMIT NOTIFICATION
      if (resource.uploader) {
        const notification = await Notification.create({
          recipient: resource.uploader._id,
          type: 'system',
          content: `Your resource "${resource.title}" was ${action} by moderation.`,
          link: '/resources'
        });
  
        const io = req.app.get('io');
        if (io) io.to(resource.uploader._id.toString()).emit('new_notification', notification);
      }
  
      res.status(200).json({ success: true, data: resource });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Approve or Reject an IBA Voice Complaint
// @route   PUT /api/v1/admin/complaints/:id/moderate
// @access  Private/Admin
export const moderateComplaint = async (req: Request, res: Response): Promise<void> => {
    try {
      const { action } = req.body; 
      
      if (!['approved', 'rejected'].includes(action)) {
        res.status(400).json({ success: false, message: 'Invalid action. Use approved or rejected' });
        return;
      }
  
      const complaint = await Complaint.findByIdAndUpdate(
        req.params.id, 
        { moderationStatus: action }, 
        { new: true }
      ).populate('author', '_id firstName'); // 🚀 Populate author to get their ID
  
      if (!complaint) {
        res.status(404).json({ success: false, message: 'Complaint not found' });
        return;
      }
  
      // 🚀 CREATE AND EMIT NOTIFICATION
      if (complaint.author) {
        const notification = await Notification.create({
          recipient: complaint.author._id,
          type: 'status_change',
          content: `Your IBA Voice submission "${complaint.title}" was ${action}.`,
          link: '/voice'
        });
  
        const io = req.app.get('io');
        if (io) io.to(complaint.author._id.toString()).emit('new_notification', notification);
      }
  
      res.status(200).json({ success: true, data: complaint });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Create a new Announcement
// @route   POST /api/v1/admin/announcements
// @access  Private/Admin
export const createAnnouncement = async (req: AuthRequest | any, res: Response): Promise<void> => {
  try {
    const { message, priority } = req.body;

    const announcement = await Announcement.create({
      message,
      priority,
      author: req.user._id
    });

    res.status(201).json({ success: true, data: announcement });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get all users for Admin User Management
// @route   GET /api/v1/admin/users
// @access  Private/Admin
// export const getAllUsers = async (req: Request, res: Response): Promise<void> => {
//   try {
//     const users = await User.find({}).select('-password').sort({ createdAt: -1 });
//     res.status(200).json({ success: true, count: users.length, data: users });
//   } catch (error: any) {
//     res.status(500).json({ success: false, message: error.message });
//   }
// };

export const getAllUsers = async (req: Request, res: Response): Promise<void> => {
  try {
    // 🚀 PAGINATION: Prevent fetching thousands of users at once
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const total = await User.countDocuments();
    const users = await User.find({})
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    res.status(200).json({ 
      success: true, 
      count: users.length, 
      total, // 🚀 Send total so frontend can calculate page numbers
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      data: users 
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update User Role
// @route   PUT /api/v1/admin/users/:id/role
// @access  Private/Admin
export const updateUserRole = async (req: AuthRequest | any, res: Response): Promise<void> => {
  try {
    const { role } = req.body;
    
    // SECURITY: Prevent an admin from accidentally demoting themselves
    if (req.user._id.toString() === req.params.id && role !== 'admin') {
      res.status(400).json({ success: false, message: "Action blocked: You cannot demote yourself." });
      return;
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { role },
      { new: true, runValidators: true }
    ).select('-password').lean();

    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    res.status(200).json({ success: true, data: user });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteAnnouncement = async (req: Request, res: Response): Promise<void> => {
  try {
    const announcement = await Announcement.findByIdAndDelete(req.params.id);
    if (!announcement) {
      res.status(404).json({ success: false, message: 'Announcement not found' });
      return;
    }
    res.status(200).json({ success: true, message: 'Announcement deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

import Report from '../models/Report'; // 🚀 IMPORT THE MODEL

// ... your existing admin controllers ...

// 🚀 GET ALL PENDING REPORTS
// export const getPendingReports = async (req: Request, res: Response): Promise<void> => {
//     try {
//         const reports = await Report.find({ status: 'pending' })
//             .populate('reporter', 'firstName lastName avatarUrl email')
//             .populate('reportedUser', 'firstName lastName avatarUrl email')
//             .sort({ createdAt: -1 });

//         res.status(200).json({ success: true, data: reports });
//     } catch (error: any) {
//         res.status(500).json({ success: false, message: error.message });
//     }
// };

export const getPendingReports = async (req: Request, res: Response): Promise<void> => {
  try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = 20;
      const skip = (page - 1) * limit;

      const reports = await Report.find({ status: 'pending' })
          .populate('reporter', 'firstName lastName avatarUrl email')
          .populate('reportedUser', 'firstName lastName avatarUrl email')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean();

      res.status(200).json({ success: true, data: reports });
  } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
  }
};

// 🚀 RESOLVE A REPORT
export const resolveReport = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        
        const report = await Report.findByIdAndUpdate(
            id,
            { status: 'resolved' },
            { new: true }
        );

        if (!report) {
            res.status(404).json({ success: false, message: 'Report not found' });
            return;
        }

        res.status(200).json({ success: true, message: 'Report resolved successfully', data: report });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
};