import { EventEmitter } from "node:events";
import * as fs from "node:fs";
import * as path from "node:path";
import chokidar, { FSWatcher } from "chokidar";

export type FileAction = "created" | "modified" | "deleted";

export interface FileChangedEvent {
  spaceId: string;
  path: string;
  action: FileAction;
}

interface WatchEntry {
  watcher: FSWatcher;
  dirPath: string;
}

export class FileWatcher extends EventEmitter {
  private watchers = new Map<string, WatchEntry>();

  watch(spaceId: string, dirPath: string): void {
    if (this.watchers.has(spaceId)) return;

    if (!fs.existsSync(dirPath)) {
      console.warn(`[FileWatcher] Directory does not exist, skipping watch: ${dirPath}`);
      return;
    }

    try {
      const watcher = chokidar.watch(dirPath, {
        persistent: true,
        ignoreInitial: true,
        awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
      });

      watcher.on("add", (filePath) => {
        const relativePath = path.relative(dirPath, filePath);
        this.emit("file:changed", {
          spaceId,
          path: relativePath,
          action: "created",
        } satisfies FileChangedEvent);
      });

      watcher.on("change", (filePath) => {
        const relativePath = path.relative(dirPath, filePath);
        this.emit("file:changed", {
          spaceId,
          path: relativePath,
          action: "modified",
        } satisfies FileChangedEvent);
      });

      watcher.on("unlink", (filePath) => {
        const relativePath = path.relative(dirPath, filePath);
        this.emit("file:changed", {
          spaceId,
          path: relativePath,
          action: "deleted",
        } satisfies FileChangedEvent);
      });

      watcher.on("error", (err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[FileWatcher] Watcher error for space ${spaceId}:`, message);
        this.unwatch(spaceId);
      });

      this.watchers.set(spaceId, { watcher, dirPath });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[FileWatcher] Failed to watch ${dirPath}:`, message);
    }
  }

  unwatch(spaceId: string): void {
    const entry = this.watchers.get(spaceId);
    if (!entry) return;

    entry.watcher.close().catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[FileWatcher] Error closing watcher for space ${spaceId}:`, message);
    });

    this.watchers.delete(spaceId);
  }

  unwatchAll(): void {
    for (const spaceId of this.watchers.keys()) {
      this.unwatch(spaceId);
    }
  }
}

export const fileWatcher = new FileWatcher();
