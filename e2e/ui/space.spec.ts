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
  if (!response.ok) {
    throw new Error(`Login failed: ${response.status}`);
  }
  return response.json();
}

async function createTestSpace(accessToken: string): Promise<{ id: string; path: string }> {
  const spacePath = `/tmp/test-space-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const response = await fetch(`${API_BASE}/api/spaces`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ path: spacePath }),
  });
  if (!response.ok) {
    throw new Error(`Create space failed: ${response.status} ${await response.text()}`);
  }
  const data = await response.json();
  return data.space;
}

async function deleteTestSpace(accessToken: string, spaceId: string): Promise<void> {
  await fetch(`${API_BASE}/api/spaces/${spaceId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

test.describe('Space page', () => {
  let authData: AuthData;
  let spaceId: string;

  test.beforeAll(async () => {
    authData = await getAdminTokens();
    const space = await createTestSpace(authData.accessToken);
    spaceId = space.id;
  });

  test.afterAll(async () => {
    if (authData && spaceId) {
      await deleteTestSpace(authData.accessToken, spaceId);
    }
  });

  async function injectAuth(page: import('@playwright/test').Page, data: AuthData) {
    await page.addInitScript(
      ({ accessToken, refreshToken, user }: AuthData) => {
        localStorage.setItem('auth_access_token', accessToken);
        localStorage.setItem('auth_refresh_token', refreshToken);
        localStorage.setItem('auth_user', JSON.stringify(user));
      },
      data,
    );
  }

  test('navigating to /space/:id loads space content', async ({ page }) => {
    await injectAuth(page, authData);
    await page.goto(`/space/${spaceId}`);
    await page.waitForLoadState('networkidle');

    // Should not redirect to login
    expect(page.url()).not.toContain('/login');
    // Should NOT show the error state
    await expect(page.locator('text=Error Loading Space')).not.toBeVisible({ timeout: 5000 });
  });

  test('navigating to /space/doesnotexist shows error/not-found state', async ({ page }) => {
    await injectAuth(page, authData);
    await page.goto('/space/doesnotexist-fake-id-xyz');
    await page.waitForLoadState('networkidle');

    // Should not redirect to login
    expect(page.url()).not.toContain('/login');
    // Should show the error state — SpacePage renders "Error Loading Space" heading
    await expect(page.getByRole('heading', { name: 'Error Loading Space' })).toBeVisible({ timeout: 5000 });
  });
});
