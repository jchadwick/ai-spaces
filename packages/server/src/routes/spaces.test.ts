import { describe, expect, it } from "vitest";
import {
  authenticatedFileContentHeaders,
  fileContentResponseBody,
  fileContentResponseLength,
  isBase64FileResponse,
  safeContentDispositionFilename,
} from "./spaces.js";

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

  it("computes content length from the actual response body bytes", () => {
    expect(fileContentResponseLength("plain text")).toBe(10);
    expect(fileContentResponseLength("snowman: \u2603")).toBe(Buffer.byteLength("snowman: \u2603"));
    expect(fileContentResponseLength(Uint8Array.from([0x25, 0x50, 0x44, 0x46]))).toBe(4);
  });

  it("builds no-store headers with content type and content length", () => {
    expect(
      authenticatedFileContentHeaders({
        filePath: "notes.md",
        contentType: "text/markdown; charset=utf-8",
        contentLength: 42,
      }),
    ).toEqual({
      "Cache-Control": "no-store",
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Length": "42",
    });
  });

  it("adds inline PDF disposition using only an escaped safe basename", () => {
    expect(safeContentDispositionFilename('docs/archive/"quarterly report".pdf')).toBe(
      '\\"quarterly report\\".pdf',
    );
    expect(safeContentDispositionFilename("docs\\archive\\report.pdf")).toBe("report.pdf");
    expect(
      authenticatedFileContentHeaders({
        filePath: 'docs/archive/"quarterly report".pdf',
        contentType: "application/pdf",
        contentLength: 12,
      }),
    ).toMatchObject({
      "Cache-Control": "no-store",
      "Content-Type": "application/pdf",
      "Content-Length": "12",
      "Content-Disposition": 'inline; filename="\\"quarterly report\\".pdf"',
    });
  });
});
