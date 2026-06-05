import { expect, test } from "@playwright/test";
import { ADMIN_EMAIL, ADMIN_PASSWORD, registerUser, uniqueTestEmail } from "../helpers/auth.js";
import { createOwnedSpace } from "../helpers/spaces.js";

async function createInviteUrl(
  request: import("@playwright/test").APIRequestContext,
): Promise<{ inviteUrl: string; spaceId: string }> {
  const loginResponse = await request.post("/api/auth/login", {
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });

  if (!loginResponse.ok()) {
    throw new Error(`Admin login failed: ${loginResponse.status()} ${await loginResponse.text()}`);
  }

  const accessToken = ((await loginResponse.json()) as { accessToken: string }).accessToken;
  const space = await createOwnedSpace(request);
  const response = await request.post(`/api/spaces/${space.id}/invites`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    data: { role: "editor" },
  });

  if (!response.ok()) {
    throw new Error(`Invite creation failed: ${response.status()} ${await response.text()}`);
  }

  const body = (await response.json()) as { inviteUrl: string };
  return { inviteUrl: body.inviteUrl, spaceId: space.id };
}

test.describe("Invite page flow", () => {
  test("invite link strips fragment, stores pending token, and redeems after login", async ({
    page,
    request,
  }) => {
    const { inviteUrl, spaceId } = await createInviteUrl(request);
    const token = new URL(inviteUrl).hash.replace(/^#token=/, "");
    const email = uniqueTestEmail("collaborator");
    const password = "ai-spaces";
    await registerUser(request, email, password);

    await page.goto(`/invite#token=${token}`);
    await expect.poll(() => page.evaluate(() => window.location.hash)).toBe("");
    await expect(page.getByText("Please log in to accept your invitation.")).toBeVisible();

    const storedToken = await page.evaluate(() => sessionStorage.getItem("pendingInviteToken"));
    expect(storedToken).toBe(token);

    await page.getByRole("link", { name: "Go to login" }).click();
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign In", exact: true }).click();

    await page.waitForURL(
      (url) => url.pathname === "/spaces" && url.searchParams.get("space") === spaceId,
      { timeout: 10000 },
    );
    expect(page.url()).toContain(`/spaces?space=${spaceId}`);
    const pendingAfter = await page.evaluate(() => sessionStorage.getItem("pendingInviteToken"));
    expect(pendingAfter).toBeNull();
  });
});
