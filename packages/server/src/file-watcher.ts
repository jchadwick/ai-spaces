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
}

export class FileWatcher extends EventEmitter {
  private watchers = new Map<string, WatchEntry>();
  // Debounce timers per "spaceId:filePath" key
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  watch(spaceId: string, dirPath: string): void {
    if (this.watchers.has(spaceId)) {
      return;
    }

    if (!fs.existsSync(dirPath)) {
      console.warn(`[FileWatcher] Directory does not exist, skipping watch: ${dirPath}`);
      return;
    }

    try {
      const watcher = fs.watch(dirPath, { recursive: true }, (eventType, filename) => {
        if (!filename) return;

        const filePath = filename.toString();
        const debounceKey = `${spaceId}:${filePath}`;

        // Cancel any existing debounce for this file
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

      this.watchers.set(spaceId, { watcher, dirPath });
      console.log(`[FileWatcher] Watching space ${spaceId} at ${dirPath}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[FileWatcher] Failed to watch ${dirPath}:`, message);
    }
  }

  private resolveAction(spaceId: string, dirPath: string, filePath: string): void {
    const fullPath = path.join(dirPath, filePath);

    let action: FileAction;
    try {
      fs.accessSync(fullPath);
      action = 'modified';
    } catch {
      action = 'deleted';
    }

    const event: FileChangedEvent = { spaceId, path: filePath, action };
    this.emit('file:changed', event);
  }

  unwatch(spaceId: string): void {
    const entry = this.watchers.get(spaceId);
    if (!entry) return;

    try {
      entry.watcher.close();
    } catch {
      // Ignore close errors
    }

    this.watchers.delete(spaceId);
    console.log(`[FileWatcher] Stopped watching space ${spaceId}`);
  }

  unwatchAll(): void {
    for (const spaceId of this.watchers.keys()) {
      this.unwatch(spaceId);
    }

    // Clear all pending debounce timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
  }
}

export const fileWatcher = new FileWatcher();
