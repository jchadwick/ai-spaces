# OpenClaw Sandbox Setup for AI Spaces Plugin Testing

## Overview

This document describes how to create an isolated OpenClaw environment for testing the AI Spaces plugin during development. The sandbox uses environment variables to achieve complete isolation from any existing OpenClaw installation.

## Architecture

```
/tmp/openclaw-sandbox/
├── openclaw.json          # Gateway configuration
├── workspace/             # Agent workspace
│   ├── AGENTS.md         # Agent instructions
│   ├── TestSpace/        # Test space directory
│   │   └── .space/
│   │       └── spaces.json
├── data/                  # Plugin data
│   └── ai-spaces/
│       └── shares.json   # Share link storage
├── agents/                # Per-agent state
│   └── main/
│       └── sessions/      # Session transcripts
└── credentials/           # Channelauth (if needed)
```

## Prerequisites

Check prerequisites:

```bash
# Node.js 22.14+ or Node 24 (recommended)
node --version   # Should show v22.14+ or v24.x

# npm 9+
npm --version

# OpenClaw (will install if missing)
openclaw --version || npm install -g openclaw@latest
```

## Quick Start

### Automated Setup

Run the setup script to create everything:

```bash
cd /workspaces/ai-spaces
./scripts/setup-sandbox.sh
```

This will:
1. Create isolated sandbox environment
2. Install OpenClaw (if needed)
3. Configure environment variables
4. Build the AI Spaces plugin
5. Install the plugin in the sandbox
6. Create test spaces

### Manual Setup

If you prefer step-by-step manual setup:

#### Step 1: Create Sandbox Directory

```bash
export OPENCLAW_SANDBOX_HOME="/tmp/openclaw-sandbox"
mkdir -p "$OPENCLAW_SANDBOX_HOME"/{workspace,data,agents,credentials}
mkdir -p "$OPENCLAW_SANDBOX_HOME/workspace/TestSpace/.space"
```

#### Step 2: Configure Environment

```bash
 export OPENCLAW_HOME="$OPENCLAW_SANDBOX_HOME"
 export OPENCLAW_WORKSPACE="$OPENCLAW_HOME/workspace"
```

#### Step 3: Create Minimal Gateway Config

```bash
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
```

#### Step 4: Create Test Space

```bash
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
```

#### Step 5: Build and Install Plugin

```bash
cd /workspaces/ai-spaces

# Initialize npm project (if not already done)
npm init -y
npm install -D typescript @types/node tsx vitest
npm install openclaw

# Build the plugin
npm run build

# Install in sandbox
export OPENCLAW_HOME="$OPENCLAW_SANDBOX_HOME"
openclaw plugins install -l /workspaces/ai-spaces
```

## Environment Variables

Key environment variables for sandbox isolation:

| Variable | Purpose |
|----------|---------|
| `OPENCLAW_HOME` | Override default `~/.openclaw` directory |
| `OPENCLAW_WORKSPACE` | Override default workspace path |
| `OPENCLAW_STATE_DIR` | Override state directory |
| `OPENCLAW_CONFIG_PATH` | Override config file path |

## Testing Procedures

### Step 0: Project Initialization Verification

```bash
# Build should succeed
npm run build

# All manifest files exist
ls -la package.json tsconfig.json openclaw.plugin.json
```

### Step 1: Plugin Entry Point Verification

```bash
# Plugin loads without errors
openclaw plugins inspect ai-spaces

# CLI command registered
openclaw help | grep -i spaces

# Gateway starts with plugin loaded
openclaw gateway --once 2>&1 | grep -i "ai-spaces"
```

### Step 2: Space Discovery Verification

```bash
# Create test space
mkdir -p ~/.openclaw/workspace/TestSpace/.space
echo '{"name":"Test Space"}' > ~/.openclaw/workspace/TestSpace/.space/spaces.json

# List discovered spaces
openclaw spaces list

# Show space details
openclaw spaces show TestSpace
```

### Step 3: Share Link Verification

```bash
# Create share link
openclaw spaces share create TestSpace --role editor --expires 7d

# List shares
openclaw spaces share list TestSpace

# Verify storage
cat ~/.openclaw/data/ai-spaces/shares.json | jq .
```

### Step 4: HTTP Routes Verification

```bash
# Start gateway in background
openclaw gateway &
GATEWAY_PID=$!
sleep5

# Create share token
TOKEN=$(openclaw spaces share create TestSpace --role editor --format json 2>/dev/null | jq -r '.token')

# Test valid token
curl -s "http://localhost:18789/spaces/TestSpace/info?share=$TOKEN" | jq .

# Test invalid token
curl -s "http://localhost:18789/spaces/TestSpace/info?share=invalid" | jq .

# Cleanup
kill $GATEWAY_PID
```

### Step 5: WebSocket Channel Verification

```bash
# Install wscat for WebSocket testing
npm install -g wscat

# Start gateway
openclaw gateway &
sleep5

# Create share token
TOKEN=$(openclaw spaces share create TestSpace --role editor --format json 2>/dev/null | jq -r '.token')

# Connect to WebSocket
wscat -c "ws://localhost:18789/spaces/TestSpace/ws?share=$TOKEN"
```

## Integration Test Script

Run all verification tests:

```bash
cd /workspaces/ai-spaces
./scripts/test-sandbox.sh
```

## Cleanup

### Remove Sandbox

```bash
# Kill any running gateway
pkill -f "openclaw gateway"

# Remove sandbox directory
rm -rf /tmp/openclaw-sandbox

# Unset environment variables
unset OPENCLAW_HOME
unset OPENCLAW_SANDBOX_HOME
```

### Reset Test Data

```bash
# Remove test spaces
rm -rf ~/.openclaw/workspace/TestSpace

# Remove share data
rm -f ~/.openclaw/data/ai-spaces/shares.json
```

## Troubleshooting

### Plugin Not Loading

```bash
# Check plugin status
openclaw plugins list

# Check plugin details
openclaw plugins inspect ai-spaces

# Check gateway logs
openclaw logs --lines 50
```

### Gateway Not Starting

```bash
# Check if port is in use
lsof -i:18789

# Check config validity
openclaw doctor

# Try with minimal config
openclaw gateway --once
```

### Spaces Not Discovered

```bash
# Check workspace path
openclaw config get agents.defaults.workspace

# Verify space config exists
ls -la ~/.openclaw/workspace/TestSpace/.space/spaces.json

# Check config format
cat ~/.openclaw/workspace/TestSpace/.space/spaces.json | jq .
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Test AI Spaces Plugin

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '24'
      
      - name: Install OpenClaw
        run: npm install -g openclaw@latest
      
      - name: Setup Sandbox
        run: |
          export OPENCLAW_SANDBOX_HOME="/tmp/openclaw-sandbox"
          mkdir -p "$OPENCLAW_SANDBOX_HOME"/{workspace,data,agents}
          export OPENCLAW_HOME="$OPENCLAW_SANDBOX_HOME"
      
      - name: Build Plugin
        run: |
          npm install
          npm run build
      
      - name: Install Plugin
        run: openclaw plugins install -l $GITHUB_WORKSPACE      
      
      - name: Run Tests
        run: ./scripts/test-sandbox.sh
```

## Next Steps

After successful sandbox setup:

1. **Develop plugin features** - Edit source files and rebuild
2. **Test incrementally** - Use verification commands after each change
3. **Update plugin** - Run `openclaw plugins install -l .` after changes
4. **Monitor logs** - Use `openclaw logs --follow` during development
5. **Create integration tests** - Add tests to `scripts/test-sandbox.sh`