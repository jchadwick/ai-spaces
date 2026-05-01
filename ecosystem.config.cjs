const path = require('path');

const ROOT = __dirname;
const LOGS = path.join(ROOT, '.logs');

module.exports = {
  apps: [
    {
      name: 'openclaw',
      script: './scripts/start-openclaw.sh',
      interpreter: 'bash',
      cwd: ROOT,
      autorestart: false, // run-gateway.sh has its own restart loop
      out_file: path.join(LOGS, 'openclaw.log'),
      error_file: path.join(LOGS, 'openclaw.log'),
      merge_logs: true,
      log_date_format: 'HH:mm:ss',
    },
    {
      name: 'ws',
      script: 'packages/plugin/scripts/ws-server.mjs',
      interpreter: 'node',
      cwd: ROOT,
      env: { OPENCLAW_HOME: '/tmp/openclaw-sandbox' },
      autorestart: true,
      out_file: path.join(LOGS, 'ws.log'),
      error_file: path.join(LOGS, 'ws.log'),
      merge_logs: true,
      log_date_format: 'HH:mm:ss',
    },
    {
      name: 'server',
      script: 'npm',
      args: 'run dev',
      cwd: path.join(ROOT, 'packages/server'),
      autorestart: false, // tsx watch handles file changes
      out_file: path.join(LOGS, 'server.log'),
      error_file: path.join(LOGS, 'server.log'),
      merge_logs: true,
      log_date_format: 'HH:mm:ss',
    },
    {
      name: 'web',
      script: 'npm',
      args: 'run dev -- --host',
      cwd: path.join(ROOT, 'packages/web'),
      autorestart: false, // vite handles itself
      out_file: path.join(LOGS, 'web.log'),
      error_file: path.join(LOGS, 'web.log'),
      merge_logs: true,
      log_date_format: 'HH:mm:ss',
    },
  ],
};
