import express from 'express';
import { protect } from '../middlewares/authMiddleware';
import { upload } from '../middlewares/uploadMiddleware';
import { 
  uploadResource, 
  getResources, 
  getTopUploaders, 
  incrementDownload,
  getMyResources, // 🚀 NEW
  deleteResource  // 🚀 NEW
} from '../controllers/resourceController';

const router = express.Router();

// ==========================================
// 1. STATIC ROUTES (Must go BEFORE /:id routes)
// ==========================================

// Public: Get leaderboard data
router.get('/top-uploaders', getTopUploaders);

// Protected: Get the logged-in student's uploads for the tracker modal
router.get('/me', protect, getMyResources);

// Public: View all resources in the feed
router.get('/', getResources);

// Protected: Upload a new file
router.post('/', protect, upload.single('file'), uploadResource);


// ==========================================
// 2. DYNAMIC ROUTES (Must go AFTER static routes)
// ==========================================

// Public: Guests and students can increment download counters
router.put('/:id/download', incrementDownload); 

// Protected: Delete a specific resource (Used to clear rejected uploads)
router.delete('/:id', protect, deleteResource);

export default router;