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

  test('navigating to /spaces/:id loads owner Space Explorer', async ({ page, request }) => {
    await injectAuth(page, authData);
    const { id: spaceId } = await createOwnedSpace(request);
    await page.goto(`/spaces/${spaceId}`);
    await page.waitForLoadState('networkidle');

    expect(page.url()).not.toContain('/login');
    await expect(page.getByText('Workspace root')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Only owners see this view.')).toBeVisible({ timeout: 5000 });
  });

  test('navigating to an unknown space does not show raw files', async ({ page }) => {
    await injectAuth(page, authData);
    await page.goto('/spaces/doesnotexist-fake-id-xyz');
    await page.waitForLoadState('networkidle');

    expect(page.url()).not.toContain('/login');
    await expect(page.getByText('Workspace root')).not.toBeVisible({ timeout: 5000 });
  });

  test('owner can create an invite link from the owner Space Explorer', async ({ page, request }) => {
    await injectAuth(page, authData);
    const { id: spaceId } = await createOwnedSpace(request);
    await page.goto(`/spaces/${spaceId}`);
    await page.waitForLoadState('networkidle');

    const inviteButton = page.getByRole('button', { name: 'Invite link' });
    await expect(inviteButton).toBeVisible({ timeout: 5000 });
    await inviteButton.click();
    await expect(page.getByText('/invite#token=')).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Rooms shell layout', () => {
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

  test('Rooms shell renders rail, top bar, and Rooms home', async ({ page }) => {
    await page.route('**/api/spaces', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ spaces: [{ ...MOCK_SPACE, userRole: 'owner' }] }),
      }),
    );
    await page.route(`**/api/spaces/${MOCK_SPACE_ID}/rooms`, route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ rooms: [] }) }),
    );
    await page.route(`**/api/spaces/${MOCK_SPACE_ID}/metadata`, route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ files: {} }) }),
    );
    await page.route(`**/api/spaces/${MOCK_SPACE_ID}/members`, route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ members: [] }) }),
    );

    await page.addInitScript(
      ({ accessToken, refreshToken, user }: AuthData) => {
        localStorage.setItem('auth_access_token', accessToken);
        localStorage.setItem('auth_refresh_token', refreshToken);
        localStorage.setItem('auth_user', JSON.stringify(user));
      },
      authData,
    );

    await page.setViewportSize({ width: 1400, height: 768 });
    await page.goto('/spaces');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('button', { name: 'Rooms home' })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('heading', { name: 'Rooms' })).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('No rooms yet.')).toBeVisible({ timeout: 5000 });
  });
});
