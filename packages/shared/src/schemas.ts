import { z } from 'zod';

export const SpaceConfigSchema = z.object({
  id: z.string().min(1).max(100).optional(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  agent: z.object({
    capabilities: z.array(z.string()).optional(),
    denied: z.array(z.string()).optional(),
  }).optional(),
  notificationIgnorePatterns: z.array(z.string()).optional(),
});

export const SpaceSchema = z.object({
  id: z.string(),
  path: z.string(),
  configPath: z.string(),
  config: SpaceConfigSchema,
});

export const SessionContextSchema = z.object({
  type: z.literal('space'),
  spaceId: z.string(),
  spacePath: z.string(),
  agentId: z.string(),
  userId: z.string(),
  role: z.enum(['owner', 'editor', 'viewer']),
  sessionKey: z.string(),
  
  deniedTools: z.array(z.string()),
  allowedTools: z.array(z.string()),
  
  skipFiles: z.array(z.string()),
  contextFiles: z.array(z.string()),
  
  effectiveWorkspaceRoot: z.string(),
});

export interface FileNodeType {
  name: string;
  type: 'file' | 'directory' | 'space';
  path: string;
  spaceId?: string;
  children?: FileNodeType[];
  size?: number;
  modified?: string;
}

export const FileNodeSchema: z.ZodType<FileNodeType> = z.object({
  name: z.string(),
  type: z.enum(['file', 'directory', 'space']),
  path: z.string(),
  spaceId: z.string().optional(),
  children: z.lazy(() => z.array(FileNodeSchema)).optional(),
  size: z.number().optional(),
  modified: z.string().optional(),
});

export const FileTreeResponseSchema = z.object({
  files: z.array(FileNodeSchema),
});

export const FileContentResponseSchema = z.object({
  path: z.string(),
  content: z.string().optional(),
  contentType: z.enum(['markdown', 'text', 'image', 'binary']),
  size: z.number().optional(),
  modified: z.string().optional(),
});

export const UserRoleSchema = z.enum(['admin', 'user']);

export const ServerRoleSchema = z.enum(['admin', 'user']);

export const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  displayName: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const SessionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  refreshToken: z.string(),
  expiresAt: z.string().datetime(),
  createdAt: z.string().datetime(),
});

export const AuthTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number(),
});

export const FileMetadataEntrySchema = z.object({
  displayName: z.string().optional(),
  summary: z.string().optional(),
});

export const SpaceMetadataSchema = z.object({
  files: z.record(z.string(), FileMetadataEntrySchema),
});