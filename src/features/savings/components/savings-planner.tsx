"use client";

import * as React from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  PiggyBank,
  Plus,
  Sparkles,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { MonthNavigation } from "@/shared/components/month-navigation";
import { PageHeader } from "@/shared/components/page-header";
import { Button } from "@/shared/ui/button";
import { formatMonthTitle, formatShortDate, todayISO } from "@/shared/lib/dates";
import { formatMoney } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import type { SavingsMovement, SavingsPocket, SavingsSnapshot } from "../types";
import {
  CreatePocketSheet,
  SavingsMovementSheet,
} from "./savings-entry-sheets";
import { SavingsPocketList } from "./savings-pocket-list";
import { SavingsSummaryCard } from "./savings-summary-card";

export function SavingsPlanner({ snapshot }: { snapshot: SavingsSnapshot }) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [selectedPocket, setSelectedPocket] = React.useState<SavingsPocket | null>(null);
  const currentMonth = `${todayISO().slice(0, 7)}-01`;
  const historical = snapshot.month < currentMonth;

  return (
    <div className="animate-fade-in pb-4">
      <PageHeader
        title="Ahorros"
        subtitle="Bolsillos y metas"
        action={
          <Button
            type="button"
            size="icon"
            aria-label="Crear bolsillo"
            onClick={() => setCreateOpen(true)}
          >
            <Plus aria-hidden />
          </Button>
        }
      />
      <MonthNavigation month={snapshot.month} basePath="/ahorros" />
      <SavingsSummaryCard snapshot={snapshot} historical={historical} />

      <section aria-labelledby="pockets-title" className="mt-8">
        <SectionTitle
          id="pockets-title"
          title="Tus bolsillos"
          detail={`${snapshot.pockets.length} ${snapshot.pockets.length === 1 ? "bolsillo" : "bolsillos"}`}
          onAdd={() => setCreateOpen(true)}
        />
        <SavingsPocketList
          pockets={snapshot.pockets}
          historical={historical}
          onAdd={() => setCreateOpen(true)}
          onSelect={setSelectedPocket}
        />
      </section>

      <section aria-labelledby="savings-history-title" className="mt-9">
        <SectionTitle
          id="savings-history-title"
          title={formatMonthTitle(snapshot.month)}
          detail={`${snapshot.movements.length} ${snapshot.movements.length === 1 ? "movimiento" : "movimientos"}`}
        />
        <MovementList movements={snapshot.movements} currency={snapshot.currency} />
      </section>

      <CreatePocketSheet
        open={createOpen}
        currency={snapshot.currency}
        onOpenChange={setCreateOpen}
        onSaved={() => router.refresh()}
      />
      <SavingsMovementSheet
        pocket={selectedPocket}
        onClose={() => setSelectedPocket(null)}
        onSaved={() => router.refresh()}
      />
    </div>
  );
}

function SectionTitle({
  id,
  title,
  detail,
  onAdd,
}: {
  id: string;
  title: string;
  detail: string;
  onAdd?: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <h2 id={id} className="title-section">
        {title}
      </h2>
      {onAdd ? (
        <button
          type="button"
          onClick={onAdd}
          className="rounded text-xs font-medium text-primary hover:underline"
        >
          Añadir
        </button>
      ) : (
        <span className="text-xs text-muted-foreground">{detail}</span>
      )}
    </div>
  );
}

function MovementList({
  movements,
  currency,
}: {
  movements: SavingsMovement[];
  currency: string;
}) {
  if (movements.length === 0) {
    return (
      <div className="mt-4 rounded-3xl border border-dashed border-border px-5 py-8 text-center">
        <PiggyBank className="mx-auto h-6 w-6 text-muted-foreground" aria-hidden />
        <p className="mt-3 text-sm font-semibold">Sin movimientos este mes</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Los ahorros, retiros y excedentes aparecerán aquí.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      {movements.map((movement) => (
        <MovementRow key={movement.id} movement={movement} currency={currency} />
      ))}
    </div>
  );
}

function MovementRow({
  movement,
  currency,
}: {
  movement: SavingsMovement;
  currency: string;
}) {
  const withdrawal = movement.kind === "withdrawal";
  const automatic = movement.kind === "budget_surplus";
  const Icon = automatic ? Sparkles : withdrawal ? ArrowUpRight : ArrowDownLeft;
  const signedAmount = withdrawal ? -movement.amount : movement.amount;

  return (
    <article className="flex items-center gap-3 rounded-3xl bg-card p-4">
      <span
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
          withdrawal
            ? "bg-destructive/15 text-destructive"
            : "bg-primary/15 text-primary",
        )}
      >
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">
          {automatic
            ? "Excedente del presupuesto"
            : movement.description || (withdrawal ? "Retiro" : "Ahorro")}
        </p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {formatShortDate(movement.movementDate)} · {movement.pocketName}
        </p>
      </div>
      <p
        className={cn(
          "tabular shrink-0 text-sm font-semibold",
          withdrawal ? "text-destructive" : "text-primary",
        )}
      >
        {signedAmount > 0 ? "+" : ""}
        {formatMoney(signedAmount, currency)}
      </p>
    </article>
  );
}
