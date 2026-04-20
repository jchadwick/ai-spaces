import { createMiddleware } from 'hono/factory';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export interface AuthVariables {
  user: {
    userId: string;
    email: string;
    role: string;
  };
}

export const authMiddleware = createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
  const authHeader = c.req.header('Authorization');
  const path = c.req.path;
  console.log('[DEBUG-AUTH] Path:', path, 'Auth:', authHeader?.substring(0, 30));

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.log('[DEBUG-AUTH] No token');
    return c.json({ error: 'No token provided' }, 401);
  }

  const token = authHeader.substring(7);

  try {
    console.log('[DEBUG-AUTH] Verifying with secret:', config.JWT_SECRET);
    const decoded = jwt.verify(token, config.JWT_SECRET) as jwt.JwtPayload;
    console.log('[DEBUG-AUTH] Decoded:', decoded);
    
    if (!decoded.userId) {
      return c.json({ error: 'Invalid token' }, 401);
    }

    c.set('user', {
      userId: decoded.userId,
      email: decoded.email || '',
      role: decoded.role || 'user',
    });

    await next();
  } catch (error) {
    console.log('[DEBUG-AUTH] Verify error:', error);
    if (error instanceof jwt.TokenExpiredError) {
      return c.json({ error: 'Token expired', code: 'TOKEN_EXPIRED' }, 401);
    }
    return c.json({ error: 'Invalid token' }, 401);
  }
});

export function verifyRefreshToken(token: string): jwt.JwtPayload | null {
  try {
    const decoded = jwt.verify(token, config.JWT_REFRESH_SECRET) as jwt.JwtPayload;
    if (decoded.type !== 'refresh' || !decoded.userId) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}