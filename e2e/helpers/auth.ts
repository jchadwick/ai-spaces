import type { APIRequestContext } from '@playwright/test';

export const ADMIN_EMAIL = 'admin@ai-spaces.test';
export const ADMIN_PASSWORD = 'ai-spaces';

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    role: string;
    displayName: string;
  };
}

export async function loginAsAdmin(request: APIRequestContext): Promise<LoginResponse> {
  const response = await request.post('/api/auth/login', {
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });

  if (!response.ok()) {
    throw new Error(`Login failed: ${response.status()} ${await response.text()}`);
  }

  return response.json() as Promise<LoginResponse>;
}
