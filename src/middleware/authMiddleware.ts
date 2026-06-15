import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import User, { IUser } from '../models/User';

export interface AuthRequest extends Request {
  user?: IUser;
}

export const protect = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  let token;

  // 🚀 THE FIX: 1. Check for the Bearer token in the headers FIRST
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  } 
  // 2. Fallback to checking cookies (for backward compatibility)
  else if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }

  // 3. Reject if no token is found
  if (!token || token === 'none') {
    console.log("Auth Middleware: No valid token found in headers or cookies.");
    res.status(401).json({ success: false, message: 'Not authorized, no valid token provided' });
    return;
  }

  try {
    // 4. Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as { id: string };

    // 5. Fetch user
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

// Optional Auth for public routes
export const optionalAuth = async (req: Request | any, res: Response, next: NextFunction): Promise<void> => {
  let token;
  
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