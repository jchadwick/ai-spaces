import * as path from "node:path";
import type { WorkspaceSpaceRecord } from "@ai-spaces/shared";
import { scanWorkspace } from "@ai-spaces/shared";
import { logger as rootLogger } from "./logger.js";

const log = rootLogger.child({ component: "space-store" });

export type SpaceRecord = WorkspaceSpaceRecord;
export type { WorkspaceSpaceRecord };

type AgentWorkspace = { agentId: string; workspaceRoot: string };

let agentWorkspaces: AgentWorkspace[] = [];

export function initSpaceStore(workspaces: AgentWorkspace[]): void {
  agentWorkspaces = workspaces;
}

function getAllSpaces(): SpaceRecord[] {
  const seen = new Set<string>();
  const results: SpaceRecord[] = [];

  for (const { agentId, workspaceRoot } of agentWorkspaces) {
    if (seen.has(workspaceRoot)) continue;
    seen.add(workspaceRoot);
    try {
      results.push(...scanWorkspace(workspaceRoot, workspaceRoot, agentId));
    } catch (err) {
      log.warn(
        { err: err instanceof Error ? err.message : String(err), workspaceRoot, agentId },
        "Workspace scan failed; skipping workspace",
      );
    }
  }

  return results;
}

export function resolveSpaceRoot(space: SpaceRecord): string {
  const entry = agentWorkspaces.find((w) => w.agentId === space.agentId);
  const workspaceRoot = entry?.workspaceRoot ?? "";
  return path.join(workspaceRoot, space.path);
}

export function getSpace(id: string): SpaceRecord | null {
  return getAllSpaces().find((s) => s.id === id) ?? null;
}

export function listSpaces(agentId?: string): SpaceRecord[] {
  const all = getAllSpaces();
  return agentId ? all.filter((s) => s.agentId === agentId) : all;
}
