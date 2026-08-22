import { addMonths, todayISO } from "@/shared/lib/dates";
import type { CreditSummaryRow, RevolvingSummaryRow } from "@/shared/types/database";
import type { DebtOverview } from "@/shared/types/domain";

function pendingStatement(account: RevolvingSummaryRow): number {
  return Math.max(
    0,
    Number(account.statement_total_due ?? 0) -
      Number(account.statement_paid_amount ?? 0),
  );
}

function belongsToMonth(date: string | null, month: string): boolean {
  return date?.slice(0, 7) === month;
}

/**
 * Resumen puro del portafolio. `today` es inyectable para que el significado
 * de "este mes" sea determinista en pruebas y no dependa del reloj de Vercel.
 */
export function buildOverview(
  summaries: CreditSummaryRow[],
  revolving: RevolvingSummaryRow[] = [],
  today = todayISO(),
  defaultCurrency = "COP",
): DebtOverview {
  const active = summaries.filter((credit) => credit.status === "active");
  const activeCards = revolving.filter((card) => card.status === "active");
  const month = today.slice(0, 7);
  const creditsDue = active.filter((credit) =>
    belongsToMonth(credit.next_due_date, month),
  );
  const cardsDue = activeCards.filter(
    (card) =>
      belongsToMonth(card.statement_due_date, month) && pendingStatement(card) > 0,
  );

  const creditDebt = active.reduce((sum, credit) => sum + Number(credit.balance), 0);
  const revolvingDebt = activeCards.reduce(
    (sum, card) => sum + Number(card.balance),
    0,
  );
  const totalPrincipal = active.reduce(
    (sum, credit) => sum + Number(credit.principal_amount),
    0,
  );
  const totalPrincipalPaid = active.reduce(
    (sum, credit) => sum + Number(credit.total_principal_paid),
    0,
  );
  const monthlyCommitment =
    creditsDue.reduce(
      (sum, credit) => sum + Number(credit.next_payment_amount ?? 0),
      0,
    ) + cardsDue.reduce((sum, card) => sum + pendingStatement(card), 0);

  const freeDate = active.reduce<string | null>((latest, credit) => {
    if (!credit.next_due_date) return latest;
    const remaining = Math.max(
      0,
      Number(credit.total_installments) - Number(credit.paid_installments) - 1,
    );
    const last = addMonths(credit.next_due_date, remaining);
    return latest == null || last > latest ? last : latest;
  }, null);

  return {
    totalDebt: creditDebt + revolvingDebt,
    creditDebt,
    revolvingDebt,
    totalPrincipal,
    totalPrincipalPaid,
    progressPercent: totalPrincipal
      ? (totalPrincipalPaid / totalPrincipal) * 100
      : 0,
    monthlyCommitment,
    installmentsDue: creditsDue.length + cardsDue.length,
    freeDate,
    overdueCount: active.reduce(
      (sum, credit) => sum + Number(credit.overdue_count),
      0,
    ),
    activeCredits: active.length,
    currency: active[0]?.currency ?? activeCards[0]?.currency ?? defaultCurrency,
  };
}
