import { Response } from 'express';
import Resource from '../models/Resource';
import { AuthRequest } from '../middleware/authMiddleware';

// @desc    Upload a new academic resource
// @route   POST /api/v1/resources
// @access  Private
// @desc    Upload a new resource (File OR External Link)
// @route   POST /api/v1/resources
// @access  Private
export const uploadResource = async (req: AuthRequest | any, res: Response): Promise<void> => {
    try {
      const { title, description, courseCode, department, fileType, externalUrl, fileSize, fileName } = req.body;
  
      let finalFileUrl = '';
      let finalFileName = fileName || 'External Link';
      let finalFileSize = fileSize || 'Link';
      let finalFileType = fileType || 'document';
  
      // 1. If they uploaded a physical file (Cloudinary handled by Multer)
      if (req.file) {
        finalFileUrl = req.file.path;
      } 
      // 2. If they pasted a Drive link
      else if (externalUrl) {
        finalFileUrl = externalUrl;
        finalFileType = 'link';
      } 
      // 3. If they sent neither
      else {
        res.status(400).json({ success: false, message: 'Please provide a file or an external link.' });
        return;
      }
  
      const resource = await Resource.create({
        title,
        description,
        courseCode,
        department,
        fileType: finalFileType,
        fileUrl: finalFileUrl,
        fileName: finalFileName,
        fileSize: finalFileSize,
        uploader: req.user._id,
        status: 'pending' // Send to Admin Command Center
      });
  
      res.status(201).json({ success: true, data: resource });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get all academic resources
// @route   GET /api/v1/resources
// @access  Private
export const getResources = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // 🚀 Added 'page' and 'limit' extraction
    const { search, department, type, sort, page, limit } = req.query;
    
    // Build a dynamic query object
    let query: any = { status: 'approved' };

    // 1. Search by Title, Course Code, or File Name (case-insensitive)
    if (search) {
      query.$or = [
        { title: { $regex: search as string, $options: 'i' } },
        { courseCode: { $regex: search as string, $options: 'i' } },
        { fileName: { $regex: search as string, $options: 'i' } }
      ];
    }

    // 2. Filter by Department (Now Case-Insensitive)
    if (department && department !== 'All') {
      // Using ^ and $ ensures an exact match, but 'i' makes it ignore upper/lowercase differences
      query.department = { $regex: new RegExp(`^${department}$`, 'i') };
    }

    // 3. Filter by File Type (Now Case-Insensitive)
    if (type && type !== 'All') {
      query.fileType = { $regex: new RegExp(`^${type}$`, 'i') };
    }

    // 4. Determine Sorting Strategy
    let sortOptions: any = { createdAt: -1 }; // Default: Newest first
    if (sort === 'oldest') sortOptions = { createdAt: 1 };
    if (sort === 'downloads') sortOptions = { downloads: -1 }; // Most downloaded first

    // 🚀 5. PAGINATION SETUP
    const pageNumber = parseInt(page as string, 10) || 1;
    const limitNumber = parseInt(limit as string, 10) || 12;
    const skip = (pageNumber - 1) * limitNumber;

    // 🚀 Count TOTAL documents that match the filters (before limiting)
    const totalResources = await Resource.countDocuments(query);

    // Fetch resources, sort, APPLY PAGINATION, and populate uploader details
    const resources = await Resource.find(query)
      .sort(sortOptions)
      .skip(skip)          // 🚀 Skips the items from previous pages
      .limit(limitNumber)  // 🚀 Limits the array to only 12 items
      .populate('uploader', 'firstName lastName avatarUrl isAlumni');

    res.status(200).json({ 
      success: true, 
      count: resources.length, 
      data: resources,
      // 🚀 Send pagination details to the frontend
      pagination: {
          currentPage: pageNumber,
          totalPages: Math.ceil(totalResources / limitNumber),
          totalItems: totalResources
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Server Error' });
  }
};

// @desc    Get Top Uploaders for Sidebar Leaderboard
// @route   GET /api/v1/resources/top-uploaders
// @access  Private
export const getTopUploaders = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const topUploaders = await Resource.aggregate([
        // 1. SAFEGUARD: Ignore old test data where 'uploader' might be missing or null
        { $match: { uploader: { $exists: true, $ne: null } } },
        
        // 2. Group by the uploader ID
        { $group: { _id: '$uploader', count: { $sum: 1 } } },
        
        // 3. Sort and Limit
        { $sort: { count: -1 } },
        { $limit: 5 },
        
        // 4. Lookup the user details
        { $lookup: { 
            from: 'users', 
            localField: '_id', 
            foreignField: '_id', 
            as: 'user' 
        } },
        
        // 5. SAFEGUARD: Unwind without dropping data if the lookup fails temporarily
        { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
        
        // 6. Format output (Adding fallbacks just in case)
        { $project: { 
            _id: 1, 
            count: 1, 
            firstName: { $ifNull: ['$user.firstName', 'Unknown'] }, 
            lastName: { $ifNull: ['$user.lastName', 'User'] }, 
            avatarUrl: '$user.avatarUrl' 
        } }
      ]);
  
      res.status(200).json({ success: true, data: topUploaders });
    } catch (error: any) {
      console.error("Leaderboard Error:", error);
      res.status(500).json({ success: false, message: error.message || 'Server Error' });
    }
};

// @desc    Increment Download Count
// @route   PUT /api/v1/resources/:id/download
// @access  Private
export const incrementDownload = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Find the resource and increment the 'downloads' field by 1
    const resource = await Resource.findByIdAndUpdate(
      req.params.id,
      { $inc: { downloads: 1 } }, 
      { new: true }
    );

    res.status(200).json({ success: true, data: resource });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Server Error' });
  }
};

// @desc    Get current user's resources (for tracking status)
// @route   GET /api/v1/resources/me
// @access  Private
export const getMyResources = async (req: AuthRequest | any, res: Response): Promise<void> => {
    try {
      const resources = await Resource.find({ uploader: req.user._id }).sort({ createdAt: -1 });
      res.status(200).json({ success: true, data: resources });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  };
  
  // @desc    Delete a resource (Used to clear rejected uploads)
  // @route   DELETE /api/v1/resources/:id
  // @access  Private
  export const deleteResource = async (req: AuthRequest | any, res: Response): Promise<void> => {
    try {
      const resource = await Resource.findOne({ _id: req.params.id, uploader: req.user._id });
      if (!resource) {
        res.status(404).json({ success: false, message: 'Resource not found or unauthorized' });
        return;
      }
      await resource.deleteOne();
      res.status(200).json({ success: true, message: 'Resource deleted' });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  };