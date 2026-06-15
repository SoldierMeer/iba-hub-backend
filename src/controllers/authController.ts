import { Request, Response } from 'express';
import User from '../models/User';
import generateToken from '../utils/generateToken';
import { AuthRequest } from '../middleware/authMiddleware';
import jwt from 'jsonwebtoken';

// @desc    Register a new user
// @route   POST /api/v1/auth/register
// @access  Public
export const registerUser = async (req: Request, res: Response): Promise<void> => {
  try {
    // 🚀 THE FIX: Added 'section' to the destructuring right here!
    const { firstName, lastName, email, password, department, semester, section } = req.body;

    // 1. Check if user already exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      res.status(400).json({ success: false, message: 'User already exists with this email' });
      return;
    }

    const emailMatch = email.match(/\.([bm])[a-z]*(\d{2})@/i);
    
    let calculatedGradYear = null;
    let admissionYear = null;

    if (emailMatch) {
        const degreeType = emailMatch[1].toLowerCase(); // 'b' for bachelors, 'm' for masters
        const yearDigits = parseInt(emailMatch[2]); // e.g., 23
        admissionYear = 2000 + yearDigits; // e.g., 2023

        // Bachelors = 4 years, Masters = 2 years
        calculatedGradYear = degreeType === 'b' ? admissionYear + 4 : admissionYear + 2;
    }

    const currentYear = new Date().getFullYear(); // Currently 2026

    // If they checked the "I am an Alumni" box on the frontend:
    if (req.body.isAlumni) {
        if (!calculatedGradYear) {
            res.status(400).json({ success: false, message: "Could not verify graduation year from your email format." });
            return;
        }
        if (calculatedGradYear > currentYear) {
            res.status(400).json({ 
                success: false, 
                message: `Nice try! Your email indicates you graduate in ${calculatedGradYear}. You cannot register as an Alumni yet.` 
            });
            return;
        }
    }

    // 2. Create the user
    const user = await User.create({
      firstName,
      lastName,
      email,
      password,
      department,
      semester: req.body.isAlumni ? 'Graduated' : semester, // Alumni don't need semesters
      section: req.body.isAlumni ? '' : section, // 🚀 This now works because section is defined!
      
      // Save the Alumni data
      isAlumni: req.body.isAlumni || false,
      graduationYear: calculatedGradYear,
      batch: admissionYear ? admissionYear.toString() : '',
      currentPosition: req.body.currentPosition || '',
    });

    if (user) {
      // 3. Generate secure HttpOnly cookie token
      generateToken(res, user._id as any);

      res.status(201).json({
        success: true,
        data: {
          _id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          role: user.role,
        },
      });
    } else {
      res.status(400).json({ success: false, message: 'Invalid user data received' });
    }
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Server Error' });
  }
};

// @desc    Authenticate user & get token
// @route   POST /api/v1/auth/login
// @access  Public
// authController.ts
export const loginUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email }).select('+password');

    if (user && (await user.matchPassword(password))) {
      // 1. Generate the token
      const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET as string, { expiresIn: '30d' });

      // 2. 🚀 Send the token in the JSON payload (Ignore res.cookie entirely)
      res.status(200).json({
        success: true,
        token: token, 
        data: {
          _id: user._id,
          firstName: user.firstName,
          email: user.email,
          role: user.role,
        },
      });
    } else {
      res.status(401).json({ success: false, message: 'Invalid email or password' });
    }
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Logout user / clear cookie
// @route   GET /api/v1/auth/logout
export const logoutUser = (req: Request, res: Response) => {
  res.cookie('token', '', {
    httpOnly: true,
    secure: true,      // Must match generateToken
    sameSite: 'none',  // Must match generateToken
    path: '/',
    expires: new Date(0), // Sets expiration to the past to delete the cookie
  });

  res.status(200).json({
    success: true,
    message: 'Logged out successfully'
  });
};

// @desc    Get current logged in user
// @route   GET /api/v1/auth/me
// @access  Private
export const getMe = async (req: AuthRequest, res: Response): Promise<void> => {
    const user = req.user;
  
    // Background Check: Flag 4th-year students (7th or 8th semester)
    const isGraduatingSoon = user?.semester === '7th' || user?.semester === '8th';
  
    res.status(200).json({
      success: true,
      data: {
        ...user?.toObject(), // Convert Mongoose document to standard object
        isGraduatingSoon,    // Inject the calculated flag for the Next.js modal
      },
    });
};