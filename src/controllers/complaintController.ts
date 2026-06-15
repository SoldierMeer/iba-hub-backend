import { Request, Response } from 'express';
import Complaint from '../models/Complaint';
import Notification from '../models/Notification';

// @desc    Get all complaints (IBA Voice Feed)
// @route   GET /api/v1/complaints
// export const getComplaints = async (req: Request, res: Response): Promise<void> => {
//   try {
//     const complaints = await Complaint.find({ moderationStatus: 'approved' })
//       .populate('author', 'firstName lastName avatarUrl headline isAlumni')
//       .populate('comments.user', 'firstName lastName avatarUrl')
//       .sort({ createdAt: -1 });

//     // SECURITY: Sanitize anonymous posts before sending them to the frontend
//     const sanitizedComplaints = complaints.map(complaint => {
//       // Convert mongoose document to a plain JavaScript object so we can modify it
//       const doc = complaint.toObject(); 
      
//       if (doc.isAnonymous) {
//         doc.author = {
//           _id: 'anonymous_id',
//           firstName: 'Anonymous',
//           lastName: 'Student',
//           avatarUrl: '',
//           headline: 'Identity hidden for privacy'
//         };
//       }
//       return doc;
//     });

//     res.status(200).json({ success: true, count: sanitizedComplaints.length, data: sanitizedComplaints });
//   } catch (error: any) {
//     res.status(500).json({ success: false, message: error.message });
//   }
// };

// export const getComplaints = async (req: Request, res: Response): Promise<void> => {
//   try {
//     const complaints = await Complaint.find({ moderationStatus: 'approved' })
//       .populate('author', 'firstName lastName avatarUrl headline isAlumni')
//       .populate('comments.user', 'firstName lastName avatarUrl')
//       .sort({ createdAt: -1 })
//       .limit(20) // 🚀 1. THE CURE: Only fetch the 20 most recent complaints
//       .lean();   // 🚀 2. MASSIVE SPEEDUP: Returns plain JS objects directly from MongoDB

//     // SECURITY: Sanitize anonymous posts before sending them to the frontend
//     const sanitizedComplaints = complaints.map(complaint => {
//       // 🚀 3. No need for .toObject() anymore because .lean() already did it!
//       const doc = complaint as any; 
      
//       if (doc.isAnonymous) {
//         doc.author = {
//           _id: 'anonymous_id',
//           firstName: 'Anonymous',
//           lastName: 'Student',
//           avatarUrl: '',
//           headline: 'Identity hidden for privacy'
//         };
//       }

//       // Optional Pro-Tip: If a complaint goes viral and has 300 comments, 
//       // it will crash the mobile browser. Let's only send the latest 3 comments!
//       if (doc.comments && doc.comments.length > 3) {
//          doc.commentCount = doc.comments.length; // Tell the UI how many there are
//          doc.comments = doc.comments.slice(-3);  // Only send the last 3
//       }

//       return doc;
//     });

//     res.status(200).json({ 
//       success: true, 
//       count: sanitizedComplaints.length, 
//       data: sanitizedComplaints 
//     });
//   } catch (error: any) {
//     res.status(500).json({ success: false, message: error.message });
//   }
// };

// @desc    Get all complaints (IBA Voice Feed)
// @route   GET /api/v1/complaints
export const getComplaints = async (req: Request, res: Response): Promise<void> => {
  try {
    // 1. Extract Pagination from the request URL
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 10;
    const skip = (page - 1) * limit;

    // 🚀 THE FIX: Extract all 3 filters from the query
    const { category, status, department } = req.query;

    let matchQuery: any = { moderationStatus: 'approved' };
    
    // 🚀 THE FIX: Only apply the filter to the database if it doesn't say "All"
    if (category && category !== 'All') matchQuery.category = category;
    if (status && status !== 'All') matchQuery.status = status;
    if (department && department !== 'All') matchQuery.department = department;

    // 3. RUN QUERIES IN PARALLEL
    const [complaints, totalFilteredCount, statsData] = await Promise.all([
      Complaint.find(matchQuery)
        .populate('author', 'firstName lastName avatarUrl headline isAlumni')
        .populate('comments.user', 'firstName lastName avatarUrl')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      
      Complaint.countDocuments(matchQuery),

      Complaint.aggregate([
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
      ])
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
// @desc    Create a new complaint/issue
// @route   POST /api/v1/complaints
export const createComplaint = async (req: Request | any, res: Response): Promise<void> => {
    try {
      // 1. Extract department from req.body
      const { title, description, category, department, mediaUrl, isAnonymous } = req.body;
      
      const newComplaint = await Complaint.create({
        author: req.user._id,
        title,
        description,
        category,
        department, // 👈 2. Pass it into the creation object
        mediaUrl,
        isAnonymous
      });
  
      await newComplaint.populate('author', 'firstName lastName avatarUrl headline');
  
      const doc = newComplaint.toObject();
      if (doc.isAnonymous) {
        doc.author = {
          _id: 'anonymous_id',
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
// @desc    Toggle upvote on a complaint
// @route   PUT /api/v1/complaints/:id/upvote
// @desc    Toggle upvote on a complaint
// @route   PUT /api/v1/complaints/:id/upvote
// export const toggleUpvote = async (req: Request | any, res: Response): Promise<void> => {
//     try {
//       const complaint = await Complaint.findById(req.params.id);
  
//       if (!complaint) {
//         res.status(404).json({ success: false, message: 'Complaint not found' });
//         return;
//       }
  
//       // Defensive check: Ensure user exists in request
//       if (!req.user || !req.user._id) {
//         res.status(401).json({ success: false, message: 'User not authenticated properly' });
//         return;
//       }
  
//       if (!complaint.upvotes) {
//         complaint.upvotes = [];
//       }
  
//       const userId = req.user._id.toString();
//       const upvoteIndex = complaint.upvotes.findIndex((id: any) => id && id.toString() === userId);
  
//       if (upvoteIndex !== -1) {
//         complaint.upvotes.splice(upvoteIndex, 1);
//       } else {
//         complaint.upvotes.push(req.user._id);
//       }
  
//       await complaint.save();
  
//       res.status(200).json({ success: true, data: complaint.upvotes });
//     } catch (error: any) {
//       // 🚨 THIS WILL PRINT THE EXACT CRASH REASON TO YOUR BACKEND TERMINAL
//       console.error("🔥 BACKEND UPVOTE CRASH:", error);
//       res.status(500).json({ success: false, message: error.message });
//     }
// };
  
export const toggleUpvote = async (req: Request | any, res: Response): Promise<void> => {
  try {
    const complaintId = req.params.id;
    
    // Defensive check: Ensure user exists in request
    if (!req.user || !req.user._id) {
      res.status(401).json({ success: false, message: 'User not authenticated properly' });
      return;
    }

    const userId = req.user._id.toString();

    // 1. Fetch the document just to check if it exists and current status
    const complaint = await Complaint.findById(complaintId);

    if (!complaint) {
      res.status(404).json({ success: false, message: 'Complaint not found' });
      return;
    }

    // 2. Check if the user is already in the array
    const hasUpvoted = complaint.upvotes?.some((id: any) => id && id.toString() === userId);

    let updatedComplaint;

    // 3. 🚀 THE FIX: Use atomic operations directly on the database
    if (hasUpvoted) {
      // Atomic Pull: Safely removes the specific ID without touching the rest of the document
      updatedComplaint = await Complaint.findByIdAndUpdate(
          complaintId, 
          { $pull: { upvotes: userId } },
          { new: true } // Tells Mongoose to return the newly updated document
      );
    } else {
      // Atomic Add: Safely adds the ID (only if it doesn't already exist)
      updatedComplaint = await Complaint.findByIdAndUpdate(
          complaintId, 
          { $addToSet: { upvotes: userId } },
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
  
      const complaint = await Complaint.findById(req.params.id);
  
      if (!complaint) {
        res.status(404).json({ success: false, message: 'Complaint not found' });
        return;
      }
  
      if (!complaint.comments) {
        complaint.comments = [];
      }
  
      complaint.comments.push({
        user: req.user._id,
        text,
        createdAt: new Date()
      });
  
      await complaint.save();

      // --- REAL-TIME NOTIFICATION TRIGGER ---
    // Only notify if someone ELSE is commenting on the post
    if (complaint.author.toString() !== req.user._id.toString()) {
        const notification = await Notification.create({
          recipient: complaint.author,
          sender: req.user._id,
          type: 'comment',
          content: `${req.user.firstName} commented on your post.`,
          link: '/voice'
        });
  
        const io = req.app.get('io');
        io.to(complaint.author.toString()).emit('new_notification', notification);
      }
      // --------------------------------------
  
      // Re-populate the user fields so the frontend gets the names and avatars
      await complaint.populate('comments.user', 'firstName lastName avatarUrl');
  
      res.status(201).json({ success: true, data: complaint.comments });
    } catch (error: any) {
      // 🚨 THIS WILL PRINT THE EXACT CRASH REASON TO YOUR BACKEND TERMINAL
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
  
      // Update fields if they were provided in the request
      if (status) complaint.status = status;
      if (officialResponse !== undefined) complaint.officialResponse = officialResponse;
  
      await complaint.save();

      // --- REAL-TIME NOTIFICATION TRIGGER ---
    // Notify the student that their issue status was changed
    const notification = await Notification.create({
        recipient: complaint.author,
        sender: req.user._id,
        type: 'status_change',
        content: `Your complaint status was updated to: ${status}`,
        link: '/voice'
      });
  
      // Send it to the user's screen instantly!
      const io = req.app.get('io');
      io.to(complaint.author.toString()).emit('new_notification', notification);
      // --------------------------------------
  
      // Re-populate author and comments so the frontend gets the full object back
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
  
      // Find the specific comment inside the complaint's comments array
      const comment = complaint.comments.find(
        (c: any) => c._id.toString() === req.params.commentId
      );
  
      if (!comment) {
        res.status(404).json({ success: false, message: 'Comment not found' });
        return;
      }
  
      // Ensure the upvotes array exists
      if (!comment.upvotes) {
        comment.upvotes = [];
      }
  
      const userId = req.user._id.toString();
      const upvoteIndex = comment.upvotes.findIndex((id: any) => id && id.toString() === userId);
  
      // Toggle logic
      if (upvoteIndex !== -1) {
        comment.upvotes.splice(upvoteIndex, 1); // Remove like
      } else {
        comment.upvotes.push(req.user._id); // Add like
      }
  
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
  
      // Find the comment index
      const commentIndex = complaint.comments.findIndex(
        (c: any) => c._id.toString() === req.params.commentId
      );
  
      if (commentIndex === -1) {
        res.status(404).json({ success: false, message: 'Comment not found' });
        return;
      }
  
      const comment = complaint.comments[commentIndex];
  
      // SECURITY: Ensure the user deleting is either the author of the comment OR an Admin/Moderator
      const isAuthor = comment.user.toString() === req.user._id.toString();
      const isAdmin = req.user.role === 'admin' || req.user.role === 'moderator';
  
      if (!isAuthor && !isAdmin) {
        res.status(403).json({ success: false, message: 'Not authorized to delete this comment' });
        return;
      }
  
      // Remove the comment
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
  
      // SECURITY: Ensure the user deleting is the author OR an Admin/Moderator
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