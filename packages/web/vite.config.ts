import { execSync } from "node:child_process";
import type { ServerResponse } from "node:http";
import type { Socket } from "node:net";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const serverPort = process.env.AI_SPACES_PORT || "3001";
const serverHost = process.env.AI_SPACES_URL || `http://127.0.0.1:${serverPort}`;

export default defineConfig({
  plugins: [serverOwnedRoute404Plugin(), buildMetaTagsPlugin(), react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@ai-spaces/shared": path.resolve(__dirname, "../shared"),
    },
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: true,
    proxy: {
      "/api": {
        target: serverHost,
        changeOrigin: true,
        configure(proxy) {
          proxy.on("error", (err, _req, res) => {
            const out = res as ServerResponse | Socket;
            if ("writeHead" in out && !out.headersSent) {
              out.writeHead(502, { "Content-Type": "application/json" });
              out.end(
                JSON.stringify({
                  error: `Cannot reach AI Spaces server at ${serverHost}. Start it with: npm run dev -w @ai-spaces/server (${(err as Error).message})`,
                }),
              );
            }
          });
        },
      },
      "/ws": {
        target: serverHost,
        changeOrigin: true,
        ws: true,
        configure(proxy) {
          proxy.on("error", (_err, _req, res) => {
            const out = res as ServerResponse | Socket;
            if ("destroy" in out) {
              out.destroy();
            }
          });
        },
      },
    },
  },
});

type BuildInfo = {
  display: string;
  sha: string;
  branch: string;
  tag: string;
};

function buildMetaTagsPlugin(): Plugin {
  const buildInfo = resolveBuildInfo();
  return {
    name: "ai-spaces-build-meta-tags",
    transformIndexHtml(html) {
      const metaTags = [
        `<meta name="ai-spaces-build" content="${escapeHtmlAttribute(buildInfo.display)}">`,
        `<meta name="ai-spaces-sha" content="${escapeHtmlAttribute(buildInfo.sha)}">`,
        `<meta name="ai-spaces-branch" content="${escapeHtmlAttribute(buildInfo.branch)}">`,
        `<meta name="ai-spaces-tag" content="${escapeHtmlAttribute(buildInfo.tag)}">`,
      ].join("\n    ");
      return html.replace("</head>", `    ${metaTags}\n  </head>`);
    },
  };
}

function resolveBuildInfo(): BuildInfo {
  const tag = firstEnv("AI_SPACES_TAG", "GIT_TAG") || runGit("git describe --tags --exact-match");
  const sha =
    firstEnv("AI_SPACES_SHA", "GIT_SHA", "GIT_COMMIT", "SOURCE_VERSION") ||
    runGit("git rev-parse --short HEAD");
  const branch =
    firstEnv("AI_SPACES_BRANCH", "GIT_BRANCH", "BRANCH_NAME") ||
    runGit("git rev-parse --abbrev-ref HEAD");
  const envBuild = firstEnv("AI_SPACES_BUILD", "BUILD_VERSION");
  const packageVersion = process.env.npm_package_version?.trim() ?? "";

  const versionFallback = packageVersion ? `v${packageVersion}` : "unknown";
  const display = envBuild || tag || (sha && branch ? `${branch}-${sha}` : sha || versionFallback);

  return {
    display,
    sha,
    branch,
    tag,
  };
}

function runGit(command: string): string {
  try {
    return execSync(command, {
      cwd: path.resolve(__dirname, "../.."),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function firstEnv(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return "";
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function serverOwnedRoute404Plugin(): Plugin {
  const serverOwnedPaths = ["/agent-setup", "/plugins", "/schemas"];
  return {
    name: "server-owned-route-404",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
        if (
          !serverOwnedPaths.some((route) => pathname === route || pathname.startsWith(`${route}/`))
        ) {
          return next();
        }
        res.statusCode = 404;
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.end("Not found");
      });
    },
  };
}
