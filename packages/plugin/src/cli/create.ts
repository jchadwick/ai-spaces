import * as fs from "node:fs";
import * as path from "node:path";
import type { SpaceConfig } from "@ai-spaces/shared";
import { computeSpaceId } from "@ai-spaces/shared";
import { config } from "../config.js";

interface CreateSpaceOptions {
  json?: boolean;
  name?: string;
  description?: string;
}

function getAgentWorkspace(): string {
  const openclawHome = config.OPENCLAW_HOME;
  return path.join(openclawHome, "workspace");
}

function getAgentName(): string {
  return "main";
}

export async function createSpace(spacePath: string, options: CreateSpaceOptions = {}) {
  const workspaceDir = getAgentWorkspace();
  const _agentName = getAgentName();

  const absolutePath = path.isAbsolute(spacePath) ? spacePath : path.join(workspaceDir, spacePath);

  const relativePath = path.relative(workspaceDir, absolutePath);

  if (relativePath.startsWith("..") || relativePath.startsWith("/")) {
    throw new Error(
      `Path must be within the workspace directory\nWorkspace: ${workspaceDir}\nProvided: ${spacePath}`,
    );
  }

  if (fs.existsSync(path.join(absolutePath, ".space", "spaces.json"))) {
    throw new Error(
      `This path is already a space\nPath: ${spacePath}\n\nUse "openclaw spaces list" to see existing spaces.`,
    );
  }

  const spaceName = options.name || path.basename(absolutePath);
  const spaceDescription = options.description;
  const folderName = path.basename(absolutePath);
  const spaceId = computeSpaceId("", folderName);

  const spaceConfig: SpaceConfig = {
    id: spaceId,
    name: spaceName,
  };

  if (spaceDescription) {
    spaceConfig.description = spaceDescription;
  }

  try {
    if (!fs.existsSync(absolutePath)) {
      fs.mkdirSync(absolutePath, { recursive: true });
    }

    const spaceDir = path.join(absolutePath, ".space");
    if (!fs.existsSync(spaceDir)) {
      fs.mkdirSync(spaceDir, { recursive: true });
    }

    const configPath = path.join(spaceDir, "spaces.json");
    fs.writeFileSync(configPath, JSON.stringify(spaceConfig, null, 2));

    if (options.json) {
    } else {
      if (spaceDescription) {
      }
    }
  } catch (error) {
    throw new Error(
      `Failed to create space: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}
