import { Request, Response } from 'express';
import User from '../models/User';
import Message from '../models/Message';
import Notification from '../models/Notification';
import Connection from '../models/Connection'; 
import Report from '../models/Report';


// @desc    Get all users for the Smart Directory (with search/filters & connection status)
// @route   GET /api/v1/chat/users
export const getDirectoryUsers = async (req: Request | any, res: Response): Promise<void> => {
  try {
    const currentUserId = req.user._id;
    const keyword = req.query.search
      ? {
          $or: [
            { firstName: { $regex: req.query.search, $options: 'i' } },
            { lastName: { $regex: req.query.search, $options: 'i' } },
          ],
        }
      : {};

    const departmentFilter = req.query.department ? { department: req.query.department } : {};
    const sectionFilter = req.query.section ? { section: req.query.section } : {}; 

    // Fetch all users (lean() makes it a standard JS object so we can append connectionStatus)
   // Fetch all users
   const allUsers = await User.find({
    _id: { $ne: currentUserId },
    ...keyword,
    ...departmentFilter,
    ...sectionFilter
  })
  // 🚀 ADDED 'isAlumni' to the end of this select statement!
  .select('firstName lastName avatarUrl department semester section isOnline contributorPoints connections headline bio bannerUrl isAlumni')
  .lean(); 

    // Fetch all connections involving the current user (sent or received)
    const relevantConnections = await Connection.find({
      $or: [{ sender: currentUserId }, { receiver: currentUserId }]
    });

    // Attach connection status dynamically
    const usersWithConnectionStatus = allUsers.map((user: any) => {
      const userId = user._id.toString();
      
      const connection = relevantConnections.find(
          conn => conn.sender.toString() === userId || conn.receiver.toString() === userId
      );

      let connectionStatus: 'none' | 'pending_sent' | 'pending_received' | 'accepted' | 'rejected' = 'none';

      if (connection) {
          if (connection.status === 'accepted') {
              connectionStatus = 'accepted';
          } else if (connection.status === 'rejected') {
              if (connection.sender.toString() === currentUserId.toString()) {
                  connectionStatus = 'rejected';
              }
          } else if (connection.status === 'pending') {
              if (connection.sender.toString() === currentUserId.toString()) {
                  connectionStatus = 'pending_sent';
              } else {
                  connectionStatus = 'pending_received';
              }
          }
      }

      return {
          ...user,
          connectionStatus 
      };
    });

    res.status(200).json({ success: true, count: usersWithConnectionStatus.length, data: usersWithConnectionStatus });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ==========================================
// 🚀 NEW CONNECTION LOGIC (Request / Accept)
// ==========================================

// @desc    Send a connection request to a user
// @route   POST /api/v1/chat/connect/send/:userId
export const sendConnectionRequest = async (req: Request | any, res: Response): Promise<void> => {
  try {
      const senderId = req.user._id;
      const receiverId = req.params.userId;

      if (senderId.toString() === receiverId) {
          res.status(400).json({ success: false, message: "Cannot connect to yourself." });
          return;
      }

      const receiver = await User.findById(receiverId);
      if (!receiver) {
          res.status(404).json({ success: false, message: "User not found." });
          return;
      }

      const existingConnection = await Connection.findOne({
        $or: [
            { sender: senderId, receiver: receiverId },
            { sender: receiverId, receiver: senderId },
        ]
    });

    if (existingConnection) {
        if (existingConnection.status === 'accepted') return res.status(400).json({ success: false, message: "Already connected." });
        if (existingConnection.status === 'pending') return res.status(400).json({ success: false, message: "Request already pending." });
        
        if (existingConnection.status === 'rejected') {
            existingConnection.status = 'pending';
            existingConnection.sender = senderId; 
            existingConnection.receiver = receiverId;
            await existingConnection.save();
            return res.status(200).json({ success: true, message: "Connection request sent again." });
        }
    }

    await Connection.create({ sender: senderId, receiver: receiverId, status: 'pending' });
    
      try {
        const senderInfo = await User.findById(senderId).select('firstName');
        const notification = await Notification.create({
          recipient: receiverId,
          sender: senderId,
          type: 'connection',
          content: `${senderInfo?.firstName || 'Someone'} sent you a connection request.`,
          link: `/chat` 
        });
        const io = req.app.get('io');
        io.to(receiverId.toString()).emit('new_notification', notification);
      } catch (error) { 
        console.error("🔥 FAILED to send connection notification:", error); 
      }

      // 🚀 FIXED: Added the missing success response back!
      res.status(200).json({ success: true, message: "Connection request sent." });

  } catch (error: any) {
      // 🚀 FIXED: Added the missing catch block bracket back!
      res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Accept an incoming connection request
// @route   PUT /api/v1/chat/connect/accept/:senderId
export const acceptConnectionRequest = async (req: Request | any, res: Response): Promise<void> => {
  try {
      const receiverId = req.user._id; 
      const senderId = req.params.senderId;

      const connection = await Connection.findOne({ sender: senderId, receiver: receiverId, status: 'pending' });

      if (!connection) {
          res.status(404).json({ success: false, message: "Pending connection request not found." });
          return;
      }

      connection.status = 'accepted';
      await connection.save();

      await Promise.all([
          User.findByIdAndUpdate(senderId, { $addToSet: { connections: receiverId } }), 
          User.findByIdAndUpdate(receiverId, { $addToSet: { connections: senderId } })
      ]);

      try {
        const receiverInfo = await User.findById(receiverId).select('firstName');
        const notification = await Notification.create({
          recipient: senderId,
          sender: receiverId,
          type: 'connection',
          content: `${receiverInfo?.firstName || 'Someone'} accepted your connection request!`,
          link: `/chat` 
        });
        const io = req.app.get('io');
        io.to(senderId.toString()).emit('new_notification', notification);
      } catch (error) { 
        console.error("🔥 FAILED to send accept notification:", error); 
      }
    
      // 🚀 FIXED: Added the missing success response back!
      res.status(200).json({ success: true, message: "Connection accepted." });

  } catch (error: any) {
      // 🚀 FIXED: Added the missing catch block back!
      res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Reject/Cancel/Remove connection
// @route   DELETE /api/v1/chat/connect/remove/:userId
export const rejectOrRemoveConnection = async (req: Request | any, res: Response): Promise<void> => {
    try {
        const currentUserId = req.user._id;
        const otherUserId = req.params.userId;
  
        const connection = await Connection.findOne({
            $or: [
                { sender: currentUserId, receiver: otherUserId },
                { sender: otherUserId, receiver: currentUserId },
            ]
        });
  
        if (!connection) return res.status(404).json({ success: false, message: "Connection not found." });
  
        if (connection.status === 'pending' && connection.receiver.toString() === currentUserId.toString()) {
            connection.status = 'rejected';
            await connection.save();
            return res.status(200).json({ success: true, message: "Connection request declined." });
        }
  
        await Connection.findByIdAndDelete(connection._id);
  
        await Promise.all([
            User.findByIdAndUpdate(currentUserId, { $pull: { connections: otherUserId } }),
            User.findByIdAndUpdate(otherUserId, { $pull: { connections: currentUserId } })
        ]);
  
        res.status(200).json({ success: true, message: "Connection removed." });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ==========================================
// MESSAGING LOGIC
// ==========================================

// @desc    Get chat history between current user and another user
// @route   GET /api/v1/chat/messages/:userId
// @desc    Get chat history between current user and another user
// @route   GET /api/v1/chat/messages/:userId
export const getChatHistory = async (req: Request | any, res: Response): Promise<void> => {
  try {
    // 1. Pagination Params
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 50; // Load 50 messages at a time
    const skip = (page - 1) * limit;

    const query = {
      $or: [
        { sender: req.user._id, receiver: req.params.userId },
        { sender: req.params.userId, receiver: req.user._id }
      ]
    };

    // 2. Fetch the total count to let the frontend know if there are older messages
    const totalMessages = await Message.countDocuments(query);

    // 3. Fetch NEWEST first, then skip and limit, then lean() for speed
    const messages = await Message.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const hasMore = totalMessages > (skip + messages.length);

    res.status(200).json({ 
      success: true, 
      // 🚀 CRITICAL: We reverse the array before sending it so they render top-to-bottom!
      data: messages.reverse(), 
      pagination: { currentPage: page, hasMore }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Save a message to the database
// @route   POST /api/v1/chat/messages
export const sendMessage = async (req: Request | any, res: Response): Promise<void> => {
    try {
      const { receiverId, text, mediaUrl } = req.body;
  
      const message = await Message.create({
        sender: req.user._id,
        receiver: receiverId,
        text: text || '', 
        mediaUrl: mediaUrl || '' 
      });

      const notification = await Notification.create({
        recipient: receiverId, 
        sender: req.user._id,
        type: 'message',
        content: `${req.user.firstName} sent you a new message.`,
        link: `/chat?userId=${req.user._id}` 
      });
  
      const io = req.app.get('io');
      io.to(receiverId.toString()).emit('new_notification', notification);
  
      res.status(201).json({ success: true, data: message });
    } catch (error: any) {
      console.error("🔥 CRASH IN SEND_MESSAGE:", error);
      res.status(500).json({ success: false, message: error.message });
    }
};

// 🚀 Add this new function to get recent chat history
export const getRecentConversations = async (req: Request | any, res: Response): Promise<void> => {
  try {
      const currentUserId = req.user._id;

      // 1. Find all messages where the current user is either the sender or receiver
      const messages = await Message.find({
          $or: [{ sender: currentUserId }, { receiver: currentUserId }]
      }).sort({ createdAt: -1 });

      // 2. Extract unique user IDs of the people they chatted with
      const interactedUserIds = new Set<string>();
      messages.forEach(msg => {
          if (msg.sender.toString() !== currentUserId.toString()) {
              interactedUserIds.add(msg.sender.toString());
          }
          if (msg.receiver.toString() !== currentUserId.toString()) {
              interactedUserIds.add(msg.receiver.toString());
          }
      });

      // 3. Fetch the full user profiles for these IDs
      const users = await User.find({ _id: { $in: Array.from(interactedUserIds) } })
          .select('firstName lastName avatarUrl department semester section isOnline isAlumni headline')
          .lean();

      res.status(200).json({ success: true, data: users });
  } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
  }
};

// 🚀 Toggle Mute Status
export const toggleMuteUser = async (req: Request | any, res: Response): Promise<void> => {
  try {
      const currentUser = await User.findById(req.user._id);
      const targetId = req.params.id;

      if (!currentUser) throw new Error("User not found");

      const isMuted = currentUser.mutedUsers?.includes(targetId);
      
      if (isMuted) {
          await User.findByIdAndUpdate(req.user._id, { $pull: { mutedUsers: targetId } });
      } else {
          await User.findByIdAndUpdate(req.user._id, { $addToSet: { mutedUsers: targetId } });
      }

      res.status(200).json({ success: true, message: 'Mute toggled' });
  } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
  }
};

// 🚀 Block User
export const blockUser = async (req: Request | any, res: Response): Promise<void> => {
  try {
      await User.findByIdAndUpdate(req.user._id, { 
          $addToSet: { blockedUsers: req.params.id } 
      });
      res.status(200).json({ success: true, message: 'User blocked' });
  } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
  }
};

// 🚀 Unblock User
export const unblockUser = async (req: Request | any, res: Response): Promise<void> => {
  try {
      await User.findByIdAndUpdate(req.user._id, { 
          $pull: { blockedUsers: req.params.id } 
      });
      res.status(200).json({ success: true, message: 'User unblocked' });
  } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
  }
};

// 🚀 Report User
export const reportUser = async (req: Request | any, res: Response): Promise<void> => {
  try {
      // 1. Extract the text fields parsed by Multer
      const { targetUserId, reason } = req.body;
      
      // 2. Extract the Cloudinary URL if an image was uploaded
      let evidenceUrl = null;
      if (req.file && req.file.path) {
          // If using multer-storage-cloudinary, the URL is attached to req.file.path
          evidenceUrl = req.file.path; 
      }
      
      // 3. 🚀 ACTUALLY SAVE THE REPORT TO MONGODB
      await Report.create({
          reporter: req.user._id,
          reportedUser: targetUserId,
          reason: reason,
          evidenceUrl: evidenceUrl // 🚀 Added to database payload
      });

      res.status(200).json({ success: true, message: 'Report sent to Admins' });
  } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
  }
};