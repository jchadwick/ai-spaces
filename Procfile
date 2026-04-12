openclaw: (pkill -f 'openclaw gateway' || true) && ./openclaw.sh gateway --allow-unconfigured
server: (pkill -f 'tsx watch' || true) && cd packages/server && npm run dev
web: (pkill -f 'vite' || true) && cd packages/web && npm run dev -- --host