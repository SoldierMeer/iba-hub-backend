import express from 'express';
import { globalSearch } from '../controllers/searchController';
import { protect } from '../middleware/authMiddleware';

const router = express.Router();

// Only logged-in users can search the hub
router.get('/', protect, globalSearch);

export default router;