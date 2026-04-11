import type { IncomingMessage } from 'http';
import jwt from 'jsonwebtoken';

// Use the same secret as auth.ts
const ACCESS_SECRET = process.env.JWT_SECRET || 'ai-spaces-dev-secret-change-in-production';

/**
 * Extended IncomingMessage with user info
 */
export interface AuthenticatedRequest extends IncomingMessage {
  user?: {
    userId: string;
    email: string;
    role: string;
  };
}

/**
 * Session validation middleware
 * Validates JWT tokens from Authorization header
 * 
 * @param req - The incoming HTTP request
 * @returns The decoded token payload if valid, or null if invalid/missing
 */
export function validateSession(req: IncomingMessage): jwt.JwtPayload | null {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return null;
  }

  // Expect format: "Bearer <token>"
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }

  const token = parts[1];

  try {
    const decoded = jwt.verify(token, ACCESS_SECRET) as jwt.JwtPayload;
    return decoded;
  } catch {
    return null;
  }
}

/**
 * Create authenticated request by attaching user info to the request object
 * 
 * @param req - The incoming HTTP request
 * @returns The authenticated request with user info attached, or original request if invalid
 */
export function createAuthenticatedRequest(req: IncomingMessage): IncomingMessage {
  const payload = validateSession(req);

  if (payload) {
    // Attach user info to the request
    (req as AuthenticatedRequest).user = {
      userId: payload.userId as string,
      email: payload.email as string,
      role: payload.role as string,
    };
  }

  return req;
}
