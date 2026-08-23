"use client";

import * as React from "react";
import { ArrowDownToLine, ArrowUpFromLine, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  createSavingsPocket,
  registerSavingsMovement,
} from "@/features/savings/actions";
import { AmountField } from "@/shared/components/amount-field";
import { AppearancePicker } from "@/shared/components/appearance-picker";
import { OptionGrid } from "@/shared/components/option-grid";
import { InlineNotice } from "@/shared/components/states";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shared/ui/sheet";
import { todayISO } from "@/shared/lib/dates";
import { formatMoney } from "@/shared/lib/format";
import type { AccentColor, IconName } from "@/shared/lib/appearance";
import type { SavingsPocket } from "../types";

const MOVEMENT_OPTIONS = [
  { value: "deposit", label: "Guardar", icon: ArrowDownToLine, hint: "Dinero que entra" },
  { value: "withdrawal", label: "Retirar", icon: ArrowUpFromLine, hint: "Dinero que usas" },
] as const;

export function CreatePocketSheet({
  open,
  currency,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  currency: string;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [name, setName] = React.useState("");
  const [initialAmount, setInitialAmount] = React.useState(0);
  const [goalAmount, setGoalAmount] = React.useState(0);
  const [color, setColor] = React.useState<AccentColor>("sky");
  const [icon, setIcon] = React.useState<IconName>("bank");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setName("");
    setInitialAmount(0);
    setGoalAmount(0);
    setColor("sky");
    setIcon("bank");
    setError(null);
  }, [open]);

  const valid = name.trim().length > 0;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!valid || pending) return;
    setPending(true);
    setError(null);
    const result = await createSavingsPocket({
      name,
      currency,
      initialAmount,
      goalAmount,
      color,
      icon,
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.success("Bolsillo creado");
    onOpenChange(false);
    onSaved();
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Nuevo bolsillo</SheetTitle>
          <SheetDescription>
            Registra un ahorro que ya tienes o crea uno desde cero.
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {error && <InlineNotice variant="danger">{error}</InlineNotice>}
          <div className="space-y-1.5">
            <Label htmlFor="pocket-name">Nombre</Label>
            <Input
              id="pocket-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ej. Emergencias o Viaje"
              maxLength={60}
              disabled={pending}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pocket-initial">Saldo que ya tienes</Label>
            <AmountField
              id="pocket-initial"
              value={initialAmount}
              onValueChange={setInitialAmount}
              disabled={pending}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pocket-goal">Meta (opcional)</Label>
            <AmountField
              id="pocket-goal"
              value={goalAmount}
              onValueChange={setGoalAmount}
              disabled={pending}
            />
          </div>
          <AppearancePicker
            color={color}
            icon={icon}
            onColorChange={setColor}
            onIconChange={setIcon}
            disabled={pending}
          />
          <Button type="submit" className="w-full" disabled={!valid || pending}>
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />}
            Guardar bolsillo
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}

export function SavingsMovementSheet({
  pocket,
  onClose,
  onSaved,
}: {
  pocket: SavingsPocket | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [kind, setKind] = React.useState<"deposit" | "withdrawal">("deposit");
  const [amount, setAmount] = React.useState(0);
  const [movementDate, setMovementDate] = React.useState(todayISO());
  const [description, setDescription] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!pocket) return;
    setKind("deposit");
    setAmount(0);
    setMovementDate(todayISO());
    setDescription("");
    setError(null);
  }, [pocket]);

  const exceedsBalance = kind === "withdrawal" && amount > (pocket?.balance ?? 0);
  const valid = Boolean(pocket) && amount > 0 && !exceedsBalance;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!pocket || !valid || pending) return;
    setPending(true);
    setError(null);
    const result = await registerSavingsMovement({
      pocketId: pocket.id,
      kind,
      amount,
      movementDate,
      description,
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.success(kind === "deposit" ? "Ahorro registrado" : "Retiro registrado");
    onClose();
    onSaved();
  }

  return (
    <Sheet open={pocket != null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{pocket?.name ?? "Movimiento"}</SheetTitle>
          <SheetDescription>
            Saldo disponible: {formatMoney(pocket?.balance ?? 0, pocket?.currency)}
          </SheetDescription>
        </SheetHeader>
        {pocket && (
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            {error && <InlineNotice variant="danger">{error}</InlineNotice>}
            <OptionGrid
              legend="Tipo de movimiento"
              options={MOVEMENT_OPTIONS}
              value={kind}
              onChange={(value) => setKind(value as "deposit" | "withdrawal")}
            />
            <div className="space-y-1.5">
              <Label htmlFor="savings-amount">
                {kind === "deposit" ? "Valor para ahorrar" : "Valor del retiro"}
              </Label>
              <AmountField
                id="savings-amount"
                value={amount}
                onValueChange={setAmount}
                disabled={pending}
              />
              {exceedsBalance && (
                <p className="text-xs text-destructive">
                  El retiro supera el saldo disponible.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="savings-date">Fecha</Label>
              <Input
                id="savings-date"
                type="date"
                max={todayISO()}
                value={movementDate}
                onChange={(event) => setMovementDate(event.target.value)}
                disabled={pending}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="savings-description">Nota (opcional)</Label>
              <Input
                id="savings-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Ej. Fondo de emergencia"
                maxLength={120}
                disabled={pending}
              />
            </div>
            <Button type="submit" className="w-full" disabled={!valid || pending}>
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />}
              {kind === "deposit" ? "Guardar ahorro" : "Confirmar retiro"}
            </Button>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}
