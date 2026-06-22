import { Response } from 'express';
import ForumPost from '../models/ForumPost';
import ForumReply from '../models/ForumReply';
import { AuthRequest } from '../middleware/authMiddleware';
import jwt from 'jsonwebtoken'; // Make sure this is imported at the top!
import User from '../models/User';
import Notification from '../models/Notification';

// 🛠️ HELPER: Forcefully extract the user ID from raw cookies
const getUserIdFromRequest = (req: any): string | null => {
    try {
      let token = req.cookies?.jwt || req.cookies?.token;
      
      if (!token && req.headers.cookie) {
        const cookiesArr = req.headers.cookie.split(';');
        const match = cookiesArr.find((c: string) => c.trim().startsWith('jwt=') || c.trim().startsWith('token='));
        if (match) {
          token = match.split('=')[1];
        }
      }
      
      // Ignore stringified undefined/null values
      if (token && token !== 'undefined' && token !== 'null') {
        const decoded: any = jwt.verify(token, process.env.JWT_SECRET as string);
        return String(decoded.id || decoded._id); // Force strict string conversion
      }
    } catch (error) {
      return null; 
    }
    return null;
};

// @desc    Delete a post (and its replies)
// @route   DELETE /api/v1/forum/:id
export const deletePost = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const post = await ForumPost.findById(req.params.id);
    if (!post) {
      res.status(404).json({ success: false, message: 'Post not found' });
      return;
    }

    // Ensure the user deleting the post is the author
    if (post.author.toString() !== req.user?._id.toString()) {
      res.status(403).json({ success: false, message: 'Not authorized to delete this post' });
      return;
    }

    // Delete the post and all associated replies
    await post.deleteOne();
    await ForumReply.deleteMany({ post: req.params.id });

    res.status(200).json({ success: true, message: 'Post deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Server Error' });
  }
};

// @desc    Toggle upvote on a reply
// @route   PUT /api/v1/forum/replies/:replyId/upvote
export const toggleReplyUpvote = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const reply = await ForumReply.findById(req.params.replyId);
    if (!reply) {
      res.status(404).json({ success: false, message: 'Reply not found' });
      return;
    }

    const userId = req.user?._id;
    const hasUpvoted = reply.upvotes.includes(userId);

    if (hasUpvoted) {
      reply.upvotes = reply.upvotes.filter((id) => id.toString() !== userId.toString());
    } else {
      reply.upvotes.push(userId);
    }

    await reply.save();
    res.status(200).json({ success: true, data: reply.upvotes });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Server Error' });
  }
};

// @desc    Mark a reply as the accepted answer
// @route   PUT /api/v1/forum/replies/:replyId/accept
// @desc    Mark a reply as the accepted answer & Award Points
// @desc    Mark a reply as the accepted answer

// @desc    Mark a reply as the accepted answer
// @route   PUT /api/v1/forum/replies/:replyId/accept
export const acceptReply = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const reply = await ForumReply.findById(req.params.replyId);
      if (!reply) {
        res.status(404).json({ success: false, message: 'Reply not found' });
        return;
      }
  
      const post = await ForumPost.findById(reply.post);
      if (!post) {
        res.status(404).json({ success: false, message: 'Parent post not found' });
        return;
      }
  
      // 🔐 Safe string conversion to check ownership
      const postAuthorId = String(post.author);
      const currentUserId = String(req.user?._id);
  
      if (postAuthorId !== currentUserId) {
        res.status(403).json({ success: false, message: 'Only the original poster can accept an answer' });
        return;
      }
  
      const newStatus = !reply.isAcceptedAnswer;
  
      if (newStatus) {
        // 1. Remove previous accepted answers
        const previousAccepted = await ForumReply.findOne({ post: post._id, isAcceptedAnswer: true });
        if (previousAccepted) {
          previousAccepted.isAcceptedAnswer = false;
          await previousAccepted.save();
          
          // Safely deduct points from previous user (if User model exists)
          try {
            await User.findByIdAndUpdate(previousAccepted.author, { $inc: { score: -15 } });
          } catch (e) { console.log("Could not update previous user score"); }
        }
  
        // 2. Accept new reply
        reply.isAcceptedAnswer = true;
        await reply.save();
  
        // 3. Mark post as solved
        post.hasAcceptedAnswer = true;
        await post.save();
  
        // 4. Safely reward new user
        try {
          await User.findByIdAndUpdate(reply.author, { $inc: { contributorPoints: 15 } });
        } catch (e) { console.log("Could not update user score"); }
  
      } else {
        // UN-ACCEPTING
        reply.isAcceptedAnswer = false;
        await reply.save();
  
        post.hasAcceptedAnswer = false;
        await post.save();
  
        try {
          await User.findByIdAndUpdate(reply.author, { $inc: { contributorPoints: -15 } });
        } catch (e) { console.log("Could not update user score"); }
      }
  
      res.status(200).json({ success: true, data: reply });
    } catch (error: any) {
      console.error("ACCEPT REPLY ERROR:", error); // Logs the exact crash reason in your terminal
      res.status(500).json({ success: false, message: error.message || 'Server Error' });
    }
};

// @desc    Create a new forum post
// @route   POST /api/v1/forum
export const createPost = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { title, content, tags, category } = req.body;

    const post = await ForumPost.create({
      title,
      content,
      tags,
      category: category || 'General', // Added category saving
      author: req.user?._id,
    });

    res.status(201).json({ success: true, data: post });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Server Error' });
  }
};



// @desc    Get all posts (Main Feed)
// @desc    Get all posts (Main Feed)
// @route   GET /api/v1/forum

// @desc    Get all posts (Main Feed)
// @route   GET /api/v1/forum
// export const getPosts = async (req: Request | any, res: Response): Promise<void> => {
//   try {
//     // 🚀 1. Added 'search' to the query extraction
//     const { sort, category, page = '1', limit = '15', search } = req.query; 
    
//     const pageNum = parseInt(page as string, 10);
//     const limitNum = parseInt(limit as string, 10);
//     const skip = (pageNum - 1) * limitNum;

//     let query: any = {};

//     // 🚀 2. SEARCH LOGIC: If a user typed in the search bar, look in titles, content, and tags!
//     if (search) {
//       query.$or = [
//         { title: { $regex: search, $options: 'i' } },
//         { content: { $regex: search, $options: 'i' } },
//         { tags: { $regex: search, $options: 'i' } } 
//       ];
//     }

//     if (category && category !== 'All Categories' && category !== 'All') {
//       query.category = { $regex: new RegExp(`^${decodeURIComponent(category as string)}$`, 'i') };
//     }

//     if (sort === 'unanswered') {
//       query.$or = [{ replyCount: 0 }, { replyCount: { $exists: false } }];
//     }

//     // 🚀 3. FIXED TRENDING LOGIC: Now sorts by Likes (upvotesCount) from High to Low!
//     let sortOptions: any = { createdAt: -1 };
//     if (sort === 'trending') sortOptions = { upvotesCount: -1, replyCount: -1, createdAt: -1 };

//     const twentyFourHoursAgo = new Date(Date.now() - 86400000);

//     const [posts, totalPosts, activeToday, trendingSidebar, tagsAgg] = await Promise.all([
      
//       ForumPost.find(query)
//           .sort(sortOptions)
//           .skip(skip)
//           .limit(limitNum)
//           .populate('author', 'firstName lastName avatarUrl')
//           .lean(),
      
//       ForumPost.countDocuments(query),

//       ForumPost.countDocuments({ createdAt: { $gte: twentyFourHoursAgo } }),

//       // 🚀 BONUS: Also updated the global "Trending Sidebar" to sort by Likes first!
//       ForumPost.find({})
//           .sort({ upvotesCount: -1, replyCount: -1 })
//           .limit(4)
//           .select('title replyCount upvotesCount')
//           .lean(),

//       ForumPost.aggregate([
//           { $unwind: "$tags" },
//           { $group: { _id: "$tags", count: { $sum: 1 } } },
//           { $sort: { count: -1 } },
//           { $limit: 6 }
//       ])
//     ]);

//     const popularTags = tagsAgg.map(t => t._id);
//     const currentUserId = getUserIdFromRequest(req);

//     res.status(200).json({ 
//       success: true, 
//       count: posts.length, 
//       data: posts, 
//       currentUserId,
//       pagination: {
//           currentPage: pageNum,
//           totalPages: Math.ceil(totalPosts / limitNum),
//           totalItems: totalPosts
//       },
//       stats: {
//           activeToday,
//           trendingSidebar,
//           popularTags
//       }
//     });
//   } catch (error: any) {
//     res.status(500).json({ success: false, message: error.message || 'Server Error' });
//   }
// };
  
// @desc    Get all posts (Main Feed)
// @route   GET /api/v1/forum
export const getPosts = async (req: Request | any, res: Response): Promise<void> => {
  try {
    // 🚀 1. Extract 'tag' from the query parameters
    const { sort, category, page = '1', limit = '15', search, tag } = req.query; 
    
    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;

    let query: any = {};

    // SEARCH LOGIC: Look in titles, content, and tags
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { content: { $regex: search, $options: 'i' } },
        { tags: { $regex: search, $options: 'i' } } 
      ];
    }

    // CATEGORY LOGIC
    if (category && category !== 'All Categories' && category !== 'All') {
      query.category = { $regex: new RegExp(`^${decodeURIComponent(category as string)}$`, 'i') };
    }

    // 🚀 2. NEW TAG FILTER LOGIC
    if (tag) {
      // Decode it in case the tag has spaces or special characters
      const decodedTag = decodeURIComponent(tag as string);
      // Case-insensitive exact match inside the tags array
      query.tags = { $regex: new RegExp(`^${decodedTag}$`, 'i') };
    }

    // UNANSWERED LOGIC
    if (sort === 'unanswered') {
      query.$or = [{ replyCount: 0 }, { replyCount: { $exists: false } }];
    }

    // SORT LOGIC
    let sortOptions: any = { createdAt: -1 };
    if (sort === 'trending') sortOptions = { upvotesCount: -1, replyCount: -1, createdAt: -1 };

    const twentyFourHoursAgo = new Date(Date.now() - 86400000);

    const [posts, totalPosts, activeToday, trendingSidebar, tagsAgg] = await Promise.all([
      ForumPost.find(query)
          .sort(sortOptions)
          .skip(skip)
          .limit(limitNum)
          .populate('author', 'firstName lastName avatarUrl')
          .lean(),
      
      ForumPost.countDocuments(query),

      ForumPost.countDocuments({ createdAt: { $gte: twentyFourHoursAgo } }),

      ForumPost.find({})
          .sort({ upvotesCount: -1, replyCount: -1 })
          .limit(4)
          .select('title replyCount upvotesCount')
          .lean(),

      ForumPost.aggregate([
          { $unwind: "$tags" },
          { $group: { _id: "$tags", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 6 }
      ])
    ]);

    const popularTags = tagsAgg.map(t => t._id);
    const currentUserId = getUserIdFromRequest(req);

    res.status(200).json({ 
      success: true, 
      count: posts.length, 
      data: posts, 
      currentUserId,
      pagination: {
          currentPage: pageNum,
          totalPages: Math.ceil(totalPosts / limitNum),
          totalItems: totalPosts
      },
      stats: {
          activeToday,
          trendingSidebar,
          popularTags
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Server Error' });
  }
};
  // @desc    Get a single post and its replies
  // @route   GET /api/v1/forum/:id
  export const getPostById = async (req: Request | any, res: Response): Promise<void> => {
    try {
      // 1. Fetch the Post (using .lean() for speed)
      const post = await ForumPost.findById(req.params.id)
        .populate('author', 'firstName lastName avatarUrl')
        .lean();
      
      if (!post) {
        res.status(404).json({ success: false, message: 'Post not found' });
        return;
      }
  
      const sortBy = req.query.sort || 'likes';
      
      // 2. Setup Database-Level Sorting
      // Accepted answers always float to the top. After that, sort by likes or newest.
      let sortOptions: any = { isAcceptedAnswer: -1 }; 
      if (sortBy === 'newest') {
          sortOptions.createdAt = -1; // Newest first
      } else {
          sortOptions.upvoteCount = -1; // We sort by the length of the upvotes array (needs aggregate or proxy field, see fallback below)
      }
  
      // 3. Fetch Replies directly sorted by the database
      let replies = await ForumReply.find({ post: req.params.id })
        .populate('author', 'firstName lastName avatarUrl')
        .lean();
  
      // Because Mongoose can't directly sort by array length in a simple .find(), 
      // we do a lightning-fast native JS sort ONLY for the upvotes tie-breaker.
      // Since we used .lean(), this takes 1 millisecond even for 1,000 replies.
      replies.sort((a: any, b: any) => {
        // Rule 1: Accepted answer is always King
        if (a.isAcceptedAnswer && !b.isAcceptedAnswer) return -1;
        if (!a.isAcceptedAnswer && b.isAcceptedAnswer) return 1;
        
        // Rule 2: Follow user's sort preference
        if (sortBy === 'newest') {
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        } else {
          return (b.upvotes?.length || 0) - (a.upvotes?.length || 0);
        }
      });
  
      const currentUserId = getUserIdFromRequest(req);
  
      res.status(200).json({ 
        success: true, 
        data: { post, replies, currentUserId } 
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message || 'Server Error' });
    }
  };
  
  // @desc    Add a reply to a post
// @route   POST /api/v1/forum/:id/replies

// MAKE SURE THIS IMPORT IS AT THE TOP OF YOUR FILE:
// import Notification from '../models/Notification';

export const createReply = async (req: AuthRequest | any, res: Response): Promise<void> => {
    try {
      const { content } = req.body;
      const postId = req.params.id;
  
      const reply = await ForumReply.create({
        post: postId,
        content,
        author: req.user?._id,
      });
  
      // Increment the parent post's replyCount AND capture the post data
      const post = await ForumPost.findByIdAndUpdate(postId, {
        $inc: { replyCount: 1 }
      });
  
      // 🚀 NEW: Real-time Notification Logic
      // Check if the post exists and the replier is NOT the original author
      if (post && post.author.toString() !== req.user._id.toString()) {
          try {
              const notification = await Notification.create({
                  recipient: post.author,
                  sender: req.user._id,
                  type: 'forum_reply',
                  content: `${req.user.firstName} replied to your forum query.`,
                  link: `/forum/${post._id}` 
              });
              const io = req.app.get('io');
              io.to(post.author.toString()).emit('new_notification', notification);
          } catch (error) {
              console.log("Could not send forum notification", error);
          }
      }
  
      // Populate the author so the frontend can render the new reply immediately
      await reply.populate('author', 'firstName lastName avatarUrl');
  
      res.status(201).json({ success: true, data: reply });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message || 'Server Error' });
    }
};


// @desc    Toggle upvote on a post
// @route   PUT /api/v1/forum/:id/upvote
// @desc    Toggle upvote on a post
// @route   PUT /api/v1/forum/:id/upvote
export const togglePostUpvote = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const post = await ForumPost.findById(req.params.id);
      if (!post) {
        res.status(404).json({ success: false, message: 'Post not found' });
        return;
      }
  
      const userId = req.user?._id;
      // Use .some() and cast to string to prevent object reference desyncs
      const hasUpvoted = post.upvotes.some((id) => id.toString() === userId.toString());
  
      if (hasUpvoted) {
        post.upvotes = post.upvotes.filter((id) => id.toString() !== userId.toString());
      } else {
        post.upvotes.push(userId);
      }
  
      post.upvotesCount = post.upvotes.length;
      await post.save();
  
      res.status(200).json({ success: true, data: post.upvotes });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message || 'Server Error' });
    }
};