import { describe, expect, it } from "vitest";
import { buildOverview } from "@/core/portfolio";
import type { CreditSummaryRow, RevolvingSummaryRow } from "@/shared/types/database";

function credit(overrides: Partial<CreditSummaryRow> = {}): CreditSummaryRow {
  return {
    id: "credit", owner_id: "user", name: "Crédito", type: "other",
    entity: null, currency: "COP", status: "active", principal_amount: 1_000,
    interest_rate_monthly: 0, term_months: 10, amortization_system: "french",
    extra_principal_mode: "reduce_term", first_payment_date: "2026-09-01",
    created_at: "2026-08-01T00:00:00Z", color: "emerald", icon: null,
    member_count: 1, total_installments: 10, paid_installments: 0,
    overdue_count: 0, scheduled_interest: 0, remaining_interest: 0,
    balance: 1_000, next_installment_number: 1, next_due_date: "2026-09-01",
    next_payment_amount: 100, next_interest_amount: 0, next_principal_amount: 100,
    total_paid: 0, total_principal_paid: 0, total_interest_paid: 0,
    total_extra_principal: 0, last_payment_date: null, ...overrides,
  };
}

function card(overrides: Partial<RevolvingSummaryRow> = {}): RevolvingSummaryRow {
  return {
    id: "card", owner_id: "user", name: "Tarjeta", kind: "credit_card",
    entity: null, last_four: null, credit_limit: 2_000, interest_rate_monthly: 0,
    statement_day: 1, due_day: 1, currency: "USD", status: "active",
    color: "sky", icon: null, created_at: "2026-08-01T00:00:00Z",
    balance: 500, available: 1_500, total_charged: 500, total_paid: 0,
    last_movement_date: null, statement_id: "statement",
    statement_date: "2026-08-10", statement_due_date: "2026-09-01",
    statement_total_due: 500, statement_minimum_due: 100,
    statement_reduced_minimum_due: null, statement_paid_amount: 0,
    statement_status: "open", ...overrides,
  };
}

describe("resumen del portafolio", () => {
  it("cuenta sólo obligaciones que vencen en el mes visible", () => {
    const result = buildOverview(
      [credit(), credit({ id: "future", next_due_date: "2026-10-01" })],
      [card()],
      "2026-09-15",
    );
    expect(result.monthlyCommitment).toBe(600);
    expect(result.installmentsDue).toBe(2);
  });

  it("usa la moneda de la tarjeta cuando no hay créditos", () => {
    expect(buildOverview([], [card()], "2026-09-15").currency).toBe("USD");
  });
});
