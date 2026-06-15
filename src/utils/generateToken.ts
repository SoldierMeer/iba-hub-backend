import { Response } from 'express';
import jwt from 'jsonwebtoken';

const generateToken = (res: Response, userId: string): void => {
  const token = jwt.sign({ id: userId }, process.env.JWT_SECRET as string, {
    expiresIn: '30d',
  });

  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax', // CHANGED FROM 'strict' TO 'lax'
    path: '/', 
    maxAge: 30 * 24 * 60 * 60 * 1000
  });
};

export default generateToken;