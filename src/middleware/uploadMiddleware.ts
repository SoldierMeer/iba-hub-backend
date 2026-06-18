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
// 2. Configure the Storage Engine (NOW DYNAMIC & DOCUMENT-SAFE!)
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req: any, file: any) => {
    let targetFolder = 'iba_hub_general'; 

    // 🚀 DYNAMIC ROUTING LOGIC
    const url = req.originalUrl || req.baseUrl || '';

    if (url.includes('resources')) {
      targetFolder = 'iba_hub_resources';
    } else if (url.includes('complaints')) {
      targetFolder = 'iba_hub_complaints_evidence';
    } else if (url.includes('report')) { 
      targetFolder = 'iba_hub_user_reports';
    } else if (url.includes('users') || url.includes('profile')) {
      targetFolder = 'iba_hub_profiles';
    } else if (url.includes('chat') || url.includes('message')) {
      targetFolder = 'iba_hub_chat_attachments';
    }

    // Base parameters that work for ALL files
    const params: any = {
      folder: targetFolder,
      resource_type: 'auto', 
    };

    // 🚀 FIXED: Only force a specific format if it is actually an image.
    // If it is a PDF or Document, we don't pass the "format" parameter at all.
    if (file.mimetype.startsWith('image/')) {
      params.format = file.mimetype.split('/')[1]; 
    }

    return params;
  },
});
// 3. Create the Multer upload instance
export const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 } 
});