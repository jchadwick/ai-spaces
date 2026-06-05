import * as fs from "node:fs";
import * as net from "node:net";
import * as path from "node:path";
import { config } from "./config.js";
import { logger as rootLogger } from "./logger.js";

const log = rootLogger.child({ component: "preflight" });

const DEV_JWT_SECRET = "ai-spaces-dev-secret-change-in-production";

function checkPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", () => resolve(false));
    srv.once("listening", () => srv.close(() => resolve(true)));
    srv.listen(port, "127.0.0.1");
  });
}

export async function runPreflightChecks(): Promise<void> {
  // Ensure DB directory exists and is writable
  const dbDir = path.dirname(config.AI_SPACES_DB);
  try {
    fs.mkdirSync(dbDir, { recursive: true });
    fs.accessSync(dbDir, fs.constants.W_OK);
    log.info({ dir: dbDir }, "Preflight: DB directory writable");
  } catch {
    log.error({ dir: dbDir }, "Preflight FAIL: DB directory not writable");
    throw new Error(`DB directory not writable: ${dbDir}`);
  }

  // Warn if JWT_SECRET is the insecure default in production
  if (process.env.NODE_ENV === "production" && config.JWT_SECRET === DEV_JWT_SECRET) {
    throw new Error(
      "Preflight FAIL: JWT_SECRET is set to the insecure development default in production",
    );
  }

  // Warn if web dist is missing
  if (!fs.existsSync(config.WEB_DIST)) {
    log.warn(
      { dir: config.WEB_DIST },
      "Preflight WARN: WEB_DIST directory not found — UI will not be served",
    );
  }

  // Best-effort port check
  const portFree = await checkPortAvailable(config.AI_SPACES_PORT);
  if (!portFree) {
    log.warn({ port: config.AI_SPACES_PORT }, "Preflight WARN: port may already be in use");
  }
}
