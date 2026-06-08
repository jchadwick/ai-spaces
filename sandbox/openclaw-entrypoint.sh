#!/bin/sh
set -e

OPENCLAW_HOME="${OPENCLAW_HOME:-/home/openclaw}"
OPENCLAW_SANDBOX_HOME="${OPENCLAW_SANDBOX_HOME:-$OPENCLAW_HOME}"
PLUGIN_DIST="${PLUGIN_DIST:-/plugins/ai-spaces/index.js}"
CURRENT_TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"
GATEWAY_PORT="${OPENCLAW_GATEWAY_PORT:-19000}"
AI_SPACES_URL="${AI_SPACES_URL:-http://dev:3001}"
AI_SPACES_DEV_PAIRING_FILE="${AI_SPACES_DEV_PAIRING_FILE:-/dev-pairing/openclaw-pairing.json}"

# Extract OPENCODE_API_KEY from mounted auth.json if not already set
if [ -z "$OPENCODE_API_KEY" ] && [ -f /tpl/opencode-auth.json ]; then
  OPENCODE_API_KEY="$(grep -A2 '"opencode-go"' /tpl/opencode-auth.json | grep '"key"' | sed 's/.*"key": *"\([^"]*\)".*/\1/')"
  echo "[entrypoint] Extracted OPENCODE_API_KEY from opencode-auth.json"
fi
export OPENCODE_API_KEY

echo "[entrypoint] OPENCLAW_HOME=$OPENCLAW_HOME"
echo "[entrypoint] PLUGIN_DIST=$PLUGIN_DIST"

# Create directory structure
mkdir -p "$OPENCLAW_HOME/.openclaw"
mkdir -p "$OPENCLAW_HOME/workspace"
mkdir -p "$OPENCLAW_HOME/data/ai-spaces"

# Portable template substitution (works with or without envsubst)
substitute() {
  sed \
    -e "s|\${OPENCLAW_SANDBOX_HOME}|$OPENCLAW_SANDBOX_HOME|g" \
    -e "s|\${PLUGIN_DIST}|$PLUGIN_DIST|g" \
    -e "s|\${CURRENT_TIMESTAMP}|$CURRENT_TIMESTAMP|g" \
    "$1"
}

# Process openclaw.json template
substitute /tpl/openclaw.json.tpl > "$OPENCLAW_HOME/.openclaw/openclaw.json"
echo "[entrypoint] Config written to $OPENCLAW_HOME/.openclaw/openclaw.json"

# Init workspace from template (only if empty)
if [ -z "$(ls -A "$OPENCLAW_HOME/workspace" 2>/dev/null)" ]; then
  if [ -d /tpl/workspace ]; then
    cp -r /tpl/workspace/. "$OPENCLAW_HOME/workspace/"
    echo "[entrypoint] Workspace initialized from template"
  fi
fi

# Init named workspaces from templates (only if directory doesn't exist yet)
if [ -d /tpl/workspaces ]; then
  mkdir -p "$OPENCLAW_HOME/workspaces"
  for src in /tpl/workspaces/*/; do
    name="$(basename "$src")"
    dest="$OPENCLAW_HOME/workspaces/$name"
    if [ ! -d "$dest" ]; then
      cp -r "$src" "$dest"
      echo "[entrypoint] Workspace '$name' initialized from template"
    fi
  done
fi

# Dev-only external content used to verify symlinks inside spaces.
# Do not treat .space configs under this tree as discoverable spaces.
if [ -d /tpl/brain ]; then
  mkdir -p "$OPENCLAW_HOME/brain"
  cp -r /tpl/brain/. "$OPENCLAW_HOME/brain/"
  mkdir -p "$OPENCLAW_HOME/workspaces/travel"
  if [ ! -e "$OPENCLAW_HOME/workspaces/travel/LinkedVacations" ]; then
    ln -s "$OPENCLAW_HOME/brain/Vacations" "$OPENCLAW_HOME/workspaces/travel/LinkedVacations"
    echo "[entrypoint] Created travel/LinkedVacations symlink fixture"
  fi
fi

# Install plugin via CLI so openclaw writes the installs section it needs at startup
echo "[entrypoint] Installing ai-spaces plugin..."
openclaw plugins install --link "$PLUGIN_DIST" 2>&1 || \
  echo "[entrypoint] Plugin install warning (may already be installed, continuing)"

echo "[entrypoint] Waiting for AI Spaces server at $AI_SPACES_URL..."
server_ready=0
for i in $(seq 1 60); do
  health_status="$(curl -s -o /dev/null -w "%{http_code}" "$AI_SPACES_URL/health" 2>/dev/null || true)"
  if [ "$health_status" != "000" ]; then
    echo "[entrypoint] AI Spaces server is ready"
    server_ready=1
    break
  fi
  echo "[entrypoint] Waiting for AI Spaces server... ($i/60)"
  sleep 2
done

if [ "$server_ready" != "1" ]; then
  echo "[entrypoint] AI Spaces server did not become ready"
  exit 1
fi

if [ ! -f "$OPENCLAW_HOME/ai-spaces-registration.json" ]; then
  echo "[entrypoint] Waiting for dev pairing input..."
  pairing_ready=0
  for i in $(seq 1 60); do
    if [ -s "$AI_SPACES_DEV_PAIRING_FILE" ]; then
      pairing_ready=1
      break
    fi
    echo "[entrypoint] Waiting for dev pairing input... ($i/60)"
    sleep 1
  done

  if [ "$pairing_ready" != "1" ]; then
    echo "[entrypoint] Dev pairing input was not written"
    exit 1
  fi

  AI_SPACES_REGISTRATION_TOKEN="$(
    node -e "const fs = require('fs'); const file = process.argv[1]; const data = JSON.parse(fs.readFileSync(file, 'utf8')); process.stdout.write(data.registrationToken || '');" "$AI_SPACES_DEV_PAIRING_FILE"
  )"
  if [ -z "$AI_SPACES_REGISTRATION_TOKEN" ]; then
    echo "[entrypoint] No persisted registration or pending dev pairing token found"
    exit 1
  fi
  export AI_SPACES_REGISTRATION_TOKEN
  echo "[entrypoint] Loaded dev pairing input"
else
  echo "[entrypoint] Using persisted AI Spaces registration state"
fi

# Start the AI Spaces WebSocket server as a standalone process.
# The gateway plugin loading is unreliable across openclaw versions; running the
# WS server directly ensures chat is always available regardless of gateway state.
echo "[entrypoint] Starting AI Spaces server on port ${AI_SPACES_WS_PORT:-3002}..."

node --input-type=module -e "
import { registerAndStartSpacesServer } from '/plugins/ai-spaces/routes/space-ws.js';
await registerAndStartSpacesServer(parseInt(process.env.AI_SPACES_WS_PORT ?? '3002', 10));
" &
WS_PID=$!
echo "[entrypoint] AI Spaces server PID: $WS_PID"

echo "[entrypoint] Starting gateway on port $GATEWAY_PORT..."

# Auto-restart loop (gateway crashes periodically due to upstream bug)
while true; do
  OPENCLAW_HOME="$OPENCLAW_HOME" \
    openclaw gateway --allow-unconfigured --port "$GATEWAY_PORT"
  echo "[entrypoint] gateway exited (code $?), restarting in 2s..."
  sleep 2
done
