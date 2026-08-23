import type { Metadata } from "next";
import { SavingsPlanner } from "@/features/savings/components/savings-planner";
import { getSavingsSnapshot } from "@/features/savings/queries";
import { ErrorState } from "@/shared/components/states";
import { todayISO } from "@/shared/lib/dates";

export const metadata: Metadata = { title: "Ahorros" };

const MONTH = /^\d{4}-(0[1-9]|1[0-2])-01$/;

export default async function SavingsPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const { mes } = await searchParams;
  const currentMonth = `${todayISO().slice(0, 7)}-01`;
  const month = mes && MONTH.test(mes) ? mes : currentMonth;

  try {
    const snapshot = await getSavingsSnapshot(month);
    return <SavingsPlanner key={snapshot.month} snapshot={snapshot} />;
  } catch (error) {
    return (
      <ErrorState
        title="No pudimos cargar tus ahorros"
        detail={error instanceof Error ? error.message : undefined}
      />
    );
  }
}
