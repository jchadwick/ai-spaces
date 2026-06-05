import { defineConfig, devices } from "@playwright/test";
import { API_PORT, WEB_PORT } from "./e2e/helpers/constants.js";

const TEST_DB = `/tmp/ai-spaces-test-${Date.now()}.db`;

export default defineConfig({
  globalSetup: "./e2e/global-setup.ts",
  timeout: 15000,
  retries: 0,
  workers: 1,
  reporter: [["list"]],

  projects: [
    {
      name: "api",
      testMatch: ["e2e/api/**/*.spec.ts", "e2e/server-ws-chat.spec.ts"],
      use: {
        ...devices["Desktop Chrome"],
        baseURL: `http://localhost:${API_PORT}`,
      },
    },
    {
      name: "ui",
      testMatch: ["e2e/ui/**/*.spec.ts", "e2e/chat-websocket.spec.ts"],
      use: {
        ...devices["Desktop Chrome"],
        baseURL: `http://localhost:${WEB_PORT}`,
      },
    },
  ],

  webServer: [
    {
      command: [
        `AI_SPACES_PORT=${API_PORT}`,
        `AI_SPACES_DB=${TEST_DB}`,
        `AI_SPACES_DATA=/tmp/ai-spaces-test-data`,
        `OPENCLAW_HOME=/tmp/openclaw-test`,
        `NODE_ENV=test`,
        `ALLOW_OPEN_REGISTRATION=true`,
        `npx tsx packages/server/src/index.ts`,
      ].join(" "),
      url: `http://localhost:${API_PORT}/health`,
      reuseExistingServer: false,
      timeout: 20000,
    },
    {
      command: `AI_SPACES_PORT=${API_PORT} NODE_ENV=test npx vite --port ${WEB_PORT} --strictPort`,
      cwd: "packages/web",
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: false,
      timeout: 60000,
    },
  ],
});
