import chokidar, { FSWatcher } from 'chokidar';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import { SpaceConfigSchema, computeSpaceId } from '@ai-spaces/shared';
import { logger as rootLogger } from './logger.js';

const log = rootLogger.child({ component: 'space-watcher' });
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
      log.warn({ filePath, issues: result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ') }, 'Invalid space config');
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
    log.error({ filePath, err: err instanceof Error ? err.message : String(err) }, 'Failed to read config');
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
      log.info({ spaceId: space.id }, 'Space discovered at startup');
      this.emit('space:added', { space } satisfies SpaceAddedEvent);
    }
  }

  start(): void {
    if (this.watcher) return;

    if (!fs.existsSync(this.watchRoot)) {
      log.warn({ watchRoot: this.watchRoot }, 'Watch root does not exist, skipping');
      return;
    }

    log.info({ watchRoot: this.watchRoot, agentId: this.agentId }, 'Starting workspace watcher');

    this.watcher = chokidar.watch(this.watchRoot, {
      depth: 3,
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 200 },
    });

    this.watcher.on('add', (filePath) => {
      if (!isSpacesConfig(filePath)) return;

      const space = readSpaceRecord(filePath, this.watchRoot, this.agentId);
      if (!space) return;

      log.info({ spaceId: space.id }, 'Space added');
      this.emit('space:added', { space } satisfies SpaceAddedEvent);
    });

    this.watcher.on('unlink', (filePath) => {
      if (!isSpacesConfig(filePath)) return;

      const parsed = parseSpacesConfigPath(filePath, this.watchRoot, this.agentId);
      if (!parsed) return;

      const spaceId = computeSpaceId(this.agentId, parsed.relativePath);
      log.info({ spaceId }, 'Space removed');
      this.emit('space:removed', { spaceId, spacePath: parsed.relativePath } satisfies SpaceRemovedEvent);
    });

    this.watcher.on('error', (err: unknown) => {
      log.error({ err: err instanceof Error ? err.message : String(err) }, 'Watcher error');
    });

    this.scan();
  }

  stop(): void {
    if (!this.watcher) return;

    this.watcher.close().catch((err: unknown) => {
      log.error({ err: err instanceof Error ? err.message : String(err) }, 'Error closing watcher');
    });

    this.watcher = null;
    log.info({ watchRoot: this.watchRoot }, 'Stopped watching');
  }
}
