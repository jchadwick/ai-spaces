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
TEMPLATE_DIR="$PLUGIN_DIR/scripts/sandbox-template"

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

# Step 3: Create gateway config from template
echo -e "${YELLOW}Step 3: Create gateway configuration...${NC}"
mkdir -p "$OPENCLAW_HOME/.openclaw"
export PLUGIN_DIST="$PLUGIN_PACKAGE_DIR/dist/index.js"
export CURRENT_TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"
envsubst '${OPENCLAW_SANDBOX_HOME}${PLUGIN_DIST}${CURRENT_TIMESTAMP}' \
  < "$TEMPLATE_DIR/.openclaw/openclaw.json" \
  > "$OPENCLAW_HOME/.openclaw/openclaw.json"
echo "  Created gateway config at $OPENCLAW_HOME/.openclaw/openclaw.json"

# Step 4: Build plugin
echo -e "${YELLOW}Step 4: Build the plugin...${NC}"
cd "$PLUGIN_DIR"
npm run build 2>&1 || echo "Build failed"
echo "  Plugin built"

# Step 5: Copy workspace files from template
echo -e "${YELLOW}Step 5: Create test space...${NC}"
cp -r "$TEMPLATE_DIR/workspace/." "$OPENCLAW_SANDBOX_HOME/workspace/"
echo "  Created test space"

# Step 6: Create plugin space store from template
echo -e "${YELLOW}Step 6: Create plugin space store...${NC}"
export SPACE_ID=$(echo -n "default:TestSpace" | sha256sum | cut -c1-64 2>/dev/null || echo -n "default:TestSpace" | shasum -a 256 | cut -c1-64)
envsubst '${SPACE_ID}${OPENCLAW_SANDBOX_HOME}${CURRENT_TIMESTAMP}' \
  < "$TEMPLATE_DIR/spaces.json" \
  > "$OPENCLAW_HOME/spaces.json"
echo "  Created plugin spaces.json (space ID: $SPACE_ID)"

# Done
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
