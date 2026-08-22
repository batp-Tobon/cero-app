import { describe, expect, it } from "vitest";
import { buildFinancialInsights } from "./financial-insights";

const base = {
  income: 10_800_000,
  remaining: 4_000_000,
  committedPercent: 63,
  monthlyDebtPayments: 5_200_000,
  totalDebt: 200_000_000,
  cardBalance: 2_750_168,
  cardLimit: 22_000_000,
  overdueCount: 0,
};

describe("buildFinancialInsights", () => {
  it("advierte cuando el mes queda en déficit", () => {
    const result = buildFinancialInsights({ ...base, remaining: -100 });
    expect(result.some((item) => item.id === "cashflow" && item.tone === "danger")).toBe(true);
  });

  it("pide primero registrar ingresos cuando no existen", () => {
    const result = buildFinancialInsights({ ...base, income: 0 });
    expect(result[0]?.id).toBe("income");
  });

  it("detecta uso alto de tarjeta", () => {
    const result = buildFinancialInsights({
      ...base,
      cardBalance: 15_000_000,
    });
    expect(result.find((item) => item.id === "card")?.tone).toBe("warning");
  });
});
