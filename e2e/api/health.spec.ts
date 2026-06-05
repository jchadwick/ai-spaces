import { expect, test } from "@playwright/test";

test.describe("Health endpoint", () => {
  test("GET /health returns 200 with status ok", async ({ request }) => {
    const response = await request.get("/health");
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ status: "ok" });
  });

  test("GET /api/spaces without auth returns 401", async ({ request }) => {
    const response = await request.get("/api/spaces");
    expect(response.status()).toBe(401);
  });

  test("GET /api/spaces with bad token returns 401", async ({ request }) => {
    const response = await request.get("/api/spaces", {
      headers: { Authorization: "Bearer invalid.token.here" },
    });
    expect(response.status()).toBe(401);
  });
});
