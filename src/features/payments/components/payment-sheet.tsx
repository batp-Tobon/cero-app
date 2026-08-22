"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shared/ui/sheet";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { AmountField } from "@/shared/components/amount-field";
import { InlineNotice } from "@/shared/components/states";
import { registerPayment } from "@/features/payments/actions";
import { allocatePayment } from "@/core/amortization";
import { formatMoney } from "@/shared/lib/format";
import { formatLongDate, todayISO } from "@/shared/lib/dates";
import type { PaymentTarget } from "@/shared/types/domain";

/**
 * Registrar pago. La previsualización del saldo usa el MISMO reparto que el
 * servidor (`allocatePayment`), así que lo que se ve antes de confirmar es lo
 * que queda guardado.
 */
export function PaymentSheet({
  target,
  open,
  onOpenChange,
}: {
  target: PaymentTarget;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();

  const [paymentDate, setPaymentDate] = React.useState(todayISO);
  const [amount, setAmount] = React.useState(target.paymentAmount);
  const [extra, setExtra] = React.useState(0);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);

  // Al abrir para otra cuota hay que volver a partir de sus importes.
  React.useEffect(() => {
    if (!open) return;
    setPaymentDate(todayISO());
    setAmount(target.paymentAmount);
    setExtra(0);
    setError(null);
    setDone(false);
  }, [open, target.paymentAmount, target.installmentNumber]);

  const allocation = allocatePayment({
    amount,
    scheduledInterest: target.interestAmount,
    openingBalance: target.openingBalance,
  });
  const principalRoom = target.openingBalance - allocation.principalPaid;
  const extraTotal = extra + allocation.surplus;
  const overpaid = extraTotal > principalRoom + 0.009;
  const newBalance = Math.max(
    0,
    target.openingBalance - allocation.principalPaid - Math.min(extraTotal, principalRoom),
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setError(null);
    setPending(true);

    const result = await registerPayment({
      creditId: target.creditId,
      paymentDate,
      amountPaid: amount,
      extraPrincipal: extra,
    });

    if (!result.ok) {
      setError(result.error);
      setPending(false);
      return;
    }

    setDone(true);
    setPending(false);
    router.refresh();

    if (result.data.creditSettled) {
      toast.success("Crédito pagado", {
        description: `${target.creditName} llegó a cero.`,
      });
    }
  }

  if (done) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent aria-describedby={undefined}>
          <SheetTitle className="sr-only">Pago registrado</SheetTitle>
          <div className="flex flex-col items-center py-6 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/15">
              <CheckCircle2 className="h-7 w-7 text-primary" aria-hidden />
            </span>
            <p className="mt-5 text-base font-semibold">Pago registrado</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Tu saldo se actualizó correctamente.
            </p>
            <p className="tabular mt-6 text-2xl font-bold">
              {formatMoney(newBalance, target.currency)}
            </p>
            <p className="text-xs text-muted-foreground">nuevo saldo</p>
            <Button
              className="mt-7 w-full"
              onClick={() => onOpenChange(false)}
              autoFocus
            >
              Listo
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Registrar pago</SheetTitle>
          <SheetDescription>
            {target.creditName} · Cuota {target.installmentNumber}
            {target.totalInstallments > 0 && ` de ${target.totalInstallments}`}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          {error && <InlineNotice variant="danger">{error}</InlineNotice>}

          <div className="space-y-1.5">
            <Label htmlFor="payment-date">Fecha del pago</Label>
            <Input
              id="payment-date"
              type="date"
              value={paymentDate}
              max={todayISO()}
              onChange={(e) => setPaymentDate(e.target.value)}
              required
              disabled={pending}
            />
            <p className="text-xs text-muted-foreground">
              Vence el {formatLongDate(target.dueDate)}.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="payment-amount">Valor pagado</Label>
            <AmountField
              id="payment-amount"
              value={amount}
              onValueChange={setAmount}
              disabled={pending}
              aria-describedby="payment-amount-hint"
            />
            <p id="payment-amount-hint" className="text-xs text-muted-foreground">
              Cuota programada: {formatMoney(target.paymentAmount, target.currency)}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="payment-extra">Abono extra a capital (opcional)</Label>
            <AmountField
              id="payment-extra"
              value={extra}
              onValueChange={setExtra}
              disabled={pending}
            />
          </div>

          <dl className="space-y-2 rounded-2xl bg-secondary p-4">
            <div className="flex items-baseline justify-between gap-4 text-sm">
              <dt className="text-muted-foreground">Interés</dt>
              <dd className="tabular">
                {formatMoney(allocation.interestPaid, target.currency)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 text-sm">
              <dt className="text-muted-foreground">Capital</dt>
              <dd className="tabular">
                {formatMoney(
                  allocation.principalPaid + Math.min(extraTotal, principalRoom),
                  target.currency,
                )}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 border-t border-border pt-2">
              <dt className="text-sm font-medium">Nuevo saldo</dt>
              <dd className="tabular text-lg font-bold text-primary">
                {formatMoney(newBalance, target.currency)}
              </dd>
            </div>
          </dl>

          {overpaid && (
            <InlineNotice variant="warning">
              El abono supera el saldo pendiente. Como máximo puedes abonar{" "}
              {formatMoney(principalRoom, target.currency)} a capital.
            </InlineNotice>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={pending || amount <= 0 || overpaid}
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Confirmar pago
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
