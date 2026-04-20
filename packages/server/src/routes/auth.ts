import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { getUserByEmail, getUserById, verifyPassword } from '../user-service.js';
import type { User } from '@ai-spaces/shared';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export const authRouter = new Hono();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

authRouter.post('/login', zValidator('json', loginSchema), async (c) => {
  console.log('[DEBUG] Login route entered');
  const { email, password } = c.req.valid('json');
  console.log('[DEBUG] Login attempt for:', email);

  const user = getUserByEmail(email);
  console.log('[DEBUG] User found:', !!user);

  if (!user) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }

  const validPassword = await verifyPassword(password, user.passwordHash);
  console.log('[DEBUG] Password valid:', validPassword);

  if (!validPassword) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }

  const { accessToken, refreshToken } = generateTokens(user);

  return c.json({
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      displayName: user.displayName
    }
  });
});

authRouter.post('/logout', (c) => {
  return c.json({ success: true });
});

authRouter.post('/refresh', zValidator('json', refreshSchema), async (c) => {
  const { refreshToken } = c.req.valid('json');

  let decoded: jwt.JwtPayload;
  try {
    decoded = jwt.verify(refreshToken, config.JWT_REFRESH_SECRET) as jwt.JwtPayload;
  } catch {
    return c.json({ error: 'Invalid or expired refresh token' }, 401);
  }

  if (decoded.type !== 'refresh' || !decoded.userId) {
    return c.json({ error: 'Invalid refresh token' }, 401);
  }

  const user = getUserById(decoded.userId);

  if (!user) {
    return c.json({ error: 'User no longer exists' }, 401);
  }

  const { accessToken, refreshToken: newRefreshToken } = generateTokens(user);

  return c.json({
    accessToken,
    refreshToken: newRefreshToken,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      displayName: user.displayName
    }
  });
});

function generateTokens(user: User): { accessToken: string; refreshToken: string } {
  const accessToken = jwt.sign(
    { userId: user.id, email: user.email, role: user.role },
    config.JWT_SECRET,
    { expiresIn: '1h'}
  );

  const refreshToken = jwt.sign(
    { userId: user.id, type: 'refresh' },
    config.JWT_REFRESH_SECRET,
    { expiresIn: '7d' }
  );
  
  return { accessToken, refreshToken };
}

export type AuthRouter = typeof authRouter;