import { test as base, expect } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import { loginAsAdmin } from './auth.js';

interface TestFixtures {
  authToken: string;
  authedRequest: APIRequestContext;
}

export const test = base.extend<TestFixtures>({
  authToken: async ({ request }, use) => {
    const data = await loginAsAdmin(request);
    await use(data.accessToken);
  },

  authedRequest: async ({ playwright, baseURL, authToken }, use) => {
    const context = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: {
        Authorization: `Bearer ${authToken}`,
      },
    });
    await use(context);
    await context.dispose();
  },
});

export { expect };
