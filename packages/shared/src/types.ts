import type { z } from 'zod';
import type { SpaceConfigSchema, SpaceSchema, ShareSchema, SessionContextSchema } from './schemas.js';
import type { FileNodeType } from './schemas.js';

export type SpaceConfig = z.infer<typeof SpaceConfigSchema>;
export type Space = z.infer<typeof SpaceSchema>;
export type Share = z.infer<typeof ShareSchema>;
export type SessionContext = z.infer<typeof SessionContextSchema>;
export type FileNode = FileNodeType;

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