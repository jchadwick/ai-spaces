import { test, expect } from '@playwright/test';
import { ADMIN_EMAIL, ADMIN_PASSWORD } from '../helpers/auth.js';

test.describe('Auth endpoints', () => {
  test('login with correct credentials returns 200 with tokens and user', async ({ request }) => {
    const response = await request.post('/api/auth/login', {
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty('accessToken');
    expect(body).toHaveProperty('refreshToken');
    expect(body).toHaveProperty('user');
    expect(body.user).toHaveProperty('id');
    expect(body.user).toHaveProperty('email', ADMIN_EMAIL);
    expect(body.user).toHaveProperty('role');
    expect(body.user).toHaveProperty('displayName');
  });

  test('login with wrong password returns 401', async ({ request }) => {
    const response = await request.post('/api/auth/login', {
      data: { email: ADMIN_EMAIL, password: 'wrongpassword' },
    });
    expect(response.status()).toBe(401);
  });

  test('login with unknown email returns 401', async ({ request }) => {
    const response = await request.post('/api/auth/login', {
      data: { email: 'nobody@example.com', password: 'somepassword' },
    });
    expect(response.status()).toBe(401);
  });

  test('refresh with valid refresh token returns 200 with new accessToken', async ({ request }) => {
    // First login to get a refresh token
    const loginResponse = await request.post('/api/auth/login', {
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });
    const { refreshToken } = await loginResponse.json();

    const response = await request.post('/api/auth/refresh', {
      data: { refreshToken },
    });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty('accessToken');
  });

  test('logout returns 200', async ({ request }) => {
    const response = await request.post('/api/auth/logout');
    expect(response.status()).toBe(200);
  });
});
