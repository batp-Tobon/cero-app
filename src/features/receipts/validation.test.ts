import { describe, expect, it } from "vitest";
import { hasValidReceiptSignature } from "@/features/receipts/validation";

describe("hasValidReceiptSignature", () => {
  it.each([
    ["image/jpeg", [0xff, 0xd8, 0xff, 0xe0]],
    ["image/png", [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
    ["application/pdf", [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]],
    [
      "image/webp",
      [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50],
    ],
  ])("acepta una firma real de %s", (mime, signature) => {
    expect(hasValidReceiptSignature(mime, Uint8Array.from(signature))).toBe(true);
  });

  it("rechaza contenido disfrazado con un MIME permitido", () => {
    expect(
      hasValidReceiptSignature(
        "image/png",
        new TextEncoder().encode("<script>alert(1)</script>"),
      ),
    ).toBe(false);
  });
});
