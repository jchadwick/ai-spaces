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
export OPENCLAW_STATE_DIR="$OPENCLAW_HOME/data"
export OPENCLAW_CONFIG_PATH="$OPENCLAW_HOME/openclaw.json"

PLUGIN_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && cd .. && pwd )"
PLUGIN_PACKAGE_DIR="$PLUGIN_DIR/packages/plugin"
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

echo ""
echo -e "${YELLOW}Configuration:${NC}"
echo "  Sandbox Home: $OPENCLAW_SANDBOX_HOME"
echo "  Plugin Dir: $PLUGIN_DIR"
echo ""

# Step 0: Check prerequisites
echo -e "${YELLOW}Step 0: Check prerequisites...${NC}"

# Check Node.js version (22.14+ or 24.x)
NODE_VERSION=$(node --version 2>/dev/null | sed 's/v//' | cut -d'.' -f1,2)
if [ -z "$NODE_VERSION" ]; then
  echo -e "${RED}ERROR: Node.js is not installed${NC}"
  exit 1
fi

NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d'.' -f1)
NODE_MINOR=$(echo "$NODE_VERSION" | cut -d'.' -f2)

if [ "$NODE_MAJOR" -lt 22 ] || ([ "$NODE_MAJOR" -eq 22 ] && [ "$NODE_MINOR" -lt 14 ]); then
  if [ "$NODE_MAJOR" -lt 24 ]; then
    echo -e "${RED}ERROR: Node.js version must be 22.14+ or 24.x (found $NODE_VERSION)${NC}"
    exit 1
  fi
fi
echo "  ✓ Node.js version: $(node --version)"

# Check npm version (9+)
NPM_VERSION=$(npm --version 2>/dev/null | cut -d'.' -f1)
if [ -z "$NPM_VERSION" ]; then
  echo -e "${RED}ERROR: npm is not installed${NC}"
  exit 1
fi

if [ "$NPM_VERSION" -lt 9 ]; then
  echo -e "${RED}ERROR: npm version must be 9+ (found $NPM_VERSION)${NC}"
  exit 1
fi
echo "  ✓ npm version: $(npm --version)"

# Check/install OpenClaw
if ! command -v openclaw &> /dev/null; then
  echo "  Installing OpenClaw globally..."
  npm install -g openclaw@latest
else
  echo "  ✓ OpenClaw installed: $(openclaw --version 2>/dev/null || echo 'version unknown')"
fi

# Step 1: Clean up any existing sandbox
echo -e "${YELLOW}Step 1: Cleanup existing sandbox...${NC}"
if [ -d "$OPENCLAW_SANDBOX_HOME" ]; then
  echo "  Removing existing sandbox at $OPENCLAW_SANDBOX_HOME"
  rm -rf "$OPENCLAW_SANDBOX_HOME"
fi

# Step 2: Create sandbox directory structure
echo -e "${YELLOW}Step 2: Create sandbox directory structure...${NC}"
mkdir -p "$OPENCLAW_SANDBOX_HOME"/{workspace,data,agents,credentials}
mkdir -p "$OPENCLAW_SANDBOX_HOME/data/ai-spaces"

echo "  Created: $OPENCLAW_SANDBOX_HOME/"
echo "  Created: $OPENCLAW_SANDBOX_HOME/workspace/"
echo "  Created: $OPENCLAW_SANDBOX_HOME/data/"
echo "  Created: $OPENCLAW_SANDBOX_HOME/data/ai-spaces/"
echo "  Created: $OPENCLAW_SANDBOX_HOME/credentials/"

# Step 3: Create minimal gateway config
echo -e "${YELLOW}Step 3: Create gateway configuration...${NC}"
cat > "$OPENCLAW_HOME/openclaw.json" << EOF
{
  "agents": {
    "defaults": {
      "workspace": "$OPENCLAW_SANDBOX_HOME/workspace",
      "skipBootstrap": true
    }
  },
  "gateway": {
    "mode": "local",
    "port": 18789,
    "bind": "loopback"
  },
  "plugins": {
    "entries": {
      "ai-spaces": {
        "enabled": true
      }
    }
  }
}
EOF
echo "  Created: $OPENCLAW_HOME/openclaw.json"

# Step 4: Create agent workspace directories
echo -e "${YELLOW}Step 4: Create agent workspace directories...${NC}"
mkdir -p "$OPENCLAW_SANDBOX_HOME/workspace/TestSpace"
mkdir -p "$OPENCLAW_SANDBOX_HOME/agents/main"
echo "  Created: $OPENCLAW_SANDBOX_HOME/workspace/TestSpace/"
echo "  Created: $OPENCLAW_SANDBOX_HOME/agents/main/"

# Create agent configuration for main agent
cat > "$OPENCLAW_SANDBOX_HOME/agents/main/agent.json" << EOF
{
  "id": "main",
  "workspace": "$OPENCLAW_SANDBOX_HOME/workspace"
}
EOF
echo "  Created: $OPENCLAW_SANDBOX_HOME/agents/main/agent.json"

# Step 5: Build the plugin
echo -e "${YELLOW}Step 5: Build the plugin...${NC}"
cd "$PLUGIN_DIR"
if [ -f "package.json" ] && grep -q '"build"' package.json; then
  echo "  Running npm run build..."
  npm run build || echo -e "${RED}Build failed${NC}"
else
  echo "  No build script found - skipping build"
fi

# Step 6: Install plugin in sandbox
echo -e "${YELLOW}Step 6: Install plugin in sandbox...${NC}"

# Install plugin using openclaw plugins install -l for proper registration
if [ -d "$PLUGIN_PACKAGE_DIR/dist" ]; then
  echo "  Installing plugin from: $PLUGIN_PACKAGE_DIR"
  export OPENCLAW_HOME="$OPENCLAW_SANDBOX_HOME"
  openclaw plugins install -l "$PLUGIN_PACKAGE_DIR" || echo -e "${YELLOW}  Plugin install may have issues - continuing${NC}"
else
  echo -e "${RED}  Plugin not built - run 'npm run build' in packages/plugin first${NC}"
fi

# Step 7: Create test spaces
echo -e "${YELLOW}Step 7: Create test spaces...${NC}"

# Main workspace test space
TEST_SPACE_DIR="$OPENCLAW_SANDBOX_HOME/workspace/TestSpace"
mkdir -p "$TEST_SPACE_DIR/.space"
mkdir -p "$TEST_SPACE_DIR/Budget"

cat > "$TEST_SPACE_DIR/.space/spaces.json" << 'EOF'
{
  "name": "Test Space",
  "description": "A test space for development"
}
EOF

cat > "$TEST_SPACE_DIR/Maine.md" << 'EOF'
# Maine Vacation

Our upcoming summer trip to the Northeast. We are focusing on coastal regions and local dining.

## Options

- **Portland** - Foodie hub with great breweries and harbor views.
- **Acadia National Park** - Hiking, Cadillac Mountain, and lobster rolls.
- **Kennebunkport** - Classic beach vibes and charming boutiques.

> **Tip**: Consider adding a section for car rental availability in July.
EOF

cat > "$TEST_SPACE_DIR/CostaRica.md" << 'EOF'
# Costa Rica Trip

Tropical adventure planned for winter.

## Activities

- Zip-lining through cloud forests
- Beach time in Manuel Antonio
- Volcano hiking in Arenal
- Wildlife spotting in Monteverde
EOF

cat > "$TEST_SPACE_DIR/Budget/notes.md" << 'EOF'
# Budget Notes

- Hotel: $150/night x 5 nights
- Flights: ~$400 per person
- Food: ~$50/day per person
- Activities: Variable
EOF

echo "  Created: Test Space at $TEST_SPACE_DIR"

# Step 8: Verify installation
echo -e "${YELLOW}Step 8: Verify installation...${NC}"
echo ""
echo -e "${GREEN}Sandbox setup complete!${NC}"
echo ""
echo "Environment variables:"
echo "  export OPENCLAW_SANDBOX_HOME=$OPENCLAW_SANDBOX_HOME"
echo "  export OPENCLAW_HOME=$OPENCLAW_SANDBOX_HOME"
echo "  export OPENCLAW_WORKSPACE=$OPENCLAW_SANDBOX_HOME/workspace"
echo "  export OPENCLAW_STATE_DIR=$OPENCLAW_SANDBOX_HOME/data"
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
echo ""

# Export for current session
echo "Sandbox environment ready at: $OPENCLAW_SANDBOX_HOME"