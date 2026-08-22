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
import { OptionGrid } from "@/shared/components/option-grid";
import { AppearancePicker } from "@/shared/components/appearance-picker";
import type { AccentColor, IconName } from "@/shared/lib/appearance";
import { InlineNotice } from "@/shared/components/states";
import { deleteCredit, updateCredit } from "@/features/credits/actions";
import { EXTRA_PRINCIPAL_MODES } from "@/shared/lib/constants";
import type { ExtraPrincipalMode } from "@/core/amortization";
import type { Credit } from "@/shared/types/domain";

/**
 * Ajustes del crédito. Monto, tasa y plazo no se editan: ya hay pagos
 * calculados sobre ellos y cambiarlos falsearía el histórico.
 */
export function CreditMenu({
  credit,
  isOwner,
}: {
  credit: Credit;
  isOwner: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(credit.name);
  const [entity, setEntity] = React.useState(credit.entity ?? "");
  const [notes, setNotes] = React.useState(credit.notes ?? "");
  const [mode, setMode] = React.useState<ExtraPrincipalMode>(
    credit.extra_principal_mode,
  );
  const [color, setColor] = React.useState<AccentColor>(credit.color);
  const [icon, setIcon] = React.useState<IconName | null>(
    (credit.icon as IconName | null) ?? null,
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

    const result = await updateCredit({
      id: credit.id,
      name,
      entity,
      notes,
      extraPrincipalMode: mode,
      color,
      icon,
    });
    setPending(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    toast.success("Crédito actualizado");
    setOpen(false);
    router.refresh();
  }

  async function onDelete() {
    setError(null);
    setPending(true);
    const result = await deleteCredit(credit.id);

    if (!result.ok) {
      setPending(false);
      setError(result.error);
      return;
    }

    toast.success("Crédito eliminado");
    setOpen(false);
    router.replace("/creditos");
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Ajustes del crédito"
        className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        <MoreHorizontal className="h-5 w-5" aria-hidden />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Ajustes del crédito</SheetTitle>
            <SheetDescription>
              El monto, la tasa y el plazo no se editan: hay pagos calculados
              sobre ellos.
            </SheetDescription>
          </SheetHeader>

          {isOwner && (
          <form onSubmit={onSave} className="space-y-4">
            {error && <InlineNotice variant="danger">{error}</InlineNotice>}

            <div className="space-y-1.5">
              <Label htmlFor="credit-name">Nombre</Label>
              <Input
                id="credit-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                required
                disabled={pending}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="credit-entity">Entidad</Label>
              <Input
                id="credit-entity"
                value={entity}
                onChange={(e) => setEntity(e.target.value)}
                placeholder="Banco, concesionario…"
                maxLength={80}
                disabled={pending}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="credit-notes">Notas</Label>
              <Input
                id="credit-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={500}
                disabled={pending}
              />
            </div>

            <div className="space-y-2">
              <Label>Al abonar a capital</Label>
              <OptionGrid
                legend="Qué hacer con los abonos a capital"
                options={EXTRA_PRINCIPAL_MODES}
                value={mode}
                onChange={setMode}
                columns={1}
              />
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
          )}

          {isOwner && (
          <div className="mt-6 border-t border-border pt-5">
            {confirmingDelete ? (
              <div className="space-y-3">
                <InlineNotice variant="danger">
                  Se borrarán el crédito, su plan de pagos y todos sus pagos
                  registrados. No se puede deshacer.
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
                Eliminar crédito
              </Button>
            )}
          </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
