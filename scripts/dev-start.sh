#!/bin/bash
# Start all dev services via PM2, with fresh logs each session.
set -e

cd "$(dirname "$0")/.."

# Truncate logs so each session starts clean (keeps context small for AI tools)
mkdir -p .logs
for f in .logs/openclaw.log .logs/ws.log .logs/server.log .logs/web.log; do
  > "$f"
done

pm2 start ecosystem.config.cjs
pm2 logs --lines 0  # tail all logs live (Ctrl-C exits without stopping processes)
