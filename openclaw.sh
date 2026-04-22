#!/bin/sh

# Kill any existing gateway process to avoid stale processes
if [ "$1" = "gateway" ]; then
  if launchctl list ai.openclaw.gateway >/dev/null 2>&1; then
    echo "ERROR: openclaw gateway is registered as a launchd service and will conflict." >&2
    echo "Run: openclaw daemon uninstall" >&2
    exit 1
  fi
  pkill -f 'openclaw' 2>/dev/null
  find /var/folders -type d -name 'openclaw-*' 2>&1 | grep -v "Operation not permitted" | grep claw | xargs rm -rf $1
  sleep 1
fi

OPENCLAW_HOME=/tmp/openclaw-sandbox openclaw "$@"
