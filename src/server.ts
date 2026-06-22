import dotenv from 'dotenv';
import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import mongoSanitize from 'express-mongo-sanitize';
import rateLimit from 'express-rate-limit';
import compression from 'compression'; // 🚀 NEW: Saves massive amounts of bandwidth!
import http from 'http';
import { Server } from 'socket.io';
import connectDB from './config/db';
import cookieParser from 'cookie-parser';

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

// Model Import
import User from './models/User'; 
import Announcement from './models/Announcement';
import Resource from './models/Resource';
import ForumPost from './models/ForumPost';

// Load environment variables
dotenv.config();

const app: Application = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 5000;

const server = http.createServer(app);

// 🚀 OPTIMIZED: Relaxed ping times prevent mobile phones from spam-connecting your DB
const io = new Server(server, {
  pingTimeout: 60000,   // Wait 60 seconds before declaring a user disconnected
  pingInterval: 25000,  // Ping every 25 seconds (less CPU overhead)
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000", 
    methods: ["GET", "POST", 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'Cookie', 'Expires', 'Cache-Control', 'Pragma', 'X-Requested-With', 'Accept']
  }
});

// THIS PREVENTS THE 500 ERROR IN YOUR CONTROLLERS!
app.set('io', io);

io.on('connection', (socket) => {
  console.log(`🟢 Real-time Socket connected: ${socket.id}`);

  // 1. User logs in and joins their own personal room
  socket.on('setup_user', async (userId) => {
    (socket as any).userId = userId; 
    socket.join(userId);
    
    try {
      await User.findByIdAndUpdate(userId, { isOnline: true });
      io.emit('user_status_change', { userId, isOnline: true });
    } catch (error) {
      console.error("Failed to update online status", error);
    }
    socket.emit('connected');
  });

  // 2. Routing the message to the specific receiver
  socket.on('send_message', (messageData) => {
    socket.to(messageData.receiver).emit('receive_message', messageData);
  });

  // 3. Typing indicators
  socket.on('typing', (data) => socket.to(data.receiverId).emit('typing', data.senderId));
  socket.on('stop_typing', (data) => socket.to(data.receiverId).emit('stop_typing', data.senderId));

  // 4. Handle Disconnects safely
  socket.on('disconnect', async () => {
    const userId = (socket as any).userId;
    
    if (userId) {
      setTimeout(async () => {
        const activeSockets = await io.in(userId).fetchSockets();
        
        if (activeSockets.length === 0) {
          try {
            await User.findByIdAndUpdate(userId, { isOnline: false });
            io.emit('user_status_change', { userId, isOnline: false });
          } catch (error) {
            console.error("Failed to update offline status", error);
          }
        }
      }, 5000);
    }
  });
});

// ==========================================
// 1. ENTERPRISE SECURITY MIDDLEWARE & PARSERS
// ==========================================

app.use(helmet());
app.use(compression()); // 🚀 NEW: Compresses all JSON responses (Makes app lightning fast)

// Body parser
app.use(express.json({ limit: '10mb' }));

// Cookie parser
app.use(cookieParser());

// EXPRESS 5 COMPATIBILITY PATCH
app.use((req: Request, res: Response, next: NextFunction) => {
  Object.defineProperty(req, 'query', {
    value: { ...req.query },
    writable: true,
    configurable: true,
    enumerable: true,
  });
  next();
});

app.use(mongoSanitize());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: process.env.NODE_ENV === 'development' ? 5000 : 1000, // Safe limit for production
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api', limiter);

// ==========================================
// 2. CROSS-ORIGIN RESOURCE SHARING (CORS)
// ==========================================
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true, 
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'], 
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie', 'Cache-Control', 'Pragma' , 'X-Requested-With'] 
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
// 4. MISC ROUTES & CACHED STATS
// ==========================================
app.get('/api/v1/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'success', environment: process.env.NODE_ENV });
});

app.get('/api/v1/announcements', async (req, res) => {
  try {
    // .lean() makes this infinitely faster
    const announcements = await Announcement.find().sort({ createdAt: -1 }).limit(5).lean();
    res.status(200).json({ success: true, data: announcements });
  } catch (error) {
    res.status(500).json({ success: false });
  }
});

// 🚀 CRITICAL OPTIMIZATION: Simple In-Memory Cache for Stats
let cachedStats: any = null;
let lastCacheTime = 0;

app.get('/api/v1/stats/overview', async (req, res) => {
  try {
    const now = Date.now();
    // Cache the stats for 60 seconds (60000 ms). 
    // This absorbs 99% of the database impact if thousands of students log in at once.
    if (cachedStats && now - lastCacheTime < 60000) {
      return res.status(200).json({ success: true, data: cachedStats });
    }

    // Run all count queries in parallel!
    const [resourcesCount, queriesCount, onlineStudents] = await Promise.all([
      Resource.countDocuments(),
      ForumPost.countDocuments(),
      User.countDocuments({ isOnline: true })
    ]);

    cachedStats = { resourcesCount, queriesCount, onlineStudents };
    lastCacheTime = now;

    res.status(200).json({ success: true, data: cachedStats });
  } catch (error) {
    res.status(500).json({ success: false });
  }
});

// ==========================================
// 5. DATABASE & SERVER INITIALIZATION
// ==========================================
connectDB();

server.listen(PORT, () => {
  console.log(`🚀 [Server]: IBA Hub Engine running on port ${PORT}`);
  console.log(`🔒 [Security]: CORS restricted to ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
});