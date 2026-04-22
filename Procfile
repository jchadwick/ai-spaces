openclaw: (./kill-claw.sh || true) && OPENCLAW_GATEWAY_PORT=19000 ./scripts/run-gateway.sh
ws: (pkill -f 'ws-server.mjs' || true) && OPENCLAW_HOME=/tmp/openclaw-sandbox node packages/plugin/scripts/ws-server.mjs
server: (pkill -f 'tsx watch' || true) && cd packages/server && npm run dev
web: (pkill -f 'vite' || true) && cd packages/web && npm run dev -- --host
