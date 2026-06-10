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

# Install plugin via server's install.sh (production-consistent flow).
# This downloads the tarball, extracts, and links the plugin.
# No registration token passed — registration is handled by the plugin code.
echo "[entrypoint] Installing ai-spaces plugin via install.sh..."
curl -fsSL "${AI_SPACES_URL}/api/plugins/openclaw/install.sh" | bash || \
  echo "[entrypoint] WARNING: install.sh failed, continuing..."

# Re-link plugin to mounted dist so dev hot-reload works.
# install.sh links to a temp dir that gets cleaned up on exit;
# re-link to the mounted dist for dev workflow.
echo "[entrypoint] Re-linking to mounted dist..."
openclaw plugins install --link "$PLUGIN_DIST" 2>&1 || \
  echo "[entrypoint] WARNING: re-link failed, continuing..."

# Restore config from template (overwrites whatever install.sh/link wrote).
# The template config has load.paths pointing to the mounted dist file path.
substitute /tpl/openclaw.json.tpl > "$OPENCLAW_HOME/.openclaw/openclaw.json"

# The channel plugin registers itself when loaded.
# channels.ai-spaces is in the template config.

# Bootstrap registration token via admin API for the gateway plugin.
# The plugin code calls tryRegisterWithServer(), persists credentials to the
# SDK state dir, and skips re-registration on restart.
CREDENTIALS_DIR="$OPENCLAW_HOME/.local/share/openclaw/ai-spaces"
if [ ! -f "$CREDENTIALS_DIR/credentials.json" ]; then
  echo "[entrypoint] No persisted credentials; bootstrapping registration token..."
  AI_SPACES_REGISTRATION_TOKEN=$(node /scripts/openclaw-bootstrap.mjs)
  if [ -z "$AI_SPACES_REGISTRATION_TOKEN" ]; then
    echo "[entrypoint] Bootstrap did not return a registration token"
    exit 1
  fi
  export AI_SPACES_REGISTRATION_TOKEN
  echo "[entrypoint] Registration token acquired (length: ${#AI_SPACES_REGISTRATION_TOKEN})"
else
  echo "[entrypoint] Using persisted credentials from SDK state dir"
fi

# Dev-only: seed default rooms after reconciliation completes.
echo "[entrypoint] Seeding dev rooms..."
node /scripts/seed-dev-rooms.mjs &
echo "[entrypoint] Room seeding started in background"

echo "[entrypoint] Starting gateway on port $GATEWAY_PORT..."

# Auto-restart loop (gateway crashes periodically due to upstream bug)
while true; do
  OPENCLAW_HOME="$OPENCLAW_HOME" \
    openclaw gateway --allow-unconfigured --port "$GATEWAY_PORT"
  echo "[entrypoint] gateway exited (code $?), restarting in 2s..."
  sleep 2
done
