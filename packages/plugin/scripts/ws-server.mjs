#!/usr/bin/env node
/**
 * Standalone AI Spaces WebSocket server.
 * Run with: node packages/plugin/scripts/ws-server.mjs
 * OPENCLAW_HOME must be set.
 */
import { startWebSocketServer } from '../dist/routes/space-ws.js';

const port = parseInt(process.env.AI_SPACES_WS_PORT ?? '3002', 10);
startWebSocketServer(port);
