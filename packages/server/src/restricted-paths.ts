import type { FileNodeType, SpaceMetadata } from "@ai-spaces/shared";
import { SpaceMetadataSchema } from "@ai-spaces/shared";
import { agentAdapter } from "./agent-adapter-instance.js";
import type { SpaceRecord } from "./space-store.js";

function normalizeRelativePath(input: string): string {
  return input.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");
}

export async function loadSpaceMetadata(space: SpaceRecord): Promise<SpaceMetadata> {
  try {
    const raw = await agentAdapter.getMetadata(space);
    const parsed = SpaceMetadataSchema.safeParse(raw);
    return parsed.success ? parsed.data : { files: {} };
  } catch {
    return { files: {} };
  }
}

export function restrictedAncestorForPath(
  metadata: SpaceMetadata,
  requestedPath: string,
): string | null {
  const normalized = normalizeRelativePath(requestedPath);
  for (const [path, entry] of Object.entries(metadata.files)) {
    if (!(entry as { restricted?: boolean }).restricted) continue;
    const restrictedPath = normalizeRelativePath(path);
    if (!restrictedPath) continue;
    if (normalized === restrictedPath || normalized.startsWith(`${restrictedPath}/`)) {
      return restrictedPath;
    }
  }
  return null;
}

export function isPathRestricted(metadata: SpaceMetadata, requestedPath: string): boolean {
  return restrictedAncestorForPath(metadata, requestedPath) !== null;
}

export function filterRestrictedNodes(
  nodes: FileNodeType[],
  metadata: SpaceMetadata,
): FileNodeType[] {
  return nodes
    .filter((node) => !isPathRestricted(metadata, node.path))
    .map((node) => ({
      ...node,
      children: node.children ? filterRestrictedNodes(node.children, metadata) : node.children,
    }));
}
