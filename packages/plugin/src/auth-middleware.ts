import type { IncomingMessage, ServerResponse } from 'http';
import { validateSession, type AuthenticatedRequest } from './session-middleware.js';

/**
 * Sets JSON response headers for auth errors
 */
function setJsonHeaders(res: ServerResponse): void {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
}

/**
 * Auth middleware that requires valid JWT token for protected routes.
 * 
 * @param req - The incoming request
 * @param res - The server response
 * @returns True if authentication succeeded, false otherwise
 * 
 * Behavior:
 * - Returns 401 if no token provided
 * - Returns 403 if token is invalid/expired
 * - Attaches user info to request.user on success
 */
export async function requireAuth(
  req: AuthenticatedRequest,
  res: ServerResponse
): Promise<boolean> {
  // Use the session validation middleware
  const payload = validateSession(req);
  
  // No token provided or invalid
  if (!payload) {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      // No token at all - 401
      res.statusCode = 401;
      setJsonHeaders(res);
      res.end(JSON.stringify({ error: 'No token provided' }));
    } else {
      // Token provided but invalid - 403
      res.statusCode = 403;
      setJsonHeaders(res);
      res.end(JSON.stringify({ error: 'Invalid or expired token' }));
    }
    return false;
  }
  
  // Attach user info to request for downstream handlers
  req.user = {
    userId: payload.userId as string,
    email: payload.email as string,
    role: payload.role as string,
  };
  
  return true;
}

/**
 * Wrapper for route handlers that require authentication.
 * Use this to wrap existing handlers:
 * 
 * ```typescript
 * export async function handleProtectedRoute(req, res) {
 *   const authenticated = await requireAuth(req, res);
 *   if (!authenticated) return;
 *   
 *   // Your protected route logic here
 *   // Access user info via req.user
 * }
 * ```
 */
export function withAuth<T extends AuthenticatedRequest>(
  handler: (req: T, res: ServerResponse) => Promise<boolean>
) {
  return async function authWrapper(req: T, res: ServerResponse): Promise<boolean> {
    const authenticated = await requireAuth(req, res);
    if (!authenticated) return false;
    return handler(req, res);
  };
}

// Re-export AuthenticatedRequest for consumers
export type { AuthenticatedRequest } from './session-middleware.js';
