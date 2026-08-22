"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  ExternalLink,
  Loader2,
  Percent,
  Receipt,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shared/ui/sheet";
import { Button } from "@/shared/ui/button";
import { InlineNotice } from "@/shared/components/states";
import { deleteMovement } from "@/features/revolving/actions";
import { formatMoney } from "@/shared/lib/format";
import { formatShortDate } from "@/shared/lib/dates";
import type { MovementKindDB } from "@/shared/types/database";
import type { RevolvingMovementWithReceipt } from "@/features/revolving/queries";

const META: Record<
  MovementKindDB,
  { label: string; icon: typeof ArrowDownCircle; reducesDebt: boolean }
> = {
  payment: { label: "Pago", icon: ArrowDownCircle, reducesDebt: true },
  charge: { label: "Compra", icon: ArrowUpCircle, reducesDebt: false },
  interest: { label: "Intereses", icon: Percent, reducesDebt: false },
  fee: { label: "Cuota de manejo", icon: Receipt, reducesDebt: false },
};

/**
 * Movimientos de la tarjeta, con opción de borrar el que se registró mal.
 *
 * Aquí no hay que recalcular nada: el saldo de una tarjeta es la suma de sus
 * movimientos, así que quitar uno lo deja correcto por sí solo.
 */
export function MovementList({
  movements,
  currency,
}: {
  movements: RevolvingMovementWithReceipt[];
  currency: string;
}) {
  const [selected, setSelected] = React.useState<RevolvingMovementWithReceipt | null>(
    null,
  );

  if (movements.length === 0) {
    return (
      <p className="mt-3 rounded-2xl bg-card p-5 text-sm text-muted-foreground">
        Todavía no hay movimientos registrados.
      </p>
    );
  }

  return (
    <>
      <ul className="mt-3 space-y-2">
        {movements.map((movement) => {
          const meta = META[movement.kind];
          const Icon = meta.icon;

          return (
            <li key={movement.id}>
              <button
                type="button"
                onClick={() => setSelected(movement)}
                className="flex w-full items-center gap-3 rounded-2xl bg-card p-4 text-left transition-colors hover:bg-secondary"
              >
                <span
                  className={
                    meta.reducesDebt
                      ? "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary"
                      : "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground"
                  }
                  aria-hidden
                >
                  <Icon className="h-4 w-4" />
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {meta.label}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {formatShortDate(movement.movement_date)}
                    {movement.description && ` · ${movement.description}`}
                    {movement.kind === "charge" &&
                      movement.installment_count > 1 &&
                      ` · ${movement.installment_count} cuotas (${movement.installments_paid} pagadas)`}
                    {movement.receipt_path && " · comprobante"}
                  </span>
                </span>

                <span
                  className={
                    meta.reducesDebt
                      ? "tabular shrink-0 text-sm font-semibold text-primary"
                      : "tabular shrink-0 text-sm font-semibold"
                  }
                >
                  {meta.reducesDebt ? "−" : "+"}
                  {formatMoney(movement.amount, currency)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {selected && (
        <DeleteMovementSheet
          movement={selected}
          currency={currency}
          onOpenChange={(open) => !open && setSelected(null)}
        />
      )}
    </>
  );
}

function DeleteMovementSheet({
  movement,
  currency,
  onOpenChange,
}: {
  movement: RevolvingMovementWithReceipt;
  currency: string;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const meta = META[movement.kind];

  async function onDelete() {
    setError(null);
    setPending(true);
    const result = await deleteMovement(movement.id);
    setPending(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    toast.success("Movimiento eliminado");
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Sheet open onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{meta.label}</SheetTitle>
          <SheetDescription>
            {formatShortDate(movement.movement_date)}
            {movement.description && ` · ${movement.description}`}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4">
          {error && <InlineNotice variant="danger">{error}</InlineNotice>}

          <div className="rounded-2xl bg-secondary p-4 text-center">
            <p className="tabular text-2xl font-bold">
              {meta.reducesDebt ? "−" : "+"}
              {formatMoney(movement.amount, currency)}
            </p>
          </div>

          {movement.kind === "charge" && movement.installment_count > 1 && (
            <div className="rounded-2xl border border-border px-4 py-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Compra diferida</span>
                <span className="font-semibold">
                  {movement.installments_paid} / {movement.installment_count} pagadas
                </span>
              </div>
              <p className="tabular mt-1 text-xs text-muted-foreground">
                Aproximadamente {formatMoney(
                  Number(movement.amount) / movement.installment_count,
                  currency,
                )} por cuota
              </p>
            </div>
          )}

          {movement.receiptUrl && (
            <Button variant="outline" className="w-full" asChild>
              <a href={movement.receiptUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4" aria-hidden />
                Ver comprobante
              </a>
            </Button>
          )}

          <InlineNotice>
            Al eliminarlo, el saldo de la tarjeta se recalcula solo: es la suma
            de sus movimientos.
          </InlineNotice>

          <Button
            variant="destructive"
            className="w-full"
            onClick={onDelete}
            disabled={pending}
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Trash2 className="h-4 w-4" aria-hidden />
            )}
            Eliminar movimiento
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
