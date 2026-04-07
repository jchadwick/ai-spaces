#!/bin/sh

# Kill any existing gateway process to avoid stale processes
if [ "$1" = "gateway" ]; then
  pkill -f 'openclaw gateway' 2>/dev/null
  sleep 1
fi

OPENCLAW_HOME=/tmp/openclaw-sandbox openclaw "$@"
