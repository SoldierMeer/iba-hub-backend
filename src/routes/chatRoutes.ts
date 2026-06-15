import express from 'express';
import { 
    getDirectoryUsers, 
    getChatHistory, 
    sendMessage, 
    sendConnectionRequest, 
    acceptConnectionRequest, 
    rejectOrRemoveConnection,
    getRecentConversations,
    toggleMuteUser,
    blockUser,
    unblockUser,
    reportUser
} from '../controllers/chatController';
import { protect } from '../middlewares/authMiddleware';
import { upload } from '../middlewares/uploadMiddleware';

const router = express.Router();

// Smart Directory Endpoint
router.route('/users').get(protect, getDirectoryUsers);

// Chat Endpoints
router.route('/messages').post(protect, sendMessage);
router.route('/messages/:userId').get(protect, getChatHistory);
router.get('/conversations', protect, getRecentConversations);
router.put('/mute/:id', protect, toggleMuteUser);
router.post('/block/:id', protect, blockUser);
router.put('/unblock/:id', protect, unblockUser);
router.post('/report', protect, upload.single('evidence'), reportUser);

// Connection Request Endpoints
router.post('/connect/send/:userId', protect, sendConnectionRequest);
router.put('/connect/accept/:senderId', protect, acceptConnectionRequest);
router.delete('/connect/remove/:userId', protect, rejectOrRemoveConnection);

export default router;