import { describe, expect, it } from "vitest";
import { calculateBudget } from "./budget";

describe("calculateBudget", () => {
  it("separa pagos de deuda y gastos del hogar", () => {
    const result = calculateBudget(
      [{ amount: 6_000_000 }],
      [{ amount: 1_500_000 }, { amount: 800_000 }],
      [{ amount: 1_200_000 }, { amount: 500_000 }],
    );

    expect(result.expenses).toBe(2_300_000);
    expect(result.debtPayments).toBe(1_700_000);
    expect(result.totalOutflow).toBe(4_000_000);
    expect(result.remaining).toBe(2_000_000);
    expect(result.committedPercent).toBeCloseTo(66.6667, 3);
  });

  it("representa un mes en déficit con saldo negativo", () => {
    const result = calculateBudget([{ amount: 2_000_000 }], [{ amount: 1_500_000 }], [
      { amount: 1_000_000 },
    ]);

    expect(result.remaining).toBe(-500_000);
    expect(result.committedPercent).toBe(125);
  });

  it("redondea el resultado al centavo", () => {
    const result = calculateBudget(
      [{ amount: 70 }, { amount: 30.1 }],
      [{ amount: 20.055 }, { amount: 10.011 }],
      [{ amount: 5.005 }],
    );

    expect(result.expenses).toBe(30.07);
    expect(result.debtPayments).toBe(5.01);
    expect(result.remaining).toBe(65.02);
  });

  it("no produce porcentajes inválidos cuando no hay sueldo", () => {
    expect(calculateBudget([], [], []).committedPercent).toBe(0);
    expect(
      calculateBudget([], [{ amount: 100_000 }], []).committedPercent,
    ).toBe(100);
  });

  it("suma varios ingresos del mismo mes", () => {
    const result = calculateBudget(
      [{ amount: 10_800_000 }, { amount: 500_000 }],
      [],
      [],
    );

    expect(result.income).toBe(11_300_000);
    expect(result.remaining).toBe(11_300_000);
  });
});
