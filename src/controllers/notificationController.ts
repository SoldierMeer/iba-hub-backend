import { Request, Response } from 'express';
import Notification from '../models/Notification';

// @desc    Get user's notifications
// @route   GET /api/v1/notifications
// export const getNotifications = async (req: Request | any, res: Response): Promise<void> => {
//   try {
//     // SAFETY CHECK: Prevent server crash if user is undefined
//     if (!req.user || !req.user._id) {
//       res.status(401).json({ success: false, message: 'User not authenticated' });
//       return;
//     }

//     const notifications = await Notification.find({ recipient: req.user._id })
//       .populate('sender', 'firstName lastName avatarUrl')
//       .sort({ createdAt: -1 })
//       .limit(50);

//     const unreadCount = await Notification.countDocuments({ recipient: req.user._id, isRead: false });

//     res.status(200).json({ success: true, unreadCount, data: notifications });
//   } catch (error: any) {
//     console.error("Notification Fetch Error:", error);
//     res.status(500).json({ success: false, message: error.message });
//   }
// };

export const getNotifications = async (req: Request | any, res: Response): Promise<void> => {
  try {
    if (!req.user || !req.user._id) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    const notifications = await Notification.find({ recipient: req.user._id })
      .populate('sender', 'firstName lastName avatarUrl')
      .sort({ createdAt: -1 })
      .limit(10) // 🚀 REDUCED FROM 50 to 10
      .lean();   // 🚀 ADDED LEAN for faster processing

    const unreadCount = await Notification.countDocuments({ recipient: req.user._id, isRead: false });

    res.status(200).json({ success: true, unreadCount, data: notifications });
  } catch (error: any) {
    console.error("Notification Fetch Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Mark a single notification as read
// @route   PUT /api/v1/notifications/:id/read
export const markAsRead = async (req: Request | any, res: Response): Promise<void> => {
  try {
    if (!req.user || !req.user._id) return;

    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, recipient: req.user._id },
      { isRead: true },
      { new: true }
    );
    res.status(200).json({ success: true, data: notification });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Mark ALL notifications as read
// @route   PUT /api/v1/notifications/read-all
export const markAllAsRead = async (req: Request | any, res: Response): Promise<void> => {
  try {
    if (!req.user || !req.user._id) return;

    await Notification.updateMany(
      { recipient: req.user._id, isRead: false },
      { isRead: true }
    );
    res.status(200).json({ success: true, message: 'All notifications marked as read' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};