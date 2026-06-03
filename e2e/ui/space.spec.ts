import { test, expect } from '@playwright/test';
import { ADMIN_EMAIL, ADMIN_PASSWORD } from '../helpers/auth.js';
import { API_BASE } from '../helpers/constants.js';
import { createOwnedSpace } from '../helpers/spaces.js';

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

test.describe('Space page', () => {
  let authData: AuthData;

  test.beforeAll(async () => {
    authData = await getAdminTokens();
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

  test('navigating to /space/:id loads space content', async ({ page, request }) => {
    await injectAuth(page, authData);
    const { id: spaceId } = await createOwnedSpace(request);
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

  test('owner can create an invite link from the share dialog', async ({ page, request }) => {
    await injectAuth(page, authData);
    const { id: spaceId } = await createOwnedSpace(request);
    await page.goto(`/space/${spaceId}`);
    await page.waitForLoadState('networkidle');

    const shareButton = page.getByRole('button', { name: 'Share' });
    await expect(shareButton).toBeVisible({ timeout: 5000 });
    await shareButton.click();

    await expect(page.getByRole('dialog', { name: 'Share Space' })).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: 'Create Invite' }).click();

    const inviteInput = page.locator('input[readonly]').last();
    await expect(inviteInput).toHaveValue(/\/invite#token=/, { timeout: 5000 });
  });
});

test.describe('Space page layout', () => {
  let authData: AuthData;

  // Lightweight mock space — only needs the API response, not the filesystem
  const MOCK_SPACE_ID = 'layout-test-space';
  const MOCK_SPACE = {
    id: MOCK_SPACE_ID,
    name: 'Layout Test Space',
    agent: 'openclaw',
    path: '/tmp/layout-test',
    config: { name: 'Layout Test Space' },
  };

  test.beforeAll(async () => {
    authData = await getAdminTokens();
  });

  test('three-column layout renders with correct proportions', async ({ page }) => {
    // Mock just the space data — auth uses real tokens against the test server
    await page.route(`**/api/spaces/${MOCK_SPACE_ID}`, route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ space: MOCK_SPACE }) }),
    );
    // Abort WS connections so reconnect retries don't affect layout measurement
    await page.route('**/ws/**', route => route.abort());

    await page.addInitScript(
      ({ accessToken, refreshToken, user }: AuthData) => {
        localStorage.setItem('auth_access_token', accessToken);
        localStorage.setItem('auth_refresh_token', refreshToken);
        localStorage.setItem('auth_user', JSON.stringify(user));
      },
      authData,
    );

    await page.setViewportSize({ width: 1400, height: 768 });
    await page.goto(`/space/${MOCK_SPACE_ID}`);
    await page.waitForLoadState('networkidle');

    // Must be on the space page, not login
    await expect(page).toHaveURL(/\/space\//, { timeout: 5000 });

    // The space-page <main> must be visible
    const main = page.locator('main').first();
    await expect(main).toBeVisible({ timeout: 5000 });

    // Measure all direct children of <main>
    const children = await main.evaluate(el =>
      Array.from(el.children).map(c => ({
        tag: c.tagName,
        width: Math.round(c.getBoundingClientRect().width),
      })),
    );

    // Must be exactly 5 children: left sidebar, left handle, center, right handle, right sidebar
    expect(children).toHaveLength(5);
    const [leftSidebar, , center, , rightSidebar] = children;

    // Sidebars must match their defaults (±10px tolerance)
    expect(leftSidebar.width).toBeGreaterThanOrEqual(246);
    expect(leftSidebar.width).toBeLessThanOrEqual(266);
    expect(rightSidebar.width).toBeGreaterThanOrEqual(310);
    expect(rightSidebar.width).toBeLessThanOrEqual(330);

    // Center column must be substantial — regression guard against flex-1 being removed
    expect(center.width).toBeGreaterThan(400);
    expect(center.tag).toBe('DIV');
  });
});
