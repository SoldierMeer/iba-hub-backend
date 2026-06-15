import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import mongoSanitize from 'express-mongo-sanitize';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import http from 'http';
import { Server } from 'socket.io';
import connectDB from './config/db';
import cookieParser from 'cookie-parser';
import { protect, authorizeRoles } from './middleware/authMiddleware';

// Route Imports
import authRoutes from './routes/authRoutes';
import postRoutes from './routes/postRoutes';
import resourceRoutes from './routes/resourceRoutes';
import complaintRoutes from './routes/complaintRoutes';
import achievementRoutes from './routes/achievementRoutes';
import forumRoutes from './routes/forumRoutes';
import userRoutes from './routes/userRoutes';
import chatRoutes from './routes/chatRoutes';
import notificationRoutes from './routes/notificationRoutes';
import searchRoutes from './routes/searchRoutes';
import adminRoutes from './routes/adminRoutes';

// Model Import for Online Status Tracking
import User from './models/User'; 
import Announcement from './models/Announcement';
import Resource from './models/Resource';
import ForumPost from './models/ForumPost'

// Load environment variables
dotenv.config();

const app: Application = express();
const PORT = process.env.PORT || 5000;

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000", 
    methods: ["GET", "POST", 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'Cookie']
  }
});

// THIS PREVENTS THE 500 ERROR IN YOUR CONTROLLERS!
app.set('io', io);

io.on('connection', (socket) => {
  console.log(`🟢 Real-time Socket connected: ${socket.id}`);

  // 1. User logs in and joins their own personal room
  socket.on('setup_user', async (userId) => {
    (socket as any).userId = userId; // Attach userId to the socket for disconnect handling
    socket.join(userId);
    
    try {
      // Turn user ONLINE in MongoDB
      await User.findByIdAndUpdate(userId, { isOnline: true });
      console.log(`👤 User ID: ${userId} is now ONLINE in database`);
    } catch (error) {
      console.error("Failed to update online status", error);
    }
    
    socket.emit('connected');
  });

  // 2. Routing the message to the specific receiver
  socket.on('send_message', (messageData) => {
    const receiverId = messageData.receiver;
    // Broadcast the message ONLY to the receiver's room
    socket.to(receiverId).emit('receive_message', messageData);
  });

  // 3. Typing indicators
  socket.on('typing', (data) => socket.to(data.receiverId).emit('typing', data.senderId));
  socket.on('stop_typing', (data) => socket.to(data.receiverId).emit('stop_typing', data.senderId));

  // 4. Handle Disconnects (Turn user offline!)
  socket.on('disconnect', async () => {
    const userId = (socket as any).userId;
    
    if (userId) {
      try {
        // Turn user OFFLINE in MongoDB
        await User.findByIdAndUpdate(userId, { isOnline: false });
        console.log(`🔴 User ID: ${userId} went OFFLINE in database`);
      } catch (error) {
        console.error("Failed to update offline status", error);
      }
    }
    console.log(`🔴 Socket disconnected: ${socket.id}`);
  });
});

// ==========================================
// 1. ENTERPRISE SECURITY MIDDLEWARE & PARSERS
// ==========================================
// Set security HTTP headers
app.use(helmet());

// Body parser (CRITICAL: MUST BE BEFORE SANITIZATION)
app.use(express.json({ limit: '10mb' }));

// Cookie parser (Allows Express to read the JWT attached to the request)
app.use(cookieParser());

// EXPRESS 5 COMPATIBILITY PATCH
// Express 5 makes req.query read-only. This custom middleware makes it 
// writable again so our security sanitizers can scrub malicious code.
app.use((req: Request, res: Response, next: NextFunction) => {
  Object.defineProperty(req, 'query', {
    value: { ...req.query },
    writable: true,
    configurable: true,
    enumerable: true,
  });
  next();
});

// Prevent NoSQL injection attacks
app.use(mongoSanitize());

// Rate limiting: 100 requests per 15 minutes per IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: process.env.NODE_ENV === 'development' ? 5000 : 100,
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api', limiter);

// ==========================================
// 2. CROSS-ORIGIN RESOURCE SHARING (CORS)
// ==========================================
// Strictly allow only the Next.js frontend to communicate and send cookies
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true, // Crucial for HttpOnly cookies
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'], // 🚀 Added OPTIONS for preflight requests
  allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control', 'Pragma'] // 🚀 THE CRITICAL FIX: Allows Bearer tokens
}));

// ==========================================
// 3. API ROUTES
// ==========================================
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/posts', postRoutes);
app.use('/api/v1/resources', resourceRoutes);
app.use('/api/v1/complaints', complaintRoutes);
app.use('/api/v1/achievements', achievementRoutes);
app.use('/api/v1/forum', forumRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/chat', chatRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/search', searchRoutes);
app.use('/api/v1/admin', adminRoutes);

// ==========================================
// 4. HEALTH CHECK ROUTE
// ==========================================
app.get('/api/v1/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'success',
    message: 'IBA Hub Engine is operational.',
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString()
  });
});

app.get('/api/v1/announcements', async (req, res) => {
    try {
      const announcements = await Announcement.find().sort({ createdAt: -1 }).limit(5);
      res.status(200).json({ success: true, data: announcements });
    } catch (error) {
      res.status(500).json({ success: false });
    }
  });

  // GET /api/v1/stats/overview
app.get('/api/v1/stats/overview', async (req, res) => {
    try {
      const resourcesCount = await Resource.countDocuments();
      const queriesCount = await ForumPost.countDocuments();
      const onlineStudents = await User.countDocuments({ isOnline: true }); // Requires your socket logic
  
      res.status(200).json({
        success: true,
        data: { resourcesCount, queriesCount, onlineStudents }
      });
    } catch (error) {
      res.status(500).json({ success: false });
    }
  });


//   app.post('/api/v1/announcements', protect, authorizeRoles('admin'), async (req: any, res) => {
//     try {
//       const { message, priority } = req.body;
      
//       // Create new announcement in DB
//       const newAnnouncement = await Announcement.create({
//         message,
//         priority,
//         author: req.user._id
//       });
  
//       res.status(201).json({ success: true, data: newAnnouncement });
//     } catch (error: any) {
//       res.status(500).json({ success: false, message: error.message });
//     }
//   });
// ==========================================
// 5. DATABASE & SERVER INITIALIZATION
// ==========================================
// Connect to MongoDB Atlas
connectDB();

server.listen(PORT, () => {
  console.log(`🚀 [Server]: IBA Hub Engine running on port ${PORT}`);
  console.log(`🔒 [Security]: CORS restricted to ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
});