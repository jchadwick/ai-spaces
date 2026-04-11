import { Hono } from 'hono';
import { getAuditLog } from '../audit.js';
import { authMiddleware } from '../middleware/auth.js';

export const auditRouter = new Hono();

auditRouter.get('/', authMiddleware, (c) => {
  const userId = c.get('userId') as string;
  const limit = parseInt(c.req.query('limit') || '50', 10);
  const spaceId = c.req.query('spaceId') || undefined;
  
  const entries = getAuditLog(limit, spaceId, userId);
  
  return c.json({ entries });
});