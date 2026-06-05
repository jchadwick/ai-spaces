import * as path from "node:path";

const HOME = process.env.HOME ?? "";

const parseList = (value: string | undefined, defaults: string[]): string[] =>
  value
    ? value
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : defaults;

export interface ConfigDiagnostics {
  warnings: string[];
  invalid: string[];
}

const configDiagnostics: ConfigDiagnostics = {
  warnings: [],
  invalid: [],
};

function warn(message: string): void {
  configDiagnostics.warnings.push(message);
}

function markInvalid(name: string, message: string): void {
  if (!configDiagnostics.invalid.includes(name)) {
    configDiagnostics.invalid.push(name);
  }
  warn(message);
}

function parseHttpUrl(value: string | undefined, name: string, fallback: string): string {
  const candidate = value ?? fallback;
  try {
    const parsed = new URL(candidate);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      markInvalid(
        name,
        `${name} must use http or https, got '${parsed.protocol}'. Falling back to '${fallback}'.`,
      );
      return fallback;
    }
    return candidate;
  } catch {
    markInvalid(
      name,
      `${name} must be a valid URL, got '${candidate}'. Falling back to '${fallback}'.`,
    );
    return fallback;
  }
}

function parseAbsolutePath(value: string | undefined, name: string, fallback: string): string {
  const candidate = value ?? fallback;
  if (!path.isAbsolute(candidate)) {
    markInvalid(
      name,
      `${name} must be an absolute path, got '${candidate}'. Falling back to '${fallback}'.`,
    );
    return fallback;
  }
  return candidate;
}

function parsePort(value: string | undefined, name: string, fallback: number): number {
  const candidate = value ?? String(fallback);
  const parsed = Number.parseInt(candidate, 10);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 65535) {
    markInvalid(
      name,
      `${name} must be a valid port (1-65535), got '${candidate}'. Falling back to '${fallback}'.`,
    );
    return fallback;
  }
  return parsed;
}

function parsePositiveNumber(value: string | undefined, name: string, fallback: number): number {
  const candidate = value ?? String(fallback);
  const parsed = Number.parseFloat(candidate);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    markInvalid(
      name,
      `${name} must be a positive number, got '${candidate}'. Falling back to '${fallback}'.`,
    );
    return fallback;
  }
  return parsed;
}

function parseListenHost(value: string | undefined, name: string, fallback: string): string {
  const candidate = (value ?? fallback).trim();
  if (!candidate) {
    markInvalid(name, `${name} must be a non-empty hostname or IP. Falling back to '${fallback}'.`);
    return fallback;
  }
  return candidate;
}

export const config = {
  OPENCLAW_HOME: parseAbsolutePath(process.env.OPENCLAW_HOME, "OPENCLAW_HOME", "/home/node"),
  JWT_SECRET: process.env.JWT_SECRET ?? "ai-spaces-dev-secret-change-in-production",
  AI_SPACES_ROOT: process.env.AI_SPACES_ROOT ?? path.join(HOME, "ai-spaces-workspace"),
  AI_SPACES_URL: parseHttpUrl(process.env.AI_SPACES_URL, "AI_SPACES_URL", "http://127.0.0.1:3001"),
  AI_SPACES_WS_PORT: parsePort(process.env.AI_SPACES_WS_PORT, "AI_SPACES_WS_PORT", 3002),
  AI_SPACES_WS_HOST: parseListenHost(process.env.AI_SPACES_WS_HOST, "AI_SPACES_WS_HOST", "0.0.0.0"),
  AI_SPACES_PLUGIN_STATE_FILE:
    process.env.AI_SPACES_PLUGIN_STATE_FILE ??
    path.join(process.env.OPENCLAW_HOME ?? "/home/node", "ai-spaces-registration.json"),
  GATEWAY_TOKEN: process.env.GATEWAY_TOKEN ?? "",
  PLUGIN_URL: process.env.PLUGIN_URL,
  DEFAULT_DENIED_TOOLS: parseList(process.env.AI_SPACES_DENIED_TOOLS, [
    "exec",
    "messaging",
    "spawn_agents",
    "browser",
    "credentials",
  ]),
  DEFAULT_ALLOWED_TOOLS: parseList(process.env.AI_SPACES_ALLOWED_TOOLS, [
    "read",
    "write",
    "edit",
    "glob",
  ]),
  MAX_FILE_SIZE_MB: parsePositiveNumber(process.env.MAX_FILE_SIZE_MB, "MAX_FILE_SIZE_MB", 10),
  FILE_STREAM_THRESHOLD_MB: parsePositiveNumber(
    process.env.FILE_STREAM_THRESHOLD_MB,
    "FILE_STREAM_THRESHOLD_MB",
    1,
  ),
};

if (!config.GATEWAY_TOKEN) {
  markInvalid(
    "GATEWAY_TOKEN",
    "GATEWAY_TOKEN is missing; registration/reconcile and auth-dependent callbacks will run in degraded mode.",
  );
}

export const diagnostics = Object.freeze(configDiagnostics);

export const configStatus = Object.freeze({
  hasGatewayToken: Boolean(config.GATEWAY_TOKEN),
  isDegraded: configDiagnostics.invalid.length > 0,
});
