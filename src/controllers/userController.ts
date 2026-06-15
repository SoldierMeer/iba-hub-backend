import User from '../models/User';
import Complaint from '../models/Complaint';
import Forum from '../models/ForumPost'; // Adjust if your model is named 'Post'
import Resource from '../models/Resource';
import ForumReply from '../models/ForumReply';
import Connection from '../models/Connection';
import { v2 as cloudinary } from 'cloudinary';
import jwt from 'jsonwebtoken';
import { Request, Response } from 'express';


// @desc    Get Global Leaderboard
// @route   GET /api/v1/users/leaderboard
// controllers/userController.ts
// controllers/userController.ts

const getUserIdFromRequest = (req: any): string | null => {
    try {
      let token = req.cookies?.jwt || req.cookies?.token;
      if (!token && req.headers.cookie) {
        const cookiesArr = req.headers.cookie.split(';');
        const match = cookiesArr.find((c: string) => c.trim().startsWith('jwt=') || c.trim().startsWith('token='));
        if (match) token = match.split('=')[1];
      }
      if (token && token !== 'undefined' && token !== 'null') {
        const decoded: any = jwt.verify(token, process.env.JWT_SECRET as string);
        return String(decoded.id || decoded._id); 
      }
    } catch (error) { return null; }
    return null;
};


// @desc    Get Global Leaderboard
// @route   GET /api/v1/users/leaderboard
export const getLeaderboard = async (req: Request, res: Response): Promise<void> => {
    try {
      const { filter } = req.query;
      let dateMatch: any = {};

      // 1. Time Filters
      if (filter === 'this_week') {
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        dateMatch = { createdAt: { $gte: oneWeekAgo } };
      } else if (filter === 'monthly') {
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
        dateMatch = { createdAt: { $gte: oneMonthAgo } };
      }

      // 2. Score Calculation Logic based on Filter
      let scoreCalc: any;
      if (filter === 'resources') {
        scoreCalc = { $multiply: [{ $size: '$userResources' }, 10] }; // Only Resource Points
      } else if (filter === 'query_replies') {
        scoreCalc = { 
          $add: [
            { $multiply: [{ $size: '$userReplies' }, 5] },
            { $multiply: [{ $size: { $filter: { input: '$userReplies', as: 'reply', cond: { $eq: ['$$reply.isAcceptedAnswer', true] } } } }, 15] }
          ] 
        }; // Only Reply Points
      } else {
        scoreCalc = {
          $add: [
            { $multiply: [{ $size: '$userResources' }, 10] },
            { $multiply: [{ $size: '$userReplies' }, 5] }, 
            { $multiply: [{ $size: { $filter: { input: '$userReplies', as: 'reply', cond: { $eq: ['$$reply.isAcceptedAnswer', true] } } } }, 15] }
          ]
        }; // Overall Points
      }

      // 3. Aggregation Pipeline
      const leaderboard = await User.aggregate([
        {
          $lookup: {
            from: 'resources',
            let: { userId: '$_id' },
            pipeline: [
              { $match: { $expr: { $eq: ['$uploader', '$$userId'] }, ...dateMatch } }
            ],
            as: 'userResources'
          }
        },
        {
          $lookup: {
            from: 'forumreplies',
            let: { userId: '$_id' },
            pipeline: [
              { $match: { $expr: { $eq: ['$author', '$$userId'] }, ...dateMatch } }
            ],
            as: 'userReplies'
          }
        },
        {
          $project: {
            firstName: 1,
            lastName: 1,
            avatarUrl: 1,
            department: 1, 
            uploads: { $size: '$userResources' }, 
            replies: { $size: '$userReplies' },   
            score: scoreCalc
          }
        },
        { $match: { score: { $gt: 0 } } }, // 🛑 PREVENTS ANYONE WITH 0 POINTS FROM SHOWING UP!
        { $sort: { score: -1 } } 
      ]);
  
      const currentUserId = getUserIdFromRequest(req);

      res.status(200).json({ success: true, data: leaderboard, currentUserId });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
};


  // @desc    Get current logged in user
// @route   GET /api/v1/users/me
// export const getMe = async (req: Request | any, res: Response): Promise<void> => {
//     try {
//       // req.user is already populated by your protect middleware!
//       res.status(200).json({ 
//         success: true, 
//         data: req.user 
//       });
//     } catch (error: any) {
//       res.status(500).json({ success: false, message: error.message });
//     }
// };

export const getMe = async (req: Request | any, res: Response): Promise<void> => {
  try {
    // 1. Convert Mongoose document to a plain JS object
    const userObj = req.user.toObject ? req.user.toObject() : { ...req.user };
    
    // 2. Delete massive arrays/data that the UI doesn't need on every page load!
    delete userObj.password;
    delete userObj.tokens;
    delete userObj.activity; 
    delete userObj.savedResources;
    delete userObj.notifications; // <--- This might be the massive one!
    delete userObj.messages;
    
    // Send connection count instead of a massive array of connection objects
    if (userObj.connections) {
       userObj.connectionCount = userObj.connections.length;
       delete userObj.connections;
    }

    res.status(200).json({ 
      success: true, 
      data: userObj 
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update user profile (Avatar, Banner, Bio, Dept, Semester)
// @route   PUT /api/v1/users/profile
// @desc    Update user profile
// @route   PUT /api/v1/users/profile

// export const updateProfile = async (req: Request | any, res: Response): Promise<void> => {
//   try {
//     // 🚀 1. Add github to the destructured body
//     const { 
//       bio, department, semester, section, currentPosition, 
//       about, skills, avatarUrl, bannerUrl, linkedin, instagram, github 
//     } = req.body; 

//     const parsedSkills = typeof skills === 'string' 
//       ? skills.split(',').map((s: string) => s.trim()).filter((s: string) => s) 
//       : skills;

//     const updatedUser = await User.findByIdAndUpdate(
//       req.user._id,
//       { 
//         bio, department, semester, section, currentPosition, 
//         about, skills: parsedSkills, avatarUrl, bannerUrl,
//         linkedin, instagram, github // 🚀 2. Include github in the update object
//       }, 
//       { new: true, runValidators: true }
//     ).select('-password');

//     res.status(200).json({ success: true, data: updatedUser });
//   } catch (error: any) {
//     res.status(500).json({ success: false, message: error.message });
//   }
// };

export const updateProfile = async (req: Request | any, res: Response): Promise<void> => {
  try {
    // 🚀 Changed from 'const' to 'let' so we can overwrite the Base64 strings with Cloudinary URLs
    let { 
      bio, department, semester, section, currentPosition, 
      about, skills, avatarUrl, bannerUrl, linkedin, instagram, github 
    } = req.body; 

    // 🚀 1. CLOUDINARY INTERCEPTOR FOR AVATAR
    // If the frontend sent a Base64 string, upload it to Cloudinary first
    if (avatarUrl && avatarUrl.startsWith('data:image')) {
      const avatarUpload = await cloudinary.uploader.upload(avatarUrl, {
        folder: 'iba_hub_avatars',
        transformation: [{ width: 400, height: 400, crop: 'thumb', gravity: 'face' }] // Auto-crops to the face
      });
      avatarUrl = avatarUpload.secure_url; // Replace Base64 string with the clean URL
    }

    // 🚀 2. CLOUDINARY INTERCEPTOR FOR BANNER
    // If the frontend sent a Base64 string, upload it to Cloudinary first
    if (bannerUrl && bannerUrl.startsWith('data:image')) {
      const bannerUpload = await cloudinary.uploader.upload(bannerUrl, {
        folder: 'iba_hub_banners',
        transformation: [{ width: 1200, height: 400, crop: 'fill' }]
      });
      bannerUrl = bannerUpload.secure_url; // Replace Base64 string with the clean URL
    }

    // 3. Process skills exactly as you had it
    const parsedSkills = typeof skills === 'string' 
      ? skills.split(',').map((s: string) => s.trim()).filter((s: string) => s) 
      : skills;

    // 4. Save the ultra-clean, lightweight object to MongoDB
    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      { 
        bio, department, semester, section, currentPosition, 
        about, skills: parsedSkills, avatarUrl, bannerUrl,
        linkedin, instagram, github 
      }, 
      { new: true, runValidators: true }
    ).select('-password');

    res.status(200).json({ success: true, data: updatedUser });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get user's recent activity across the platform
// @route   GET /api/v1/users/activity
// @desc    Get user's recent activity across the platform
// @route   GET /api/v1/users/activity

// @desc    Get user's recent activity across the platform
// @route   GET /api/v1/users/activity

// @desc    Get user's recent activity across the platform
// @route   GET /api/v1/users/activity
export const getUserActivity = async (req: Request | any, res: Response): Promise<void> => {
    try {
      const userId = req.user._id;
  
      const resources = await Resource.find({ uploader: userId }).select('title createdAt').lean();
      const replies = await ForumReply.find({ author: userId }).populate('post', 'title').select('createdAt isAcceptedAnswer post').lean();
  
      // 🏆 DYNAMICALLY CALCULATE REAL POINTS (Same math as Leaderboard!)
      const totalPoints = (resources.length * 10) + 
                          (replies.length * 5) + 
                          (replies.filter(r => r.isAcceptedAnswer).length * 15);

      // Extract Activity & Assign Points based on the action
      const activity = [
        ...resources.map(r => ({ 
           _id: r._id, 
           type: 'Resource', 
           title: r.title, 
           date: r.createdAt, 
           points: 10,
           link: '/resources' 
        })),
        ...replies.map(r => ({ 
           _id: r._id, 
           type: r.isAcceptedAnswer ? 'Accepted Answer' : 'Reply', 
           title: r.post ? `Reply on "${(r.post as any).title}"` : 'Forum Reply', 
           date: r.createdAt, 
           points: r.isAcceptedAnswer ? 20 : 5,
           link: r.post ? `/forum/${(r.post as any)._id}` : '/forum'
        }))
      ];
  
      // Sort newest first
      activity.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      const recentActivity = activity.slice(0, 10);
  
      // Send totalPoints to the frontend!
      res.status(200).json({ success: true, totalPoints, data: recentActivity });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
};



// @desc    Get public user profile by ID
// @route   GET /api/v1/users/public/:id

// @desc    Get public user profile by ID
// @route   GET /api/v1/users/public/:id
export const getUserProfileById = async (req: Request | any, res: Response): Promise<void> => {
    try {
        const user = await User.findById(req.params.id).select('-password');
        if (!user) {
            res.status(404).json({ success: false, message: 'User not found' });
            return;
        }

        // 🚀 NEW: Check Connection Status
        let connectionStatus = 'none';
        if (req.user) {
            const connection = await Connection.findOne({
                $or: [
                    { sender: req.user._id, receiver: user._id },
                    { sender: user._id, receiver: req.user._id }
                ]
            });
            if (connection) {
                if (connection.status === 'accepted') {
                    connectionStatus = 'accepted';
                } else if (connection.status === 'pending') {
                    connectionStatus = connection.sender.toString() === req.user._id.toString() ? 'pending_sent' : 'pending_received';
                }
            }
        }

        const resources = await Resource.find({ uploader: user._id }).select('title createdAt').lean();
        const replies = await ForumReply.find({ author: user._id }).populate('post', 'title').select('createdAt isAcceptedAnswer post').lean();
        
        const totalPoints = (resources.length * 10) + (replies.length * 5) + (replies.filter(r => r.isAcceptedAnswer).length * 15);

        const activity = [
            ...resources.map(r => ({ _id: r._id, type: 'Resource', title: r.title, date: r.createdAt, link: '/resources' })),
            ...replies.map(r => ({ _id: r._id, type: r.isAcceptedAnswer ? 'Accepted Answer' : 'Reply', title: r.post ? `Reply on "${(r.post as any).title}"` : 'Forum Reply', date: r.createdAt, link: r.post ? `/forum/${(r.post as any)._id}` : '/forum' }))
        ];
        
        activity.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        
        res.status(200).json({ 
            success: true, 
            data: user, 
            totalPoints, 
            activity: activity.slice(0, 10),
            connectionStatus // 👈 Sending this to the frontend!
        });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get all Alumni for the Directory
// @route   GET /api/v1/users/alumni
// @desc    Get all Alumni for the Directory
// @route   GET /api/v1/users/alumni
export const getAlumniDirectory = async (req: Request | any, res: Response): Promise<void> => {
    try {
        const currentUserId = req.user._id;
        const keyword = req.query.search
          ? {
              $or: [
                { firstName: { $regex: req.query.search, $options: 'i' } },
                { lastName: { $regex: req.query.search, $options: 'i' } },
                { currentPosition: { $regex: req.query.search, $options: 'i' } },
              ],
            }
          : {};

        const departmentFilter = req.query.department && req.query.department !== 'All' ? { department: req.query.department } : {};
        const batchFilter = req.query.batch && req.query.batch !== 'All' ? { batch: req.query.batch } : {}; 

        const alumni = await User.find({
          _id: { $ne: currentUserId },
          isAlumni: true,
          ...keyword,
          ...departmentFilter,
          ...batchFilter
        })
        .select('firstName lastName avatarUrl department batch currentPosition skills contributorPoints isOnline')
        .lean();

        // 🚀 FETCH CONNECTIONS TO MAKE BUTTONS WORK
        const relevantConnections = await Connection.find({
            $or: [{ sender: currentUserId }, { receiver: currentUserId }]
        });
  
        const alumniWithConnectionStatus = alumni.map((user: any) => {
            const userId = user._id.toString();
            const connection = relevantConnections.find(
                conn => conn.sender.toString() === userId || conn.receiver.toString() === userId
            );
  
            let connectionStatus: 'none' | 'pending_sent' | 'pending_received' | 'accepted' | 'rejected' = 'none';
  
            if (connection) {
                if (connection.status === 'accepted') {
                    connectionStatus = 'accepted';
                } else if (connection.status === 'rejected') {
                    if (connection.sender.toString() === currentUserId.toString()) connectionStatus = 'rejected';
                } else if (connection.status === 'pending') {
                    if (connection.sender.toString() === currentUserId.toString()) connectionStatus = 'pending_sent';
                    else connectionStatus = 'pending_received';
                }
            }
  
            return { ...user, connectionStatus };
        });

        res.status(200).json({ success: true, count: alumniWithConnectionStatus.length, data: alumniWithConnectionStatus });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Auto-Transition: Convert current student to Alumni
// @route   PUT /api/v1/users/become-alumni
export const transitionToAlumni = async (req: Request | any, res: Response): Promise<void> => {
    try {
        const user = await User.findById(req.user._id);
        
        if (!user) {
            res.status(404).json({ success: false, message: "User not found" });
            return; // 🚀 FIX: Return nothing (void) after sending the response
        }

        user.isAlumni = true;
        user.currentPosition = req.body.currentPosition || "Seeking Opportunities";
        user.semester = "Graduated";
        user.section = ""; 
        
        await user.save();
        
        res.status(200).json({ success: true, message: "Welcome to the Alumni Network!", data: user });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const updateProfileBanner = async (req: any, res: Response): Promise<void> => {
  try {
    const { bannerImage } = req.body; // Expecting the data:image/jpeg;base64 string

    if (!bannerImage) {
      res.status(400).json({ success: false, message: 'No image data provided.' });
      return;
    }

    // 🚀 1. Upload the Base64 string directly to Cloudinary
    const uploadResponse = await cloudinary.uploader.upload(bannerImage, {
      folder: 'iba_hub_profiles', // Separates profile assets from resources
      allowed_formats: ['jpg', 'png', 'jpeg', 'webp'],
      transformation: [{ width: 1200, height: 400, crop: 'fill' }] // Auto-crop to banner dimensions!
    });

    // 🚀 2. Save ONLY the clean secure URL string in MongoDB
    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      { profileBanner: uploadResponse.secure_url },
      { new: true }
    ).select('-password');

    res.status(200).json({
      success: true,
      message: 'Banner updated successfully',
      data: updatedUser,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateProfileAvatar = async (req: any, res: Response): Promise<void> => {
  try {
    const { avatarImage } = req.body; // Expecting the Base64 string from the frontend

    if (!avatarImage) {
      res.status(400).json({ success: false, message: 'No image data provided.' });
      return;
    }

    // 🚀 Upload to Cloudinary with automatic face-cropping
    const uploadResponse = await cloudinary.uploader.upload(avatarImage, {
      folder: 'iba_hub_avatars',
      allowed_formats: ['jpg', 'png', 'jpeg', 'webp'],
      transformation: [
        { width: 400, height: 400, crop: 'thumb', gravity: 'face' } // 🔥 Magic face detection!
      ]
    });

    // 🚀 Save the clean URL in MongoDB
    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      { avatarUrl: uploadResponse.secure_url },
      { new: true }
    ).select('-password');

    res.status(200).json({
      success: true,
      message: 'Profile picture updated successfully',
      data: updatedUser,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Delay graduation by 1 year (Snooze modal for gap year/backlogs)
// @route   PUT /api/v1/users/delay-graduation
// @access  Private
export const delayGraduation = async (req: Request | any, res: Response): Promise<void> => {
  try {
    // We strictly use currentYear + 1 to guarantee it surpasses the current check
    const currentYear = new Date().getFullYear();
    const newGraduationYear = currentYear + 1;

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { graduationYear: newGraduationYear },
      { new: true, runValidators: true }
    );

    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    res.status(200).json({ 
      success: true, 
      message: `Graduation timeline updated to ${newGraduationYear}`,
      data: user 
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Server Error' });
  }
};