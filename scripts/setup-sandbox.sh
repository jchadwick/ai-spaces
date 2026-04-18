#!/bin/bash
# OpenClaw Sandbox Setup Script for AI Spaces Plugin

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}=== OpenClaw Sandbox Setup ===${NC}"

# Configuration
export OPENCLAW_SANDBOX_HOME="${OPENCLAW_SANDBOX_HOME:-/tmp/openclaw-sandbox}"
export OPENCLAW_HOME="$OPENCLAW_SANDBOX_HOME"
export OPENCLAW_WORKSPACE="$OPENCLAW_HOME/workspace"
export OPENCLAW_STATE_DIR="$OPENCLAW_HOME/data"
export OPENCLAW_CONFIG_PATH="$OPENCLAW_HOME/openclaw.json"

# Set GOOGLE_API_KEY
GOOGLE_API_KEY="${GOOGLE_API_KEY:-${GOOGLE_GENERATIVE_AI_API_KEY:-${GEMINI_API_KEY:-}}}"

PLUGIN_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && cd .. && pwd )"
PLUGIN_PACKAGE_DIR="$PLUGIN_DIR/packages/plugin"

echo ""
echo -e "${YELLOW}Configuration:${NC}"
echo "  Sandbox Home: $OPENCLAW_SANDBOX_HOME"
echo "  Plugin Dir: $PLUGIN_DIR"

# Step 0: Check prerequisites
echo -e "${YELLOW}Step 0: Check prerequisites...${NC}"
echo "  Node.js version: $(node --version)"
echo "  npm version: $(npm --version)"
echo "  OpenClaw installed: $(openclaw --version 2>/dev/null || echo 'not found')"

# Step 1: Cleanup
echo -e "${YELLOW}Step 1: Cleanup existing sandbox...${NC}"
if [ -d "$OPENCLAW_SANDBOX_HOME" ]; then
  rm -rf "$OPENCLAW_SANDBOX_HOME"
fi

# Step 2: Create directories
echo -e "${YELLOW}Step 2: Create sandbox directory structure...${NC}"
mkdir -p "$OPENCLAW_SANDBOX_HOME/workspace"
mkdir -p "$OPENCLAW_SANDBOX_HOME/data/ai-spaces"
mkdir -p "$OPENCLAW_HOME/agents/main/agent"
echo "  Created sandbox directories"

# Step 3: Create gateway config
echo -e "${YELLOW}Step 3: Create gateway configuration...${NC}"
cat > "$OPENCLAW_HOME/openclaw.json" << 'OPENCLAW_JSON_EOF'
{
  "agents": {
    "defaults": {
      "workspace": "/tmp/openclaw-sandbox/workspace",
      "skipBootstrap": true
    }
  },
  "gateway": {
    "mode": "local",
    "port": 19000,
    "bind": "loopback",
    "auth": {
      "token": "secret"
    }
  },
  "plugins": {
    "load": {
      "paths": [
        "/Users/jchadwick/repos/jchadwick/ai-spaces/packages/plugin"
      ]
    },
    "entries": {
      "ai-spaces": {
        "enabled": true
      }
    }
  }
}
OPENCLAW_JSON_EOF
echo "  Created gateway config"

# Step 4: Build plugin
echo -e "${YELLOW}Step 4: Build the plugin...${NC}"
cd "$PLUGIN_DIR"
npm run build 2>&1 || echo "Build failed"
echo "  Plugin built"

# Step 5: Create test space
echo -e "${YELLOW}Step 5: Create test space...${NC}"
mkdir -p "$OPENCLAW_SANDBOX_HOME/workspace/TestSpace/.space"
mkdir -p "$OPENCLAW_SANDBOX_HOME/workspace/TestSpace/Budget"

cat > "$OPENCLAW_SANDBOX_HOME/workspace/TestSpace/.space/spaces.json" << 'SPACES_JSON_EOF'
{
  "name": "Test Space",
  "description": "A test space for development"
}
SPACES_JSON_EOF

cat > "$OPENCLAW_SANDBOX_HOME/workspace/TestSpace/Maine.md" << 'MAINE_MD_EOF'
# Maine Vacation

Our upcoming summer trip to the Northeast.
MAINE_MD_EOF

cat > "$OPENCLAW_SANDBOX_HOME/workspace/TestSpace/CostaRica.md" << 'COSTA_MD_EOF'
# Costa Rica Trip

Tropical adventure planned for winter.
COSTA_MD_EOF

echo "  Created test space"

# Step 6: Verify
echo ""
echo -e "${GREEN}Sandbox setup complete!${NC}"
echo ""
echo "To start the gateway:"
echo "  OPENCLAW_HOME=$OPENCLAW_SANDBOX_HOME openclaw gateway --allow-unconfigured"
echo ""
echo "To run the web app (in another terminal):"
echo "  cd $PLUGIN_DIR && npm run dev -w @ai-spaces/web"
echo ""
echo "To clean up:"
echo "  pkill -f 'openclaw gateway'"
echo "  rm -rf $OPENCLAW_SANDBOX_HOME"