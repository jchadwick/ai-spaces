import { createMiddleware } from 'hono/factory';
import jwt from 'jsonwebtoken';

export const ACCESS_SECRET = process.env.JWT_SECRET || 'ai-spaces-dev-secret-change-in-production';
export const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'ai-spaces-refresh-secret-change-in-production';

export interface AuthVariables {
  user: {
    userId: string;
    email: string;
    role: string;
  };
}

export const authMiddleware = createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'No token provided' }, 401);
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, ACCESS_SECRET) as jwt.JwtPayload;
    
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
    if (error instanceof jwt.TokenExpiredError) {
      return c.json({ error: 'Token expired', code: 'TOKEN_EXPIRED' }, 401);
    }
    return c.json({ error: 'Invalid token' }, 401);
  }
});

export function verifyRefreshToken(token: string): jwt.JwtPayload | null {
  try {
    const decoded = jwt.verify(token, REFRESH_SECRET) as jwt.JwtPayload;
    if (decoded.type !== 'refresh' || !decoded.userId) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}