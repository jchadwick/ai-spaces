import type { APIRequestContext } from "@playwright/test";

export const ADMIN_EMAIL = "admin@ai-spaces.test";
export const ADMIN_PASSWORD = "ai-spaces";
export const USER_EMAIL = "user@ai-spaces.test";
export const USER_PASSWORD = "ai-spaces";

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

async function loginAs(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<LoginResponse> {
  const response = await request.post("/api/auth/login", {
    data: { email, password },
  });

  if (!response.ok()) {
    throw new Error(`Login failed: ${response.status()} ${await response.text()}`);
  }

  return response.json() as Promise<LoginResponse>;
}

export async function loginAsAdmin(request: APIRequestContext): Promise<LoginResponse> {
  return loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);
}

export async function loginAsUser(request: APIRequestContext): Promise<LoginResponse> {
  return loginAs(request, USER_EMAIL, USER_PASSWORD);
}

export function uniqueTestEmail(prefix = "user"): string {
  return `${prefix}.${Date.now()}.${Math.random().toString(36).slice(2)}@ai-spaces.test`;
}

export async function registerUser(
  request: APIRequestContext,
  email: string,
  password: string,
  displayName = "E2E User",
): Promise<void> {
  const response = await request.post("/api/auth/register", {
    data: { email, password, displayName },
  });

  if (response.ok()) {
    return;
  }

  if (response.status() === 409) {
    return;
  }

  throw new Error(`Registration failed: ${response.status()} ${await response.text()}`);
}
