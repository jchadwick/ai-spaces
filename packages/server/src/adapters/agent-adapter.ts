import type { SpaceRecord } from '../space-store.js';
import type { SpaceRole, SpaceMetadata, FileMetadataEntry, FileNodeType } from '@ai-spaces/shared';

export type FileNode = FileNodeType;

export interface AgentAdapter {
  listFiles(space: SpaceRecord, dirPath: string, role: SpaceRole): Promise<FileNode[]>;
  readFile(space: SpaceRecord, filePath: string, role: SpaceRole): Promise<{ content: string; contentType: string }>;
  writeFile(space: SpaceRecord, filePath: string, content: string, encoding?: 'utf-8' | 'base64'): Promise<void>;
  deleteFile(space: SpaceRecord, filePath: string): Promise<void>;
  renameFile(space: SpaceRecord, filePath: string, newPath: string): Promise<void>;
  createDirectory(space: SpaceRecord, dirPath: string): Promise<void>;
  deleteDirectory(space: SpaceRecord, dirPath: string): Promise<void>;
  renameDirectory(space: SpaceRecord, dirPath: string, newPath: string): Promise<void>;
  getMetadata(space: SpaceRecord): Promise<SpaceMetadata>;
  patchMetadata(space: SpaceRecord, files: Record<string, Partial<FileMetadataEntry>>): Promise<void>;
  getCircuitStatus(): 'CLOSED' | 'OPEN' | 'HALF_OPEN';
}
