import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { listWorkspaceFiles, readWorkspaceFile, writeWorkspaceFile } from './workspace-ops.js';

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

  it('lists and reads files under symlinked directories', async () => {
    const externalDir = path.join(tempDir, 'brain', 'Vacations');
    fs.mkdirSync(externalDir, { recursive: true });
    fs.writeFileSync(path.join(externalDir, 'Maine.md'), '# Maine');
    fs.symlinkSync(externalDir, path.join(spaceRoot, 'LinkedVacations'));

    const files = await listWorkspaceFiles(spaceRoot, 'viewer', '');
    const paths = JSON.stringify(files);
    expect(paths).toContain('LinkedVacations');
    expect(paths).toContain('LinkedVacations/Maine.md');

    const data = await readWorkspaceFile(spaceRoot, 'LinkedVacations/Maine.md', 'viewer');
    expect(data.content).toBe('# Maine');
  });

  it('writes files under symlinked directories', async () => {
    const externalDir = path.join(tempDir, 'brain', 'Vacations');
    fs.mkdirSync(externalDir, { recursive: true });
    fs.symlinkSync(externalDir, path.join(spaceRoot, 'LinkedVacations'));

    await writeWorkspaceFile(spaceRoot, 'LinkedVacations/New.md', '# New');
    expect(fs.readFileSync(path.join(externalDir, 'New.md'), 'utf-8')).toBe('# New');
  });

  it('blocks listing traversal outside the workspace', async () => {
    await expect(listWorkspaceFiles(spaceRoot, 'viewer', '../../')).rejects.toThrow('Access denied');
  });

  it('does not expose internal files through symlink aliases', async () => {
    fs.symlinkSync(path.join(spaceRoot, '.space', 'SPACE.md'), path.join(spaceRoot, 'public.md'));

    const files = await listWorkspaceFiles(spaceRoot, 'viewer', '');
    expect(JSON.stringify(files)).not.toContain('public.md');
    await expect(readWorkspaceFile(spaceRoot, 'public.md', 'viewer')).rejects.toThrow('Access denied');
  });

  it('skips broken symlinks in listings', async () => {
    fs.symlinkSync(path.join(tempDir, 'missing'), path.join(spaceRoot, 'Broken'));

    const files = await listWorkspaceFiles(spaceRoot, 'viewer', '');
    expect(JSON.stringify(files)).not.toContain('Broken');
  });
});
