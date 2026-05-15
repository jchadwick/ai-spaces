// PM2 process configuration for local development.
// Use: pm2 start ecosystem.config.cjs
// Stop: pm2 delete all  (or pm2 stop all)
//
// restart_delay: 5000ms between crash-restart cycles prevents CPU spin from tight loops.
// min_uptime: 10s — processes that die before 10s are considered unstable; max_restarts caps retries.

'use strict';
module.exports = {
  apps: [
    {
      name: 'server',
      cwd: './packages/server',
      script: 'npx',
      args: 'tsx src/index.ts',
      interpreter: 'none',
      restart_delay: 5000,
      min_uptime: '10s',
      max_restarts: 10,
      out_file: '../../.logs/server.log',
      error_file: '../../.logs/server.log',
      merge_logs: true,
    },
    {
      name: 'web',
      cwd: './packages/web',
      script: 'npx',
      args: 'vite',
      interpreter: 'none',
      restart_delay: 5000,
      min_uptime: '10s',
      max_restarts: 10,
      out_file: '../../.logs/web.log',
      error_file: '../../.logs/web.log',
      merge_logs: true,
    },
  ],
};
