import { test, expect } from '@playwright/test';
import { E2E_SPACE_ID } from './constants';

test.describe('Space WebSocket (dev stack)', () => {
  test('login, open space, WebSocket reaches connected', async ({ page }) => {
    await page.goto('/login');

    await page.getByLabel('Email').fill('admin@ai-spaces.test');
    await page.getByLabel('Password').fill('ai-spaces');
    await page.getByRole('button', { name: 'Sign In' }).click();

    await expect(page).toHaveURL(/\/spaces$/);

    const wsEvent = page.waitForEvent('websocket', {
      predicate: (ws) => ws.url().includes(`/ws/spaces/${E2E_SPACE_ID}`),
    });

    await page.goto(`/space/${E2E_SPACE_ID}`);

    await expect(page.getByText('Error Loading Space')).toHaveCount(0);
    await expect(page.getByText('Space Not Found')).toHaveCount(0);

    const ws = await wsEvent;
    expect(ws.url()).toContain('127.0.0.1');
    expect(ws.url()).toContain(`/ws/spaces/${E2E_SPACE_ID}`);

    const status = page.getByTestId('chat-ws-status');
    await expect(status).toHaveAttribute('data-status', 'connected', { timeout: 30_000 });

    await page.getByPlaceholder('Ask AI anything...').fill('Hello from Playwright');
    await page.locator('aside form button[type="submit"]').click();

    await expect(page.getByText('Mock reply.')).toBeVisible({ timeout: 15_000 });
  });
});
