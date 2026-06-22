import { Request, Response } from 'express';
import Complaint from '../models/Complaint';
import Notification from '../models/Notification';

// 🚀 CRITICAL OPTIMIZATION: Global Stats Cache
// This prevents MongoDB from recalculating the exact same global stats 3,000 times.
let cachedGlobalStats: any = null;
let lastStatsCacheTime = 0;

// @desc    Get all complaints (IBA Voice Feed)
// @route   GET /api/v1/complaints
export const getComplaints = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 10;
    const skip = (page - 1) * limit;

    const { category, status, department } = req.query;

    let matchQuery: any = { moderationStatus: 'approved' };
    
    if (category && category !== 'All') matchQuery.category = category;
    if (status && status !== 'All') matchQuery.status = status;
    if (department && department !== 'All') matchQuery.department = department;

    const now = Date.now();
    let statsData = cachedGlobalStats;

    // 🚀 CACHE CHECK: Only run the heavy aggregation if 60 seconds have passed!
    if (!statsData || now - lastStatsCacheTime > 60000) {
      statsData = await Complaint.aggregate([
        { $match: { moderationStatus: 'approved' } },
        { 
          $group: {
            _id: null,
            total: { $sum: 1 },
            pending: { $sum: { $cond: [{ $in: ["$status", ["Pending", "Under Review"]] }, 1, 0] } },
            inProgress: { $sum: { $cond: [{ $eq: ["$status", "In Progress"] }, 1, 0] } },
            resolved: { $sum: { $cond: [{ $eq: ["$status", "Resolved"] }, 1, 0] } },
            anonymous: { $sum: { $cond: [{ $eq: ["$isAnonymous", true] }, 1, 0] } },
            totalResolvedTime: {
              $sum: {
                $cond: [
                  { $eq: ["$status", "Resolved"] },
                  { $subtract: [{ $ifNull: ["$updatedAt", "$createdAt"] }, "$createdAt"] },
                  0
                ]
              }
            }
          }
        }
      ]);
      cachedGlobalStats = statsData;
      lastStatsCacheTime = now;
    }

    // RUN THE FAST QUERIES IN PARALLEL
    const [complaints, totalFilteredCount] = await Promise.all([
      Complaint.find(matchQuery)
        .populate('author', 'firstName lastName avatarUrl headline isAlumni')
        .populate('comments.user', 'firstName lastName avatarUrl')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      
      Complaint.countDocuments(matchQuery)
    ]);

    // Format global stats
    const rawStats = statsData[0] || { total: 0, pending: 0, inProgress: 0, resolved: 0, anonymous: 0, totalResolvedTime: 0 };
    const anonymousPercent = rawStats.total > 0 ? Math.round((rawStats.anonymous / rawStats.total) * 100) : 0;
    
    let avgResStr = '-';
    if (rawStats.resolved > 0) {
      const avgDays = (rawStats.totalResolvedTime / rawStats.resolved) / (1000 * 60 * 60 * 24);
      avgResStr = `${avgDays.toFixed(1)}d`;
    }

    const globalStats = {
      total: rawStats.total,
      pending: rawStats.pending,
      inProgress: rawStats.inProgress,
      resolved: rawStats.resolved,
      anonymousPercent: anonymousPercent,
      avgRes: avgResStr
    };

    // Sanitize anonymous posts & limit comment depth
    const sanitizedComplaints = complaints.map(complaint => {
      const doc = complaint as any; 
      if (doc.isAnonymous) {
        doc.author = { _id: 'anonymous_id', firstName: 'Anonymous', lastName: 'Student', avatarUrl: '', headline: 'Identity hidden for privacy' };
      }
      if (doc.comments && doc.comments.length > 5) {
         doc.commentCount = doc.comments.length; 
         doc.comments = doc.comments.slice(-5);  
      } else {
         doc.commentCount = doc.comments ? doc.comments.length : 0;
      }
      return doc;
    });

    const hasMore = totalFilteredCount > (skip + sanitizedComplaints.length);

    res.status(200).json({ 
      success: true, 
      count: sanitizedComplaints.length, 
      data: sanitizedComplaints,
      stats: globalStats,
      pagination: { currentPage: page, hasMore: hasMore } 
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Create a new complaint/issue
// @route   POST /api/v1/complaints
export const createComplaint = async (req: Request | any, res: Response): Promise<void> => {
    try {
      const { title, description, category, department, mediaUrl, isAnonymous } = req.body;
      
      const newComplaint = await Complaint.create({
        author: req.user._id as any,
        title,
        description,
        category,
        department,
        mediaUrl,
        isAnonymous
      });
  
      await newComplaint.populate('author', 'firstName lastName avatarUrl headline');
  
      const doc: any = newComplaint.toObject();
      if (doc.isAnonymous) {
        doc.author = {
          _id: 'anonymous_id' as any,
          firstName: 'Anonymous',
          lastName: 'Student',
          avatarUrl: '',
          headline: 'Identity hidden for privacy'
        };
      }
  
      res.status(201).json({ success: true, data: doc });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Toggle upvote on a complaint
// @route   PUT /api/v1/complaints/:id/upvote
export const toggleUpvote = async (req: Request | any, res: Response): Promise<void> => {
  try {
    const complaintId = req.params.id;
    
    if (!req.user || !req.user._id) {
      res.status(401).json({ success: false, message: 'User not authenticated properly' });
      return;
    }

    const userId = req.user._id.toString();
    const complaint = await Complaint.findById(complaintId);

    if (!complaint) {
      res.status(404).json({ success: false, message: 'Complaint not found' });
      return;
    }

    const hasUpvoted = complaint.upvotes?.some((id: any) => id && id.toString() === userId);
    let updatedComplaint;

    // ATOMIC UPDATES: Super fast and race-condition free
    if (hasUpvoted) {
      updatedComplaint = await Complaint.findByIdAndUpdate(
          complaintId, 
          { $pull: { upvotes: userId as any } },
          { new: true } 
      );
    } else {
      updatedComplaint = await Complaint.findByIdAndUpdate(
          complaintId, 
          { $addToSet: { upvotes: userId as any } },
          { new: true }
      );
    }

    res.status(200).json({ success: true, data: updatedComplaint?.upvotes || [] });
  } catch (error: any) {
    console.error("🔥 BACKEND UPVOTE CRASH:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};
  
// @desc    Add a comment to a complaint
// @route   POST /api/v1/complaints/:id/comments
export const addComment = async (req: Request | any, res: Response): Promise<void> => {
    try {
      const { text } = req.body;
      
      if (!text) {
        res.status(400).json({ success: false, message: 'Comment text is required' });
        return;
      }
  
      const newComment = {
        user: req.user._id as any,
        text,
        createdAt: new Date()
      };

      // 🚀 CONCURRENCY FIX: Use $push to atomically add the comment
      // This allows 1,000 students to comment simultaneously without throwing a VersionError crash
      const complaint = await Complaint.findByIdAndUpdate(
        req.params.id,
        { $push: { comments: newComment } },
        { new: true }
      );
  
      if (!complaint) {
        res.status(404).json({ success: false, message: 'Complaint not found' });
        return;
      }
  
      // --- REAL-TIME NOTIFICATION TRIGGER ---
      if (complaint.author.toString() !== req.user._id.toString()) {
        const notification = await Notification.create({
          recipient: complaint.author as any,
          sender: req.user._id as any,
          type: 'comment',
          content: `${req.user.firstName} commented on your post.`,
          link: '/voice'
        });
  
        const io = req.app.get('io');
        io.to(complaint.author.toString()).emit('new_notification', notification);
      }
      // --------------------------------------
  
      await complaint.populate('comments.user', 'firstName lastName avatarUrl');
  
      res.status(201).json({ success: true, data: complaint.comments });
    } catch (error: any) {
      console.error("🔥 BACKEND COMMENT CRASH:", error);
      res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Update complaint status & add official response (Admin/Moderator only)
// @route   PUT /api/v1/complaints/:id/status
export const updateComplaintStatus = async (req: Request | any, res: Response): Promise<void> => {
    try {
      const { status, officialResponse } = req.body;
      const complaint = await Complaint.findById(req.params.id);
  
      if (!complaint) {
        res.status(404).json({ success: false, message: 'Complaint not found' });
        return;
      }
  
      if (status) complaint.status = status;
      if (officialResponse !== undefined) complaint.officialResponse = officialResponse;
  
      await complaint.save();

      // --- REAL-TIME NOTIFICATION TRIGGER ---
      const notification = await Notification.create({
        recipient: complaint.author as any,
        sender: req.user._id as any,
        type: 'status_change',
        content: `Your complaint status was updated to: ${status}`,
        link: '/voice'
      });
  
      const io = req.app.get('io');
      io.to(complaint.author.toString()).emit('new_notification', notification);
      // --------------------------------------
  
      await complaint.populate('author', 'firstName lastName avatarUrl headline');
      await complaint.populate('comments.user', 'firstName lastName avatarUrl');
  
      res.status(200).json({ success: true, data: complaint });
    } catch (error: any) {
      console.error("🔥 BACKEND STATUS UPDATE CRASH:", error);
      res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Toggle like/upvote on a complaint comment
// @route   PUT /api/v1/complaints/:id/comments/:commentId/like
export const toggleCommentLike = async (req: Request | any, res: Response): Promise<void> => {
    try {
      const complaint = await Complaint.findById(req.params.id);
  
      if (!complaint) {
        res.status(404).json({ success: false, message: 'Complaint not found' });
        return;
      }
  
      const comment = complaint.comments.find(
        (c: any) => c._id.toString() === req.params.commentId
      );
  
      if (!comment) {
        res.status(404).json({ success: false, message: 'Comment not found' });
        return;
      }
  
      if (!comment.upvotes) {
        comment.upvotes = [];
      }
  
      const userId = req.user._id.toString();
      const upvoteIndex = comment.upvotes.findIndex((id: any) => id && id.toString() === userId);
  
      if (upvoteIndex !== -1) {
        comment.upvotes.splice(upvoteIndex, 1); 
      } else {
        comment.upvotes.push(req.user._id as any); 
      }
  
      // Array updates on sub-documents can't easily be done atomically without massive complexity.
      // Since comments aren't highly concurrent, .save() is acceptable here.
      await complaint.save();
  
      res.status(200).json({ success: true, data: comment.upvotes });
    } catch (error: any) {
      console.error("🔥 BACKEND COMMENT LIKE CRASH:", error);
      res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Delete a comment
// @route   DELETE /api/v1/complaints/:id/comments/:commentId
export const deleteComment = async (req: Request | any, res: Response): Promise<void> => {
    try {
      const complaint = await Complaint.findById(req.params.id);
  
      if (!complaint) {
        res.status(404).json({ success: false, message: 'Complaint not found' });
        return;
      }
  
      const commentIndex = complaint.comments.findIndex(
        (c: any) => c._id.toString() === req.params.commentId
      );
  
      if (commentIndex === -1) {
        res.status(404).json({ success: false, message: 'Comment not found' });
        return;
      }
  
      const comment = complaint.comments[commentIndex];
  
      const isAuthor = comment.user.toString() === req.user._id.toString();
      const isAdmin = req.user.role === 'admin' || req.user.role === 'moderator';
  
      if (!isAuthor && !isAdmin) {
        res.status(403).json({ success: false, message: 'Not authorized to delete this comment' });
        return;
      }
  
      complaint.comments.splice(commentIndex, 1);
      await complaint.save();
  
      res.status(200).json({ success: true, message: 'Comment deleted successfully' });
    } catch (error: any) {
      console.error("🔥 BACKEND COMMENT DELETE CRASH:", error);
      res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Delete a complaint completely
// @route   DELETE /api/v1/complaints/:id
export const deleteComplaint = async (req: Request | any, res: Response): Promise<void> => {
    try {
      const complaint = await Complaint.findById(req.params.id);
  
      if (!complaint) {
        res.status(404).json({ success: false, message: 'Complaint not found' });
        return;
      }
  
      const isAuthor = complaint.author.toString() === req.user._id.toString();
      const isAdmin = req.user.role === 'admin' || req.user.role === 'moderator';
  
      if (!isAuthor && !isAdmin) {
        res.status(403).json({ success: false, message: 'Not authorized to delete this complaint' });
        return;
      }
  
      await complaint.deleteOne();
      res.status(200).json({ success: true, message: 'Complaint deleted successfully' });
    } catch (error: any) {
      console.error("🔥 COMPLAINT DELETE CRASH:", error);
      res.status(500).json({ success: false, message: error.message });
    }
};