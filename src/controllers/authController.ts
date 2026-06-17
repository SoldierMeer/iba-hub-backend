import { Request, Response } from 'express';
import User from '../models/User';
import generateToken from '../utils/generateToken';
import { AuthRequest } from '../middleware/authMiddleware';
import jwt from 'jsonwebtoken';
import Otp from '../models/Otp';
import nodemailer from 'nodemailer';



const getTransporter = () => {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_APP_PASSWORD,
    },
  });
};

// 1. SEND OTP ENDPOINT
export const sendRegistrationOtp = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    // 🚀 STRICT DOMAIN CHECK
    if (!email.endsWith('@iba-suk.edu.pk')) {
      return res.status(403).json({ success: false, message: "Access denied. Only @iba-suk.edu.pk emails are allowed." });
    }

    const studentEmailRegex = /^[a-zA-Z0-9]+\.(b|m)(f|s)[a-z]+\d{2}@iba-suk\.edu\.pk$/i;

    if (!studentEmailRegex.test(email)) {
      return res.status(403).json({ 
        success: false, 
        message: "Access restricted. Please use your valid student email (e.g., name.bsai23@iba-suk.edu.pk)." 
      });
    }

    const transporter = getTransporter();
    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ success: false, message: "This email is already registered." });
    }

    // Generate 6-digit OTP
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

    // Save to DB (Update if one already exists for this email)
    await (Otp as any).findOneAndUpdate(
      { email },
      { otp: otpCode, createdAt: Date.now() },
      { upsert: true, new: true, setDefaultsOnInsert: true}
    );

    // Send Email
    await transporter.sendMail({
      from: `"IBA Hub" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Verify your IBA Hub Account',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px;">
          <h2 style="color: #0f172a;">Welcome to IBA Hub!</h2>
          <p style="color: #475569; font-size: 16px;">Use the verification code below to complete your registration. This code will expire in 10 minutes.</p>
          <div style="background-color: #f8fafc; padding: 15px; text-align: center; border-radius: 8px; margin: 20px 0;">
            <h1 style="color: #4f46e5; letter-spacing: 5px; margin: 0;">${otpCode}</h1>
          </div>
          <p style="color: #94a3b8; font-size: 12px;">If you didn't request this, you can safely ignore this email.</p>
        </div>
      `,
    });

    res.status(200).json({ success: true, message: "OTP sent successfully." });
  } catch (error: any) {
    console.error("OTP Error Details:", error);
    res.status(500).json({ success: false, message: "Failed to send OTP." , details: error.message});
  }
};

// @desc    Register a new user
// @route   POST /api/v1/auth/register
// @access  Public

export const registerUser = async (req: Request, res: Response): Promise<void> => {
  try {
    // 🚀 1. Extract EVERYTHING from req.body (including OTP and alumni fields)
    const { 
      firstName, lastName, email, password, department, 
      semester, section, otp, isAlumni, currentPosition 
    } = req.body;

    // 🚀 2. VERIFY OTP FIRST
    const validOtp = await (Otp as any).findOne({ email, otp });
    if (!validOtp) {
      res.status(400).json({ success: false, message: "Invalid or expired verification code." });
      return;
    }

    // 3. Check if user already exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      res.status(400).json({ success: false, message: 'User already exists with this email' });
      return;
    }

    // 🚀 4. YOUR EXISTING IBA EMAIL PARSING LOGIC
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

    // Alumni Validation
    if (isAlumni) {
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

    // 5. Create the user
    const user = await User.create({
      firstName,
      lastName,
      email,
      password, // Assuming your User schema has a pre-save hook for hashing!
      department,
      semester: isAlumni ? 'Graduated' : semester, 
      section: isAlumni ? '' : section, 
      isAlumni: isAlumni || false,
      graduationYear: calculatedGradYear,
      batch: admissionYear ? admissionYear.toString() : '',
      currentPosition: currentPosition || '',
    });

    if (user) {
      // 🚀 6. CLEANUP: Delete the OTP so it cannot be reused
      await Otp.deleteOne({ email });

      // 7. Generate secure HttpOnly cookie token
      generateToken(res, user._id as any);

      res.status(201).json({
        success: true,
        message: "Registration complete! Welcome to IBA Hub.",
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