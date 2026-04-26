import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';

export type FileAction = 'created' | 'modified' | 'deleted';

export interface FileChangedEvent {
  spaceId: string;
  path: string;
  action: FileAction;
}

interface WatchEntry {
  watcher: fs.FSWatcher;
  dirPath: string;
  knownFiles: Set<string>;
}

export class FileWatcher extends EventEmitter {
  private watchers = new Map<string, WatchEntry>();
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  private scanDirectory(dirPath: string): Set<string> {
    const files = new Set<string>();
    const scan = (dir: string) => {
      try {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          files.add(path.relative(dirPath, full));
          if (entry.isDirectory()) scan(full);
        }
      } catch { /* ignore permission errors */ }
    };
    scan(dirPath);
    return files;
  }

  watch(spaceId: string, dirPath: string): void {
    if (this.watchers.has(spaceId)) return;

    if (!fs.existsSync(dirPath)) {
      console.warn(`[FileWatcher] Directory does not exist, skipping watch: ${dirPath}`);
      return;
    }

    try {
      const watcher = fs.watch(dirPath, { recursive: true }, (eventType, filename) => {
        if (!filename) return;

        const filePath = filename.toString();
        const debounceKey = `${spaceId}:${filePath}`;

        const existing = this.debounceTimers.get(debounceKey);
        if (existing) clearTimeout(existing);

        const timer = setTimeout(() => {
          this.debounceTimers.delete(debounceKey);
          this.resolveAction(spaceId, dirPath, filePath);
        }, 100);

        this.debounceTimers.set(debounceKey, timer);
      });

      watcher.on('error', (err) => {
        console.error(`[FileWatcher] Watcher error for space ${spaceId}:`, err.message);
        this.unwatch(spaceId);
      });

      this.watchers.set(spaceId, { watcher, dirPath, knownFiles: this.scanDirectory(dirPath) });
      console.log(`[FileWatcher] Watching space ${spaceId} at ${dirPath}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[FileWatcher] Failed to watch ${dirPath}:`, message);
    }
  }

  private resolveAction(spaceId: string, dirPath: string, filePath: string): void {
    const fullPath = path.join(dirPath, filePath);
    const entry = this.watchers.get(spaceId);
    if (!entry) return;

    let action: FileAction;
    try {
      fs.accessSync(fullPath);
      action = entry.knownFiles.has(filePath) ? 'modified' : 'created';
      entry.knownFiles.add(filePath);
    } catch {
      action = 'deleted';
      entry.knownFiles.delete(filePath);
    }

    this.emit('file:changed', { spaceId, path: filePath, action });
  }

  unwatch(spaceId: string): void {
    const entry = this.watchers.get(spaceId);
    if (!entry) return;

    try {
      entry.watcher.close();
    } catch { /* ignore close errors */ }

    this.watchers.delete(spaceId);
    console.log(`[FileWatcher] Stopped watching space ${spaceId}`);
  }

  unwatchAll(): void {
    for (const spaceId of this.watchers.keys()) {
      this.unwatch(spaceId);
    }
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
  }
}

export const fileWatcher = new FileWatcher();
