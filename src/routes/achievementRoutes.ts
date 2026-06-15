import express from 'express';
import { 
  getAchievements, 
  createAchievement, 
  toggleReaction 
} from '../controllers/achievementController';
import { protect } from '../middleware/authMiddleware';

const router = express.Router();

// GET all achievements, POST a new achievement
router.route('/')
  .get(getAchievements) // Add 'protect' here if you want the feed to be for logged-in users only
  .post(protect, createAchievement);

// PUT toggle a like on a specific achievement
router.route('/:id/react')
  .put(protect, toggleReaction);

export default router;