import path from 'path'
import type { ServerResponse } from 'http'
import type { Socket } from 'net'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const serverPort = process.env.AI_SPACES_PORT || '3001';
const serverHost = process.env.AI_SPACES_URL || `http://127.0.0.1:${serverPort}`;

export default defineConfig({
  plugins: [serverOwnedRoute404Plugin(), react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@ai-spaces/shared': path.resolve(__dirname, '../shared'),
    },
  },
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
    proxy: {
      '/api': {
        target: serverHost,
        changeOrigin: true,
        configure(proxy) {
          proxy.on('error', (err, _req, res) => {
            const out = res as ServerResponse | Socket;
            if ('writeHead' in out && !out.headersSent) {
              out.writeHead(502, { 'Content-Type': 'application/json' });
              out.end(
                JSON.stringify({
                  error: `Cannot reach AI Spaces server at ${serverHost}. Start it with: npm run dev -w @ai-spaces/server (${(err as Error).message})`,
                }),
              );
            }
          });
        },
      },
      '/ws': {
        target: serverHost,
        changeOrigin: true,
        ws: true,
        configure(proxy) {
          proxy.on('error', (_err, _req, res) => {
            const out = res as ServerResponse | Socket;
            if ('destroy' in out) {
              out.destroy();
            }
          });
        },
      },
    },
  },
})

function serverOwnedRoute404Plugin(): Plugin {
  const serverOwnedPaths = ['/agent-setup', '/plugins', '/schemas'];
  return {
    name: 'server-owned-route-404',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
        if (!serverOwnedPaths.some((route) => pathname === route || pathname.startsWith(`${route}/`))) {
          return next();
        }
        res.statusCode = 404;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end('Not found');
      });
    },
  };
}
