import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const args = parseArgs(process.argv.slice(2));
const distDir = requiredArg(args, "dist");
const packagePath = requiredArg(args, "package");
const outDir = requiredArg(args, "out");

const pkg = JSON.parse(readFileSync(packagePath, "utf-8"));
const version = String(pkg.version ?? "").trim();
if (!version) throw new Error(`Missing version in ${packagePath}`);

mkdirSync(outDir, { recursive: true });
for (const entry of readdirSync(outDir)) {
  if (/^openclaw-spaces-.*\.tar\.gz$/.test(entry) || entry === "openclaw-spaces.meta.json") {
    rmSync(join(outDir, entry), { force: true });
  }
}

const tempDir = mkdtempSync(join(tmpdir(), "ai-spaces-openclaw-plugin-"));
try {
  const packageRoot = join(tempDir, "openclaw-spaces");
  mkdirSync(join(packageRoot, "dist"), { recursive: true });
  cpSync(distDir, join(packageRoot, "dist"), { recursive: true });
  cpSync(packagePath, join(packageRoot, "package.json"));

  const artifactFilename = `openclaw-spaces-${version}.tar.gz`;
  const artifactPath = resolve(outDir, artifactFilename);
  execFileSync("tar", ["-czf", artifactPath, "-C", tempDir, "openclaw-spaces"], {
    stdio: "inherit",
  });

  const artifact = readFileSync(artifactPath);
  const metadata = {
    schemaVersion: 1,
    runtime: "openclaw",
    packageName: pkg.name,
    latestVersion: version,
    generatedAt: new Date().toISOString(),
    artifacts: [
      {
        version,
        filename: artifactFilename,
        path: `/plugins/${artifactFilename}`,
        contentType: "application/gzip",
        sizeBytes: statSync(artifactPath).size,
        sha256: createHash("sha256").update(artifact).digest("hex"),
      },
    ],
    dependencies: pkg.dependencies ?? {},
    install: {
      checkMetadata: "GET /plugins/openclaw-spaces.meta.json",
      download: `GET /plugins/${artifactFilename}`,
      extract: `tar -xzf ${artifactFilename}`,
      register: 'openclaw plugins install --link "./openclaw-spaces"',
    },
  };

  writeFileSync(
    resolve(outDir, "openclaw-spaces.meta.json"),
    `${JSON.stringify(metadata, null, 2)}\n`,
  );
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, "");
    const value = argv[i + 1];
    if (!key || !value) throw new Error(`Invalid arguments: ${argv.join(" ")}`);
    parsed[key] = value;
  }
  return parsed;
}

function requiredArg(args, name) {
  const value = args[name];
  if (!value) throw new Error(`Missing --${name}`);
  return resolve(value);
}
