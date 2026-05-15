import chokidar, { FSWatcher } from 'chokidar';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import { SpaceConfigSchema, computeSpaceId } from '@ai-spaces/shared';
import type { SpaceRecord } from './space-store.js';

export interface SpaceAddedEvent {
  space: SpaceRecord;
}

export interface SpaceRemovedEvent {
  spaceId: string;
  spacePath: string;
}

function isSpacesConfig(filePath: string): boolean {
  return filePath.endsWith(`${path.sep}.space${path.sep}spaces.json`) ||
         filePath.endsWith('/.space/spaces.json');
}

/**
 * Derives the space path (relative to watchRoot) and agentId from a spaces.json file path.
 * The spaces.json lives at: <watchRoot>/<agentWorkspace>/<spacePath>/.space/spaces.json
 */
function parseSpacesConfigPath(
  filePath: string,
  watchRoot: string,
  agentId: string,
): { relativePath: string; configPath: string } | null {
  const normalizedFile = filePath.replace(/\\/g, '/');
  const normalizedRoot = watchRoot.replace(/\\/g, '/');

  if (!normalizedFile.startsWith(normalizedRoot)) return null;

  // relative from watchRoot: e.g. "my-project/.space/spaces.json"
  const rel = normalizedFile.slice(normalizedRoot.length).replace(/^\//, '');

  // Strip the trailing "/.space/spaces.json" suffix
  const suffix = '/.space/spaces.json';
  if (!rel.endsWith(suffix)) return null;

  const relativePath = rel.slice(0, rel.length - suffix.length);
  if (!relativePath) return null;

  return { relativePath, configPath: filePath };
}

function readSpaceRecord(
  filePath: string,
  watchRoot: string,
  agentId: string,
): SpaceRecord | null {
  const parsed = parseSpacesConfigPath(filePath, watchRoot, agentId);
  if (!parsed) return null;

  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const result = SpaceConfigSchema.safeParse(raw);
    if (!result.success) {
      console.warn(
        `[space-watcher] Invalid config at ${filePath}:`,
        result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ')
      );
      return null;
    }

    return {
      id: computeSpaceId(agentId, parsed.relativePath),
      agentId,
      agentType: agentId === 'main' ? 'main' : 'agent',
      path: parsed.relativePath,
      configPath: filePath,
      config: result.data,
    };
  } catch (err) {
    console.error(`[space-watcher] Failed to read config at ${filePath}:`, err instanceof Error ? err.message : String(err));
    return null;
  }
}

export class SpaceWatcher extends EventEmitter {
  private watcher: FSWatcher | null = null;

  constructor(
    private readonly watchRoot: string,
    private readonly agentId: string,
  ) {
    super();
  }

  private scan(): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(this.watchRoot, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const configPath = path.join(this.watchRoot, entry.name, '.space', 'spaces.json');
      if (!fs.existsSync(configPath)) continue;
      const space = readSpaceRecord(configPath, this.watchRoot, this.agentId);
      if (!space) continue;
      console.log(`[space-watcher] Space discovered at startup: ${space.id}`);
      this.emit('space:added', { space } satisfies SpaceAddedEvent);
    }
  }

  start(): void {
    if (this.watcher) return;

    if (!fs.existsSync(this.watchRoot)) {
      console.warn(`[space-watcher] Watch root does not exist, skipping: ${this.watchRoot}`);
      return;
    }

    console.log(`[space-watcher] Starting workspace watcher at ${this.watchRoot} (agent: ${this.agentId})`);

    this.watcher = chokidar.watch(this.watchRoot, {
      depth: 3,
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 200 },
    });

    this.watcher.on('add', (filePath) => {
      if (!isSpacesConfig(filePath)) return;

      const space = readSpaceRecord(filePath, this.watchRoot, this.agentId);
      if (!space) return;

      console.log(`[space-watcher] Space added: ${space.id}`);
      this.emit('space:added', { space } satisfies SpaceAddedEvent);
    });

    this.watcher.on('unlink', (filePath) => {
      if (!isSpacesConfig(filePath)) return;

      const parsed = parseSpacesConfigPath(filePath, this.watchRoot, this.agentId);
      if (!parsed) return;

      const spaceId = computeSpaceId(this.agentId, parsed.relativePath);
      console.log(`[space-watcher] Space removed: ${spaceId}`);
      this.emit('space:removed', { spaceId, spacePath: parsed.relativePath } satisfies SpaceRemovedEvent);
    });

    this.watcher.on('error', (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[space-watcher] Watcher error:`, message);
    });

    this.scan();
  }

  stop(): void {
    if (!this.watcher) return;

    this.watcher.close().catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[space-watcher] Error closing watcher:`, message);
    });

    this.watcher = null;
    console.log(`[space-watcher] Stopped watching ${this.watchRoot}`);
  }
}
