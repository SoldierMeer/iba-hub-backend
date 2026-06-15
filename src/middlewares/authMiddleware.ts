import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import User, { IUser } from '../models/User';

export interface AuthRequest extends Request {
  user?: IUser;
}

export const protect = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  // Debug: Log incoming cookies to see if the browser sent the 'token'
  // console.log("Cookies received:", req.cookies); 
  console.log("Cookies received by server:", req.cookies);
  let token = req.cookies?.token;

  // 1. Check if token exists
  if (!token || token === 'none') {
    console.log("Auth Middleware: No valid token found in cookies.");
    res.status(401).json({ success: false, message: 'Not authorized, no valid token provided' });
    return;
  }

  try {
    // 2. Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as { id: string };

    // 3. Fetch user
    const user = await User.findById(decoded.id).select('-password');

    if (!user) {
      console.log("Auth Middleware: Token valid, but user not found in DB.");
      res.status(401).json({ success: false, message: 'Not authorized, user not found' });
      return;
    }

    req.user = user;
    next();
  } catch (error) {
    console.error("Auth Middleware: JWT Verification Failed:", error);
    res.status(401).json({ success: false, message: 'Not authorized, token failed or expired' });
  }
};


// Grant access to specific roles (e.g., 'admin', 'moderator')
export const authorizeRoles = (...roles: string[]) => {
    return (req: AuthRequest | any, res: Response, next: NextFunction): void => {
      if (!req.user || !roles.includes(req.user.role)) {
        res.status(403).json({ 
          success: false, 
          message: `User role '${req.user?.role || 'Guest'}' is not authorized to access this route` 
        });
        return;
      }
      next();
    };
};

// 🚀 NEW: Optional Auth for public routes
export const optionalAuth = async (req: Request | any, res: Response, next: NextFunction): Promise<void> => {
  let token;
  
  // Check for token in headers or cookies
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
  }

  if (token) {
      try {
          const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as any;
          req.user = await User.findById(decoded.id).select('-password');
      } catch (error) {
          // Ignore errors (like expired tokens), just treat them as a guest
      }
  }
  
  next(); // Always proceed to the controller!
};