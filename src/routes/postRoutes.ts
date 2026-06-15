import express from 'express';
import { createPost, getPosts, upvotePost, addComment } from '../controllers/postController';
import { protect } from '../middlewares/authMiddleware';

const router = express.Router();

// Apply the 'protect' middleware to all post routes automatically
router.use(protect);

router.route('/')
  .post(createPost)
  .get(getPosts);

router.put('/:id/upvote', upvotePost);
router.post('/:id/comments', addComment);

export default router;