import { Buffer } from "node:buffer";
import { inflateSync } from "node:zlib";
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
const PDF_FILE_PATH = `${ROOM_ROOT}/audit:report.pdf`;
const UPLOADED_PDF_NAME = "tiny spaces:upload.pdf";
const UPLOADED_PDF_PATH = `${ROOM_ROOT}/${UPLOADED_PDF_NAME}`;

function asciiBytes(value: string): number[] {
  return Array.from(value, (character) => character.charCodeAt(0));
}

function buildTinyPdfBytes(): Uint8Array {
  const chunks: number[][] = [];
  let offset = 0;
  const objectOffsets: number[] = [];

  function pushBytes(bytes: number[]) {
    chunks.push(bytes);
    offset += bytes.length;
  }

  function pushText(text: string) {
    pushBytes(asciiBytes(text));
  }

  function pushObject(number: number, body: string) {
    objectOffsets[number] = offset;
    pushText(`${number} 0 obj\n${body}\nendobj\n`);
  }

  const stream = "BT /F1 18 Tf 40 90 Td (AI Spaces PDF upload fixture) Tj ET\n";
  pushText("%PDF-1.7\n%");
  pushBytes([0xff, 0xfe, 0xfd, 0xfc]);
  pushText("\n");
  pushObject(1, "<< /Type /Catalog /Pages 2 0 R >>");
  pushObject(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  pushObject(
    3,
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
  );
  pushObject(4, `<< /Length ${asciiBytes(stream).length} >>\nstream\n${stream}endstream`);
  pushObject(5, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  const xrefOffset = offset;
  pushText("xref\n0 6\n0000000000 65535 f \n");
  for (let objectNumber = 1; objectNumber <= 5; objectNumber++) {
    pushText(`${String(objectOffsets[objectNumber]).padStart(10, "0")} 00000 n \n`);
  }
  pushText(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

  return Uint8Array.from(chunks.flat());
}

const TINY_PDF_BYTES = buildTinyPdfBytes();

function paethPredictor(left: number, up: number, upperLeft: number): number {
  const prediction = left + up - upperLeft;
  const leftDistance = Math.abs(prediction - left);
  const upDistance = Math.abs(prediction - up);
  const upperLeftDistance = Math.abs(prediction - upperLeft);
  if (leftDistance <= upDistance && leftDistance <= upperLeftDistance) return left;
  if (upDistance <= upperLeftDistance) return up;
  return upperLeft;
}

function countChromeReloadButtonBluePixels(png: Buffer): number {
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idatChunks: Buffer[] = [];

  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.subarray(offset + 4, offset + 8).toString("ascii");
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const bitDepth = data[8];
      colorType = data[9];
      if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) {
        throw new Error(`Unsupported PNG format: bitDepth=${bitDepth}, colorType=${colorType}`);
      }
    } else if (type === "IDAT") {
      idatChunks.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset += length + 12;
  }

  const bytesPerPixel = colorType === 6 ? 4 : 3;
  const rowLength = width * bytesPerPixel;
  const inflated = inflateSync(Buffer.concat(idatChunks));
  const pixels = Buffer.alloc(rowLength * height);
  let inputOffset = 0;

  for (let y = 0; y < height; y++) {
    const filter = inflated[inputOffset++];
    const rowStart = y * rowLength;
    const previousRowStart = rowStart - rowLength;
    for (let x = 0; x < rowLength; x++) {
      const raw = inflated[inputOffset++];
      const left = x >= bytesPerPixel ? pixels[rowStart + x - bytesPerPixel] : 0;
      const up = y > 0 ? pixels[previousRowStart + x] : 0;
      const upperLeft =
        y > 0 && x >= bytesPerPixel ? pixels[previousRowStart + x - bytesPerPixel] : 0;
      let value = raw;
      if (filter === 1) value += left;
      else if (filter === 2) value += up;
      else if (filter === 3) value += Math.floor((left + up) / 2);
      else if (filter === 4) value += paethPredictor(left, up, upperLeft);
      else if (filter !== 0) throw new Error(`Unsupported PNG filter: ${filter}`);
      pixels[rowStart + x] = value & 0xff;
    }
  }

  let bluePixels = 0;
  for (let y = Math.floor(height * 0.35); y < Math.floor(height * 0.8); y++) {
    for (let x = Math.floor(width * 0.2); x < Math.floor(width * 0.9); x++) {
      const pixelOffset = y * rowLength + x * bytesPerPixel;
      const red = pixels[pixelOffset];
      const green = pixels[pixelOffset + 1];
      const blue = pixels[pixelOffset + 2];
      if (red < 90 && green > 70 && green < 170 && blue > 170) bluePixels++;
    }
  }
  return bluePixels;
}

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
  const pdfFiles = new Map<string, Uint8Array>([[PDF_FILE_PATH, TINY_PDF_BYTES]]);
  const writes: Array<{ path: string; content: string; encoding?: "utf-8" | "base64" }> = [];

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
          files: [...files.keys(), ...pdfFiles.keys()]
            .filter((filePath) => filePath.startsWith(`${ROOM_ROOT}/`))
            .map((filePath) => ({
              name: filePath.split("/").pop() ?? filePath,
              path: filePath,
              type: "file",
            })),
        }),
      });
      return;
    }

    const filePrefix = `/api/spaces/${SPACE_ID}/files/`;
    if (path.startsWith(filePrefix)) {
      const filePath = decodeURIComponent(path.slice(filePrefix.length));
      const pdfBytes = pdfFiles.get(filePath);

      if (method === "HEAD") {
        const textContent = files.get(filePath);
        if (textContent === undefined && pdfBytes === undefined) {
          await route.fulfill({
            status: 404,
            contentType: "application/json",
            body: JSON.stringify({ error: "Not found" }),
          });
          return;
        }

        await route.fulfill({
          status: 200,
          contentType: pdfBytes ? "application/pdf" : "text/plain",
          headers: {
            "content-length": String(pdfBytes?.byteLength ?? textContent?.length ?? 0),
            "x-file-modified": "2026-06-05T12:00:00.000Z",
          },
        });
        return;
      }

      if (method === "GET") {
        if (pdfBytes) {
          await route.fulfill({
            status: 200,
            contentType: "application/pdf",
            headers: {
              "content-length": String(pdfBytes.byteLength),
              "x-file-modified": "2026-06-05T12:00:00.000Z",
            },
            body: Buffer.from(pdfBytes),
          });
          return;
        }

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
        const body = (await request.postDataJSON()) as {
          content?: string;
          encoding?: "utf-8" | "base64";
        };
        const content = body.content ?? "";
        if (body.encoding === "base64") {
          pdfFiles.set(filePath, Uint8Array.from(Buffer.from(content, "base64")));
        } else {
          files.set(filePath, content);
        }
        writes.push({ path: filePath, content, encoding: body.encoding });
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

async function expectViewerControls(page: Page) {
  await expect(page.getByRole("button", { name: "Enter focus mode" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Zoom out" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reset zoom" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Zoom in" })).toBeVisible();
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
    await expectViewerControls(page);

    const contentPane = page.locator("[data-rooms-content-pane]");
    const zoomedViewer = page.getByTestId("rooms-viewer-zoom");
    await expect(contentPane).toHaveAttribute("data-focus-mode", "false");
    await expect(zoomedViewer).toHaveAttribute("data-zoom-level", "100");

    await page.getByRole("button", { name: "Zoom in" }).click();
    await expect(zoomedViewer).toHaveAttribute("data-zoom-level", "110");

    await page.getByRole("button", { name: "Reset zoom" }).click();
    await expect(zoomedViewer).toHaveAttribute("data-zoom-level", "100");

    await page.getByRole("button", { name: "Zoom out" }).click();
    await expect(zoomedViewer).toHaveAttribute("data-zoom-level", "90");

    await page.getByRole("button", { name: "Reset zoom" }).click();
    await expect(zoomedViewer).toHaveAttribute("data-zoom-level", "100");

    await page.getByRole("button", { name: "Enter focus mode" }).click();
    await expect(page.getByRole("button", { name: "Exit focus mode" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Enter focus mode" })).toBeHidden();
    await expect(contentPane).toHaveAttribute("data-focus-mode", "true");

    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Enter focus mode" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Exit focus mode" })).toBeHidden();
    await expect(contentPane).toHaveAttribute("data-focus-mode", "false");

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
    await expectViewerControls(page);

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

    await page.getByText("audit:report.pdf").click();
    const pdfFrame = page.locator('iframe[title="PDF viewer"]');
    await expect(pdfFrame).toBeVisible({ timeout: 5000 });
    const pdfSrc = await pdfFrame.getAttribute("src");
    expect(pdfSrc).toBeTruthy();
    expect(pdfSrc).not.toContain("blob:");
    expect(pdfSrc).toContain(`/api/spaces/${SPACE_ID}/files/`);
    expect(pdfSrc).toContain(encodeURIComponent(PDF_FILE_PATH));
    expect(pdfSrc).toContain("token=rooms-content-viewer-token");

    await page.locator('input[type="file"]').setInputFiles({
      name: UPLOADED_PDF_NAME,
      mimeType: "application/pdf",
      buffer: Buffer.from(TINY_PDF_BYTES),
    });
    await expect
      .poll(() => writes.find((write) => write.path === UPLOADED_PDF_PATH))
      .toMatchObject({
        path: UPLOADED_PDF_PATH,
        encoding: "base64",
        content: Buffer.from(TINY_PDF_BYTES).toString("base64"),
      });

    const uploadedPdfUrl = `/api/spaces/${SPACE_ID}/files/${encodeURIComponent(
      UPLOADED_PDF_PATH,
    )}?token=rooms-content-viewer-token`;
    const uploadedBytes = await page.evaluate(async (url) => {
      const response = await fetch(url);
      const bytes = Array.from(new Uint8Array(await response.arrayBuffer()));
      return {
        ok: response.ok,
        contentType: response.headers.get("content-type"),
        bytes,
      };
    }, uploadedPdfUrl);
    expect(uploadedBytes.ok).toBe(true);
    expect(uploadedBytes.contentType).toBe("application/pdf");
    expect(uploadedBytes.bytes).toEqual(Array.from(TINY_PDF_BYTES));

    await page.getByText(UPLOADED_PDF_NAME, { exact: true }).click();
    const uploadedPdfSrc = await pdfFrame.getAttribute("src");
    expect(uploadedPdfSrc).toContain(encodeURIComponent(UPLOADED_PDF_PATH));
    expect(uploadedPdfSrc).not.toContain("blob:");
    await expect(page.getByText("Failed to load PDF document")).toHaveCount(0);
    const pdfScreenshot = await pdfFrame.screenshot();
    expect(countChromeReloadButtonBluePixels(pdfScreenshot)).toBeLessThan(100);
  });
});
