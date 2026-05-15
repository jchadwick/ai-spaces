import type { AgentAdapter, FileNode } from './agent-adapter.js';
import type { SpaceRecord } from '../space-store.js';
import type { SpaceRole, SpaceMetadata, FileMetadataEntry } from '@ai-spaces/shared';
import { SpaceMetadataSchema } from '@ai-spaces/shared';
import { getServerById } from '../db/queries.js';
import { CircuitBreaker } from './circuit-breaker.js';

export class OpenClawAgentAdapter implements AgentAdapter {
  private readonly circuit = new CircuitBreaker({ failureThreshold: 5, resetTimeoutMs: 30_000 });

  getCircuitStatus(): 'CLOSED' | 'OPEN' | 'HALF_OPEN' {
    return this.circuit.getStatus();
  }

  private getPluginUrl(space: SpaceRecord): string {
    const server = getServerById(space.serverId);
    if (!server?.pluginUrl) throw new Error(`No plugin URL registered for server ${space.serverId}`);
    return server.pluginUrl;
  }

  private filesBase(space: SpaceRecord): string {
    return `${this.getPluginUrl(space)}/api/spaces/${space.id}/files`;
  }

  private async checkOk(res: Response, context: string): Promise<void> {
    if (!res.ok) {
      throw new Error(`Plugin server error (${res.status}) during ${context}`);
    }
  }

  async listFiles(space: SpaceRecord, dirPath: string, role: SpaceRole): Promise<FileNode[]> {
    const params = new URLSearchParams({ role });
    if (dirPath) params.set('path', dirPath);
    const url = `${this.filesBase(space)}?${params}`;
    return this.circuit.execute(async () => {
      const res = await fetch(url);
      await this.checkOk(res, 'listFiles');
      const data = await res.json() as { files: FileNode[] };
      return data.files;
    });
  }

  async readFile(space: SpaceRecord, filePath: string): Promise<{ content: string; contentType: string }> {
    const url = `${this.filesBase(space)}/${encodeURIComponent(filePath)}`;
    return this.circuit.execute(async () => {
      const res = await fetch(url);
      await this.checkOk(res, 'readFile');
      const content = await res.text();
      const contentType = res.headers.get('Content-Type') ?? 'text/plain';
      return { content, contentType };
    });
  }

  async writeFile(space: SpaceRecord, filePath: string, content: string, encoding?: 'utf-8' | 'base64'): Promise<void> {
    const url = `${this.filesBase(space)}/${encodeURIComponent(filePath)}`;
    return this.circuit.execute(() => fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, encoding }),
    }).then(res => this.checkOk(res, 'writeFile')));
  }

  async deleteFile(space: SpaceRecord, filePath: string): Promise<void> {
    const url = `${this.filesBase(space)}/${encodeURIComponent(filePath)}`;
    return this.circuit.execute(() => fetch(url, { method: 'DELETE' })
      .then(res => this.checkOk(res, 'deleteFile')));
  }

  async renameFile(space: SpaceRecord, filePath: string, newPath: string): Promise<void> {
    const url = `${this.filesBase(space)}/${encodeURIComponent(filePath)}`;
    return this.circuit.execute(() => fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newPath }),
    }).then(res => this.checkOk(res, 'renameFile')));
  }

  async createDirectory(space: SpaceRecord, dirPath: string): Promise<void> {
    const url = `${this.getPluginUrl(space)}/api/spaces/${space.id}/directories`;
    return this.circuit.execute(() => fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: dirPath }),
    }).then(res => this.checkOk(res, 'createDirectory')));
  }

  async deleteDirectory(space: SpaceRecord, dirPath: string): Promise<void> {
    const url = `${this.getPluginUrl(space)}/api/spaces/${space.id}/directories/${encodeURIComponent(dirPath)}`;
    return this.circuit.execute(() => fetch(url, { method: 'DELETE' })
      .then(res => this.checkOk(res, 'deleteDirectory')));
  }

  async renameDirectory(space: SpaceRecord, dirPath: string, newPath: string): Promise<void> {
    const url = `${this.getPluginUrl(space)}/api/spaces/${space.id}/directories/${encodeURIComponent(dirPath)}`;
    return this.circuit.execute(() => fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newPath }),
    }).then(res => this.checkOk(res, 'renameDirectory')));
  }

  async getMetadata(space: SpaceRecord): Promise<SpaceMetadata> {
    const url = `${this.getPluginUrl(space)}/api/spaces/${space.id}/metadata`;
    return this.circuit.execute(async () => {
      const res = await fetch(url);
      if (!res.ok) return { files: {} };
      const data = await res.json();
      const parsed = SpaceMetadataSchema.safeParse(data);
      return parsed.success ? parsed.data : { files: {} };
    });
  }

  async patchMetadata(space: SpaceRecord, files: Record<string, Partial<FileMetadataEntry>>): Promise<void> {
    const url = `${this.getPluginUrl(space)}/api/spaces/${space.id}/metadata`;
    return this.circuit.execute(() => fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files }),
    }).then(res => this.checkOk(res, 'patchMetadata')));
  }
}
