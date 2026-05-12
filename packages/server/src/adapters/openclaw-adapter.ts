import type { AgentAdapter, FileNode } from './agent-adapter.js';
import type { SpaceRecord } from '../space-store.js';
import { config } from '../config.js';
import type { WorkspaceSpaceRecord, SpaceRole } from '@ai-spaces/shared';

export class OpenClawAgentAdapter implements AgentAdapter {
  private filesBase(space: SpaceRecord): string {
    return `${config.PLUGIN_SPACES_URL}/api/spaces/${space.id}/files`;
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
    const res = await fetch(url);
    await this.checkOk(res, 'listFiles');
    const data = await res.json() as { files: FileNode[] };
    return data.files;
  }

  async readFile(space: SpaceRecord, filePath: string): Promise<{ content: string; contentType: string }> {
    const url = `${this.filesBase(space)}/${encodeURIComponent(filePath)}`;
    const res = await fetch(url);
    await this.checkOk(res, 'readFile');
    const content = await res.text();
    const contentType = res.headers.get('Content-Type') ?? 'text/plain';
    return { content, contentType };
  }

  async writeFile(space: SpaceRecord, filePath: string, content: string, encoding?: 'utf-8' | 'base64'): Promise<void> {
    const url = `${this.filesBase(space)}/${encodeURIComponent(filePath)}`;
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, encoding }),
    });
    await this.checkOk(res, 'writeFile');
  }

  async deleteFile(space: SpaceRecord, filePath: string): Promise<void> {
    const url = `${this.filesBase(space)}/${encodeURIComponent(filePath)}`;
    const res = await fetch(url, { method: 'DELETE' });
    await this.checkOk(res, 'deleteFile');
  }

  async renameFile(space: SpaceRecord, filePath: string, newPath: string): Promise<void> {
    const url = `${this.filesBase(space)}/${encodeURIComponent(filePath)}`;
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newPath }),
    });
    await this.checkOk(res, 'renameFile');
  }

  async createDirectory(space: SpaceRecord, dirPath: string): Promise<void> {
    const url = `${config.PLUGIN_SPACES_URL}/api/spaces/${space.id}/directories`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: dirPath }),
    });
    await this.checkOk(res, 'createDirectory');
  }

  async deleteDirectory(space: SpaceRecord, dirPath: string): Promise<void> {
    const url = `${config.PLUGIN_SPACES_URL}/api/spaces/${space.id}/directories/${encodeURIComponent(dirPath)}`;
    const res = await fetch(url, { method: 'DELETE' });
    await this.checkOk(res, 'deleteDirectory');
  }

  async renameDirectory(space: SpaceRecord, dirPath: string, newPath: string): Promise<void> {
    const url = `${config.PLUGIN_SPACES_URL}/api/spaces/${space.id}/directories/${encodeURIComponent(dirPath)}`;
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newPath }),
    });
    await this.checkOk(res, 'renameDirectory');
  }

  async scanSpaces(): Promise<WorkspaceSpaceRecord[]> {
    const res = await fetch(`${config.PLUGIN_SPACES_URL}/api/spaces`);
    await this.checkOk(res, 'scanSpaces');
    const data = await res.json() as { spaces: WorkspaceSpaceRecord[] };
    return data.spaces;
  }
}
