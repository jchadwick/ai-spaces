import type { IncomingMessage, ServerResponse } from 'http';
import https from 'https';
import http from 'http';

export async function proxyRequest(
  req: IncomingMessage,
  res: ServerResponse,
  targetUrl: string
): Promise<boolean> {
  return new Promise((resolve) => {
    const url = new URL(targetUrl);
    const isHttps = url.protocol === 'https:';
    const httpModule = isHttps ? https : http;

    const proxyReq = httpModule.request({
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: req.method,
      headers: {
        ...req.headers,
        host: url.host,
      },
    }, (proxyRes) => {
      res.statusCode = proxyRes.statusCode || 500;
      
      for (const [key, value] of Object.entries(proxyRes.headers)) {
        if (value) {
          res.setHeader(key, value);
        }
      }
      
      proxyRes.on('data', (chunk) => {
        res.write(chunk);
      });
      
      proxyRes.on('end', () => {
        res.end();
        resolve(true);
      });
    });

    proxyReq.on('error', (error) => {
      const target = `${url.hostname}:${url.port || (isHttps ? 443 : 80)}`;
      console.error('[ai-spaces] Proxy error:', error.message, '→', targetUrl);
      res.statusCode = 502;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          error: `Cannot reach AI Spaces server at ${target} (${error.message}). Start it with: npm run dev -w @ai-spaces/server`,
          message: error.message,
          target,
        }),
      );
      resolve(true);
    });

    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        proxyReq.write(body);
        proxyReq.end();
      });
    } else {
      proxyReq.end();
    }
  });
}