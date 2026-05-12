import type { SpaceRecord } from '../space-store.js';
import type { WorkspaceSpaceRecord, SpaceRole } from '@ai-spaces/shared';

export interface FileNode {
  name: string;
  type: 'file' | 'directory' | 'space';
  path: string;
  spaceId?: string;
  size?: number;
  modified: string;
}

export interface AgentAdapter {
  listFiles(space: SpaceRecord, dirPath: string, role: SpaceRole): Promise<FileNode[]>;
  readFile(space: SpaceRecord, filePath: string): Promise<{ content: string; contentType: string }>;
  writeFile(space: SpaceRecord, filePath: string, content: string, encoding?: 'utf-8' | 'base64'): Promise<void>;
  deleteFile(space: SpaceRecord, filePath: string): Promise<void>;
  renameFile(space: SpaceRecord, filePath: string, newPath: string): Promise<void>;
  createDirectory(space: SpaceRecord, dirPath: string): Promise<void>;
  deleteDirectory(space: SpaceRecord, dirPath: string): Promise<void>;
  renameDirectory(space: SpaceRecord, dirPath: string, newPath: string): Promise<void>;
  scanSpaces(): Promise<WorkspaceSpaceRecord[]>;
}
