import express from 'express';
import { protect } from '../middleware/authMiddleware';
import {
  createPost,
  getPosts,
  getPostById,
  createReply,
  togglePostUpvote,
  deletePost,
  toggleReplyUpvote,
  acceptReply
} from '../controllers/forumController';

const router = express.Router();

// ==========================================
// 1. PUBLIC ROUTES (No auth required)
// ==========================================
router.get('/', getPosts);


// ==========================================
// 2. SPECIFIC PROTECTED ROUTES 
// 🚨 MUST come before /:id routes to avoid Express mistaking "replies" for an ID!
// ==========================================
router.put('/replies/:replyId/upvote', protect, toggleReplyUpvote);
router.put('/replies/:replyId/accept', protect, acceptReply);


// ==========================================
// 3. DYNAMIC PROTECTED ROUTES (/:id)
// ==========================================
// Get Single Post (Public)
router.get('/:id', getPostById);

// Post Actions (Protected)
router.post('/', protect, createPost);
router.delete('/:id', protect, deletePost);
router.put('/:id/upvote', protect, togglePostUpvote);
router.post('/:id/replies', protect, createReply);

export default router;