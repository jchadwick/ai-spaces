# Node Module Loading in OpenClaw Plugins

## Overview

OpenClaw plugins run as ES modules (`"type": "module"` in package.json). This document covers the correct and incorrect ways to load Node.js modules and third-party dependencies.

## ES Modules Only

OpenClaw plugins are bundled and loaded as ES modules. This means:

- CommonJS `require()` is NOT available
- Dynamic `import()` works for conditional loading
- All imports should be at the module top level

## Correct Import Patterns

### Static Imports (Recommended)

```typescript
// Third-party packages
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';

// Node.js built-in modules (use node: prefix)
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
```

### Dynamic Imports (Conditional Loading)

Only when you need conditional/optional loading:

```typescript
async function loadOptionalModule() {
  const mod = await import('optional-package');
  return mod.default;
}
```

## Incorrect - Will Fail

```typescript
// NEVER do this in ES modules
const jwt = require('jsonwebtoken');        // ❌ CommonJS only
const fs = require('node:fs');            // ❌ Won't work
const path = require('path');            // ❌ Use 'node:path' instead
```

## Why This Matters

1. **No runtime errors**: ES modules cannot use `require()` - it will throw at runtime
2. **Build verification**: The TypeScript compiler may not catch this in all configurations
3. **Consistency**: OpenClaw bundles plugins as ES modules for proper tree-shaking

## Verification

Always run these before testing:

```bash
npm run lint    # Catches require() usage via @typescript-eslint/no-var-requires
npm run build   # Should compile successfully
```

## Related

- [AGENTS.md](../../AGENTS.md) - Development guidelines
- [OpenClaw Documentation](https://docs.openclaw.ai) - Plugin development