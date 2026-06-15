import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import dotenv from 'dotenv';

dotenv.config();

// 1. Configure Cloudinary with your .env credentials
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// 2. Configure the Storage Engine (NOW DYNAMIC!)
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req: any, file: any) => {
    // Determine the file format based on mimetype
    let format = 'raw'; 
    if (file.mimetype.startsWith('image/')) {
      format = file.mimetype.split('/')[1]; 
    }

    let targetFolder = 'iba_hub_general'; 

    // 🚀 DYNAMIC ROUTING LOGIC
    // req.originalUrl looks at the full path (e.g., /api/v1/users/report)
    const url = req.originalUrl || req.baseUrl || '';

    if (url.includes('resources')) {
      targetFolder = 'iba_hub_resources';
    } else if (url.includes('complaints')) {
      targetFolder = 'iba_hub_complaints_evidence';
    } else if (url.includes('report')) { 
      // 👈 NEW: Catches User Report evidence from the chat module
      targetFolder = 'iba_hub_user_reports';
    } else if (url.includes('users') || url.includes('profile')) {
      targetFolder = 'iba_hub_profiles';
    } else if (url.includes('chat') || url.includes('message')) {
      // 👈 NEW: Future-proofing for direct chat image attachments
      targetFolder = 'iba_hub_chat_attachments';
    }

    return {
      folder: targetFolder, 
      format: format,
      resource_type: 'auto', 
    };
  },
});

// 3. Create the Multer upload instance
export const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 } 
});