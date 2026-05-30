import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import {
  getUserForLogin,
  getUserWithServerRole,
  verifyPassword,
  hashPassword,
  createUser,
  getUserPasswordHash,
  updateUser,
  updateUserPassword,
  findOrCreateOAuthUser,
} from '../user-service.js';
import type { UserWithServerRole } from '../db/index.js';
import jwt from 'jsonwebtoken';
import { config, isGoogleOAuthEnabled, getGoogleOAuthRedirectUri, getOAuthReturnOrigin } from '../config.js';
import { authMiddleware, type AuthVariables } from '../middleware/auth.js';
import * as arctic from 'arctic';

export const authRouter = new Hono<{ Variables: AuthVariables }>();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().optional(),
});

const updateProfileSchema = z.object({
  displayName: z.string().max(100).optional(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

// @ts-ignore -- tsgo TS2589: type instantiation depth limit on Hono+zValidator chains
authRouter.post('/login', zValidator('json', loginSchema), async (c) => {
  console.log('[DEBUG] Login route entered');
  const { email, password } = c.req.valid('json');
  console.log('[DEBUG] Login attempt for:', email);

  const result = getUserForLogin(email);
  console.log('[DEBUG] User found:', !!result);

  if (!result) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }

  const validPassword = await verifyPassword(password, result.passwordHash);
  console.log('[DEBUG] Password valid:', validPassword);

  if (!validPassword) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }

  const { accessToken, refreshToken } = generateTokens(result.user);

  return c.json({
    accessToken,
    refreshToken,
    user: {
      id: result.user.id,
      email: result.user.email,
      displayName: result.user.displayName,
      serverRole: result.user.serverRole,
    }
  });
});

authRouter.post('/logout', (c) => {
  return c.json({ success: true });
});

// @ts-ignore -- tsgo TS2589: type instantiation depth limit on Hono+zValidator chains
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

  const user = getUserWithServerRole(decoded.userId);

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
      displayName: user.displayName,
      serverRole: user.serverRole,
    }
  });
});

// @ts-ignore -- tsgo TS2589: type instantiation depth limit on Hono+zValidator chains
authRouter.post('/register', zValidator('json', registerSchema), async (c) => {
  if (!config.ALLOW_OPEN_REGISTRATION) {
    return c.json({ error: 'Registration is not open' }, 403);
  }

  const { email, password, displayName } = c.req.valid('json');

  try {
    const passwordHash = await hashPassword(password);
    createUser(email, passwordHash, 'user', displayName);
    return c.json({ success: true }, 201);
  } catch (err) {
    if (err instanceof Error && err.message.includes('already exists')) {
      return c.json({ error: 'Email already registered.' }, 409);
    }
    throw err;
  }
});

authRouter.get('/me', authMiddleware, (c) => {
  const { userId } = c.get('user');
  const user = getUserWithServerRole(userId);

  if (!user) {
    return c.json({ error: 'User not found' }, 404);
  }

  return c.json({
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    serverRole: user.serverRole,
  });
});

// @ts-ignore -- tsgo TS2589: type instantiation depth limit on Hono+zValidator chains
authRouter.put('/me', authMiddleware, zValidator('json', updateProfileSchema), (c) => {
  const { userId } = c.get('user');
  const { displayName } = c.req.valid('json');
  const user = updateUser(userId, { displayName });

  if (!user) {
    return c.json({ error: 'User not found' }, 404);
  }

  const userWithRole = getUserWithServerRole(user.id);
  return c.json({
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    serverRole: userWithRole?.serverRole ?? 'user',
  });
});

// @ts-ignore -- tsgo TS2589: type instantiation depth limit on Hono+zValidator chains
authRouter.put('/me/password', authMiddleware, zValidator('json', changePasswordSchema), async (c) => {
  const { userId } = c.get('user');
  const { currentPassword, newPassword } = c.req.valid('json');

  const existingHash = getUserPasswordHash(userId);
  if (!existingHash) {
    return c.json({ error: 'Password authentication not available' }, 400);
  }

  const isCurrentPasswordValid = await verifyPassword(currentPassword, existingHash);
  if (!isCurrentPasswordValid) {
    return c.json({ error: 'Current password is incorrect' }, 401);
  }

  const nextHash = await hashPassword(newPassword);
  const updated = updateUserPassword(userId, nextHash);

  if (!updated) {
    return c.json({ error: 'Failed to update password' }, 500);
  }

  return c.json({ success: true });
});

// GET /api/auth/providers - Returns available authentication providers
authRouter.get('/providers', (c) => {
  return c.json({
    password: true,
    google: isGoogleOAuthEnabled(),
  });
});

// GET /api/auth/google - Initiates Google OAuth flow
authRouter.get('/google', (c) => {
  if (!isGoogleOAuthEnabled()) {
    return c.json({ error: 'Google OAuth is not configured' }, 400);
  }

  const google = new arctic.Google(
    config.GOOGLE_CLIENT_ID,
    config.GOOGLE_CLIENT_SECRET,
    getGoogleOAuthRedirectUri()
  );

  const state = arctic.generateState();
  const codeVerifier = arctic.generateCodeVerifier();
  const scopes = ['openid', 'email', 'profile'];

  const authUrl = google.createAuthorizationURL(state, codeVerifier, scopes);
  const returnOrigin = getOAuthReturnOrigin(c.req.query('returnOrigin'));
  
  // Request refresh token for offline access
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');

  // Set cookies for state and codeVerifier validation
  setCookie(c, 'oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax',
    maxAge: 60 * 10, // 10 minutes
    path: '/',
  });

  setCookie(c, 'oauth_code_verifier', codeVerifier, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax',
    maxAge: 60 * 10, // 10 minutes
    path: '/',
  });

  setCookie(c, 'oauth_return_origin', returnOrigin, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax',
    maxAge: 60 * 10, // 10 minutes
    path: '/',
  });

  return c.redirect(authUrl.toString());
});

// GET /api/auth/google/callback - Handles Google OAuth callback
authRouter.get('/google/callback', async (c) => {
  if (!isGoogleOAuthEnabled()) {
    return c.json({ error: 'Google OAuth is not configured' }, 400);
  }

  const code = c.req.query('code');
  const state = c.req.query('state');
  const storedState = getCookie(c, 'oauth_state');
  const storedCodeVerifier = getCookie(c, 'oauth_code_verifier');
  const returnOrigin = getOAuthReturnOrigin(getCookie(c, 'oauth_return_origin'));

  // Clear the cookies
  deleteCookie(c, 'oauth_state', { path: '/' });
  deleteCookie(c, 'oauth_code_verifier', { path: '/' });
  deleteCookie(c, 'oauth_return_origin', { path: '/' });

  if (!code || !state || !storedState || !storedCodeVerifier) {
    return c.json({ error: 'Invalid OAuth request' }, 400);
  }

  if (state !== storedState) {
    return c.json({ error: 'Invalid state parameter' }, 400);
  }

  const google = new arctic.Google(
    config.GOOGLE_CLIENT_ID,
    config.GOOGLE_CLIENT_SECRET,
    getGoogleOAuthRedirectUri()
  );

  let tokens: arctic.OAuth2Tokens;
  try {
    tokens = await google.validateAuthorizationCode(code, storedCodeVerifier);
  } catch (e) {
    console.error('[Google OAuth] Code exchange failed:', e);
    if (e instanceof arctic.OAuth2RequestError) {
      return c.json({ error: 'Failed to exchange authorization code' }, 400);
    }
    if (e instanceof arctic.ArcticFetchError) {
      return c.json({ error: 'Failed to contact Google' }, 503);
    }
    return c.json({ error: 'OAuth exchange failed' }, 500);
  }

  // Decode ID token to get user info
  const idToken = tokens.idToken();
  if (!idToken) {
    return c.json({ error: 'No ID token received from Google' }, 500);
  }

  let claims: arctic.IdTokenClaims;
  try {
    claims = arctic.decodeIdToken(idToken);
  } catch (e) {
    console.error('[Google OAuth] Failed to decode ID token:', e);
    return c.json({ error: 'Invalid ID token' }, 500);
  }

  const oauthId = claims.sub;
  const email = (claims as Record<string, string>).email;
  const displayName = (claims as Record<string, string>).name;

  if (!email) {
    return c.json({ error: 'Google did not provide an email address' }, 400);
  }

  // Find or create user
  let user: UserWithServerRole;
  try {
    user = findOrCreateOAuthUser('google', oauthId, email, displayName);
  } catch (e) {
    console.error('[Google OAuth] Failed to find or create user:', e);
    return c.json({ error: 'Failed to create user account' }, 500);
  }

  // Generate JWT tokens
  const { accessToken, refreshToken } = generateTokens(user);

  // Redirect to frontend callback page with tokens
  const callbackUrl = new URL('/auth/callback', returnOrigin);
  callbackUrl.searchParams.set('accessToken', accessToken);
  callbackUrl.searchParams.set('refreshToken', refreshToken);

  return c.redirect(callbackUrl.toString());
});

function generateTokens(user: UserWithServerRole): { accessToken: string; refreshToken: string } {
  const accessToken = jwt.sign(
    { userId: user.id, email: user.email, serverRole: user.serverRole },
    config.JWT_SECRET,
    { expiresIn: '1h' }
  );

  const refreshToken = jwt.sign(
    { userId: user.id, type: 'refresh' },
    config.JWT_REFRESH_SECRET,
    { expiresIn: '7d' }
  );

  return { accessToken, refreshToken };
}

export type AuthRouter = typeof authRouter;
