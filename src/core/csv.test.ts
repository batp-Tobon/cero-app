import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "@/core/csv";

describe("CSV", () => {
  it.each(["=2+2", "+cmd", "-1+1", "@SUM(A1:A2)", "  =HYPERLINK(\"x\")"])(
    "neutraliza fórmulas: %s",
    (value) => expect(csvCell(value).startsWith("'") || csvCell(value).startsWith("\"'")).toBe(true),
  );

  it("escapa comillas, saltos y separadores", () => {
    expect(csvCell('uno;"dos"\ntres')).toBe('"uno;""dos""\ntres"');
  });

  it("incluye BOM y finales CRLF", () => {
    expect(toCsv(["a"], [["b"], ["c"]])).toBe("\uFEFFa\r\nb\r\nc");
  });
});
