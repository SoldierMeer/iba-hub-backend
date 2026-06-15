import { Router } from 'express';
import { protect, authorizeRoles } from '../middleware/authMiddleware';
import { 
    getPendingModeration, 
    moderateResource, 
    moderateComplaint,
    createAnnouncement,
    deleteAnnouncement,
    getAllUsers,
    updateUserRole,
    getPendingReports,
    resolveReport
} from '../controllers/adminController';

const router = Router();

// ==========================================
// GLOBAL MIDDLEWARE (Applies to all routes below)
// ==========================================
router.use(protect);
router.use(authorizeRoles('admin', 'moderator')); // Allows both by default

// ==========================================
// MODERATOR & ADMIN ROUTES
// ==========================================
router.get('/pending', getPendingModeration);
router.put('/resources/:id/moderate', moderateResource);
router.put('/complaints/:id/moderate', moderateComplaint);
router.post('/announcements', createAnnouncement);
router.delete('/announcements/:id', deleteAnnouncement);

// ==========================================
// STRICTLY ADMIN-ONLY ROUTES
// ==========================================
// 🚀 Re-apply authorizeRoles('admin') to strictly block moderators from these routes
router.get('/users', authorizeRoles('admin'), getAllUsers);
router.put('/users/:id/role', authorizeRoles('admin'), updateUserRole);
router.get('/reports', authorizeRoles('admin'), getPendingReports); // 🚀 FIXED
router.put('/reports/:id/resolve', authorizeRoles('admin'), resolveReport); // 🚀 FIXED

export default router;