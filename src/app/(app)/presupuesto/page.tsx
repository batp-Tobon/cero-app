import type { Metadata } from "next";
import { BudgetPlanner } from "@/features/budget/components/budget-planner";
import { getBudgetSnapshot } from "@/features/budget/queries";
import { ErrorState } from "@/shared/components/states";
import { todayISO } from "@/shared/lib/dates";

export const metadata: Metadata = { title: "Presupuesto" };

const MONTH = /^\d{4}-(0[1-9]|1[0-2])-01$/;

export default async function BudgetPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const { mes } = await searchParams;
  const currentMonth = `${todayISO().slice(0, 7)}-01`;
  const month = mes && MONTH.test(mes) ? mes : currentMonth;

  try {
    const snapshot = await getBudgetSnapshot(month);
    return (
      <BudgetPlanner
        key={`${snapshot.month}:${snapshot.source}:${snapshot.sourceMonth ?? ""}`}
        snapshot={snapshot}
      />
    );
  } catch (error) {
    return (
      <ErrorState
        title="No pudimos cargar tu presupuesto"
        detail={error instanceof Error ? error.message : undefined}
      />
    );
  }
}
