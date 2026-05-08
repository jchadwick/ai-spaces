import type { AgentAdapter, FileNode } from './agent-adapter.js';
import type { SpaceRecord } from '../space-store.js';
import { config } from '../config.js';

export class OpenClawAgentAdapter implements AgentAdapter {
  private filesBase(space: SpaceRecord): string {
    return `${config.GATEWAY_URL}/api/spaces/${space.id}/files`;
  }

  private authHeaders(): HeadersInit {
    return {
      Authorization: `Bearer ${config.GATEWAY_TOKEN}`,
      'Content-Type': 'application/json',
    };
  }

  private async checkOk(res: Response, context: string): Promise<void> {
    if (!res.ok) {
      throw new Error(`Gateway error (${res.status}) during ${context}`);
    }
  }

  async listFiles(space: SpaceRecord, dirPath: string): Promise<FileNode[]> {
    const url = `${this.filesBase(space)}?path=${encodeURIComponent(dirPath)}`;
    const res = await fetch(url, { headers: this.authHeaders() });
    await this.checkOk(res, 'listFiles');
    const data = await res.json() as { files: FileNode[] };
    return data.files;
  }

  async readFile(space: SpaceRecord, filePath: string): Promise<{ content: string; contentType: string }> {
    const url = `${this.filesBase(space)}/${filePath}`;
    const res = await fetch(url, { headers: this.authHeaders() });
    await this.checkOk(res, 'readFile');
    const content = await res.text();
    const contentType = res.headers.get('Content-Type') ?? 'text/plain';
    return { content, contentType };
  }

  async writeFile(space: SpaceRecord, filePath: string, content: string, encoding?: 'utf-8' | 'base64'): Promise<void> {
    const url = `${this.filesBase(space)}/${filePath}`;
    const res = await fetch(url, {
      method: 'PUT',
      headers: this.authHeaders(),
      body: JSON.stringify({ content, encoding }),
    });
    await this.checkOk(res, 'writeFile');
  }

  async deleteFile(space: SpaceRecord, filePath: string): Promise<void> {
    const url = `${this.filesBase(space)}/${filePath}`;
    const res = await fetch(url, {
      method: 'DELETE',
      headers: this.authHeaders(),
    });
    await this.checkOk(res, 'deleteFile');
  }

  async renameFile(space: SpaceRecord, filePath: string, newPath: string): Promise<void> {
    const url = `${this.filesBase(space)}/${filePath}`;
    const res = await fetch(url, {
      method: 'PATCH',
      headers: this.authHeaders(),
      body: JSON.stringify({ newPath }),
    });
    await this.checkOk(res, 'renameFile');
  }

  async createDirectory(space: SpaceRecord, dirPath: string): Promise<void> {
    const url = `${config.GATEWAY_URL}/api/spaces/${space.id}/directories`;
    const res = await fetch(url, {
      method: 'POST',
      headers: this.authHeaders(),
      body: JSON.stringify({ path: dirPath }),
    });
    await this.checkOk(res, 'createDirectory');
  }

  async deleteDirectory(space: SpaceRecord, dirPath: string): Promise<void> {
    const url = `${config.GATEWAY_URL}/api/spaces/${space.id}/directories/${dirPath}`;
    const res = await fetch(url, {
      method: 'DELETE',
      headers: this.authHeaders(),
    });
    await this.checkOk(res, 'deleteDirectory');
  }

  async renameDirectory(space: SpaceRecord, dirPath: string, newPath: string): Promise<void> {
    const url = `${config.GATEWAY_URL}/api/spaces/${space.id}/directories/${dirPath}`;
    const res = await fetch(url, {
      method: 'PATCH',
      headers: this.authHeaders(),
      body: JSON.stringify({ newPath }),
    });
    await this.checkOk(res, 'renameDirectory');
  }
}
