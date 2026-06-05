import * as crypto from "node:crypto";
import type { WorkspacePathFacts } from "@ai-spaces/shared";
import type { AgentAdapter } from "../adapters/agent-adapter.js";
import type { SpaceRecord } from "../space-store.js";

export interface ApprovedWorkspacePath {
  token: string;
  path: string;
  facts: WorkspacePathFacts;
}

interface ResolutionRecord extends ApprovedWorkspacePath {
  expiresAt: number;
}

const TOKEN_TTL_MS = 30_000;

export class WorkspacePolicy {
  private readonly tokens = new Map<string, ResolutionRecord>();

  constructor(private readonly adapter: AgentAdapter) {}

  async approvePath(
    space: SpaceRecord,
    requestedPath: string,
    options: {
      allowMissing?: boolean;
      allowHidden?: boolean;
      expectedType?: "file" | "directory";
    } = {},
  ): Promise<ApprovedWorkspacePath> {
    const facts = await this.adapter.resolvePath(space, requestedPath);
    if (!facts.contained || facts.symlinkEscaped)
      throw new Error("Access denied: path outside workspace");
    if (facts.hidden && !options.allowHidden) throw new Error("Access denied: hidden path");
    if (!facts.exists && !options.allowMissing) throw new Error("Path not found");
    if (options.expectedType && facts.exists && facts.targetType !== options.expectedType) {
      throw new Error(`Expected ${options.expectedType}`);
    }
    const token = crypto.randomUUID();
    const approved = { token, path: facts.canonicalRelativePath, facts };
    this.tokens.set(token, { ...approved, expiresAt: Date.now() + TOKEN_TTL_MS });
    return approved;
  }

  consume(token: string): ApprovedWorkspacePath {
    const record = this.tokens.get(token);
    this.tokens.delete(token);
    if (!record || record.expiresAt < Date.now())
      throw new Error("Stale workspace resolution token");
    return { token: record.token, path: record.path, facts: record.facts };
  }
}
