import type { z } from 'zod';
import type { SpaceConfigSchema, SpaceSchema, SessionContextSchema, UserRoleSchema, UserSchema, SessionSchema, AuthTokensSchema } from './schemas.js';
import type { FileNodeType } from './schemas.js';

export type SpaceConfig = z.infer<typeof SpaceConfigSchema>;
export type Space = z.infer<typeof SpaceSchema>;
export type SessionContext = z.infer<typeof SessionContextSchema>;
export type FileNode = FileNodeType;
export type UserRoleType = z.infer<typeof UserRoleSchema>;
export type UserType = z.infer<typeof UserSchema>;
export type SessionType = z.infer<typeof SessionSchema>;
export type AuthTokensType = z.infer<typeof AuthTokensSchema>;

export type Role = 'viewer' | 'editor' | 'admin';

export interface CollaboratorConfig {
  email?: string;
  name?: string;
  role: Role;
}

export interface AgentConfig {
  capabilities?: string[];
  denied?: string[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface WebSocketMessage {
  type: 'req' | 'res' | 'event';
  id?: string;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { code: number; message: string };
  event?: string;
  payload?: unknown;
}

export type UserRole = 'admin' | 'owner' | 'viewer' | 'editor';

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  displayName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Session {
  id: string;
  userId: string;
  refreshToken: string;
  expiresAt: string;
  createdAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}