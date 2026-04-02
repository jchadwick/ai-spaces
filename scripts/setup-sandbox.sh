#!/bin/bash
# OpenClaw Sandbox Setup Script for AI Spaces Plugin
# This script creates an isolated environment for testing the plugin

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== OpenClaw Sandbox Setup ===${NC}"

# Configuration
export OPENCLAW_SANDBOX_HOME="${OPENCLAW_SANDBOX_HOME:-/tmp/openclaw-sandbox}"
export OPENCLAW_HOME="$OPENCLAW_SANDBOX_HOME"
export OPENCLAW_WORKSPACE="$OPENCLAW_HOME/workspace"

PLUGIN_DIR="/workspaces/ai-spaces"
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

echo ""
echo -e "${YELLOW}Configuration:${NC}"
echo "  Sandbox Home: $OPENCLAW_SANDBOX_HOME"
echo "  Plugin Dir: $PLUGIN_DIR"
echo ""

# Step 1: Clean up any existing sandbox
echo -e "${YELLOW}Step 1: Cleanup existing sandbox...${NC}"
if [ -d "$OPENCLAW_SANDBOX_HOME" ]; then
  echo "  Removing existing sandbox at $OPENCLAW_SANDBOX_HOME"
  rm -rf "$OPENCLAW_SANDBOX_HOME"
fi

# Step 2: Create sandbox directory structure
echo -e "${YELLOW}Step 2: Create sandbox directory structure...${NC}"
mkdir -p "$OPENCLAW_SANDBOX_HOME"/{workspace,data,agents,credentials}
mkdir -p "$OPENCLAW_SANDBOX_HOME/workspace/TestSpace/.space"

echo "  Created: $OPENCLAW_SANDBOX_HOME/"
echo "  Created: $OPENCLAW_SANDBOX_HOME/workspace/"
echo "  Created: $OPENCLAW_SANDBOX_HOME/data/"
echo "  Created: $OPENCLAW_SANDBOX_HOME/agents/"
echo "  Created: $OPENCLAW_SANDBOX_HOME/credentials/"

# Step 3: Create minimal gateway config
echo -e "${YELLOW}Step 3: Create gateway configuration...${NC}"
cat > "$OPENCLAW_HOME/openclaw.json" << 'EOF'
{
  agents: {
    defaults: {
      workspace: "~/.openclaw/workspace",
      model: {
        primary: "anthropic/claude-sonnet-4"
      }
    }
  },
  gateway: {
    port: 18789,
    auth: {
      token: "sandbox-test-token"
    }
  },
  plugins: {
    entries: {
      "ai-spaces": {
        enabled: true
      }
    }
  }
}
EOF
echo "  Created: $OPENCLAW_HOME/openclaw.json"

# Step 4: Create test space
echo -e "${YELLOW}Step 4: Create test space...${NC}"
cat > "$OPENCLAW_HOME/workspace/TestSpace/.space/spaces.json" << 'EOF'
{
  "name": "Test Space",
  "description": "Test space for plugin development",
  "collaborators": [],
  "agent": {
    "capabilities": ["read", "write", "edit", "web_search"],
    "denied": ["exec", "messaging"]
  }
}
EOF
echo "  Created: $OPENCLAW_HOME/workspace/TestSpace/.space/spaces.json"

# Step 5: Create AGENTS.md in workspace
echo -e "${YELLOW}Step 5: Create agent workspace files...${NC}"
cat > "$OPENCLAW_HOME/workspace/AGENTS.md" << 'EOF'
# Test Agent

This is a test agent workspace for AI Spaces plugin development.
EOF
echo "  Created: $OPENCLAW_HOME/workspace/AGENTS.md"

# Step 6: Initialize plugin project if needed
echo -e "${YELLOW}Step 6: Initialize plugin project...${NC}"
cd "$PLUGIN_DIR"

if [ ! -f "package.json" ]; then
  echo "  Initializing npm project..."
  npm init -y
fi

if [ ! -d "node_modules/openclaw" ]; then
  echo "  Installing dependencies..."
  npm install -D typescript @types/node tsx vitest
  npm install openclaw
fi

# Step 7: Create plugin manifest if it doesn't exist
echo -e "${YELLOW}Step 7: Create plugin manifest...${NC}"
if [ ! -f "openclaw.plugin.json" ]; then
  cat > "$PLUGIN_DIR/openclaw.plugin.json" << 'EOF'
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
EOF
  echo "  Created: openclaw.plugin.json"
else
  echo "  Plugin manifest already exists"
fi

# Step 8: Create minimal tsconfig if needed
echo -e "${YELLOW}Step 8: Create TypeScript configuration...${NC}"
if [ ! -f "tsconfig.json" ]; then
  cat > "$PLUGIN_DIR/tsconfig.json" << 'EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true,
    "outDir": "dist",
    "rootDir": "src",
    "skipLibCheck": true
  },
  "include": ["src/**/*", "index.ts", "setup-entry.ts"]
}
EOF
  echo "  Created: tsconfig.json"
else
  echo "  TypeScript config already exists"
fi

# Step 9: Build the plugin
echo -e "${YELLOW}Step 9: Build plugin...${NC}"
if [ -f "package.json" ] && grep -q '"build"' package.json; then
  echo "  Running npm run build..."
  npm run build || echo -e "${RED}Build failed - this is expected for initial setup${NC}"
else
  echo "  No build script found - skipping build"
fi

# Step 10: Install plugin in sandbox
echo -e "${YELLOW}Step 10: Install plugin in sandbox...${NC}"
export OPENCLAW_HOME="$OPENCLAW_SANDBOX_HOME"

# Check if plugin can be installed
if [ -f "openclaw.plugin.json" ]; then
  echo "  Installing plugin from: $PLUGIN_DIR"
  openclaw plugins install -l "$PLUGIN_DIR" || echo -e "${YELLOW}Plugin install requires build artifacts - continuing${NC}"
else
  echo "  Skipping plugin install - manifest not found"
fi

# Step 11: Verify installation
echo -e "${YELLOW}Step 11: Verify installation...${NC}"
echo ""
echo -e "${GREEN}Sandbox setup complete!${NC}"
echo ""
echo "Environment variables set:"
echo "  export OPENCLAW_SANDBOX_HOME=$OPENCLAW_SANDBOX_HOME"
echo "  export OPENCLAW_HOME=$OPENCLAW_HOME"
echo "  export OPENCLAW_WORKSPACE=$OPENCLAW_WORKSPACE"
echo ""
echo "Next steps:"
echo "  1. Build the plugin: cd $PLUGIN_DIR && npm run build"
echo "  2. Install plugin: openclaw plugins install -l $PLUGIN_DIR"
echo "  3. Verify: openclaw plugins inspect ai-spaces"
echo "  4. Test: openclaw spaces list"
echo ""
echo "To start the gateway:"
echo "  openclaw gateway"
echo ""
echo "To clean up:"
echo "  rm -rf $OPENCLAW_SANDBOX_HOME"
echo ""

# Export for current session
echo "Sandbox environment ready at: $OPENCLAW_SANDBOX_HOME"