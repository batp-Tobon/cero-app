import { describe, expect, it } from "vitest";
import {
  allocatePayment,
  buildSchedule,
  frenchPayment,
  recalculateRemaining,
  summarize,
  termForPayment,
  type AmortizationSystem,
  type ScheduleRow,
} from "./amortization";
import { addMonths } from "@/shared/lib/dates";

/** Crédito de referencia del mockup: Carro · 120M · 1,89 % m.v. · 72 cuotas. */
const CARRO = {
  principal: 120_000_000,
  monthlyRate: 0.0189,
  termMonths: 72,
  firstPaymentDate: "2026-09-01",
};

const sumBy = (rows: ScheduleRow[], key: keyof ScheduleRow) =>
  rows.reduce((s, r) => s + (r[key] as number), 0);

const SYSTEMS: AmortizationSystem[] = [
  "french",
  "german",
  "american",
  "zero_interest",
];

describe("frenchPayment", () => {
  it("reproduce la cuota del crédito del mockup", () => {
    const payment = frenchPayment(120_000_000, 0.0189, 72);
    // Valor de referencia calculado con A = P·i/(1−(1+i)^−n)
    expect(payment).toBeCloseTo(3_063_760.38, 2);
  });

  it("con tasa cero reparte el capital en partes iguales", () => {
    expect(frenchPayment(1_200_000, 0, 12)).toBe(100_000);
  });
});

describe("buildSchedule · sistema francés", () => {
  const rows = buildSchedule({ ...CARRO, system: "french" });

  it("genera exactamente el número de cuotas del plazo", () => {
    expect(rows).toHaveLength(72);
    expect(rows[0].installment).toBe(1);
    expect(rows[71].installment).toBe(72);
  });

  it("cobra el interés del período sobre el saldo inicial", () => {
    expect(rows[0].openingBalance).toBe(120_000_000);
    expect(rows[0].interest).toBeCloseTo(2_268_000, 2);
    expect(rows[0].principal).toBeCloseTo(795_760.38, 2);
    expect(rows[0].closingBalance).toBeCloseTo(119_204_239.62, 2);
  });

  it("mantiene la cuota constante salvo el ajuste de la última", () => {
    const middle = rows.slice(0, 71).map((r) => r.payment);
    expect(new Set(middle).size).toBe(1);
  });

  it("cierra el plan en cero", () => {
    expect(rows[71].closingBalance).toBe(0);
  });

  it("amortiza exactamente el capital prestado", () => {
    expect(sumBy(rows, "principal")).toBeCloseTo(CARRO.principal, 2);
  });
});

describe("buildSchedule · sistema alemán", () => {
  const rows = buildSchedule({ ...CARRO, system: "german" });

  it("mantiene el capital fijo y la cuota decreciente", () => {
    expect(rows[0].principal).toBeCloseTo(rows[40].principal, 2);
    expect(rows[0].payment).toBeGreaterThan(rows[40].payment);
    expect(rows[40].payment).toBeGreaterThan(rows[71].payment);
  });

  it("cierra el plan en cero y cuesta menos intereses que el francés", () => {
    expect(rows[71].closingBalance).toBe(0);
    const french = buildSchedule({ ...CARRO, system: "french" });
    expect(sumBy(rows, "interest")).toBeLessThan(sumBy(french, "interest"));
  });
});

describe("buildSchedule · sistema americano", () => {
  const rows = buildSchedule({ ...CARRO, system: "american" });

  it("sólo cobra intereses hasta la última cuota", () => {
    expect(rows[0].principal).toBe(0);
    expect(rows[0].payment).toBeCloseTo(2_268_000, 2);
    expect(rows[70].closingBalance).toBe(CARRO.principal);
  });

  it("liquida todo el capital en la última cuota", () => {
    expect(rows[71].principal).toBe(CARRO.principal);
    expect(rows[71].payment).toBeCloseTo(120_000_000 + 2_268_000, 2);
    expect(rows[71].closingBalance).toBe(0);
  });
});

describe("buildSchedule · sin interés", () => {
  const rows = buildSchedule({ ...CARRO, system: "zero_interest" });

  it("no cobra intereses y reparte el capital", () => {
    expect(sumBy(rows, "interest")).toBe(0);
    expect(sumBy(rows, "principal")).toBeCloseTo(CARRO.principal, 2);
    expect(rows[71].closingBalance).toBe(0);
  });

  it("ignora la tasa aunque venga informada", () => {
    expect(rows[0].payment).toBeCloseTo(120_000_000 / 72, 0);
  });
});

describe("buildSchedule · invariantes de todos los sistemas", () => {
  it.each(SYSTEMS)("%s: saldos encadenados y plan cerrado en cero", (system) => {
    const rows = buildSchedule({ ...CARRO, system });
    expect(rows.length).toBeGreaterThan(0);
    rows.forEach((row, i) => {
      expect(row.payment).toBeCloseTo(row.interest + row.principal, 2);
      expect(row.closingBalance).toBeCloseTo(
        row.openingBalance - row.principal,
        2,
      );
      if (i > 0) {
        expect(row.openingBalance).toBeCloseTo(rows[i - 1].closingBalance, 2);
      }
    });
    expect(rows[rows.length - 1].closingBalance).toBe(0);
    expect(sumBy(rows, "principal")).toBeCloseTo(CARRO.principal, 2);
  });

  it("no acumula error de redondeo en importes con centavos", () => {
    const rows = buildSchedule({
      principal: 1_000_000.33,
      monthlyRate: 0.0233,
      termMonths: 37,
      system: "french",
      firstPaymentDate: "2026-01-31",
    });
    expect(sumBy(rows, "principal")).toBeCloseTo(1_000_000.33, 2);
    expect(rows[rows.length - 1].closingBalance).toBe(0);
  });
});

describe("fechas de vencimiento", () => {
  it("avanza mes a mes desde la primera cuota", () => {
    const rows = buildSchedule({ ...CARRO, system: "french" });
    expect(rows[0].dueDate).toBe("2026-09-01");
    expect(rows[1].dueDate).toBe("2026-10-01");
    expect(rows[11].dueDate).toBe("2027-08-01");
  });

  it("ancla al último día cuando el mes destino es más corto", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2026-08-31", 2)).toBe("2026-10-31");
  });
});

describe("termForPayment", () => {
  it("resuelve el plazo que corresponde a una cuota francesa", () => {
    const payment = frenchPayment(120_000_000, 0.0189, 72);
    expect(termForPayment(120_000_000, 0.0189, payment)).toBe(72);
  });

  it("devuelve null si la cuota no cubre ni el interés", () => {
    expect(termForPayment(120_000_000, 0.0189, 1_000_000)).toBeNull();
  });

  it("con tasa cero divide capital entre cuota", () => {
    expect(termForPayment(1_000_000, 0, 250_000)).toBe(4);
  });
});

describe("recalculateRemaining · abono a capital", () => {
  const rows = buildSchedule({ ...CARRO, system: "french" });
  // Se pagó la cuota 1; el abono de 10M entra sobre el saldo restante.
  const balanceAfterExtra = rows[0].closingBalance - 10_000_000;
  const remainingDueDates = rows.slice(1).map((r) => r.dueDate);
  const base = {
    balance: balanceAfterExtra,
    monthlyRate: CARRO.monthlyRate,
    system: "french" as const,
    remainingDueDates,
    startInstallment: 2,
    currentPayment: rows[0].payment,
  };

  it("reduce_term acorta el plazo y conserva la cuota", () => {
    const next = recalculateRemaining({ ...base, mode: "reduce_term" });
    expect(next.length).toBeLessThan(remainingDueDates.length);
    expect(next[0].payment).toBeCloseTo(rows[0].payment, 2);
    expect(next[0].installment).toBe(2);
    expect(next[next.length - 1].closingBalance).toBe(0);
  });

  it("reduce_installment conserva el plazo y baja la cuota", () => {
    const next = recalculateRemaining({ ...base, mode: "reduce_installment" });
    expect(next).toHaveLength(remainingDueDates.length);
    expect(next[0].payment).toBeLessThan(rows[0].payment);
    expect(next[next.length - 1].closingBalance).toBe(0);
  });

  it("conserva las fechas de vencimiento originales", () => {
    const next = recalculateRemaining({ ...base, mode: "reduce_installment" });
    expect(next[0].dueDate).toBe(remainingDueDates[0]);
    expect(next[10].dueDate).toBe(remainingDueDates[10]);
  });

  it("un abono que cubre todo el saldo deja el plan vacío", () => {
    const next = recalculateRemaining({
      ...base,
      balance: 0,
      mode: "reduce_term",
    });
    expect(next).toHaveLength(0);
  });

  it("cae a mantener plazo si la cuota no cubriera el interés", () => {
    const next = recalculateRemaining({
      ...base,
      currentPayment: 1_000,
      mode: "reduce_term",
    });
    expect(next).toHaveLength(remainingDueDates.length);
    expect(next[next.length - 1].closingBalance).toBe(0);
  });

  it("en el alemán conserva el capital fijo por cuota", () => {
    const german = buildSchedule({ ...CARRO, system: "german" });
    const next = recalculateRemaining({
      balance: german[0].closingBalance - 10_000_000,
      monthlyRate: CARRO.monthlyRate,
      system: "german",
      mode: "reduce_term",
      remainingDueDates: german.slice(1).map((r) => r.dueDate),
      startInstallment: 2,
      currentPayment: german[0].payment,
      currentPrincipal: german[0].principal,
    });
    expect(next.length).toBeLessThan(71);
    expect(next[0].principal).toBeCloseTo(german[0].principal, 2);
    expect(next[next.length - 1].closingBalance).toBe(0);
  });
});

describe("allocatePayment", () => {
  it("imputa primero el interés y el resto a capital", () => {
    const a = allocatePayment({
      amount: 3_063_760,
      scheduledInterest: 2_268_000,
      openingBalance: 120_000_000,
    });
    expect(a.interestPaid).toBe(2_268_000);
    expect(a.principalPaid).toBe(795_760);
    expect(a.surplus).toBe(0);
  });

  it("un pago corto no amortiza capital", () => {
    const a = allocatePayment({
      amount: 1_000_000,
      scheduledInterest: 2_268_000,
      openingBalance: 120_000_000,
    });
    expect(a.interestPaid).toBe(1_000_000);
    expect(a.principalPaid).toBe(0);
  });

  it("nunca abona más capital del que queda vivo", () => {
    const a = allocatePayment({
      amount: 5_000_000,
      scheduledInterest: 10_000,
      openingBalance: 500_000,
    });
    expect(a.principalPaid).toBe(500_000);
    expect(a.surplus).toBe(4_490_000);
  });
});

describe("summarize", () => {
  it("suma capital, intereses y total del crédito", () => {
    const rows = buildSchedule({ ...CARRO, system: "french" });
    const t = summarize(rows);
    expect(t.installments).toBe(72);
    expect(t.totalPrincipal).toBeCloseTo(CARRO.principal, 2);
    expect(t.totalPaid).toBeCloseTo(t.totalPrincipal + t.totalInterest, 2);
    expect(t.firstDueDate).toBe("2026-09-01");
    expect(t.lastDueDate).toBe("2032-08-01");
  });
});
