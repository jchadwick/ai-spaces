#!/bin/bash
# Wrapper that auto-restarts the openclaw gateway when it crashes.
# The gateway crashes ~every 5min due to an unhandled promise rejection
# in the health monitor (listAccountIds). This wrapper keeps it alive.

PORT="${OPENCLAW_GATEWAY_PORT:-19000}"

while true; do
  OPENCLAW_HOME=/tmp/openclaw-sandbox \
  GOOGLE_GENERATIVE_AI_API_KEY="$GOOGLE_GENERATIVE_AI_API_KEY" \
    openclaw gateway --allow-unconfigured --port "$PORT"
  echo "[run-gateway] gateway exited (code $?), restarting in 2s..."
  sleep 2
done
