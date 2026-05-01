#!/bin/bash
# Kill stale openclaw processes/ports before starting the gateway.
# kill-claw.sh must run here (not just at top-level dev start) so
# individual `pm2 restart openclaw` also cleans up properly.
./kill-claw.sh || true
exec OPENCLAW_GATEWAY_PORT=19000 OPENCLAW_DISABLE_BONJOUR=1 ./scripts/run-gateway.sh
