import { afterEach, describe, expect, it } from "vitest";
import { config, getOAuthReturnOrigin } from "./config.js";

const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  if (originalNodeEnv === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = originalNodeEnv;
  }
});

describe("getOAuthReturnOrigin", () => {
  it("preserves localhost ports during local development", () => {
    process.env.NODE_ENV = "development";

    expect(getOAuthReturnOrigin("http://localhost:3000")).toBe("http://localhost:3000");
    expect(getOAuthReturnOrigin("http://localhost:5173")).toBe("http://localhost:5173");
  });

  it("falls back to the configured frontend for untrusted origins", () => {
    process.env.NODE_ENV = "development";

    expect(getOAuthReturnOrigin("https://example.com")).toBe(new URL(config.BASE_URL).origin);
  });

  it("does not allow alternate localhost ports in production", () => {
    process.env.NODE_ENV = "production";

    expect(getOAuthReturnOrigin("http://localhost:3000")).toBe(new URL(config.BASE_URL).origin);
  });
});
