import { build } from "esbuild";
import { cpSync, existsSync, mkdirSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pluginDir = resolve(__dirname, "..");
const sharedDist = resolve(pluginDir, "../shared/dist");
const webDist = resolve(pluginDir, "../web/dist");
const pluginDist = resolve(__dirname, "../dist");
const pluginWebDist = resolve(pluginDist, "web");

const cjsShim = `import { createRequire } from 'module';\nconst require = createRequire(import.meta.url);\n`;

// Bundle index.js into a single self-contained file (keeps openclaw/* as external)
await build({
  entryPoints: [resolve(pluginDist, "index.js")],
  bundle: true,
  format: "esm",
  platform: "node",
  target: "esnext",
  outfile: resolve(pluginDist, "index.js"),
  allowOverwrite: true,
  packages: "bundle",
  external: ["openclaw", "openclaw/*"],
  banner: { js: cjsShim },
});
console.log("Bundled plugin index.js");

// Bundle setup-entry.js into a single self-contained file
if (existsSync(resolve(pluginDist, "setup-entry.js"))) {
  await build({
    entryPoints: [resolve(pluginDist, "setup-entry.js")],
    bundle: true,
    format: "esm",
    platform: "node",
    target: "esnext",
    outfile: resolve(pluginDist, "setup-entry.js"),
    allowOverwrite: true,
    packages: "bundle",
    external: ["openclaw", "openclaw/*"],
    banner: { js: cjsShim },
  });
  console.log("Bundled plugin setup-entry.js");
}

// Bundle routes/space-ws.js as standalone (used by docker entrypoint directly).
// npm packages are available in /plugins/node_modules at runtime, so keep them external.
// @ai-spaces/shared is a workspace package not available in the container, so bundle it in.
const spaceWsDist = resolve(pluginDist, "routes/space-ws.js");
if (existsSync(spaceWsDist)) {
  await build({
    entryPoints: [spaceWsDist],
    bundle: true,
    format: "esm",
    platform: "node",
    target: "esnext",
    outfile: spaceWsDist,
    allowOverwrite: true,
    external: [
      "openclaw",
      "openclaw/*",
      "ws",
      "bcrypt",
      "chokidar",
      "jsonwebtoken",
      "mime-types",
      "zod",
    ],
    banner: { js: cjsShim },
  });
  console.log("Bundled routes/space-ws.js");
}

// Bundle shared package (kept for reference/compat but no longer needed at runtime)
const sharedTarget = resolve(pluginDist, "shared");
if (existsSync(sharedDist)) {
  mkdirSync(sharedTarget, { recursive: true });
  cpSync(sharedDist, sharedTarget, { recursive: true });
  console.log("Bundled shared package into plugin");
} else {
  console.log("Shared dist not found, skipping bundle");
}

// Bundle web assets
if (existsSync(webDist)) {
  mkdirSync(pluginWebDist, { recursive: true });
  cpSync(webDist, pluginWebDist, { recursive: true });
  console.log("Bundled web assets into plugin");
} else {
  console.log("Web dist not found, skipping bundle");
}

// Copy plugin manifest to dist
const manifestSource = resolve(pluginDir, "openclaw.plugin.json");
const manifestTarget = resolve(pluginDist, "openclaw.plugin.json");
if (existsSync(manifestSource)) {
  cpSync(manifestSource, manifestTarget);
  console.log("Bundled plugin manifest");
}
