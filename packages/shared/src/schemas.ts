import { z } from 'zod';

export const SpaceConfigSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  collaborators: z.array(z.object({
    email: z.string().email().optional(),
    name: z.string().optional(),
    role: z.enum(['viewer', 'editor', 'admin']),
  })).optional(),
  agent: z.object({
    capabilities: z.array(z.string()).optional(),
    denied: z.array(z.string()).optional(),
  }).optional(),
});

export const SpaceSchema = z.object({
  id: z.string(),
  path: z.string(),
  configPath: z.string(),
  config: SpaceConfigSchema,
});

export const ShareSchema = z.object({
  id: z.string(),
  token: z.string(),
  spaceId: z.string(),
  spacePath: z.string(),
  role: z.enum(['viewer', 'editor', 'admin']),
  created: z.string().datetime(),
  expires: z.string().datetime().optional(),
  label: z.string().max(100).optional(),
  revoked: z.boolean().optional(),
  revokedAt: z.string().datetime().optional(),
});

export const SessionContextSchema = z.object({
  type: z.literal('space'),
  spaceId: z.string(),
  spacePath: z.string(),
  agentId: z.string(),
  shareToken: z.string(),
  role: z.enum(['viewer', 'editor', 'admin']),
  sessionKey: z.string(),
  
  deniedTools: z.array(z.string()),
  allowedTools: z.array(z.string()),
  
  skipFiles: z.array(z.string()),
  contextFiles: z.array(z.string()),
  
  effectiveWorkspaceRoot: z.string(),
});

export const ShareStoreSchema = z.object({
  shares: z.record(ShareSchema),
  byToken: z.record(z.string()),
});

export interface FileNodeType {
  name: string;
  type: 'file' | 'directory';
  path: string;
  children?: FileNodeType[];
  size?: number;
  modified?: string;
}

export const FileNodeSchema: z.ZodType<FileNodeType> = z.object({
  name: z.string(),
  type: z.enum(['file', 'directory']),
  path: z.string(),
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