import type { Context } from 'hono';
import type { AuthVariables } from './middleware/auth.js';

export type AppContext = Context<{
  Variables: AuthVariables;
}>;

export interface UserPayload {
  userId: string;
  email: string;
  isAdmin: boolean;
}

declare module 'hono' {
  interface ContextVariableMap extends AuthVariables {}
}

export function getUser(c: AppContext) {
  return c.get('user');
}

export function getUserId(c: AppContext): string {
  const user = c.get('user');
  return user?.userId || '';
}

export function getUserEmail(c: AppContext): string {
  const user = c.get('user');
  return user?.email || '';
}

export function getUserIsAdmin(c: AppContext): boolean {
  const user = c.get('user');
  return user?.isAdmin ?? false;
}