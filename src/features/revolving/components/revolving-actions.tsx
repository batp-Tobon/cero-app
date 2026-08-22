"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Receipt } from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shared/ui/sheet";
import { Button, type ButtonProps } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { AmountField } from "@/shared/components/amount-field";
import { OptionGrid } from "@/shared/components/option-grid";
import { InlineNotice } from "@/shared/components/states";
import { ReceiptField } from "@/features/receipts/components/receipt-field";
import { registerMovement, registerStatement } from "@/features/revolving/actions";
import { formatMoney } from "@/shared/lib/format";
import { todayISO } from "@/shared/lib/dates";
import type { MovementInput } from "@/features/revolving/actions";

type MovementKind = MovementInput["kind"];

const KINDS: Array<{ value: MovementKind; label: string; hint: string }> = [
  { value: "payment", label: "Pago", hint: "Abonas y baja el saldo" },
  { value: "charge", label: "Compra", hint: "Sube el saldo usado" },
  { value: "interest", label: "Intereses", hint: "Los que cobró el banco" },
  { value: "fee", label: "Cuota de manejo", hint: "Cargo fijo del período" },
];

export function MovementButton({
  accountId,
  accountName,
  currency,
  balance,
  available,
  defaultKind = "payment",
  label = "Registrar movimiento",
  variant = "default",
  size,
  className,
}: {
  accountId: string;
  accountName: string;
  currency: string;
  balance: number;
  available: number;
  defaultKind?: MovementKind;
  label?: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [kind, setKind] = React.useState<MovementKind>(defaultKind);
  const [amount, setAmount] = React.useState(0);
  const [date, setDate] = React.useState(todayISO);
  const [description, setDescription] = React.useState("");
  const [installmentCount, setInstallmentCount] = React.useState(1);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  function openEditor() {
    setKind(defaultKind);
    setAmount(0);
    setDate(todayISO());
    setDescription("");
    setInstallmentCount(1);
    setError(null);
    setOpen(true);
  }

  const ceiling = kind === "payment" ? balance : available;
  const exceeds = amount > ceiling + 0.009;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const receiptData = new FormData(e.currentTarget as HTMLFormElement);
    setError(null);
    setPending(true);

    const result = await registerMovement({
      accountId,
      kind,
      amount,
      movementDate: date,
      description,
      installmentCount,
    }, receiptData);
    setPending(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    toast.success("Movimiento registrado", {
      description: `Saldo: ${formatMoney(result.data.balance, currency)}`,
    });
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={className}
        onClick={openEditor}
      >
        {size !== "sm" && <Plus className="h-4 w-4" aria-hidden />}
        {label}
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Registrar movimiento</SheetTitle>
            <SheetDescription>{accountName}</SheetDescription>
          </SheetHeader>

          <form onSubmit={onSubmit} className="space-y-4">
            {error && <InlineNotice variant="danger">{error}</InlineNotice>}

            <OptionGrid
              legend="Tipo de movimiento"
              options={KINDS}
              value={kind}
              onChange={setKind}
            />

            <div className="space-y-1.5">
              <Label htmlFor="movement-amount">Importe</Label>
              <AmountField
                id="movement-amount"
                value={amount}
                onValueChange={setAmount}
                disabled={pending}
                aria-describedby="movement-amount-hint"
              />
              <p
                id="movement-amount-hint"
                className="text-xs text-muted-foreground"
              >
                {kind === "payment"
                  ? `Saldo usado: ${formatMoney(balance, currency)}`
                  : `Cupo disponible: ${formatMoney(available, currency)}`}
              </p>
            </div>

            {kind === "charge" && (
              <div className="space-y-1.5">
                <Label htmlFor="movement-installments">Diferir a cuotas</Label>
                <Input
                  id="movement-installments"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={60}
                  value={installmentCount}
                  onChange={(event) =>
                    setInstallmentCount(
                      Math.min(60, Math.max(1, Number(event.target.value) || 1)),
                    )
                  }
                  disabled={pending}
                />
                <p className="text-xs text-muted-foreground">
                  {installmentCount > 1 && amount > 0
                    ? `${installmentCount} cuotas aproximadas de ${formatMoney(
                        amount / installmentCount,
                        currency,
                      )}`
                    : "Usa 1 si la compra no fue diferida."}
                </p>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="movement-date">Fecha</Label>
              <Input
                id="movement-date"
                type="date"
                value={date}
                max={todayISO()}
                onChange={(e) => setDate(e.target.value)}
                required
                disabled={pending}
              />
            </div>

            {kind === "payment" && (
              <ReceiptField id="movement-receipt" disabled={pending} />
            )}

            <div className="space-y-1.5">
              <Label htmlFor="movement-description">Descripción (opcional)</Label>
              <Input
                id="movement-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Mercado, gasolina…"
                maxLength={120}
                disabled={pending}
              />
            </div>

            {exceeds && (
              <InlineNotice variant="warning">
                {kind === "payment"
                  ? `No puedes pagar más del saldo usado (${formatMoney(balance, currency)}).`
                  : `Supera el cupo disponible (${formatMoney(available, currency)}).`}
              </InlineNotice>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={pending || amount <= 0 || exceeds}
            >
              {pending && (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              )}
              Registrar
            </Button>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}

export function StatementButton({
  accountId,
  accountName,
  statementDay,
  dueDay,
  className,
}: {
  accountId: string;
  accountName: string;
  statementDay: number;
  dueDay: number;
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [statementDate, setStatementDate] = React.useState("");
  const [dueDate, setDueDate] = React.useState("");
  const [totalDue, setTotalDue] = React.useState(0);
  const [minimumDue, setMinimumDue] = React.useState(0);
  const [reducedDue, setReducedDue] = React.useState(0);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  function openEditor() {
    setError(null);
    setTotalDue(0);
    setMinimumDue(0);
    setReducedDue(0);
    // Se proponen las fechas del ciclo configurado; siempre editables.
    const { year, month } = splitToday();
    setStatementDate(`${year}-${pad(month)}-${pad(statementDay)}`);
    const dueMonth = month === 12 ? 1 : month + 1;
    const dueYear = month === 12 ? year + 1 : year;
    setDueDate(`${dueYear}-${pad(dueMonth)}-${pad(dueDay)}`);
    setOpen(true);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);

    const result = await registerStatement({
      accountId,
      statementDate,
      dueDate,
      totalDue,
      minimumDue,
      reducedMinimumDue: reducedDue > 0 ? reducedDue : null,
    });
    setPending(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    toast.success("Extracto guardado");
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button
        variant="outline"
        className={className}
        onClick={openEditor}
      >
        <Receipt className="h-4 w-4" aria-hidden />
        Registrar extracto
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Extracto del corte</SheetTitle>
            <SheetDescription>
              {accountName} · copia las cifras tal como vienen del banco
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={onSubmit} className="space-y-4">
            {error && <InlineNotice variant="danger">{error}</InlineNotice>}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="statement-date">Fecha de corte</Label>
                <Input
                  id="statement-date"
                  type="date"
                  value={statementDate}
                  onChange={(e) => setStatementDate(e.target.value)}
                  required
                  disabled={pending}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="due-date">Límite de pago</Label>
                <Input
                  id="due-date"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  required
                  disabled={pending}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="total-due">Total a pagar</Label>
              <AmountField
                id="total-due"
                value={totalDue}
                onValueChange={setTotalDue}
                disabled={pending}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="minimum-due">Mínimo a pagar</Label>
              <AmountField
                id="minimum-due"
                value={minimumDue}
                onValueChange={setMinimumDue}
                disabled={pending}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="reduced-due">Pago mínimo reducido (opcional)</Label>
              <AmountField
                id="reduced-due"
                value={reducedDue}
                onValueChange={setReducedDue}
                disabled={pending}
              />
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={pending || totalDue <= 0}
            >
              {pending && (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              )}
              Guardar extracto
            </Button>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function splitToday(): { year: number; month: number } {
  const [year, month] = todayISO().split("-").map(Number);
  return { year, month };
}
