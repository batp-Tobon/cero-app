"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, MoreHorizontal, Trash2 } from "lucide-react";
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
import { AppearancePicker } from "@/shared/components/appearance-picker";
import { InlineNotice } from "@/shared/components/states";
import {
  deleteRevolvingAccount,
  updateRevolvingAccount,
} from "@/features/revolving/actions";
import type { AccentColor, IconName } from "@/shared/lib/appearance";
import type { RevolvingAccountRow } from "@/shared/types/database";

/** Ajustes de la tarjeta: datos del producto, apariencia y baja. */
export function RevolvingMenu({ account }: { account: RevolvingAccountRow }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(account.name);
  const [entity, setEntity] = React.useState(account.entity ?? "");
  const [creditLimit, setCreditLimit] = React.useState(
    Number(account.credit_limit),
  );
  const [statementDay, setStatementDay] = React.useState(
    String(account.statement_day),
  );
  const [dueDay, setDueDay] = React.useState(String(account.due_day));
  const [rate, setRate] = React.useState(
    String(Number(account.interest_rate_monthly) * 100 || ""),
  );
  const [color, setColor] = React.useState<AccentColor>(account.color);
  const [icon, setIcon] = React.useState<IconName | null>(
    (account.icon as IconName | null) ?? null,
  );
  const [pending, setPending] = React.useState(false);
  const [confirmingDelete, setConfirmingDelete] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) setConfirmingDelete(false);
  }, [open]);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);

    const result = await updateRevolvingAccount({
      id: account.id,
      name,
      entity,
      creditLimit,
      statementDay: Number(statementDay) || 1,
      dueDay: Number(dueDay) || 1,
      interestRateMonthly: Number(rate.replace(",", ".")) || 0,
      color,
      icon,
    });
    setPending(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    toast.success("Tarjeta actualizada");
    setOpen(false);
    router.refresh();
  }

  async function onDelete() {
    setError(null);
    setPending(true);
    const result = await deleteRevolvingAccount(account.id);

    if (!result.ok) {
      setPending(false);
      setError(result.error);
      return;
    }

    toast.success("Tarjeta eliminada");
    setOpen(false);
    router.replace("/creditos");
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Ajustes de la tarjeta"
        className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        <MoreHorizontal className="h-5 w-5" aria-hidden />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Ajustes de la tarjeta</SheetTitle>
            <SheetDescription>
              El saldo no se edita aquí: sale de los movimientos registrados.
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={onSave} className="space-y-4">
            {error && <InlineNotice variant="danger">{error}</InlineNotice>}

            <div className="space-y-1.5">
              <Label htmlFor="rev-edit-name">Nombre</Label>
              <Input
                id="rev-edit-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                required
                disabled={pending}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rev-edit-entity">Entidad</Label>
              <Input
                id="rev-edit-entity"
                value={entity}
                onChange={(e) => setEntity(e.target.value)}
                maxLength={80}
                disabled={pending}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rev-edit-limit">Cupo total</Label>
              <AmountField
                id="rev-edit-limit"
                value={creditLimit}
                onValueChange={setCreditLimit}
                disabled={pending}
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="rev-edit-rate">Tasa</Label>
                <div className="relative">
                  <Input
                    id="rev-edit-rate"
                    inputMode="decimal"
                    value={rate}
                    onChange={(e) => setRate(e.target.value)}
                    placeholder="0,00"
                    disabled={pending}
                    className="pr-8"
                  />
                  <span
                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground"
                    aria-hidden
                  >
                    %
                  </span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rev-edit-cut">Corte</Label>
                <Input
                  id="rev-edit-cut"
                  inputMode="numeric"
                  value={statementDay}
                  onChange={(e) =>
                    setStatementDay(e.target.value.replace(/\D/g, "").slice(0, 2))
                  }
                  disabled={pending}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rev-edit-due">Pago</Label>
                <Input
                  id="rev-edit-due"
                  inputMode="numeric"
                  value={dueDay}
                  onChange={(e) =>
                    setDueDay(e.target.value.replace(/\D/g, "").slice(0, 2))
                  }
                  disabled={pending}
                />
              </div>
            </div>

            <div className="border-t border-border pt-4">
              <p className="mb-3 text-sm font-semibold">Apariencia</p>
              <AppearancePicker
                color={color}
                icon={icon}
                onColorChange={setColor}
                onIconChange={setIcon}
                disabled={pending}
              />
            </div>

            <Button type="submit" className="w-full" disabled={pending}>
              {pending && (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              )}
              Guardar cambios
            </Button>
          </form>

          <div className="mt-6 border-t border-border pt-5">
            {confirmingDelete ? (
              <div className="space-y-3">
                <InlineNotice variant="danger">
                  Se borran la tarjeta, sus movimientos y sus extractos. No se
                  puede deshacer.
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
                Eliminar tarjeta
              </Button>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
