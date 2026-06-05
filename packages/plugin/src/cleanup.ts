import * as fs from "node:fs";
import * as path from "node:path";
import { logger as rootLogger } from "./logger.js";

const log = rootLogger.child({ component: "cleanup" });

const STALE_AGE_MS = 5 * 60 * 1000; // 5 minutes
const MAX_DEPTH = 10;

function* findOrphans(dir: string, depth: number): Generator<string> {
  if (depth > MAX_DEPTH) return;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* findOrphans(fullPath, depth + 1);
    } else if (entry.isFile() && (entry.name.endsWith(".tmp") || entry.name.endsWith(".lock"))) {
      yield fullPath;
    }
  }
}

export function cleanOrphanedFiles(workspaceRoot: string): void {
  const now = Date.now();
  let found = 0;
  let removed = 0;

  for (const filePath of findOrphans(workspaceRoot, 0)) {
    found++;
    try {
      const stats = fs.statSync(filePath);
      if (now - stats.mtimeMs < STALE_AGE_MS) continue;
      fs.unlinkSync(filePath);
      removed++;
      log.info({ filePath }, "Removed orphaned file");
    } catch (err) {
      log.warn(
        { filePath, err: err instanceof Error ? err.message : String(err) },
        "Failed to remove orphaned file",
      );
    }
  }

  if (found > 0) {
    log.info({ found, removed }, "Orphan cleanup complete");
  }
}
