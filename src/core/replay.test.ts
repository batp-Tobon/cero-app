import { describe, expect, it } from "vitest";
import {
  buildSchedule,
  replaySchedule,
  type PaymentEvent,
  type ReplayInput,
  type ReplayedRow,
} from "./amortization";

/** Vehículo del contrato: 120.332.720 · 1,89 % m.v. · 72 cuotas · francés. */
const CREDIT: Omit<ReplayInput, "events"> = {
  principal: 120_332_720,
  monthlyRate: 0.0189,
  termMonths: 72,
  system: "french",
  firstPaymentDate: "2026-09-01",
  mode: "reduce_term",
};

/** Un pago normal de la cuota `n`, en su fecha de vencimiento. */
function installmentPayment(
  id: string,
  date: string,
  amount: number,
  extra = 0,
): PaymentEvent {
  return {
    id,
    date,
    settlesInstallment: true,
    amountPaid: amount,
    extraPrincipal: extra,
  };
}

function extraPayment(id: string, date: string, amount: number): PaymentEvent {
  return {
    id,
    date,
    settlesInstallment: false,
    amountPaid: 0,
    extraPrincipal: amount,
  };
}

/** Invariantes que ningún plan puede violar, pase lo que pase. */
function expectConsistent(rows: ReplayedRow[]) {
  rows.forEach((row, i) => {
    expect(row.closingBalance).toBeCloseTo(
      row.openingBalance - row.principal,
      2,
    );
    if (i > 0) {
      // El saldo encadena, salvo por el abono a capital que cayo entre medias.
      expect(row.openingBalance).toBeCloseTo(
        rows[i - 1].closingBalance - row.extraPrincipalBefore,
        2,
      );
      expect(row.installment).toBe(rows[i - 1].installment + 1);
    }
  });
  if (rows.length > 0) {
    expect(rows[0].installment).toBe(1);
    expect(rows[rows.length - 1].closingBalance).toBe(0);
  }
}

describe("replaySchedule · sin movimientos", () => {
  it("reproduce exactamente el plan original", () => {
    const result = replaySchedule({ ...CREDIT, events: [] });
    const original = buildSchedule(CREDIT);

    expect(result.rows).toHaveLength(original.length);
    expect(result.balance).toBeCloseTo(CREDIT.principal, 2);
    expect(result.settled).toBe(false);
    result.rows.forEach((row, i) => {
      expect(row.payment).toBeCloseTo(original[i].payment, 2);
      expect(row.dueDate).toBe(original[i].dueDate);
      expect(row.paid).toBe(false);
    });
  });
});

describe("replaySchedule · pagos normales", () => {
  const original = buildSchedule(CREDIT);
  const cuota = original[0].payment;

  it("marca la cuota pagada y deja intacto el resto del plan", () => {
    const result = replaySchedule({
      ...CREDIT,
      events: [installmentPayment("p1", "2026-09-01", cuota)],
    });

    expect(result.rows[0].paid).toBe(true);
    expect(result.rows[0].paidAmount).toBeCloseTo(cuota, 2);
    expect(result.rows[1].paid).toBe(false);
    expect(result.rows).toHaveLength(72);
    expect(result.balance).toBeCloseTo(original[0].closingBalance, 2);
    expectConsistent(result.rows);
  });

  it("nueve cuotas seguidas dejan el saldo donde marca el plan", () => {
    const events = original
      .slice(0, 9)
      .map((r, i) => installmentPayment(`p${i}`, r.dueDate, r.payment));

    const result = replaySchedule({ ...CREDIT, events });

    expect(result.rows.filter((r) => r.paid)).toHaveLength(9);
    expect(result.balance).toBeCloseTo(original[8].closingBalance, 2);
    expectConsistent(result.rows);
  });

  it("asigna los números de cuota por orden cronológico", () => {
    const events = [
      installmentPayment("b", "2026-10-01", cuota),
      installmentPayment("a", "2026-09-01", cuota),
    ];
    const result = replaySchedule({ ...CREDIT, events });

    expect(result.allocations.map((a) => a.id)).toEqual(["a", "b"]);
    expect(result.allocations.map((a) => a.installment)).toEqual([1, 2]);
  });
});

describe("replaySchedule · abonos a capital", () => {
  const original = buildSchedule(CREDIT);

  it("un abono suelto acorta el plazo y mantiene la cuota", () => {
    const result = replaySchedule({
      ...CREDIT,
      events: [extraPayment("e1", "2026-09-10", 15_747_921)],
    });

    expect(result.rows.length).toBeLessThan(72);
    expect(result.balance).toBeCloseTo(CREDIT.principal - 15_747_921, 2);
    expect(result.rows[0].payment).toBeCloseTo(original[0].payment, 2);
    expectConsistent(result.rows);
  });

  it("en modo reducir cuota conserva el plazo y baja el pago", () => {
    const result = replaySchedule({
      ...CREDIT,
      mode: "reduce_installment",
      events: [extraPayment("e1", "2026-09-10", 15_747_921)],
    });

    expect(result.rows).toHaveLength(72);
    expect(result.rows[0].payment).toBeLessThan(original[0].payment);
    expectConsistent(result.rows);
  });

  it("un abono pegado a un pago de cuota se aplica después de la cuota", () => {
    const cuota = original[0].payment;
    const result = replaySchedule({
      ...CREDIT,
      events: [
        extraPayment("e", "2026-09-01", 5_000_000),
        installmentPayment("p", "2026-09-01", cuota),
      ],
    });

    expect(result.allocations[0].id).toBe("p");
    expect(result.allocations[1].id).toBe("e");
    expectConsistent(result.rows);
  });
});

describe("replaySchedule · corregir errores", () => {
  const original = buildSchedule(CREDIT);
  const events = original
    .slice(0, 5)
    .map((r, i) => installmentPayment(`p${i + 1}`, r.dueDate, r.payment));

  it("borrar un pago intermedio renumera los siguientes", () => {
    const withoutThird = events.filter((e) => e.id !== "p3");
    const result = replaySchedule({ ...CREDIT, events: withoutThird });

    expect(result.rows.filter((r) => r.paid)).toHaveLength(4);
    expect(result.allocations.map((a) => a.id)).toEqual([
      "p1",
      "p2",
      "p4",
      "p5",
    ]);
    expect(result.allocations.map((a) => a.installment)).toEqual([1, 2, 3, 4]);
    expect(result.balance).toBeCloseTo(original[3].closingBalance, 2);
    expectConsistent(result.rows);
  });

  it("borrar el último pago devuelve el saldo al estado anterior", () => {
    const full = replaySchedule({ ...CREDIT, events });
    const undone = replaySchedule({
      ...CREDIT,
      events: events.filter((e) => e.id !== "p5"),
    });

    expect(undone.balance).toBeCloseTo(original[3].closingBalance, 2);
    expect(undone.balance).toBeGreaterThan(full.balance);
    expectConsistent(undone.rows);
  });

  it("corregir el importe de un pago recalcula todo lo que viene después", () => {
    const corrected = events.map((e) =>
      e.id === "p2" ? { ...e, amountPaid: e.amountPaid + 3_000_000 } : e,
    );
    const result = replaySchedule({ ...CREDIT, events: corrected });
    const base = replaySchedule({ ...CREDIT, events });

    expect(result.balance).toBeLessThan(base.balance);
    expectConsistent(result.rows);
  });

  it("es idempotente: reconstruir dos veces da lo mismo", () => {
    const a = replaySchedule({ ...CREDIT, events });
    const b = replaySchedule({ ...CREDIT, events });
    expect(b.rows).toEqual(a.rows);
    expect(b.allocations).toEqual(a.allocations);
  });
});

describe("replaySchedule · liquidación", () => {
  it("un abono que cubre todo deja el crédito saldado y sin cuotas", () => {
    const result = replaySchedule({
      ...CREDIT,
      events: [extraPayment("e", "2026-09-05", CREDIT.principal)],
    });

    expect(result.settled).toBe(true);
    expect(result.balance).toBe(0);
    expect(result.rows.filter((r) => !r.paid)).toHaveLength(0);
  });

  it("rechaza movimientos posteriores a la liquidación en vez de descuadrar", () => {
    const result = replaySchedule({
      ...CREDIT,
      events: [
        extraPayment("e", "2026-09-05", CREDIT.principal),
        installmentPayment("tarde", "2026-10-01", 3_000_000),
      ],
    });

    expect(result.settled).toBe(true);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].id).toBe("tarde");
  });
});

describe("replaySchedule · pagos parciales", () => {
  it("un pago corto no amortiza capital y el plan se reajusta", () => {
    const original = buildSchedule(CREDIT);
    const result = replaySchedule({
      ...CREDIT,
      events: [installmentPayment("p", "2026-09-01", original[0].interest)],
    });

    expect(result.allocations[0].principalPaid).toBe(0);
    expect(result.allocations[0].interestPaid).toBeCloseTo(
      original[0].interest,
      2,
    );
    expect(result.balance).toBeCloseTo(CREDIT.principal, 2);
    expectConsistent(result.rows);
  });

  it("mantiene el plan cerrado en cero incluso pagando de menos siempre", () => {
    const original = buildSchedule(CREDIT);
    const events = original
      .slice(0, 6)
      .map((r, i) =>
        installmentPayment(`p${i}`, r.dueDate, r.payment * 0.6),
      );

    const result = replaySchedule({ ...CREDIT, events });
    expectConsistent(result.rows);
    expect(result.balance).toBeGreaterThan(0);
  });
});

describe("replaySchedule · todos los sistemas", () => {
  it.each(["french", "german", "american", "zero_interest"] as const)(
    "%s: el historial no rompe los invariantes",
    (system) => {
      const base = { ...CREDIT, system };
      const original = buildSchedule(base);
      const events = [
        ...original
          .slice(0, 3)
          .map((r, i) => installmentPayment(`p${i}`, r.dueDate, r.payment)),
        extraPayment("e", "2026-12-10", 5_000_000),
      ];

      const result = replaySchedule({ ...base, events });
      expectConsistent(result.rows);
      expect(result.rows.filter((r) => r.paid)).toHaveLength(3);
    },
  );
});
