import { Response } from 'express';
import Post from '../models/Post';
import { AuthRequest } from '../middleware/authMiddleware';

// @desc    Create a new campus post
// @route   POST /api/v1/posts
// @access  Private
export const createPost = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { content, category } = req.body;

    const post = await Post.create({
      user: req.user?._id, // Safely extracted from the JWT cookie by our middleware
      content,
      category,
    });

    // Instantly populate the user data before sending it back to the frontend
    const populatedPost = await post.populate('user', 'firstName lastName avatarUrl department');

    res.status(201).json({ success: true, data: populatedPost });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Server Error' });
  }
};

// @desc    Get all posts for the campus feed
// @route   GET /api/v1/posts
// @access  Private
export const getPosts = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const posts = await Post.find()
      .sort({ createdAt: -1 }) // Sort by newest first
      .populate('user', 'firstName lastName avatarUrl department') // Get post author
      .populate('comments.user', 'firstName lastName avatarUrl'); // Get comment authors

    res.status(200).json({ success: true, count: posts.length, data: posts });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Server Error' });
  }
};

// @desc    Toggle an upvote on a post
// @route   PUT /api/v1/posts/:id/upvote
// @access  Private
export const upvotePost = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post) {
      res.status(404).json({ success: false, message: 'Post not found' });
      return;
    }

    // Convert ObjectIds to strings for accurate strict equality checking
    const userId = req.user?._id?.toString() as string;
    const hasUpvoted = post.upvotes.some((id) => id.toString() === userId);

    if (hasUpvoted) {
      // If they already upvoted, clicking again removes their vote (toggle off)
      post.upvotes = post.upvotes.filter((id) => id.toString() !== userId);
    } else {
      // If they haven't upvoted, add their ID to the array (toggle on)
      post.upvotes.push(req.user?._id as any);
    }

    await post.save();

    // We only need to return the updated upvotes array to refresh the frontend UI counter
    res.status(200).json({ success: true, data: post.upvotes });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Server Error' });
  }
};

export const addComment = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { text } = req.body;
      const post = await Post.findById(req.params.id);
  
      if (!post) {
        res.status(404).json({ success: false, message: 'Post not found' });
        return;
      }
  
      // Create the new comment object
      const newComment = {
        user: req.user?._id, // Tied to the logged-in user via our JWT middleware
        text,
      };
  
      // Push it into the post's embedded array
      post.comments.push(newComment as any);
      await post.save();
  
      // Re-populate the user data for the comments so the frontend gets the avatars/names instantly
      await post.populate('comments.user', 'firstName lastName avatarUrl');
  
      res.status(201).json({ success: true, data: post.comments });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message || 'Server Error' });
    }
  };