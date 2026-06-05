import type { IncomingMessage, ServerResponse } from "node:http";
import http from "node:http";
import https from "node:https";
import { pipeline } from "node:stream";

function writeProxyError(
  res: ServerResponse,
  statusCode: number,
  body: Record<string, unknown>,
): void {
  if (res.writableEnded || res.destroyed) return;
  try {
    if (!res.headersSent) {
      res.statusCode = statusCode;
      res.setHeader("Content-Type", "application/json");
    }
    res.end(JSON.stringify(body));
  } catch {
    try {
      res.end();
    } catch {
      /* ignore */
    }
  }
}

export async function proxyRequest(
  req: IncomingMessage,
  res: ServerResponse,
  targetUrl: string,
): Promise<boolean> {
  return new Promise((resolve) => {
    let url: URL;
    try {
      url = new URL(targetUrl);
    } catch {
      writeProxyError(res, 502, {
        error: "Invalid proxy target URL",
      });
      resolve(true);
      return;
    }

    const isHttps = url.protocol === "https:";
    const httpModule = isHttps ? https : http;
    const target = `${url.hostname}:${url.port || (isHttps ? 443 : 80)}`;

    const proxyReq = httpModule.request(
      {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: req.method,
        headers: {
          ...req.headers,
          host: url.host,
        },
      },
      (proxyRes) => {
        if (!res.headersSent) {
          res.statusCode = proxyRes.statusCode || 500;
        }

        for (const [key, value] of Object.entries(proxyRes.headers)) {
          if (value && !res.headersSent) {
            res.setHeader(key, value);
          }
        }

        pipeline(proxyRes, res, (err) => {
          if (err) console.error("[ai-spaces] Proxy response pipeline error:", err.message);
          resolve(true);
        });
      },
    );

    proxyReq.setTimeout(10_000, () => {
      proxyReq.destroy(new Error("Proxy timeout"));
    });

    proxyReq.on("error", (error) => {
      console.error("[ai-spaces] Proxy error:", error.message, "→", targetUrl);
      writeProxyError(res, 502, {
        error: `Cannot reach AI Spaces server at ${target} (${error.message}). Start it with: npm run dev -w @ai-spaces/server`,
        message: error.message,
        target,
      });
      resolve(true);
    });

    if (req.method === "POST" || req.method === "PUT" || req.method === "PATCH") {
      pipeline(req, proxyReq, (err) => {
        if (err) console.error("[ai-spaces] Proxy request pipeline error:", err.message);
      });
    } else {
      proxyReq.end();
    }
  });
}
