import type { SpaceRecord } from '../space-store.js';
import type { SpaceMetadata, FileMetadataEntry, FileNodeType, WorkspacePathFacts } from '@ai-spaces/shared';

export type FileNode = FileNodeType;

export interface AgentAdapter {
  resolvePath(space: SpaceRecord, filePath: string): Promise<WorkspacePathFacts>;
  listFiles(space: SpaceRecord, dirPath: string, includeHidden: boolean, resolutionToken: string): Promise<FileNode[]>;
  readFile(space: SpaceRecord, filePath: string, resolutionToken: string): Promise<{ content: string; contentType: string }>;
  writeFile(space: SpaceRecord, filePath: string, content: string, resolutionToken: string, encoding?: 'utf-8' | 'base64'): Promise<void>;
  deleteFile(space: SpaceRecord, filePath: string, resolutionToken: string): Promise<void>;
  renameFile(space: SpaceRecord, filePath: string, newPath: string, sourceResolutionToken: string, targetResolutionToken: string): Promise<void>;
  createDirectory(space: SpaceRecord, dirPath: string, resolutionToken: string): Promise<void>;
  deleteDirectory(space: SpaceRecord, dirPath: string, resolutionToken: string): Promise<void>;
  renameDirectory(space: SpaceRecord, dirPath: string, newPath: string, sourceResolutionToken: string, targetResolutionToken: string): Promise<void>;
  getMetadata(space: SpaceRecord): Promise<SpaceMetadata>;
  patchMetadata(space: SpaceRecord, files: Record<string, Partial<FileMetadataEntry>>): Promise<void>;
  getCircuitStatus(): 'CLOSED' | 'OPEN' | 'HALF_OPEN';
}
