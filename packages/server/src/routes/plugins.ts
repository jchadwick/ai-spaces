import * as fs from "node:fs";
import * as path from "node:path";
import { Hono } from "hono";
import { config } from "../config.js";

export const pluginsRouter = new Hono();

// Runtime-scoped plugin routes: /api/plugins/:runtime/*
// Each runtime gets its own subdirectory under AI_SPACES_PLUGIN_DIR.
// Currently supported: openclaw

// GET /api/plugins/openclaw/install.sh — dynamically-generated one-shot install + register script
pluginsRouter.get("/openclaw/install.sh", (c) => {
  const serverUrl = config.BASE_URL;
  const registrationToken = c.req.query("token") ?? "";
  const script = buildOpenClawInstallScript(serverUrl, registrationToken);
  return c.text(script, 200, {
    "Content-Type": "text/x-shellscript; charset=utf-8",
    "Content-Disposition": 'inline; filename="install.sh"',
    "Cache-Control": "no-store",
  });
});

// GET /api/plugins/:runtime/:artifact — serve a packaged plugin artifact
pluginsRouter.get("/:runtime/:artifact", (c) => {
  const runtime = c.req.param("runtime");
  const artifact = c.req.param("artifact");

  if (!isValidRuntimeName(runtime)) return c.text("Unknown runtime", 404);

  const target = resolvePluginArtifact(runtime, artifact);
  if (!target) return c.text("Plugin artifact not found", 404);

  const body = fs.readFileSync(target);
  return c.body(body, 200, {
    "Content-Type": getContentType(target),
    "Content-Length": String(body.byteLength),
    "Content-Disposition": `attachment; filename="${path.basename(target)}"`,
    "Cache-Control": target.endsWith(".meta.json") ? "no-cache" : "public, max-age=3600",
  });
});

// ── helpers ──────────────────────────────────────────────────────────────────

const KNOWN_RUNTIMES = new Set(["openclaw"]);

function isValidRuntimeName(runtime: string): boolean {
  return KNOWN_RUNTIMES.has(runtime);
}

function resolvePluginArtifact(runtime: string, artifact: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(artifact);
  } catch {
    return null;
  }

  // Artifact must be a plain filename — no path separators, no leading dots
  if (!decoded || decoded !== path.basename(decoded) || decoded.startsWith(".")) return null;
  if (!fs.existsSync(config.AI_SPACES_PLUGIN_DIR)) return null;

  const rootBase = fs.realpathSync(config.AI_SPACES_PLUGIN_DIR);
  const runtimeDir = path.resolve(rootBase, runtime);
  if (!runtimeDir.startsWith(`${rootBase}${path.sep}`)) return null;
  if (!fs.existsSync(runtimeDir)) return null;

  const candidate = path.resolve(runtimeDir, decoded);
  if (!candidate.startsWith(`${runtimeDir}${path.sep}`)) return null;
  if (!fs.existsSync(candidate)) return null;

  const realTarget = fs.realpathSync(candidate);
  if (!realTarget.startsWith(`${runtimeDir}${path.sep}`)) return null;
  const stat = fs.statSync(realTarget);
  return stat.isFile() ? realTarget : null;
}

function getContentType(filePath: string): string {
  if (filePath.endsWith(".tar.gz") || filePath.endsWith(".tgz")) return "application/gzip";
  const ext = path.extname(filePath);
  const types: Record<string, string> = {
    ".json": "application/json",
    ".zip": "application/zip",
    ".sh": "text/x-shellscript",
  };
  return types[ext] ?? "application/octet-stream";
}

// ── install script ────────────────────────────────────────────────────────────

function buildOpenClawInstallScript(serverUrl: string, registrationToken: string): string {
  const metaUrl = `${serverUrl}/api/plugins/openclaw/openclaw-spaces.meta.json`;
  const tokenSuffix = registrationToken.length > 0 ? `?token=${registrationToken}` : "";

  // Shell variable references that must not be interpolated by TypeScript
  // are written as plain strings and joined — no template expressions inside.
  const S = (v: string) => `\${${v}}`;

  return [
    `#!/usr/bin/env bash`,
    `# AI Spaces - OpenClaw plugin installer`,
    `# Server: ${serverUrl}`,
    `# Usage:  bash <(curl -fsSL '${serverUrl}/api/plugins/openclaw/install.sh${tokenSuffix}')`,
    `set -euo pipefail`,
    ``,
    `SERVER_URL="${serverUrl}"`,
    `REGISTRATION_TOKEN="${registrationToken}"`,
    `META_URL="${metaUrl}"`,
    ``,
    `log()  { echo "[ai-spaces] $*"; }`,
    `die()  { echo "[ai-spaces] ERROR: $*" >&2; exit 1; }`,
    ``,
    `# preflight`,
    `for cmd in curl node tar openclaw; do`,
    `  command -v "$cmd" >/dev/null 2>&1 || die "Required command not found: $cmd"`,
    `done`,
    ``,
    `# fetch metadata`,
    `log "Fetching plugin metadata from $META_URL"`,
    `META_JSON="$(curl -fsSL "$META_URL")" || die "Could not fetch plugin metadata"`,
    ``,
    `LATEST_VERSION="$(node -p "JSON.parse(process.argv[1]).latestVersion" "$META_JSON")"`,
    `ARTIFACT_FILENAME="$(node -p "const m=JSON.parse(process.argv[1]); m.artifacts.find(a=>a.version===m.latestVersion).filename" "$META_JSON")"`,
    `ARTIFACT_SHA256="$(node -p "const m=JSON.parse(process.argv[1]); m.artifacts.find(a=>a.version===m.latestVersion).sha256" "$META_JSON")"`,
    `ARTIFACT_URL="${S("SERVER_URL")}/api/plugins/openclaw/${S("ARTIFACT_FILENAME")}"`,
    ``,
    `log "Latest plugin version: ${S("LATEST_VERSION")}"`,
    ``,
    `# persistent install directory (files must survive this script's exit)`,
    `INSTALL_DIR="$HOME/.local/share/openclaw/ai-spaces"`,
    `mkdir -p "$INSTALL_DIR"`,
    ``,
    `# check if plugin is already installed and up to date`,
    `INSTALLED_VERSION=""`,
    `PLUGIN_LINK_EXISTS=false`,
    `if [ -d "$INSTALL_DIR" ] && [ -f "$HOME/.openclaw/openclaw.json" ]; then`,
    `  INSTALLED_VERSION="$(node -p "try{JSON.parse(require('fs').readFileSync('$HOME/.openclaw/openclaw.json','utf8')).plugins?.installs?.['ai-spaces']?.sourcePath?.match(/openclaw-spaces-(.+)/)?.[1]||''}catch{}" 2>/dev/null || true)"`,
    `  # Also check if linked plugin directory exists`,
    `  LINK_PATH="$(node -p "try{JSON.parse(require('fs').readFileSync('$HOME/.openclaw/openclaw.json','utf8')).plugins?.installs?.['ai-spaces']?.installPath||''}catch{}" 2>/dev/null || true)"`,
    `  if [ -n "$LINK_PATH" ] && [ -d "$LINK_PATH" ]; then`,
    `    PLUGIN_LINK_EXISTS=true`,
    `  fi`,
    `fi`,
    ``,
    `# Download to a temp file (fine to clean up later; files get extracted to INSTALL_DIR)`,
    `DOWNLOAD_FILE="$(mktemp)"`,
    `trap 'rm -f "$DOWNLOAD_FILE"' EXIT`,
    ``,
    `if [ "$PLUGIN_LINK_EXISTS" = true ] && [ "${S("INSTALLED_VERSION")}" = "${S("LATEST_VERSION")}" ]; then`,
    `  log "Plugin v${S("INSTALLED_VERSION")} is already installed and up to date. Skipping install."`,
    `else`,
    `  if [ "$PLUGIN_LINK_EXISTS" = true ]; then`,
    `    log "Upgrading plugin from v${S("INSTALLED_VERSION")} to v${S("LATEST_VERSION")}"`,
    `  else`,
    `    log "Installing plugin v${S("LATEST_VERSION")}"`,
    `  fi`,
    `  log "Downloading ${S("ARTIFACT_FILENAME")}"`,
    `  curl -fsSL "${S("ARTIFACT_URL")}" -o "${S("DOWNLOAD_FILE")}" \\`,
    `    || die "Download failed: ${S("ARTIFACT_URL")}"`,
    `  log "Verifying checksum"`,
    `  ACTUAL_SHA256="$(node -e "`,
    `    const {createHash}=require('crypto'),{readFileSync}=require('fs');`,
    `    process.stdout.write(createHash('sha256').update(readFileSync(process.argv[1])).digest('hex'));`,
    `  " "${S("DOWNLOAD_FILE")}")"`,
    `  if [ "${S("ACTUAL_SHA256")}" != "${S("ARTIFACT_SHA256")}" ]; then`,
    `    die "Checksum mismatch. expected=${S("ARTIFACT_SHA256")} actual=${S("ACTUAL_SHA256")}"`,
    `  fi`,
    `  log "Checksum verified: ${S("ACTUAL_SHA256")}"`,
    `  log "Extracting and installing plugin"`,
    `  tar -xzf "${S("DOWNLOAD_FILE")}" -C "$INSTALL_DIR"`,
    `  openclaw plugins install --link "$INSTALL_DIR/openclaw-spaces" \\`,
    `    || die "openclaw plugins install failed"`,
    `  log "Plugin v${S("LATEST_VERSION")} installed"`,
    `fi`,
    ``,
    `# registration`,
    `if [ -z "${S("REGISTRATION_TOKEN")}" ]; then`,
    `  log "No registration token provided - skipping server pairing."`,
    `  log "Re-run with: bash <(curl -fsSL '${S("SERVER_URL")}/api/plugins/openclaw/install.sh?token=YOUR_TOKEN')"`,
    `  exit 0`,
    `fi`,
    ``,
    `log "Registering with AI Spaces server at ${S("SERVER_URL")}"`,
    ``,
    `PLUGIN_PORT="${S("AI_SPACES_WS_PORT:-3002")}"`,
    `PLUGIN_HOST="${S("PLUGIN_URL:-http://127.0.0.1:$PLUGIN_PORT")}"`,
    ``,
    `REGISTER_BODY="$(node -e "process.stdout.write(JSON.stringify({`,
    `  registrationToken: process.argv[1],`,
    `  runtimeType: 'openclaw',`,
    `  name: 'openclaw-' + require('os').hostname(),`,
    `  pluginUrl: process.argv[2],`,
    `  acpBaseUrl: process.argv[2],`,
    `}))" "${S("REGISTRATION_TOKEN")}" "${S("PLUGIN_HOST")}")"`,
    ``,
    `REGISTER_RESPONSE="$(curl -fsSL -X POST "${S("SERVER_URL")}/api/internal/register" \\`,
    `  -H "Content-Type: application/json" \\`,
    `  -d "${S("REGISTER_BODY")}")" \\`,
    `  || die "Registration request failed"`,
    ``,
    `SERVER_ID="$(node -p "JSON.parse(process.argv[1]).serverId" "${S("REGISTER_RESPONSE")}" 2>/dev/null || true)"`,
    `CALLBACK_TOKEN="$(node -p "JSON.parse(process.argv[1]).callbackToken" "${S("REGISTER_RESPONSE")}" 2>/dev/null || true)"`,
    ``,
    `if [ -z "${S("SERVER_ID")}" ] || [ -z "${S("CALLBACK_TOKEN")}" ]; then`,
    `  die "Unexpected registration response: ${S("REGISTER_RESPONSE")}"`,
    `fi`,
    ``,
    `log "Registered with server (serverId: ${S("SERVER_ID")})"`,
    ``,
    `# verify round-trip`,
    `log "Verifying registration with a test reconcile"`,
    `RECONCILE_STATUS="$(curl -o /dev/null -s -w "%{http_code}" -X POST "${S("SERVER_URL")}/api/internal/reconcile" \\`,
    `  -H "Content-Type: application/json" \\`,
    `  -H "Authorization: Bearer ${S("CALLBACK_TOKEN")}" \\`,
    `  -d '{"spaces":[]}')"`,
    ``,
    `if [ "${S("RECONCILE_STATUS")}" = "200" ]; then`,
    `  log "Verification passed - plugin is paired and communicating with the server."`,
    `else`,
    `  log "WARNING: reconcile check returned HTTP ${S("RECONCILE_STATUS")} - the plugin may need to be restarted."`,
    `fi`,
    ``,
    `log "Setup complete."`,
    `echo ""`,
    `echo "Next steps:"`,
    `echo "  Set these environment variables in your OpenClaw configuration, then restart OpenClaw:"`,
    `echo ""`,
    `echo "  AI_SPACES_URL=${S("SERVER_URL")}"`,
    `echo "  AI_SPACES_WS_PORT=${S("PLUGIN_PORT")}"`,
    `echo ""`,
  ].join("\n");
}
