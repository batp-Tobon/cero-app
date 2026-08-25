"use client";

import * as React from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  Loader2,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  createSavingsPocket,
  registerSavingsMovement,
  deleteSavingsMovement,
  deleteSavingsPocket,
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
import { cn } from "@/shared/lib/utils";
import type { AccentColor, IconName } from "@/shared/lib/appearance";
import { formatShortDate } from "@/shared/lib/dates";
import type { SavingsMovement, SavingsPocket } from "../types";

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

        {pocket && (
          <div className="mt-6 border-t border-border pt-5">
            <DeleteConfirm
              label="Eliminar bolsillo"
              warning={[
                pocket.balance > 0
                  ? `Se borra el bolsillo y todo su historial, incluidos ${formatMoney(pocket.balance, pocket.currency)} de saldo.`
                  : "Se borra el bolsillo y todo su historial.",
                // El automático lo vuelve a crear la sincronización mientras
                // el presupuesto siga dejando excedente; callarlo haría
                // parecer que el borrado falló.
                pocket.isDefault
                  ? "Al ser el bolsillo automático, volverá a crearse vacío mientras tu presupuesto siga dejando excedente."
                  : "No se puede deshacer.",
              ].join(" ")}
              pending={pending}
              onDelete={async () => {
                setPending(true);
                const result = await deleteSavingsPocket(pocket.id);
                setPending(false);
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                toast.success("Bolsillo eliminado");
                onClose();
                onSaved();
              }}
            />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

/**
 * Confirmación en dos pasos para una acción que no se deshace.
 *
 * Un solo toque bastaría para borrar meses de historial; el segundo paso
 * cuesta medio segundo y evita el arrepentimiento.
 */
function DeleteConfirm({
  label,
  warning,
  pending,
  onDelete,
}: {
  label: string;
  warning: string;
  pending: boolean;
  onDelete: () => void;
}) {
  const [confirming, setConfirming] = React.useState(false);

  if (!confirming) {
    return (
      <Button
        type="button"
        variant="ghost"
        className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
        disabled={pending}
        onClick={() => setConfirming(true)}
      >
        <Trash2 className="h-4 w-4" aria-hidden />
        {label}
      </Button>
    );
  }

  return (
    <div className="space-y-3">
      <InlineNotice variant="danger">{warning}</InlineNotice>
      <div className="flex gap-2.5">
        <Button
          type="button"
          variant="secondary"
          className="flex-1"
          disabled={pending}
          onClick={() => setConfirming(false)}
        >
          Cancelar
        </Button>
        <Button
          type="button"
          variant="destructive"
          className="flex-1"
          disabled={pending}
          onClick={onDelete}
        >
          {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          Eliminar
        </Button>
      </div>
    </div>
  );
}

/**
 * Detalle de un movimiento, con la opción de retirarlo.
 *
 * El excedente del presupuesto no se puede borrar aquí: lo deriva la
 * sincronización del presupuesto en cada carga y volvería a aparecer. En su
 * lugar se explica dónde cambiarlo de verdad.
 */
export function MovementDetailSheet({
  movement,
  currency,
  onClose,
  onDeleted,
}: {
  movement: SavingsMovement | null;
  currency: string;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (movement) setError(null);
  }, [movement]);

  const automatic = movement?.kind === "budget_surplus";
  const withdrawal = movement?.kind === "withdrawal";

  async function onDelete() {
    if (!movement) return;
    setError(null);
    setPending(true);
    const result = await deleteSavingsMovement(movement.id);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.success("Movimiento eliminado");
    onDeleted();
  }

  return (
    <Sheet open={movement != null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>
            {automatic
              ? "Excedente del presupuesto"
              : withdrawal
                ? "Retiro"
                : "Ahorro"}
          </SheetTitle>
          <SheetDescription>
            {movement
              ? `${formatShortDate(movement.movementDate)} · ${movement.pocketName}`
              : ""}
          </SheetDescription>
        </SheetHeader>

        {movement && (
          <div className="space-y-4">
            {error && <InlineNotice variant="danger">{error}</InlineNotice>}

            <div className="rounded-2xl bg-secondary p-4 text-center">
              <p
                className={cn(
                  "figure-lead tabular",
                  withdrawal ? "text-destructive" : "text-primary",
                )}
              >
                {withdrawal ? "−" : "+"}
                {formatMoney(movement.amount, currency)}
              </p>
              {movement.description && (
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {movement.description}
                </p>
              )}
            </div>

            {automatic ? (
              <InlineNotice>
                <span className="flex items-start gap-2">
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  Este movimiento se calcula solo a partir de lo que te sobra en
                  el presupuesto del mes. Para cambiarlo, ajusta ese presupuesto:
                  borrarlo aquí no serviría porque volvería a aparecer.
                </span>
              </InlineNotice>
            ) : (
              <DeleteConfirm
                label="Eliminar movimiento"
                warning="Se retira del historial y el saldo del bolsillo se recalcula sin él."
                pending={pending}
                onDelete={onDelete}
              />
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
