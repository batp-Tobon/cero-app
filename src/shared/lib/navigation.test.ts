import { describe, expect, it } from "vitest";
import { safeInternalPath } from "@/shared/lib/navigation";

describe("safeInternalPath", () => {
  it("conserva rutas internas con query", () => {
    expect(safeInternalPath("/presupuesto?mes=2026-09-01")).toBe(
      "/presupuesto?mes=2026-09-01",
    );
  });

  it.each([
    "https://malicioso.test",
    "//malicioso.test",
    "/\\malicioso.test",
    "/inicio\nLocation: https://malicioso.test",
    "inicio",
  ])("rechaza destinos no confiables: %s", (value) => {
    expect(safeInternalPath(value)).toBe("/inicio");
  });
});
