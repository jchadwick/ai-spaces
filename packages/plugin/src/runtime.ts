import { createPluginRuntimeStore } from 'openclaw/plugin-sdk/runtime-store';
import type { PluginRuntime } from 'openclaw/plugin-sdk/runtime-store';

const store = createPluginRuntimeStore<PluginRuntime>('ai-spaces runtime not initialized');

export function setRuntime(runtime: PluginRuntime): void {
  store.setRuntime(runtime);
}

export function getRuntime(): PluginRuntime {
  return store.getRuntime();
}

export function tryGetRuntime(): PluginRuntime | null {
  return store.tryGetRuntime();
}