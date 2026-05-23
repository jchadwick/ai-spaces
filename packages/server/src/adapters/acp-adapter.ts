import type { AgentAdapter, FileNode } from './agent-adapter.js';
import type { SpaceRecord } from '../space-store.js';
import type { SpaceRole, SpaceMetadata, FileMetadataEntry } from '@ai-spaces/shared';
import { SpaceMetadataSchema } from '@ai-spaces/shared';
import { ACP_WORKSPACE_METHODS } from '@ai-spaces/shared';
import { acpConnectionPool } from './acp-connection-pool.js';

export class ACPAgentAdapter implements AgentAdapter {
  getCircuitStatus(): 'CLOSED' | 'OPEN' | 'HALF_OPEN' {
    return 'CLOSED';
  }

  private async ext(space: SpaceRecord, method: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
    const connection = await acpConnectionPool.getConnection(space);
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`ACP ext method ${method} timed out`)), 30_000)
    );
    return Promise.race([
      connection.extMethod(method, { spaceId: space.id, ...params }) as Promise<Record<string, unknown>>,
      timeout,
    ]);
  }

  async listFiles(space: SpaceRecord, dirPath: string, role: SpaceRole): Promise<FileNode[]> {
    const result = await this.ext(space, ACP_WORKSPACE_METHODS.LIST_FILES, { path: dirPath, role });
    return (result.files as FileNode[] | undefined) ?? [];
  }

  async readFile(space: SpaceRecord, filePath: string, role: SpaceRole): Promise<{ content: string; contentType: string }> {
    const result = await this.ext(space, ACP_WORKSPACE_METHODS.READ_FILE, { path: filePath, role });
    return {
      content: (result.content as string | undefined) ?? '',
      contentType: (result.contentType as string | undefined) ?? 'text/plain',
    };
  }

  async writeFile(space: SpaceRecord, filePath: string, content: string, encoding?: 'utf-8' | 'base64'): Promise<void> {
    await this.ext(space, ACP_WORKSPACE_METHODS.WRITE_FILE, { path: filePath, content, encoding: encoding ?? 'utf-8' });
  }

  async deleteFile(space: SpaceRecord, filePath: string): Promise<void> {
    await this.ext(space, ACP_WORKSPACE_METHODS.DELETE_FILE, { path: filePath });
  }

  async renameFile(space: SpaceRecord, filePath: string, newPath: string): Promise<void> {
    await this.ext(space, ACP_WORKSPACE_METHODS.RENAME, { path: filePath, newPath });
  }

  async createDirectory(space: SpaceRecord, dirPath: string): Promise<void> {
    await this.ext(space, ACP_WORKSPACE_METHODS.CREATE_DIRECTORY, { path: dirPath });
  }

  async deleteDirectory(space: SpaceRecord, dirPath: string): Promise<void> {
    await this.ext(space, ACP_WORKSPACE_METHODS.DELETE_DIRECTORY, { path: dirPath });
  }

  async renameDirectory(space: SpaceRecord, dirPath: string, newPath: string): Promise<void> {
    await this.ext(space, ACP_WORKSPACE_METHODS.RENAME, { path: dirPath, newPath });
  }

  async getMetadata(space: SpaceRecord): Promise<SpaceMetadata> {
    const result = await this.ext(space, ACP_WORKSPACE_METHODS.GET_METADATA, {});
    const parsed = SpaceMetadataSchema.safeParse(result);
    return parsed.success ? parsed.data : { files: {} };
  }

  async patchMetadata(space: SpaceRecord, files: Record<string, Partial<FileMetadataEntry>>): Promise<void> {
    await this.ext(space, ACP_WORKSPACE_METHODS.PATCH_METADATA, { files });
  }
}
