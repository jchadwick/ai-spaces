# OpenClaw Plugin Registration Guide

## Overview

OpenClaw uses a modular plugin architecture where every capability is a plugin. This document covers how to properly register a plugin with OpenClaw.

## Entry Point Helpers

| Helper | Import Path | Use Case |
|--------|-------------|----------|
| `definePluginEntry` | `openclaw/plugin-sdk/plugin-entry` | Non-channel plugins (providers, tools, hooks) |
| `defineChannelPluginEntry` | `openclaw/plugin-sdk/core` | Messaging channel plugins |
| `defineSetupPluginEntry` | `openclaw/plugin-sdk/core` | Lightweight setup entry for disabled channels |

## File Structure

```
my-plugin/
├── package.json              # With openclaw metadata
├── openclaw.plugin.json      # Manifest
├── tsconfig.json
├── src/
│   ├── index.ts              # Full entry (defineChannelPluginEntry)
│   ├── setup-entry.ts        # Lightweight entry (defineSetupPluginEntry)
│   ├── channel.ts            # ChannelPlugin implementation
│   ├── runtime.ts             # Runtime store initialization
│   └── ...
```

## Required Configuration

### openclaw.plugin.json

```json
{
  "id": "ai-spaces",
  "name": "AI Spaces",
  "description": "Share portions of your agent workspace with collaborators",
  "kind": "channel",
  "configSchema": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "enabled": { "type": "boolean", "default": true },
      "basePath": { "type": "string", "default": "/spaces" }
    }
  }
}
```

### package.json openclaw block

```json
{
  "openclaw": {
    "extensions": ["./dist/index.js"],
    "setupEntry": "./dist/setup-entry.js"
  }
}
```

## Registration Modes

| Mode | When Used | What Gets Registered |
|------|-----------|---------------------|
| `"full"` | Normal gateway startup | Everything |
| `"setup-only"` | Disabled/unconfigured channel | Channel registration only |
| `"setup-runtime"` | Setup flow with runtime | Channel + lightweight runtime |
| `"cli-metadata"` | Root help / CLI metadata | CLI descriptors only |

## Full Channel Plugin Entry (index.ts)

```typescript
import { defineChannelPluginEntry } from "openclaw/plugin-sdk/core";
import { myChannelPlugin } from "./channel.js";
import { setRuntime } from "./runtime.js";

export default defineChannelPluginEntry({
  id: "ai-spaces",
  name: "AI Spaces",
  description: "Share portions of your agent workspace with collaborators",
  plugin: myChannelPlugin,
  setRuntime,
  
  async registerFull(api) {
    api.registerHttpRoute({ path: "/api/spaces", handler: async (req, res) => { /* ... */ } });
    api.registerCli(({ program }) => { /* CLI setup */ });
    await seedAdminUser();
  },
});
```

## Setup Entry (setup-entry.ts)

```typescript
import { defineSetupPluginEntry } from "openclaw/plugin-sdk/core";
import { myChannelPlugin } from "./channel.js";

export default defineSetupPluginEntry(myChannelPlugin);
```

## Runtime Store

```typescript
import { createPluginRuntimeStore } from "openclaw/plugin-sdk/runtime-store";
import type { PluginRuntime } from "openclaw/plugin-sdk/runtime-store";

const store = createPluginRuntimeStore<PluginRuntime>();
```

## Registration API Methods

- `api.registerProvider(...)` - Text inference (LLM)
- `api.registerChannel(...)` - Messaging channel
- `api.registerTool(...)` - Agent tool
- `api.registerHook(...)` - Event hook
- `api.registerService(...)` - Background service
- `api.registerHttpRoute(...)` - HTTP endpoint
- `api.registerCli(...)` - CLI commands
- `api.registerSpeechProvider(...)` - Text-to-speech/STT

## Plugin Lifecycle

1. **Discovery** - Scans `plugins.load.paths`, `~/.openclaw/*.ts`, and `/plugins/*/index.ts`
2. **Loading** - Uses dynamic imports (jiti for TypeScript support)
3. **Registration** - Calls the `register(api)` callback with an `OpenClawPluginApi` object
4. **Activation** - Optional `activate()` method for deferred initialization