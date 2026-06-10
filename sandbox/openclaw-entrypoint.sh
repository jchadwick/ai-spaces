#!/bin/sh
set -e

OPENCLAW_HOME="${OPENCLAW_HOME:-/home/openclaw}"
OPENCLAW_SANDBOX_HOME="${OPENCLAW_SANDBOX_HOME:-$OPENCLAW_HOME}"
GATEWAY_PORT="${OPENCLAW_GATEWAY_PORT:-19000}"

# Extract OPENCODE_API_KEY from mounted auth.json if not already set
if [ -z "$OPENCODE_API_KEY" ] && [ -f /tpl/opencode-auth.json ]; then
  OPENCODE_API_KEY="$(grep -A2 '"opencode-go"' /tpl/opencode-auth.json | grep '"key"' | sed 's/.*"key": *"\([^"]*\)".*/\1/')"
  echo "[entrypoint] Extracted OPENCODE_API_KEY from opencode-auth.json"
fi
export OPENCODE_API_KEY

echo "[entrypoint] OPENCLAW_HOME=$OPENCLAW_HOME"

# Create directory structure
mkdir -p "$OPENCLAW_HOME/.openclaw"
mkdir -p "$OPENCLAW_HOME/workspace"
mkdir -p "$OPENCLAW_HOME/data/ai-spaces"

# Process openclaw.json template
sed -e "s|\${OPENCLAW_SANDBOX_HOME}|$OPENCLAW_SANDBOX_HOME|g" /tpl/openclaw.json.tpl > "$OPENCLAW_HOME/.openclaw/openclaw.json"
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
# This downloads the tarball, verifies checksum, extracts to a persistent dir,
# and runs openclaw plugins install --link to register the plugin.
echo "[entrypoint] Installing ai-spaces plugin via install.sh..."
curl -fsSL "${AI_SPACES_URL}/api/plugins/openclaw/install.sh" | bash || \
  echo "[entrypoint] WARNING: install.sh failed, continuing..."

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
