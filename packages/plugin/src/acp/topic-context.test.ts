import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { buildTopicPromptContext, resolveTopicPath } from './topic-context.js';

describe('topic context isolation', () => {
  let tempDir: string;
  let spaceRoot: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'topic-context-test-'));
    spaceRoot = path.join(tempDir, 'space');
    fs.mkdirSync(path.join(spaceRoot, 'Vacations', 'Hotels'), { recursive: true });
    fs.writeFileSync(path.join(spaceRoot, 'README.md'), 'root context');
    fs.writeFileSync(path.join(spaceRoot, 'Vacations', 'notes.txt'), 'vacation context');
    fs.writeFileSync(path.join(spaceRoot, 'Vacations', 'Hotels', 'list.md'), 'hotel context');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it.each(['../../etc/passwd', '../outside', 'Vacations/../../../etc', '..\\..\\etc', '.space'])(
    'rejects traversal before reading files: %s',
    async (topicPath) => {
      expect(() => resolveTopicPath(spaceRoot, topicPath)).toThrow('Access denied');
      await expect(buildTopicPromptContext(spaceRoot, topicPath, 'viewer')).rejects.toThrow('Access denied');
    },
  );

  it('injects the visible tree and parent context for a nested topic', async () => {
    const context = await buildTopicPromptContext(spaceRoot, '/Vacations/Hotels', 'viewer');
    expect(context).toContain('Active Topic Focus Path: /Vacations/Hotels');
    expect(context).toContain('[file] /README.md');
    expect(context).toContain('hotel context');
    expect(context).toContain('vacation context');
    expect(context).toContain('root context');
  });
});
