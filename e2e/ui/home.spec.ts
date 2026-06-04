import { test, expect } from '@playwright/test';
import { ADMIN_EMAIL, ADMIN_PASSWORD } from '../helpers/auth.js';
import { API_BASE } from '../helpers/constants.js';

interface AuthData {
  accessToken: string;
  refreshToken: string;
  user: object;
}

async function getAdminTokens(): Promise<AuthData> {
  const response = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  if (!response.ok) throw new Error(`Login failed: ${response.status}`);
  return response.json();
}

test.describe('Home page', () => {
  let authData: AuthData;

  test.beforeAll(async () => {
    authData = await getAdminTokens();
  });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(
      ({ accessToken, refreshToken, user }: AuthData) => {
        localStorage.setItem('auth_access_token', accessToken);
        localStorage.setItem('auth_refresh_token', refreshToken);
        localStorage.setItem('auth_user', JSON.stringify(user));
      },
      authData,
    );
  });

  test('authenticated page loads without redirecting to /login', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    expect(page.url()).not.toContain('/login');
  });

  test('page contains brand headline text', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Spaces').first()).toBeVisible();
  });

  test('rooms grid or empty state is visible', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const cardCount = await page.getByRole('heading', { level: 3 }).count();

    if (cardCount === 0) {
      await expect(page.getByText('No rooms yet.')).toBeVisible();
    } else {
      expect(cardCount).toBeGreaterThan(0);
    }
  });
});
