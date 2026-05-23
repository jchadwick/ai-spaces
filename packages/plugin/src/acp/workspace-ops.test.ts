import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { listWorkspaceFiles, readWorkspaceFile } from './workspace-ops.js';

describe('workspace ops internal access', () => {
  let tempDir: string;
  let spaceRoot: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workspace-ops-test-'));
    spaceRoot = path.join(tempDir, 'space');
    fs.mkdirSync(spaceRoot, { recursive: true });
    fs.writeFileSync(path.join(spaceRoot, 'README.md'), 'hello');
    fs.writeFileSync(path.join(spaceRoot, 'AGENTS.md'), 'secret');
    fs.mkdirSync(path.join(spaceRoot, '.space'), { recursive: true });
    fs.writeFileSync(path.join(spaceRoot, '.space', 'SPACE.md'), 'hidden');
    fs.mkdirSync(path.join(spaceRoot, 'memory'), { recursive: true });
    fs.writeFileSync(path.join(spaceRoot, 'memory', 'foo.md'), 'hidden memory');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('hides internal files from viewer listing', async () => {
    const files = await listWorkspaceFiles(spaceRoot, 'viewer', '');
    const paths = JSON.stringify(files);
    expect(paths).toContain('README.md');
    expect(paths).not.toContain('AGENTS.md');
    expect(paths).not.toContain('.space');
    expect(paths).not.toContain('memory');
  });

  it('blocks viewer reads of internal files', async () => {
    await expect(readWorkspaceFile(spaceRoot, 'AGENTS.md', 'viewer')).rejects.toThrow('Access denied');
    await expect(readWorkspaceFile(spaceRoot, '.space/SPACE.md', 'viewer')).rejects.toThrow('Access denied');
    await expect(readWorkspaceFile(spaceRoot, 'memory/foo.md', 'viewer')).rejects.toThrow('Access denied');
  });

  it('allows owner reads of internal files', async () => {
    const data = await readWorkspaceFile(spaceRoot, 'AGENTS.md', 'owner');
    expect(data.content).toBe('secret');
  });
});
