import type { SpaceConfig } from '@ai-spaces/shared';
import { validatePath } from '@ai-spaces/shared';
import { config } from '../config.js';

/**
 * Argument keys that are treated as file-system paths and validated
 * against the space root on every tool call.
 */
const PATH_ARG_KEYS = new Set([
  'path',
  'file',
  'filePath',
  'file_path',
  'target',
  'destination',
  'dest',
  'source',
  'src',
  'dir',
  'directory',
  'dirPath',
  'dir_path',
  'filename',
]);

/**
 * Minimal shape of the `before_tool_call` event object from the OpenClaw
 * plugin SDK (`PluginHookBeforeToolCallEvent`). These types are not re-exported
 * from the public SDK entry-point, so we mirror just the fields we need.
 */
interface BeforeToolCallEvent {
  toolName: string;
  params: Record<string, unknown>;
  runId?: string;
  toolCallId?: string;
}

/**
 * Minimal shape of the `before_tool_call` result object
 * (`PluginHookBeforeToolCallResult`).
 */
interface BeforeToolCallResult {
  params?: Record<string, unknown>;
  block?: boolean;
  blockReason?: string;
}

export type ToolHookHandler = (
  event: unknown,
  ctx?: unknown
) => Promise<BeforeToolCallResult | void> | BeforeToolCallResult | void;

export interface ToolHookConfig {
  spaceConfig: SpaceConfig;
  /** Absolute path to the space root directory (workspace directory). */
  spacePath: string;
}

/**
 * Create a `before_tool_call` hook handler that enforces:
 *   1. Tool deny-list — blocks tools listed in `spaceConfig.agent.denied`
 *      (merged with `DEFAULT_DENIED_TOOLS`).
 *   2. Path containment — for any argument whose key looks like a file-system
 *      path, verifies the resolved path stays inside `spacePath`.
 *
 * Register the returned handler via `api.registerHook('before_tool_call', handler)`.
 */
export function createToolHook({ spaceConfig, spacePath }: ToolHookConfig): ToolHookHandler {
  // Build the effective denied-tools set (space config + global defaults).
  const configDenied = spaceConfig.agent?.denied ?? [];
  const effectiveDenied = new Set([
    ...configDenied,
    ...config.DEFAULT_DENIED_TOOLS,
  ]);

  return function toolHookHandler(rawEvent: unknown): BeforeToolCallResult | void {
    // Defensive type guard — the runtime passes a BeforeToolCallEvent object.
    if (!rawEvent || typeof rawEvent !== 'object') {
      return;
    }

    const event = rawEvent as Partial<BeforeToolCallEvent>;
    const toolName = typeof event.toolName === 'string' ? event.toolName : undefined;
    const params =
      event.params && typeof event.params === 'object' && !Array.isArray(event.params)
        ? event.params
        : undefined;

    if (!toolName) {
      return;
    }

    // --- 1. Tool deny-list check ---
    if (effectiveDenied.has(toolName)) {
      console.warn(`[ai-spaces] Blocked denied tool: ${toolName}`);
      return {
        block: true,
        blockReason: `Tool "${toolName}" is not allowed in this space.`,
      };
    }

    // --- 2. Path containment check ---
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (typeof value !== 'string' || !value) continue;

        // For known path keys, always validate.
        // For other string args, validate if they look like a filesystem path
        // (absolute path, home-dir reference, or contains traversal segments).
        const isKnownPathKey = PATH_ARG_KEYS.has(key);
        const looksLikePath =
          value.startsWith('/') ||
          value.startsWith('~/') ||
          value.startsWith('~\\') ||
          value.includes('..') ||
          value.includes('./');

        if (!isKnownPathKey && !looksLikePath) continue;

        const result = validatePath(value, spacePath);
        if (!result.valid) {
          console.warn(
            `[ai-spaces] Blocked path traversal: tool="${toolName}" arg="${key}" value="${value}" error="${result.error}"`
          );
          return {
            block: true,
            blockReason:
              result.error === 'Access denied'
                ? `Path "${value}" is outside the space directory.`
                : `Invalid path argument "${key}": ${result.error ?? 'invalid path'}.`,
          };
        }
      }
    }

    // Allow the tool call to proceed (return void).
  };
}
