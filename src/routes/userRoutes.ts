import express from 'express';
import { protect, optionalAuth } from '../middleware/authMiddleware';
import { 
    getLeaderboard, 
    getMe, 
    updateProfile, 
    getUserActivity, 
    getUserProfileById, 
    getAlumniDirectory, 
    transitionToAlumni, 
    delayGraduation 
  } from '../controllers/userController';
  
const router = express.Router();

// ==========================================
// PUBLIC & OPTIONALLY AUTHENTICATED ROUTES
// ==========================================
// This makes the full path: /api/v1/users/leaderboard
router.get('/leaderboard', getLeaderboard); 

// 🚀 FIXED: Replaced 'protect' with 'optionalAuth' so guests don't get a 401 Error
router.route('/public/:id').get(optionalAuth, getUserProfileById);

// ==========================================
// STRICTLY PROTECTED ROUTES (Requires Login)
// ==========================================
router.get('/me', protect, getMe);
router.route('/profile').put(protect, updateProfile);
router.route('/activity').get(protect, getUserActivity);
router.route('/alumni').get(protect, getAlumniDirectory);
router.route('/become-alumni').put(protect, transitionToAlumni);
router.put('/delay-graduation', protect, delayGraduation);

export default router;