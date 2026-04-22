import path from 'path'
import type { ServerResponse } from 'http'
import type { Socket } from 'net'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const serverPort = process.env.AI_SPACES_PORT || '3001';
const serverHost = process.env.AI_SPACES_URL || `http://127.0.0.1:${serverPort}`;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0',
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
