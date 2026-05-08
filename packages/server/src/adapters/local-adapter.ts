import * as fs from 'fs';
import * as path from 'path';
import type { AgentAdapter, FileNode } from './agent-adapter.js';
import type { SpaceRecord } from '../space-store.js';
import { config } from '../config.js';
import { scanWorkspace, getAgentWorkspace, type WorkspaceSpaceRecord } from '@ai-spaces/shared';

export class LocalAgentAdapter implements AgentAdapter {
  private spaceRoot(space: SpaceRecord): string {
    return path.join(config.AI_SPACES_ROOT, space.path);
  }

  async listFiles(space: SpaceRecord, dirPath: string): Promise<FileNode[]> {
    const spaceRoot = this.spaceRoot(space);
    const fullPath = dirPath ? path.join(spaceRoot, dirPath) : spaceRoot;

    const entries = await fs.promises.readdir(fullPath, { withFileTypes: true });
    const nodes = await Promise.all(
      entries.map(async (entry) => {
        const relativePath = dirPath ? `${dirPath}/${entry.name}` : entry.name;
        try {
          const stats = await fs.promises.stat(path.join(fullPath, entry.name));
          return {
            name: entry.name,
            type: (entry.isDirectory() ? 'directory' : 'file') as 'file' | 'directory',
            path: relativePath,
            size: entry.isDirectory() ? undefined : stats.size,
            modified: stats.mtime.toISOString(),
          } satisfies FileNode;
        } catch {
          return null;
        }
      }),
    );

    return (nodes.filter(Boolean) as FileNode[]).sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }

  async readFile(space: SpaceRecord, filePath: string): Promise<{ content: string; contentType: string }> {
    const spaceRoot = this.spaceRoot(space);
    const fullPath = path.resolve(spaceRoot, filePath);

    if (!fullPath.startsWith(spaceRoot + path.sep) && fullPath !== spaceRoot) {
      throw new Error('Access denied: path escape attempt');
    }

    const content = await fs.promises.readFile(fullPath, 'utf-8');
    const ext = path.extname(filePath).toLowerCase();
    const contentType = ext === '.md' ? 'text/markdown' : 'text/plain';
    return { content, contentType };
  }

  async writeFile(space: SpaceRecord, filePath: string, content: string, encoding?: 'utf-8' | 'base64'): Promise<void> {
    const spaceRoot = this.spaceRoot(space);
    const fullPath = path.resolve(spaceRoot, filePath);

    if (!fullPath.startsWith(spaceRoot + path.sep) && fullPath !== spaceRoot) {
      throw new Error('Access denied: path escape attempt');
    }

    const dir = path.dirname(fullPath);
    await fs.promises.mkdir(dir, { recursive: true });

    if (encoding === 'base64') {
      await fs.promises.writeFile(fullPath, Buffer.from(content, 'base64'));
    } else {
      await fs.promises.writeFile(fullPath, content, 'utf-8');
    }
  }

  async deleteFile(space: SpaceRecord, filePath: string): Promise<void> {
    const spaceRoot = this.spaceRoot(space);
    const fullPath = path.join(spaceRoot, filePath);
    const normalizedSpacePath = path.normalize(spaceRoot);
    const normalizedFullPath = path.normalize(fullPath);

    if (!normalizedFullPath.startsWith(normalizedSpacePath)) {
      throw new Error('Access denied: path escape attempt');
    }

    await fs.promises.unlink(fullPath);
  }

  async renameFile(space: SpaceRecord, filePath: string, newPath: string): Promise<void> {
    const spaceRoot = this.spaceRoot(space);
    const fullPath = path.join(spaceRoot, filePath);
    const newFullPath = path.join(spaceRoot, newPath);
    const normalizedSpacePath = path.normalize(spaceRoot);

    if (!path.normalize(fullPath).startsWith(normalizedSpacePath) || !path.normalize(newFullPath).startsWith(normalizedSpacePath)) {
      throw new Error('Access denied: path escape attempt');
    }

    const newDir = path.dirname(newFullPath);
    await fs.promises.mkdir(newDir, { recursive: true });
    await fs.promises.rename(fullPath, newFullPath);
  }

  async createDirectory(space: SpaceRecord, dirPath: string): Promise<void> {
    const spaceRoot = this.spaceRoot(space);
    const fullPath = path.join(spaceRoot, dirPath);
    const normalizedSpacePath = path.normalize(spaceRoot);
    const normalizedFullPath = path.normalize(fullPath);

    if (!normalizedFullPath.startsWith(normalizedSpacePath)) {
      throw new Error('Access denied: path escape attempt');
    }

    await fs.promises.mkdir(fullPath, { recursive: true });
  }

  async deleteDirectory(space: SpaceRecord, dirPath: string): Promise<void> {
    const spaceRoot = this.spaceRoot(space);
    const fullPath = path.join(spaceRoot, dirPath);
    const normalizedSpacePath = path.normalize(spaceRoot);
    const normalizedFullPath = path.normalize(fullPath);

    if (!normalizedFullPath.startsWith(normalizedSpacePath)) {
      throw new Error('Access denied: path escape attempt');
    }

    await fs.promises.rm(fullPath, { recursive: true, force: true });
  }

  async renameDirectory(space: SpaceRecord, dirPath: string, newPath: string): Promise<void> {
    const spaceRoot = this.spaceRoot(space);
    const fullPath = path.join(spaceRoot, dirPath);
    const newFullPath = path.join(spaceRoot, newPath);
    const normalizedSpacePath = path.normalize(spaceRoot);

    if (!path.normalize(fullPath).startsWith(normalizedSpacePath) || !path.normalize(newFullPath).startsWith(normalizedSpacePath)) {
      throw new Error('Access denied: path escape attempt');
    }

    await fs.promises.rename(fullPath, newFullPath);
  }

  async scanSpaces(): Promise<WorkspaceSpaceRecord[]> {
    const openclawHome = config.OPENCLAW_HOME;
    const agentsHome = path.join(openclawHome, 'agents');
    const results: WorkspaceSpaceRecord[] = [];

    // Always include main workspace
    const mainWorkspaceRoot = getAgentWorkspace(openclawHome, 'main');
    results.push(...scanWorkspace(openclawHome, mainWorkspaceRoot, 'main'));

    if (!fs.existsSync(agentsHome)) return results;

    const agentNames = fs.readdirSync(agentsHome, { withFileTypes: true })
      .filter(e => e.isDirectory() && e.name !== 'main')
      .map(e => e.name);

    for (const agentName of agentNames) {
      const workspaceRoot = getAgentWorkspace(openclawHome, agentName);
      results.push(...scanWorkspace(openclawHome, workspaceRoot, agentName));
    }

    return results;
  }
}
