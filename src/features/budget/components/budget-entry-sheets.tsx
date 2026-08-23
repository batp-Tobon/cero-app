"use client";

import { Check, Trash2 } from "lucide-react";
import { AmountField } from "@/shared/components/amount-field";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shared/ui/sheet";
import { addMonths } from "@/shared/lib/dates";
import type { EditableExpense, EditableIncome } from "./editor-types";
import { BUDGET_CATEGORIES } from "./category-options";
import type { BudgetExpenseCategory } from "../types";

export function IncomeEntrySheet({
  value,
  month,
  disabled,
  canDelete,
  onChange,
  onSave,
  onDelete,
  onClose,
}: {
  value: EditableIncome | null;
  month: string;
  disabled: boolean;
  canDelete: boolean;
  onChange: (value: EditableIncome) => void;
  onSave: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const monthEnd = addMonths(`${month.slice(0, 8)}31`, 0);
  const valid =
    value != null &&
    value.name.trim().length > 0 &&
    value.amount > 0 &&
    value.receivedDate >= month &&
    value.receivedDate < addMonths(month, 1);

  return (
    <Sheet open={value != null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{canDelete ? "Editar ingreso" : "Registrar ingreso"}</SheetTitle>
          <SheetDescription>
            Guarda lo que realmente llega y la fecha en que estará disponible.
          </SheetDescription>
        </SheetHeader>

        {value && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="income-name">Nombre</Label>
              <Input
                id="income-name"
                value={value.name}
                onChange={(event) => onChange({ ...value, name: event.target.value })}
                placeholder="Ej. Sueldo"
                maxLength={80}
                disabled={disabled}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="income-amount">Valor recibido</Label>
              <AmountField
                id="income-amount"
                value={value.amount}
                onValueChange={(amount) => onChange({ ...value, amount })}
                disabled={disabled}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="income-date">Fecha de llegada</Label>
              <Input
                id="income-date"
                type="date"
                min={month}
                max={monthEnd}
                value={value.receivedDate}
                onChange={(event) =>
                  onChange({ ...value, receivedDate: event.target.value })
                }
                disabled={disabled}
              />
            </div>

            <CheckRow
              checked={value.recurring}
              disabled={disabled}
              onChange={(recurring) => onChange({ ...value, recurring })}
            >
              Proyectar este ingreso en el próximo mes
            </CheckRow>

            <EntryActions
              canDelete={canDelete}
              disabled={disabled || !valid}
              deleteDisabled={disabled}
              onDelete={onDelete}
              onSave={onSave}
            />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

export function ExpenseEntrySheet({
  value,
  disabled,
  canDelete,
  onChange,
  onSave,
  onDelete,
  onClose,
}: {
  value: EditableExpense | null;
  disabled: boolean;
  canDelete: boolean;
  onChange: (value: EditableExpense) => void;
  onSave: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const valid = value != null && value.name.trim().length > 0 && value.amount > 0;

  return (
    <Sheet open={value != null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{canDelete ? "Editar gasto" : "Añadir gasto"}</SheetTitle>
          <SheetDescription>
            Arriendo, comida, servicios y cualquier salida que no sea una deuda.
          </SheetDescription>
        </SheetHeader>

        {value && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="expense-name">Nombre</Label>
              <Input
                id="expense-name"
                value={value.name}
                onChange={(event) => onChange({ ...value, name: event.target.value })}
                placeholder="Ej. Arriendo"
                maxLength={80}
                disabled={disabled}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="expense-category">Categoría</Label>
              <Select
                value={value.category}
                onValueChange={(category) =>
                  onChange({ ...value, category: category as BudgetExpenseCategory })
                }
                disabled={disabled}
              >
                <SelectTrigger id="expense-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BUDGET_CATEGORIES.map((category) => (
                    <SelectItem key={category.value} value={category.value}>
                      {category.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_5.5rem] gap-3">
              <div className="min-w-0 space-y-1.5">
                <Label htmlFor="expense-amount">Valor mensual</Label>
                <AmountField
                  id="expense-amount"
                  value={value.amount}
                  onValueChange={(amount) => onChange({ ...value, amount })}
                  disabled={disabled}
                />
              </div>
              <div className="min-w-0 space-y-1.5">
                <Label htmlFor="expense-day">Día</Label>
                <Input
                  id="expense-day"
                  inputMode="numeric"
                  value={String(value.dueDay)}
                  onChange={(event) => {
                    const dueDay = Math.min(
                      31,
                      Math.max(1, Number(event.target.value.replace(/\D/g, "")) || 1),
                    );
                    onChange({ ...value, dueDay });
                  }}
                  maxLength={2}
                  disabled={disabled}
                  className="h-14 text-center"
                />
              </div>
            </div>

            <CheckRow
              checked={value.recurring}
              disabled={disabled}
              onChange={(recurring) => onChange({ ...value, recurring })}
            >
              Repetir este gasto en el próximo mes
            </CheckRow>

            <EntryActions
              canDelete={canDelete}
              disabled={disabled || !valid}
              deleteDisabled={disabled}
              onDelete={onDelete}
              onSave={onSave}
            />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function CheckRow({
  checked,
  disabled,
  onChange,
  children,
}: {
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-2xl bg-secondary px-4 py-3 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        disabled={disabled}
        className="h-4 w-4 accent-[hsl(var(--primary))]"
      />
      {children}
    </label>
  );
}

function EntryActions({
  canDelete,
  disabled,
  deleteDisabled,
  onDelete,
  onSave,
}: {
  canDelete: boolean;
  disabled: boolean;
  deleteDisabled: boolean;
  onDelete: () => void;
  onSave: () => void;
}) {
  return (
    <div className="flex gap-3 pt-1">
      {canDelete && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Eliminar"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={onDelete}
          disabled={deleteDisabled}
        >
          <Trash2 aria-hidden />
        </Button>
      )}
      <Button type="button" className="flex-1" onClick={onSave} disabled={disabled}>
        <Check aria-hidden /> Listo
      </Button>
    </div>
  );
}
