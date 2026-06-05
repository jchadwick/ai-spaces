import type { WorkspacePathFacts } from "@ai-spaces/shared";
import { describe, expect, it, vi } from "vitest";
import type { AgentAdapter } from "../adapters/agent-adapter.js";
import type { SpaceRecord } from "../space-store.js";
import { WorkspacePolicy } from "./workspace-policy.js";

const space = { id: "space-1" } as SpaceRecord;

function policyFor(facts: WorkspacePathFacts): WorkspacePolicy {
  return new WorkspacePolicy({
    resolvePath: vi.fn(async () => facts),
  } as unknown as AgentAdapter);
}

const visibleFile: WorkspacePathFacts = {
  requestedPath: "notes.md",
  canonicalRelativePath: "notes.md",
  targetType: "file",
  exists: true,
  contained: true,
  hidden: false,
  symlinkEscaped: false,
};

describe("WorkspacePolicy", () => {
  it("approves a visible contained path and consumes its short-lived token once", async () => {
    const policy = policyFor(visibleFile);
    const approved = await policy.approvePath(space, "notes.md", { expectedType: "file" });
    expect(policy.consume(approved.token).path).toBe("notes.md");
    expect(() => policy.consume(approved.token)).toThrow("Stale workspace resolution token");
  });

  it.each([
    ["traversal", { ...visibleFile, requestedPath: "../../etc/passwd", contained: false }],
    [
      "symlink escape",
      { ...visibleFile, requestedPath: "linked/passwd", contained: false, symlinkEscaped: true },
    ],
  ])("rejects %s facts", async (_label, facts) => {
    await expect(policyFor(facts).approvePath(space, facts.requestedPath)).rejects.toThrow(
      "outside workspace",
    );
  });

  it("rejects hidden paths unless Hono explicitly allows internal access", async () => {
    const hidden = {
      ...visibleFile,
      requestedPath: ".space/SPACE.md",
      canonicalRelativePath: ".space/SPACE.md",
      hidden: true,
    };
    await expect(policyFor(hidden).approvePath(space, hidden.requestedPath)).rejects.toThrow(
      "hidden path",
    );
    await expect(
      policyFor(hidden).approvePath(space, hidden.requestedPath, { allowHidden: true }),
    ).resolves.toMatchObject({
      path: ".space/SPACE.md",
    });
  });
});
