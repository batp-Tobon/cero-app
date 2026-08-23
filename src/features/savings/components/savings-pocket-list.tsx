import { ChevronRight, PiggyBank, Plus } from "lucide-react";
import { ProductBadge } from "@/shared/components/product-badge";
import { Badge } from "@/shared/ui/badge";
import { productIcon, accent } from "@/shared/lib/appearance";
import { formatMoney, formatPercent } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import type { SavingsPocket } from "../types";

export function SavingsPocketList({
  pockets,
  historical,
  onAdd,
  onSelect,
}: {
  pockets: SavingsPocket[];
  historical: boolean;
  onAdd: () => void;
  onSelect: (pocket: SavingsPocket) => void;
}) {
  if (pockets.length === 0) {
    return (
      <button
        type="button"
        onClick={onAdd}
        className="mt-4 flex w-full flex-col items-center rounded-3xl border border-dashed border-border px-6 py-9 text-center transition-colors hover:bg-card"
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-secondary text-primary">
          <Plus className="h-5 w-5" aria-hidden />
        </span>
        <span className="mt-4 text-sm font-semibold">Crea tu primer bolsillo</span>
        <span className="mt-1 max-w-[30ch] text-xs leading-relaxed text-muted-foreground">
          Registra los dos ahorros que ya tienes con su saldo actual.
        </span>
      </button>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      {pockets.map((pocket) => (
        <PocketCard
          key={pocket.id}
          pocket={pocket}
          historical={historical}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function PocketCard({
  pocket,
  historical,
  onSelect,
}: {
  pocket: SavingsPocket;
  historical: boolean;
  onSelect: (pocket: SavingsPocket) => void;
}) {
  const Icon = productIcon(pocket.icon, PiggyBank);
  const classes = accent(pocket.color);
  const displayedBalance = historical
    ? pocket.balanceAtMonthEnd
    : pocket.balance;
  const progress = pocket.goalAmount
    ? Math.min(100, Math.max(0, (displayedBalance / pocket.goalAmount) * 100))
    : null;

  return (
    <button
      type="button"
      onClick={() => onSelect(pocket)}
      className="w-full rounded-3xl bg-card p-4 text-left transition-colors hover:bg-accent/60"
    >
      <div className="flex items-center gap-3">
        <ProductBadge icon={Icon} color={pocket.color} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <p className="truncate text-sm font-semibold">{pocket.name}</p>
            {pocket.isDefault && <Badge variant="success">Automático</Badge>}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {pocket.monthNet === 0
              ? "Sin movimientos este mes"
              : `${pocket.monthNet > 0 ? "+" : ""}${formatMoney(pocket.monthNet, pocket.currency)} este mes`}
          </p>
        </div>
        <div className="min-w-0 text-right">
          <p className="tabular truncate text-base font-semibold tracking-tight">
            {formatMoney(displayedBalance, pocket.currency)}
          </p>
          {pocket.goalAmount && (
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              Meta {formatMoney(pocket.goalAmount, pocket.currency)}
            </p>
          )}
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      </div>

      {progress != null && (
        <div className="mt-4">
          <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
            <span
              className={cn("block h-full rounded-full", classes.bar)}
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className={cn("mt-1.5 text-[10px] font-medium", classes.text)}>
            {formatPercent(progress, 0)} de la meta
          </p>
        </div>
      )}
    </button>
  );
}
