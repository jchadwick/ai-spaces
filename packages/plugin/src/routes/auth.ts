import type { IncomingMessage, ServerResponse } from 'http';
import { getUserByEmail, getUserById } from '../user-store.js';
import { verifyPassword } from '../password-utils.js';
import type { User } from '@ai-spaces/shared';
import jwt from 'jsonwebtoken';

const ACCESS_SECRET = process.env.JWT_SECRET || 'ai-spaces-dev-secret-change-in-production';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'ai-spaces-refresh-secret-change-in-production';

interface LoginRequest {
  email: string;
  password: string;
}

interface RefreshRequest {
  refreshToken: string;
}

export async function handleLogin(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return true;
  }

  let body = '';
  await new Promise<void>((resolve) => {
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => { resolve(); });
  });

  let loginData: LoginRequest;
  try {
    loginData = JSON.parse(body);
  } catch {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end(JSON.stringify({ error: 'Invalid JSON' }));
    return true;
  }

  if (!loginData.email || !loginData.password) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end(JSON.stringify({ error: 'Email and password required' }));
    return true;
  }

  const user = getUserByEmail(loginData.email);

  if (!user) {
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end(JSON.stringify({ error: 'Invalid credentials' }));
    return true;
  }

  const validPassword = await verifyPassword(loginData.password, user.passwordHash);

  if (!validPassword) {
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end(JSON.stringify({ error: 'Invalid credentials' }));
    return true;
  }

  const { accessToken, refreshToken } = generateTokens(user);

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.end(JSON.stringify({
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      displayName: user.displayName
    }
  }));

  return true;
}

export async function handleLogout(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.end(JSON.stringify({ success: true }));
  return true;
}

export async function handleRefreshToken(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return true;
  }

  let body = '';
  await new Promise<void>((resolve) => {
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => { resolve(); });
  });

  let refreshData: RefreshRequest;
  try {
    refreshData = JSON.parse(body);
  } catch {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end(JSON.stringify({ error: 'Invalid JSON' }));
    return true;
  }

  if (!refreshData.refreshToken) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end(JSON.stringify({ error: 'Refresh token required' }));
    return true;
  }

  let decoded: jwt.JwtPayload;
  try {
    decoded = jwt.verify(refreshData.refreshToken, REFRESH_SECRET) as jwt.JwtPayload;
  } catch {
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end(JSON.stringify({ error: 'Invalid or expired refresh token' }));
    return true;
  }

  if (decoded.type !== 'refresh' || !decoded.userId) {
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end(JSON.stringify({ error: 'Invalid refresh token' }));
    return true;
  }

  const user = getUserById(decoded.userId);

  if (!user) {
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end(JSON.stringify({ error: 'User no longer exists' }));
    return true;
  }

  const { accessToken, refreshToken } = generateTokens(user);

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.end(JSON.stringify({
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      displayName: user.displayName
    }
  }));

  return true;
}

function generateTokens(user: User): { accessToken: string; refreshToken: string } {
  const accessToken = jwt.sign(
    { userId: user.id, email: user.email, role: user.role },
    ACCESS_SECRET,
    { expiresIn: '1h'}
  );
  
  const refreshToken = jwt.sign(
    { userId: user.id, type: 'refresh' },
    REFRESH_SECRET,
    { expiresIn: '7d' }
  );
  
  return { accessToken, refreshToken };
}
