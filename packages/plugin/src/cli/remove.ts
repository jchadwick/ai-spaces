import * as fs from "node:fs";
import * as path from "node:path";
import { getSpace } from "../space-store.js";

interface RemoveSpaceOptions {
  json?: boolean;
  force?: boolean;
}

export async function removeSpace(spaceId: string, options: RemoveSpaceOptions = {}) {
  const space = getSpace(spaceId);

  if (!space) {
    throw new Error(
      `Space not found: ${spaceId}\n\nUse "openclaw spaces list" to see all available spaces.`,
    );
  }

  const spaceDir = path.dirname(space.configPath);

  if (!options.force) {
    if (options.json) {
    } else {
    }
    return;
  }

  try {
    if (fs.existsSync(spaceDir)) {
      fs.rmSync(spaceDir, { recursive: true, force: true });
    }

    if (options.json) {
    } else {
    }
  } catch (error) {
    throw new Error(
      `Failed to remove space: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}
