import { describe, expect, it } from "vitest";
import { fileContentResponseBody, isBase64FileResponse } from "./spaces.js";

describe("space file responses", () => {
  it("decodes base64 image content before sending the response body", () => {
    const pngBytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47]);
    const body = fileContentResponseBody(Buffer.from(pngBytes).toString("base64"), "image/png");

    expect(body).toBeInstanceOf(Uint8Array);
    expect([...body]).toEqual([...pngBytes]);
  });

  it("leaves text content unchanged", () => {
    expect(fileContentResponseBody("# Notes", "text/markdown; charset=utf-8")).toBe("# Notes");
  });

  it("treats images and PDFs as base64 adapter payloads", () => {
    expect(isBase64FileResponse("image/jpeg")).toBe(true);
    expect(isBase64FileResponse("application/pdf")).toBe(true);
    expect(isBase64FileResponse("application/json")).toBe(false);
  });
});
