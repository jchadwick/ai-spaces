import { createMiddleware } from 'hono/factory';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { getUserWithServerRole } from '../db/queries.js';

export interface AuthVariables {
  user: {
    userId: string;
    email: string;
    serverRole: 'admin' | 'user';
  };
}

export const authMiddleware = createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
  if (process.env.NODE_ENV !== 'production' && process.env.DEV_VIRTUAL_USER === 'true') {
    c.set('user', {
      userId: 'dev-user-00000000-0000-0000-0000-000000000000',
      email: 'dev@local',
      serverRole: 'admin',
    });
    return next();
  }

  const authHeader = c.req.header('Authorization');

  const queryToken = c.req.query('token');
  const rawToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : queryToken;

  if (!rawToken) {
    return c.json({ error: 'No token provided' }, 401);
  }

  const token = rawToken;

  try {
    const decoded = jwt.verify(token, config.JWT_SECRET) as jwt.JwtPayload;

    if (!decoded.userId) {
      return c.json({ error: 'Invalid token' }, 401);
    }

    const user = getUserWithServerRole(decoded.userId);
    if (!user) {
      return c.json({ error: 'User no longer exists' }, 401);
    }

    c.set('user', {
      userId: user.id,
      email: user.email,
      serverRole: user.serverRole,
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
    const decoded = jwt.verify(token, config.JWT_REFRESH_SECRET) as jwt.JwtPayload;
    if (decoded.type !== 'refresh' || !decoded.userId) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}
