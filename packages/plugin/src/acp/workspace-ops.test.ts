import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getWorkspacePathFacts,
  listWorkspaceFiles,
  readWorkspaceFile,
  writeWorkspaceFile,
} from "./workspace-ops.js";

describe("workspace ops internal access", () => {
  let tempDir: string;
  let spaceRoot: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-ops-test-"));
    spaceRoot = path.join(tempDir, "space");
    fs.mkdirSync(spaceRoot, { recursive: true });
    fs.writeFileSync(path.join(spaceRoot, "README.md"), "hello");
    fs.writeFileSync(path.join(spaceRoot, "AGENTS.md"), "secret");
    fs.mkdirSync(path.join(spaceRoot, ".space"), { recursive: true });
    fs.writeFileSync(path.join(spaceRoot, ".space", "SPACE.md"), "hidden");
    fs.mkdirSync(path.join(spaceRoot, "memory"), { recursive: true });
    fs.writeFileSync(path.join(spaceRoot, "memory", "foo.md"), "hidden memory");
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("hides internal files from viewer listing", async () => {
    const files = await listWorkspaceFiles(spaceRoot, false, "");
    const paths = JSON.stringify(files);
    expect(paths).toContain("README.md");
    expect(paths).not.toContain("AGENTS.md");
    expect(paths).not.toContain(".space");
    expect(paths).not.toContain("memory");
  });

  it("includes internal files only when Hono requests them", async () => {
    const files = await listWorkspaceFiles(spaceRoot, true, "");
    const paths = JSON.stringify(files);
    expect(paths).toContain("AGENTS.md");
    expect(paths).toContain(".space");
    expect(paths).toContain("memory");
  });

  it("mechanically reads internal files after Hono approval", async () => {
    const data = await readWorkspaceFile(spaceRoot, "AGENTS.md");
    expect(data.content).toBe("secret");
  });

  it("blocks listing and reads under symlinked directories outside the workspace", async () => {
    const externalDir = path.join(tempDir, "brain", "Vacations");
    fs.mkdirSync(externalDir, { recursive: true });
    fs.writeFileSync(path.join(externalDir, "Maine.md"), "# Maine");
    fs.symlinkSync(externalDir, path.join(spaceRoot, "LinkedVacations"));

    const files = await listWorkspaceFiles(spaceRoot, false, "");
    const paths = JSON.stringify(files);
    expect(paths).not.toContain("LinkedVacations");
    await expect(readWorkspaceFile(spaceRoot, "LinkedVacations/Maine.md")).rejects.toThrow(
      "Access denied",
    );
  });

  it("blocks writes under symlinked directories outside the workspace", async () => {
    const externalDir = path.join(tempDir, "brain", "Vacations");
    fs.mkdirSync(externalDir, { recursive: true });
    fs.symlinkSync(externalDir, path.join(spaceRoot, "LinkedVacations"));

    await expect(writeWorkspaceFile(spaceRoot, "LinkedVacations/New.md", "# New")).rejects.toThrow(
      "Access denied",
    );
    expect(fs.existsSync(path.join(externalDir, "New.md"))).toBe(false);
  });

  it("blocks listing traversal outside the workspace", async () => {
    await expect(listWorkspaceFiles(spaceRoot, false, "../../")).rejects.toThrow("Access denied");
  });

  it("reports path facts without granting access", async () => {
    await expect(getWorkspacePathFacts(spaceRoot, "README.md")).resolves.toMatchObject({
      canonicalRelativePath: "README.md",
      targetType: "file",
      exists: true,
      contained: true,
      hidden: false,
      symlinkEscaped: false,
    });
    await expect(getWorkspacePathFacts(spaceRoot, "../../etc/passwd")).resolves.toMatchObject({
      contained: false,
      symlinkEscaped: true,
    });
  });

  it("reports internal symlink aliases so Hono can deny them", async () => {
    fs.symlinkSync(path.join(spaceRoot, ".space", "SPACE.md"), path.join(spaceRoot, "public.md"));

    const files = await listWorkspaceFiles(spaceRoot, false, "");
    expect(JSON.stringify(files)).not.toContain("public.md");
    await expect(getWorkspacePathFacts(spaceRoot, "public.md")).resolves.toMatchObject({
      hidden: true,
    });
    await expect(readWorkspaceFile(spaceRoot, "public.md")).resolves.toMatchObject({
      content: "hidden",
    });
  });

  it("skips broken symlinks in listings", async () => {
    fs.symlinkSync(path.join(tempDir, "missing"), path.join(spaceRoot, "Broken"));

    const files = await listWorkspaceFiles(spaceRoot, false, "");
    expect(JSON.stringify(files)).not.toContain("Broken");
  });
});
