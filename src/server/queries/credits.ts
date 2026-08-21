import "server-only";

import { createClient } from "@/infrastructure/supabase/server";
import { addMonths, todayISO } from "@/lib/dates";
import type {
  CreditSummary,
  DebtOverview,
  Installment,
  InstallmentState,
  UpcomingPayment,
} from "@/types/domain";
import type {
  ActivityRow,
  CreditRow,
  PaymentRow,
  ScheduleRowDB,
} from "@/types/database";
import { env } from "@/lib/env";

/** Estado visible de una cuota. Depende de hoy, por eso no se persiste. */
export function installmentState(
  row: Pick<ScheduleRowDB, "status" | "due_date" | "installment_number">,
  nextInstallment: number | null,
  today = todayISO(),
): InstallmentState {
  if (row.status === "paid") return "paid";
  if (row.due_date < today) return "overdue";
  if (row.installment_number === nextInstallment) return "next";
  return "pending";
}

/** Resumen de todos los créditos del usuario, el activo primero. */
export async function getCreditSummaries(): Promise<CreditSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("credit_summary")
    .select("*")
    .order("status", { ascending: true })
    .order("next_due_date", { ascending: true, nullsFirst: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * Cabecera del inicio. Se calcula sobre los resúmenes ya cargados para no
 * disparar una segunda consulta por cada cifra de la pantalla.
 */
export function buildOverview(summaries: CreditSummary[]): DebtOverview {
  const active = summaries.filter((c) => c.status === "active");

  const totalDebt = active.reduce((s, c) => s + Number(c.balance), 0);
  const totalPrincipal = active.reduce(
    (s, c) => s + Number(c.principal_amount),
    0,
  );
  const totalPrincipalPaid = active.reduce(
    (s, c) => s + Number(c.total_principal_paid),
    0,
  );
  const monthlyCommitment = active.reduce(
    (s, c) => s + Number(c.next_payment_amount ?? 0),
    0,
  );
  const overdueCount = active.reduce((s, c) => s + Number(c.overdue_count), 0);

  // Cuándo se paga la última cuota del portafolio. El plan es mensual, así que
  // basta con desplazar la próxima cuota tantos meses como queden por pagar.
  const freeDate = active.reduce<string | null>((latest, c) => {
    if (!c.next_due_date) return latest;
    const remaining = Math.max(
      0,
      Number(c.total_installments) - Number(c.paid_installments) - 1,
    );
    const last = addMonths(c.next_due_date, remaining);
    return latest == null || last > latest ? last : latest;
  }, null);

  return {
    totalDebt,
    totalPrincipal,
    totalPrincipalPaid,
    progressPercent: totalPrincipal
      ? (totalPrincipalPaid / totalPrincipal) * 100
      : 0,
    monthlyCommitment,
    installmentsDue: active.filter((c) => c.next_installment_number != null)
      .length,
    freeDate,
    overdueCount,
    activeCredits: active.length,
    currency: active[0]?.currency ?? env.defaultCurrency,
  };
}

/**
 * Próximos pagos: la siguiente cuota de cada crédito activo, ordenada por
 * urgencia. Lo vencido va primero — es lo que hay que resolver hoy.
 */
export function buildUpcomingPayments(
  summaries: CreditSummary[],
  limit = 4,
  today = todayISO(),
): UpcomingPayment[] {
  return summaries
    .filter(
      (c) =>
        c.status === "active" &&
        c.next_installment_number != null &&
        c.next_due_date != null,
    )
    .map((c) => ({
      creditId: c.id,
      creditName: c.name,
      creditType: c.type,
      currency: c.currency,
      installmentNumber: c.next_installment_number!,
      totalInstallments: c.total_installments,
      dueDate: c.next_due_date!,
      paymentAmount: Number(c.next_payment_amount ?? 0),
      interestAmount: Number(c.next_interest_amount ?? 0),
      principalAmount: Number(c.next_principal_amount ?? 0),
      openingBalance: Number(c.balance),
      state: (c.next_due_date! < today ? "overdue" : "next") as InstallmentState,
    }))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, limit);
}

export interface CreditDetail {
  credit: CreditRow;
  summary: CreditSummary;
  installments: Installment[];
}

/** Detalle completo de un crédito: cabecera, resumen y plan de pagos. */
export async function getCreditDetail(
  creditId: string,
): Promise<CreditDetail | null> {
  const supabase = await createClient();

  const [creditRes, summaryRes, scheduleRes] = await Promise.all([
    supabase.from("credits").select("*").eq("id", creditId).maybeSingle(),
    supabase
      .from("credit_summary")
      .select("*")
      .eq("id", creditId)
      .maybeSingle(),
    supabase
      .from("credit_schedule")
      .select("*")
      .eq("credit_id", creditId)
      .order("installment_number", { ascending: true }),
  ]);

  if (creditRes.error) throw new Error(creditRes.error.message);
  if (summaryRes.error) throw new Error(summaryRes.error.message);
  if (scheduleRes.error) throw new Error(scheduleRes.error.message);

  // Sin fila no hay crédito, o hay uno de otro usuario que las RLS ocultan.
  if (!creditRes.data || !summaryRes.data) return null;

  const today = todayISO();
  const next = summaryRes.data.next_installment_number;

  return {
    credit: creditRes.data,
    summary: summaryRes.data,
    installments: (scheduleRes.data ?? []).map((row) => ({
      ...row,
      state: installmentState(row, next, today),
    })),
  };
}

export interface ActivityEntry extends ActivityRow {
  creditName: string | null;
}

/**
 * Timeline de la pantalla Actividad.
 * Las RLS ya acotan las filas al usuario, así que no hace falta filtrar por
 * `user_id` ni resolver quién es el autor: siempre es quien está mirando.
 */
export async function getActivity(limit = 50): Promise<ActivityEntry[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("activity")
    .select("*, credits(name)")
    .order("occurred_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);

  type Joined = ActivityRow & { credits: { name: string } | null };

  return ((data ?? []) as unknown as Joined[]).map(({ credits, ...row }) => ({
    ...row,
    creditName: credits?.name ?? null,
  }));
}

/** Pagos de un crédito, del más reciente al más antiguo. */
export async function getCreditPayments(
  creditId: string,
  limit = 100,
): Promise<PaymentRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payments")
    .select("*")
    .eq("credit_id", creditId)
    .order("payment_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return data ?? [];
}
