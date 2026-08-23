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
import { ReceiptField } from "@/features/receipts/components/receipt-field";
import {
  discardPendingReceipt,
  uploadReceiptFromForm,
} from "@/features/receipts/client";
import { registerExtraPrincipal } from "@/features/payments/actions";
import { formatMoney } from "@/shared/lib/format";
import { todayISO } from "@/shared/lib/dates";
import type { ExtraPrincipalMode } from "@/core/amortization";

/**
 * Abono a capital. La cifra que se muestra es una estimación: el plan de pagos
 * definitivo lo recalcula el servidor al confirmar.
 */
export function ExtraPrincipalSheet({
  creditId,
  creditName,
  currency,
  balance,
  mode,
  open,
  onOpenChange,
}: {
  creditId: string;
  creditName: string;
  currency: string;
  balance: number;
  mode: ExtraPrincipalMode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();

  const [paymentDate, setPaymentDate] = React.useState(todayISO);
  const [amount, setAmount] = React.useState(0);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<{
    newBalance: number;
    installmentsSaved: number;
    installmentsLeft: number;
  } | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setPaymentDate(todayISO());
    setAmount(0);
    setError(null);
    setResult(null);
  }, [open]);

  const overpaid = amount > balance + 0.009;
  const estimatedBalance = Math.max(0, balance - Math.min(amount, balance));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    const form = e.currentTarget as HTMLFormElement;
    setError(null);
    setPending(true);

    let receipt = null;
    try {
      receipt = await uploadReceiptFromForm(form, "credits", creditId);
      const response = await registerExtraPrincipal(
        { creditId, paymentDate, amount },
        receipt,
      );

      if (!response.ok) {
        await discardPendingReceipt(receipt);
        setError(response.error);
        return;
      }

      setResult(response.data);
      router.refresh();

      if (response.data.creditSettled) {
        toast.success("Crédito pagado", {
          description: `${creditName} llegó a cero.`,
        });
      }
    } catch (uploadError) {
      await discardPendingReceipt(receipt);
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "No pudimos subir el comprobante.",
      );
    } finally {
      setPending(false);
    }
  }

  if (result) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent aria-describedby={undefined}>
          <SheetTitle className="sr-only">Abono registrado</SheetTitle>
          <div className="flex flex-col items-center py-6 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/15">
              <CheckCircle2 className="h-7 w-7 text-primary" aria-hidden />
            </span>
            <p className="mt-5 text-base font-semibold">Abono registrado</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Recalculamos tu plan de pagos.
            </p>
            <p className="tabular mt-6 text-2xl font-bold">
              {formatMoney(result.newBalance, currency)}
            </p>
            <p className="text-xs text-muted-foreground">nuevo saldo</p>

            {result.installmentsSaved > 0 && (
              <p className="mt-5 rounded-2xl bg-primary/10 px-4 py-3 text-sm text-primary">
                Te ahorraste {result.installmentsSaved}{" "}
                {result.installmentsSaved === 1 ? "cuota" : "cuotas"}.
              </p>
            )}

            <Button
              className="mt-7 w-full"
              onClick={() => onOpenChange(false)}
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
          <SheetTitle>Abonar a capital</SheetTitle>
          <SheetDescription>
            {creditName} ·{" "}
            {mode === "reduce_term"
              ? "reduce el plazo, mantiene la cuota"
              : "reduce la cuota, mantiene el plazo"}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          {error && <InlineNotice variant="danger">{error}</InlineNotice>}

          <div className="space-y-1.5">
            <Label htmlFor="extra-date">Fecha del abono</Label>
            <Input
              id="extra-date"
              type="date"
              value={paymentDate}
              max={todayISO()}
              onChange={(e) => setPaymentDate(e.target.value)}
              required
              disabled={pending}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="extra-amount">Valor del abono</Label>
            <AmountField
              id="extra-amount"
              value={amount}
              onValueChange={setAmount}
              disabled={pending}
              autoFocus
              aria-describedby="extra-amount-hint"
            />
            <p id="extra-amount-hint" className="text-xs text-muted-foreground">
              Saldo pendiente: {formatMoney(balance, currency)}
            </p>
          </div>

          <ReceiptField id="extra-receipt" disabled={pending} />

          <div className="rounded-2xl bg-secondary p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Nuevo saldo estimado
            </p>
            <p className="tabular mt-1 text-2xl font-bold text-primary">
              {formatMoney(estimatedBalance, currency)}
            </p>
          </div>

          {overpaid && (
            <InlineNotice variant="warning">
              El abono supera el saldo pendiente ({formatMoney(balance, currency)}
              ).
            </InlineNotice>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={pending || amount <= 0 || overpaid}
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Confirmar abono
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
