import { Request, Response } from 'express';
import Achievement from '../models/Achievement';

// @desc    Get all achievements (The Feed)
// @route   GET /api/v1/achievements
export const getAchievements = async (req: Request, res: Response): Promise<void> => {
  try {
    // Populate the author so the frontend can display their name and avatar
    const achievements = await Achievement.find()
      .populate('author', 'firstName lastName avatarUrl headline') 
      .sort({ createdAt: -1 }); // Newest posts first

    res.status(200).json({ success: true, count: achievements.length, data: achievements });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Create a new achievement post
// @route   POST /api/v1/achievements
export const createAchievement = async (req: Request | any, res: Response): Promise<void> => {
  try {
    const { title, description, category, mediaUrl } = req.body;
    
    const newAchievement = await Achievement.create({
      author: req.user._id, // From your protect middleware
      title,
      description,
      category,
      mediaUrl
    });

    // Populate the author immediately so the frontend can inject it into the feed without refreshing
    await newAchievement.populate('author', 'firstName lastName avatarUrl headline');

    res.status(201).json({ success: true, data: newAchievement });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Toggle reaction on an achievement
// @route   PUT /api/v1/achievements/:id/react
export const toggleReaction = async (req: Request | any, res: Response): Promise<void> => {
    try {
      const { type } = req.body;
      const achievement = await Achievement.findById(req.params.id);
  
      if (!achievement) {
        res.status(404).json({ success: false, message: 'Achievement not found' });
        return;
      }
  
      // DEFENSIVE CHECK 1: If the post is old and lacks a reactions array, initialize it
      if (!achievement.reactions) {
        achievement.reactions = [];
      }
  
      const userId = req.user._id;
      
      // DEFENSIVE CHECK 2: Added optional chaining (r.user?.toString) in case of corrupted data
      achievement.reactions = achievement.reactions.filter((r: any) => 
        r.user && r.user.toString() !== userId.toString()
      );
  
      // Add the new reaction if they didn't just "un-react"
      if (type) {
        achievement.reactions.push({ user: userId, type });
      }
  
      await achievement.save();
  
      res.status(200).json({ success: true, data: achievement.reactions });
    } catch (error: any) {
      // Log the exact error to your terminal so you can see why it failed!
      console.error("Reaction Error:", error); 
      res.status(500).json({ success: false, message: error.message });
    }
};