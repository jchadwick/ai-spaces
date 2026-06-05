import { expect, type Page, test } from "@playwright/test";
import { ADMIN_EMAIL } from "../helpers/auth.js";

interface AuthData {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    displayName: string;
    serverRole: "admin" | "user";
  };
}

const SPACE_ID = "room-content-viewer-space";
const ROOM_ID = "room-content-viewer-room";
const ROOM_ROOT = "viewer-audit";

async function injectAuth(page: Page) {
  const authData: AuthData = {
    accessToken: "rooms-content-viewer-token",
    refreshToken: "rooms-content-viewer-refresh",
    user: {
      id: "rooms-content-viewer-admin",
      email: ADMIN_EMAIL,
      displayName: "E2E Admin",
      serverRole: "admin",
    },
  };

  await page.addInitScript((data: AuthData) => {
    localStorage.setItem("auth_access_token", data.accessToken);
    localStorage.setItem("auth_refresh_token", data.refreshToken);
    localStorage.setItem("auth_user", JSON.stringify(data.user));
  }, authData);
}

async function installRoomsContentMocks(page: Page) {
  const files = new Map<string, string>([
    [`${ROOM_ROOT}/notes.md`, "# Markdown registry audit\n\n- viewer assertion\n"],
    [`${ROOM_ROOT}/memo.txt`, "Plain text registry audit\nsecond line\n"],
  ]);
  const writes: Array<{ path: string; content: string }> = [];

  await page.route(/^https?:\/\/[^/]+\/api\/.*/, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();

    if (method === "GET" && path === "/api/spaces") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          spaces: [
            {
              id: SPACE_ID,
              name: "Content Viewer Space",
              agent: "openclaw",
              path: "/tmp/content-viewer-space",
              config: {
                name: "Content Viewer Space",
                description: "Mocked server responses for Rooms content viewer coverage",
              },
              userRole: "owner",
            },
          ],
        }),
      });
      return;
    }

    if (method === "GET" && path === `/api/spaces/${SPACE_ID}/rooms`) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          rooms: [
            {
              id: ROOM_ID,
              spaceId: SPACE_ID,
              topicPath: `/${ROOM_ROOT}`,
              targetType: "directory",
              status: "active",
              updatedAt: "2026-06-05T12:00:00.000Z",
            },
          ],
        }),
      });
      return;
    }

    if (method === "GET" && path === `/api/spaces/${SPACE_ID}/metadata`) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          files: {
            [ROOM_ROOT]: {
              displayName: "Viewer Audit Room",
              summary: "Exercises markdown and text viewers in the Rooms file pane.",
            },
          },
        }),
      });
      return;
    }

    if (method === "GET" && path === `/api/spaces/${SPACE_ID}/members`) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ members: [] }),
      });
      return;
    }

    if (method === "GET" && path === `/api/spaces/${SPACE_ID}/topics`) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ topics: [{ topicPath: `/${ROOM_ROOT}` }] }),
      });
      return;
    }

    if (method === "GET" && path === `/api/spaces/${SPACE_ID}/topics/session`) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ topic: null }),
      });
      return;
    }

    if (method === "GET" && path === `/api/spaces/${SPACE_ID}/files`) {
      const requestedPath = url.searchParams.get("path") ?? "";
      if (requestedPath !== ROOM_ROOT) {
        await route.fulfill({
          status: 404,
          contentType: "application/json",
          body: JSON.stringify({ error: "Not found" }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          files: [
            { name: "memo.txt", path: `${ROOM_ROOT}/memo.txt`, type: "file" },
            { name: "notes.md", path: `${ROOM_ROOT}/notes.md`, type: "file" },
          ],
        }),
      });
      return;
    }

    const filePrefix = `/api/spaces/${SPACE_ID}/files/`;
    if (path.startsWith(filePrefix)) {
      const filePath = decodeURIComponent(path.slice(filePrefix.length));

      if (method === "GET") {
        const content = files.get(filePath);
        if (content === undefined) {
          await route.fulfill({
            status: 404,
            contentType: "application/json",
            body: JSON.stringify({ error: "Not found" }),
          });
          return;
        }

        await route.fulfill({
          status: 200,
          contentType: filePath.endsWith(".md") ? "text/markdown" : "text/plain",
          headers: { "x-file-modified": "2026-06-05T12:00:00.000Z" },
          body: content,
        });
        return;
      }

      if (method === "PUT") {
        const body = (await request.postDataJSON()) as { content?: string };
        const content = body.content ?? "";
        files.set(filePath, content);
        writes.push({ path: filePath, content });
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ success: true, path: filePath }),
        });
        return;
      }
    }

    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ error: `Unhandled mock route: ${method} ${path}` }),
    });
  });

  return { writes };
}

test.describe("Rooms content viewer registry", () => {
  test("renders markdown and plain text, then saves both from the visible room file pane", async ({
    page,
  }) => {
    const { writes } = await installRoomsContentMocks(page);
    await injectAuth(page);
    await page.setViewportSize({ width: 1440, height: 900 });

    await page.goto(`/spaces/${SPACE_ID}/rooms/${ROOM_ID}`);
    await page.waitForLoadState("networkidle");

    await expect(page.getByText("Viewer Audit Room")).toBeVisible({ timeout: 5000 });
    await page.getByText("notes.md").click();
    await expect(page.getByRole("heading", { name: "Markdown registry audit" })).toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByText("viewer assertion")).toBeVisible();

    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page
      .locator('textarea:not([placeholder="Reconnecting..."])')
      .first()
      .fill("# Markdown registry audit\n\nEdited markdown through visible UI.\n");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect
      .poll(() =>
        writes.some(
          (write) =>
            write.path === `${ROOM_ROOT}/notes.md` &&
            write.content.includes("Edited markdown through visible UI."),
        ),
      )
      .toBe(true);

    await page.getByText("memo.txt").click();
    await expect(page).toHaveURL(new RegExp(`/spaces/${SPACE_ID}/rooms/${ROOM_ID}/memo\\.txt$`));
    await expect(page.locator("pre").filter({ hasText: "Plain text registry audit" })).toBeVisible({
      timeout: 5000,
    });

    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page.locator('[contenteditable="true"]').fill("Edited text through visible UI.");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect
      .poll(() =>
        writes.some(
          (write) =>
            write.path === `${ROOM_ROOT}/memo.txt` &&
            write.content.includes("Edited text through visible UI."),
        ),
      )
      .toBe(true);
  });
});
