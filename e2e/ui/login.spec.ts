import { test, expect } from '@playwright/test';
import { ADMIN_EMAIL, ADMIN_PASSWORD } from '../helpers/auth.js';

test.describe('Login page', () => {
  test('visiting / redirects to /login when not authenticated', async ({ page }) => {
    await page.goto('/');
    await page.waitForURL('**/login');
    expect(page.url()).toContain('/login');
  });

  test('login page has email and password inputs', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('input[type="text"], input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test('valid login navigates away from /login', async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[type="text"], input[type="email"]').fill(ADMIN_EMAIL);
    await page.locator('input[type="password"]').fill(ADMIN_PASSWORD);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 10000 });
    expect(page.url()).not.toContain('/login');
  });

  test('invalid credentials shows error message', async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[type="text"], input[type="email"]').fill(ADMIN_EMAIL);
    await page.locator('input[type="password"]').fill('wrongpassword');
    await page.locator('button[type="submit"]').click();
    // Error message should appear
    await expect(page.locator('text=Invalid credentials')).toBeVisible({ timeout: 5000 });
  });
});
