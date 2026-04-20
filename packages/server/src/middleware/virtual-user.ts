import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { db } from '../db/connection.js';
import { users } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { config } from '../config.js';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
  };
}

export function virtualUser(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  const token = authHeader.slice(7);
  
  let decoded: jwt.JwtPayload;
  try {
    decoded = jwt.verify(token, config.JWT_SECRET) as jwt.JwtPayload;
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
  
  if (!decoded.userId) {
    return res.status(401).json({ error: 'Invalid token payload' });
  }
  
  const userRecords = db.select().from(users).where(eq(users.id, decoded.userId)).limit(1);
  const userArray = userRecords.all();
  
  if (userArray.length === 0) {
    return res.status(401).json({ error: 'User not found' });
  }
  
  const user = userArray[0];
  
  (req as AuthenticatedRequest).user = {
    id: user.id,
    email: user.email,
    role: user.role,
  };
  
  next();
}