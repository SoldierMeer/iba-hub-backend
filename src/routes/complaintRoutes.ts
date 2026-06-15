import express from 'express';
import { 
  getComplaints, 
  createComplaint, 
  toggleUpvote, 
  addComment,
  updateComplaintStatus,
  toggleCommentLike,
  deleteComment,
  deleteComplaint
} from '../controllers/complaintController';
import { protect, authorizeRoles } from '../middlewares/authMiddleware';

const router = express.Router();

// Main routes for fetching and creating complaints
router.route('/')
  .get(protect, getComplaints)
  .post(protect, createComplaint);

// Route for toggling an upvote
router.route('/:id/upvote')
  .put(protect, toggleUpvote);

// Route for adding a nested comment
router.route('/:id/comments')
  .post(protect, addComment);
  
router.route('/:id/comments/:commentId/like')
  .put(protect, toggleCommentLike);

router.route('/:id/comments/:commentId')
  .delete(protect, deleteComment);


// --- NEW SECURE ADMIN ROUTE ---
// Only users with 'admin' or 'moderator' roles can access this!
router.route('/:id/status')
  .put(protect, authorizeRoles('admin', 'moderator'), updateComplaintStatus);

router.route('/:id')
  .delete(protect, deleteComplaint);

export default router;