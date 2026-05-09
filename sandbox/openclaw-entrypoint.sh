#!/bin/sh
set -e

OPENCLAW_HOME="${OPENCLAW_HOME:-/home/openclaw}"
OPENCLAW_SANDBOX_HOME="${OPENCLAW_SANDBOX_HOME:-$OPENCLAW_HOME}"
PLUGIN_DIST="${PLUGIN_DIST:-/plugins/ai-spaces/index.js}"
CURRENT_TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"
GATEWAY_PORT="${OPENCLAW_GATEWAY_PORT:-19000}"

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
    -e "s|\${GATEWAY_TOKEN}|${GATEWAY_TOKEN:-secret}|g" \
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

# Install plugin via CLI so openclaw writes the installs section it needs at startup
echo "[entrypoint] Installing ai-spaces plugin..."
openclaw plugins install --link "$PLUGIN_DIST" 2>&1 || \
  echo "[entrypoint] Plugin install warning (may already be installed, continuing)"

# Start the AI Spaces WebSocket server as a standalone process.
# The gateway plugin loading is unreliable across openclaw versions; running the
# WS server directly ensures chat is always available regardless of gateway state.
echo "[entrypoint] Starting AI Spaces WebSocket server on port ${AI_SPACES_WS_PORT:-3002}..."
node --input-type=module -e "
import { startWebSocketServer } from '/plugins/ai-spaces/routes/space-ws.js';
startWebSocketServer(parseInt(process.env.AI_SPACES_WS_PORT ?? '3002', 10));
console.log('[ai-spaces-ws] Server started on port ' + (process.env.AI_SPACES_WS_PORT ?? '3002'));
" &
WS_PID=$!
echo "[entrypoint] AI Spaces WS server PID: $WS_PID"

echo "[entrypoint] Starting gateway on port $GATEWAY_PORT..."

# Auto-restart loop (gateway crashes periodically due to upstream bug)
while true; do
  OPENCLAW_HOME="$OPENCLAW_HOME" \
    openclaw gateway --allow-unconfigured --port "$GATEWAY_PORT"
  echo "[entrypoint] gateway exited (code $?), restarting in 2s..."
  sleep 2
done
