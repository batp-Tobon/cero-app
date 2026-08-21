"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, TrendingDown, Trash2, Wallet } from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AmountField } from "@/components/common/amount-field";
import { InlineNotice } from "@/components/common/states";
import { deletePayment, updatePayment } from "@/server/actions/payments";
import { formatMoney } from "@/lib/format";
import { formatShortDate, todayISO } from "@/lib/dates";
import type { Payment } from "@/types/domain";

/**
 * Movimientos del crédito, con opción de corregirlos.
 *
 * Editar o borrar aquí no "parchea" el saldo: el servidor vuelve a derivar el
 * plan entero desde el historial resultante, así que todo lo posterior al
 * movimiento tocado se recalcula solo.
 */
export function PaymentHistory({
  payments,
  currency,
}: {
  payments: Payment[];
  currency: string;
}) {
  const [editing, setEditing] = React.useState<Payment | null>(null);

  if (payments.length === 0) {
    return (
      <section aria-labelledby="movements" className="mt-8">
        <h2 id="movements" className="text-base font-semibold tracking-tight">
          Movimientos
        </h2>
        <p className="mt-3 rounded-2xl bg-card p-5 text-sm leading-relaxed text-muted-foreground">
          Todavía no has registrado ningún pago de este crédito.
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="movements" className="mt-8">
      <h2 id="movements" className="text-base font-semibold tracking-tight">
        Movimientos
      </h2>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        ¿Te equivocaste? Toca un movimiento para corregirlo o eliminarlo.
      </p>

      <ul className="mt-3 space-y-2">
        {payments.map((payment) => {
          const isExtra = Number(payment.amount_paid) === 0;
          const total =
            Number(payment.amount_paid) + Number(payment.extra_principal);

          return (
            <li key={payment.id}>
              <button
                type="button"
                onClick={() => setEditing(payment)}
                className="flex w-full items-center gap-3 rounded-2xl bg-card p-4 text-left transition-colors hover:bg-secondary"
              >
                <span
                  className={
                    isExtra
                      ? "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary"
                      : "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground"
                  }
                  aria-hidden
                >
                  {isExtra ? (
                    <TrendingDown className="h-4 w-4" />
                  ) : (
                    <Wallet className="h-4 w-4" />
                  )}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {isExtra
                      ? "Abono a capital"
                      : `Cuota ${payment.installment_number ?? "—"}`}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {formatShortDate(payment.payment_date)}
                    {!isExtra &&
                      ` · interés ${formatMoney(payment.interest_paid, currency)}`}
                    {!isExtra &&
                      Number(payment.extra_principal) > 0 &&
                      ` · abono ${formatMoney(payment.extra_principal, currency)}`}
                  </span>
                </span>

                <span className="shrink-0 text-right">
                  <span className="tabular block text-sm font-semibold">
                    {formatMoney(total, currency)}
                  </span>
                  {payment.balance_after != null && (
                    <span className="tabular block text-[11px] text-muted-foreground">
                      saldo {formatMoney(payment.balance_after, currency)}
                    </span>
                  )}
                </span>

                <Pencil
                  className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                  aria-hidden
                />
              </button>
            </li>
          );
        })}
      </ul>

      {editing && (
        <EditPaymentSheet
          payment={editing}
          currency={currency}
          open
          onOpenChange={(v) => !v && setEditing(null)}
        />
      )}
    </section>
  );
}

function EditPaymentSheet({
  payment,
  currency,
  open,
  onOpenChange,
}: {
  payment: Payment;
  currency: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const isExtra = Number(payment.amount_paid) === 0;

  const [date, setDate] = React.useState(payment.payment_date);
  const [amount, setAmount] = React.useState(Number(payment.amount_paid));
  const [extra, setExtra] = React.useState(Number(payment.extra_principal));
  const [pending, setPending] = React.useState(false);
  const [confirmingDelete, setConfirmingDelete] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);

    const result = await updatePayment({
      paymentId: payment.id,
      paymentDate: date,
      amountPaid: amount,
      extraPrincipal: extra,
    });
    setPending(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    toast.success("Movimiento corregido", {
      description: `Nuevo saldo: ${formatMoney(result.data.balance, currency)}`,
    });
    onOpenChange(false);
    router.refresh();
  }

  async function onDelete() {
    setError(null);
    setPending(true);
    const result = await deletePayment(payment.id);
    setPending(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    toast.success("Movimiento eliminado", {
      description: `Nuevo saldo: ${formatMoney(result.data.balance, currency)}`,
    });
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Corregir movimiento</SheetTitle>
          <SheetDescription>
            {isExtra
              ? "Abono a capital"
              : `Cuota ${payment.installment_number ?? "—"}`}{" "}
            · {formatShortDate(payment.payment_date)}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={onSave} className="space-y-4">
          {error && <InlineNotice variant="danger">{error}</InlineNotice>}

          <InlineNotice>
            Al guardar se recalcula el plan completo: las cuotas posteriores se
            renumeran y el saldo se ajusta solo.
          </InlineNotice>

          <div className="space-y-1.5">
            <Label htmlFor="edit-date">Fecha</Label>
            <Input
              id="edit-date"
              type="date"
              value={date}
              max={todayISO()}
              onChange={(e) => setDate(e.target.value)}
              required
              disabled={pending}
            />
          </div>

          {!isExtra && (
            <div className="space-y-1.5">
              <Label htmlFor="edit-amount">Valor pagado</Label>
              <AmountField
                id="edit-amount"
                value={amount}
                onValueChange={setAmount}
                disabled={pending}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="edit-extra">
              {isExtra ? "Valor del abono" : "Abono extra a capital"}
            </Label>
            <AmountField
              id="edit-extra"
              value={extra}
              onValueChange={setExtra}
              disabled={pending}
            />
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={pending || amount + extra <= 0}
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Guardar cambios
          </Button>
        </form>

        <div className="mt-6 border-t border-border pt-5">
          {confirmingDelete ? (
            <div className="space-y-3">
              <InlineNotice variant="danger">
                Se elimina el movimiento y el plan vuelve a calcularse sin él.
              </InlineNotice>
              <div className="flex gap-2.5">
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => setConfirmingDelete(false)}
                  disabled={pending}
                >
                  Cancelar
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={onDelete}
                  disabled={pending}
                >
                  {pending && (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  )}
                  Eliminar
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="ghost"
              className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setConfirmingDelete(true)}
            >
              <Trash2 className="h-4 w-4" aria-hidden />
              Eliminar movimiento
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
