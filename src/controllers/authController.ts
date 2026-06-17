import { Request, Response } from 'express';
import User from '../models/User';
import generateToken from '../utils/generateToken';
import { AuthRequest } from '../middleware/authMiddleware';
import jwt from 'jsonwebtoken';
import Otp from '../models/Otp';

// 1. SEND OTP ENDPOINT (REGISTRATION)
export const sendRegistrationOtp = async (req: Request, res: Response) => {
  console.log("Checking for API Key:", process.env.BREVO_API_KEY ? "KEY FOUND!" : "KEY IS MISSING!");
  try {
    const { email } = req.body;

    // 🚀 STRICT DOMAIN CHECK
    if (!email.endsWith('@iba-suk.edu.pk')) {
      return res.status(403).json({ 
        success: false, 
        message: "Access denied. Only @iba-suk.edu.pk emails are allowed." 
      });
    }

    const studentEmailRegex = /^[a-zA-Z0-9]+\.(b|m)(f|s)[a-z]+\d{2}@iba-suk\.edu\.pk$/i;

    if (!studentEmailRegex.test(email)) {
      return res.status(403).json({ 
        success: false, 
        message: "Access restricted. Please use your valid student email (e.g., name.bsai23@iba-suk.edu.pk)." 
      });
    }

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
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // 🚀 BREVO HTTP API CALL
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'api-key': process.env.BREVO_API_KEY as string
      },
      body: JSON.stringify({
        sender: { name: "IBA Hub", email: process.env.EMAIL_USER }, 
        to: [{ email: email }],
        subject: 'Verify your IBA Hub Account',
        htmlContent: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px;">
            <h2 style="color: #0f172a;">Welcome to IBA Hub!</h2>
            <p style="color: #475569; font-size: 16px;">Use the verification code below to complete your registration. This code will expire in 10 minutes.</p>
            <div style="background-color: #f8fafc; padding: 15px; text-align: center; border-radius: 8px; margin: 20px 0;">
              <h1 style="color: #4f46e5; letter-spacing: 5px; margin: 0;">${otpCode}</h1>
            </div>
            <p style="color: #94a3b8; font-size: 12px;">If you didn't request this, you can safely ignore this email.</p>
          </div>
        `,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Brevo API Error Response:", errorData);
      throw new Error(errorData.message || "Failed to send email via Brevo API");
    }

    res.status(200).json({ success: true, message: "OTP sent successfully." });
  } catch (error: any) {
    console.error("OTP Error Details:", error);
    res.status(500).json({ 
      success: false, 
      message: "Failed to send OTP.", 
      details: error.message 
    });
  }
};


// 2. SEND OTP FOR RESET
export const sendPasswordResetOtp = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body;
    
    // Check if user exists
    const user = await User.findOne({ email });
    if (!user) {
      res.status(404).json({ success: false, message: "No account found with this email." });
      return;
    }

    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

    await (Otp as any).findOneAndUpdate(
      { email },
      { otp: otpCode, createdAt: Date.now() },
      { upsert: true, new: true }
    );

    // 🚀 BREVO HTTP API CALL (Replaced Nodemailer!)
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'api-key': process.env.BREVO_API_KEY as string
      },
      body: JSON.stringify({
        sender: { name: "IBA Hub", email: process.env.EMAIL_USER }, 
        to: [{ email: email }],
        subject: 'Reset your IBA Hub Password',
        htmlContent: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px;">
            <h2 style="color: #0f172a;">Password Reset Request</h2>
            <p style="color: #475569; font-size: 16px;">Use the verification code below to reset your password. This code will expire in 10 minutes.</p>
            <div style="background-color: #f8fafc; padding: 15px; text-align: center; border-radius: 8px; margin: 20px 0;">
              <h1 style="color: #dc2626; letter-spacing: 5px; margin: 0;">${otpCode}</h1>
            </div>
          </div>
        `
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Brevo API Error Response:", errorData);
      throw new Error(errorData.message || "Failed to send email via Brevo API");
    }

    res.status(200).json({ success: true, message: "OTP sent to your email." });
  } catch (error: any) {
    console.error("Password Reset OTP Error Details:", error);
    res.status(500).json({ success: false, message: "Error sending OTP." });
  }
};

// 3. VERIFY OTP & UPDATE PASSWORD
export const resetPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, otp, newPassword } = req.body;

    const validOtp = await (Otp as any).findOne({ email, otp });
    if (!validOtp) {
      res.status(400).json({ success: false, message: "Invalid or expired OTP." });
      return;
    }

    const user = await User.findOne({ email });
    if (!user) {
        res.status(404).json({ success: false, message: "User not found." });
        return;
    }

    // IMPORTANT: Make sure your User model has a pre-save hook for hashing!
    user.password = newPassword; 
    await user.save();

    await Otp.deleteOne({ email });

    res.status(200).json({ success: true, message: "Password updated successfully!" });
  } catch (error: any) {
    res.status(500).json({ success: false, message: "Error resetting password." });
  }
};

// 4. REGISTER A NEW USER
export const registerUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { 
      firstName, lastName, email, password, department, 
      semester, section, otp, isAlumni, currentPosition 
    } = req.body;

    // VERIFY OTP FIRST
    const validOtp = await (Otp as any).findOne({ email, otp });
    if (!validOtp) {
      res.status(400).json({ success: false, message: "Invalid or expired verification code." });
      return;
    }

    const userExists = await User.findOne({ email });
    if (userExists) {
      res.status(400).json({ success: false, message: 'User already exists with this email' });
      return;
    }

    // IBA EMAIL PARSING LOGIC
    const emailMatch = email.match(/\.([bm])[a-z]*(\d{2})@/i);
    let calculatedGradYear = null;
    let admissionYear = null;

    if (emailMatch) {
        const degreeType = emailMatch[1].toLowerCase(); 
        const yearDigits = parseInt(emailMatch[2]); 
        admissionYear = 2000 + yearDigits; 

        calculatedGradYear = degreeType === 'b' ? admissionYear + 4 : admissionYear + 2;
    }

    const currentYear = new Date().getFullYear();

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

    const user = await User.create({
      firstName,
      lastName,
      email,
      password,
      department,
      semester: isAlumni ? 'Graduated' : semester, 
      section: isAlumni ? '' : section, 
      isAlumni: isAlumni || false,
      graduationYear: calculatedGradYear,
      batch: admissionYear ? admissionYear.toString() : '',
      currentPosition: currentPosition || '',
    });

    if (user) {
      await Otp.deleteOne({ email });
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