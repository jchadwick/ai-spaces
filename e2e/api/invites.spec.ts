import { test, expect } from '@playwright/test';
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  registerUser,
  uniqueTestEmail,
} from '../helpers/auth.js';
import { createOwnedSpace } from '../helpers/spaces.js';

async function login(request: import('@playwright/test').APIRequestContext, email: string, password: string): Promise<string> {
  const response = await request.post('/api/auth/login', {
    data: { email, password },
  });

  if (!response.ok()) {
    throw new Error(`Login failed: ${response.status()} ${await response.text()}`);
  }

  const body = await response.json() as { accessToken: string };
  return body.accessToken;
}

test.describe('Invite endpoints', () => {
  test('owner can create an invite link', async ({ request }) => {
    const accessToken = await login(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const space = await createOwnedSpace(request);
    const response = await request.post(`/api/spaces/${space.id}/invites`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      data: { role: 'editor' },
    });

    expect(response.status()).toBe(200);
    const body = await response.json() as { inviteUrl?: string };
    expect(body.inviteUrl).toContain('/invite#token=');
  });

  test('non-owner gets a clear 403 when creating an invite', async ({ request }) => {
    const space = await createOwnedSpace(request);

    const email = uniqueTestEmail('collaborator');
    const password = 'ai-spaces';
    await registerUser(request, email, password);
    const accessToken = await login(request, email, password);

    const response = await request.post(`/api/spaces/${space.id}/invites`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      data: { role: 'editor' },
    });

    expect(response.status()).toBe(403);
    const body = await response.json() as { error?: string };
    expect(body.error).toBe('Forbidden');
  });
});
