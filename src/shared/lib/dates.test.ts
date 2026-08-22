import { describe, expect, it } from "vitest";
import {
  addMonths,
  dateForDayOfMonth,
  isCalendarDate,
} from "@/shared/lib/dates";

describe("fechas civiles", () => {
  it.each(["2026-02-29", "2026-13-01", "2026-04-31", "2026-00-10", "texto"])(
    "rechaza una fecha inexistente: %s",
    (value) => expect(isCalendarDate(value)).toBe(false),
  );

  it("acepta el 29 de febrero de un año bisiesto", () => {
    expect(isCalendarDate("2028-02-29")).toBe(true);
  });

  it("ajusta ciclos al último día del mes", () => {
    expect(dateForDayOfMonth(2026, 2, 31)).toBe("2026-02-28");
    expect(dateForDayOfMonth(2028, 2, 31)).toBe("2028-02-29");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
  });
});
