import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { scanWorkspace } from "@ai-spaces/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("space discovery symlink handling", () => {
  let tempDir: string;
  let workspaceRoot: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "space-discovery-test-"));
    workspaceRoot = path.join(tempDir, "workspace");
    fs.mkdirSync(workspaceRoot, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("does not discover spaces inside symlinked directories", () => {
    const realSpace = path.join(workspaceRoot, "Travel");
    fs.mkdirSync(path.join(realSpace, ".space"), { recursive: true });
    fs.writeFileSync(
      path.join(realSpace, ".space", "spaces.json"),
      JSON.stringify({ id: "travel", name: "Travel" }),
    );

    const externalDir = path.join(tempDir, "brain", "Vacations");
    fs.mkdirSync(path.join(externalDir, ".space"), { recursive: true });
    fs.writeFileSync(
      path.join(externalDir, ".space", "spaces.json"),
      JSON.stringify({ id: "vacations", name: "Vacations" }),
    );
    fs.symlinkSync(externalDir, path.join(realSpace, "LinkedVacations"));

    const spaces = scanWorkspace(workspaceRoot, workspaceRoot, "travel");
    expect(spaces.map((space) => space.id)).toEqual(["travel"]);
    expect(spaces.map((space) => space.path)).toEqual(["Travel"]);
  });
});
