import { expect, test } from "@playwright/test";
import { ADMIN_EMAIL, ADMIN_PASSWORD } from "../helpers/auth.js";

test.describe("Login page", () => {
  test("visiting / redirects to /login when not authenticated", async ({ page }) => {
    await page.goto("/");
    await page.waitForURL("**/login");
    expect(page.url()).toContain("/login");
  });

  test("login page has email and password inputs", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator('input[type="text"], input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test("valid login navigates away from /login", async ({ page }) => {
    await page.goto("/login");
    await page.locator('input[type="text"], input[type="email"]').fill(ADMIN_EMAIL);
    await page.locator('input[type="password"]').fill(ADMIN_PASSWORD);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 10000 });
    expect(page.url()).not.toContain("/login");
  });

  test("invalid credentials shows error message", async ({ page }) => {
    await page.goto("/login");
    await page.locator('input[type="text"], input[type="email"]').fill(ADMIN_EMAIL);
    await page.locator('input[type="password"]').fill("wrongpassword");
    await page.locator('button[type="submit"]').click();
    // Error message should appear
    await expect(page.locator("text=Invalid credentials")).toBeVisible({ timeout: 5000 });
  });

  test("auth callback establishes app auth and navigates on first pass", async ({ page }) => {
    await page.route("**/api/auth/me", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "oauth-user",
          email: ADMIN_EMAIL,
          displayName: "Admin User",
          serverRole: "admin",
        }),
      }),
    );
    await page.route("**/api/spaces", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ spaces: [] }),
      }),
    );

    await page.goto("/auth/callback?accessToken=test-access-token&refreshToken=test-refresh-token");
    await page.waitForURL("**/spaces", { timeout: 10000 });

    await expect(page.getByRole("heading", { name: "Rooms" })).toBeVisible({ timeout: 5000 });
    expect(await page.evaluate(() => localStorage.getItem("auth_access_token"))).toBe(
      "test-access-token",
    );
  });
});
