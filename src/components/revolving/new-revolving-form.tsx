"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, CreditCard, Loader2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AmountField } from "@/components/common/amount-field";
import { OptionGrid } from "@/components/common/option-grid";
import { InlineNotice } from "@/components/common/states";
import { createRevolvingAccount } from "@/server/actions/revolving";
import { formatMoney, formatPercent } from "@/lib/format";
import { percent } from "@/lib/utils";

const KINDS = [
  { value: "credit_card" as const, label: "Tarjeta de crédito", icon: CreditCard },
  { value: "credit_line" as const, label: "Cupo rotativo", icon: Wallet },
];

export function NewRevolvingForm({ currency }: { currency: string }) {
  const router = useRouter();

  const [kind, setKind] = React.useState<"credit_card" | "credit_line">(
    "credit_card",
  );
  const [name, setName] = React.useState("");
  const [entity, setEntity] = React.useState("");
  const [lastFour, setLastFour] = React.useState("");
  const [creditLimit, setCreditLimit] = React.useState(0);
  const [openingBalance, setOpeningBalance] = React.useState(0);
  const [rate, setRate] = React.useState("");
  const [statementDay, setStatementDay] = React.useState("1");
  const [dueDay, setDueDay] = React.useState("1");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const used = percent(openingBalance, creditLimit);
  const ready = name.trim().length > 0 && creditLimit > 0;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending || !ready) return;
    setError(null);
    setPending(true);

    const result = await createRevolvingAccount({
      name: name.trim(),
      kind,
      entity,
      lastFour,
      creditLimit,
      openingBalance,
      interestRateMonthly: Number(rate.replace(",", ".")) || 0,
      statementDay: Number(statementDay) || 1,
      dueDay: Number(dueDay) || 1,
      currency,
    });

    if (!result.ok) {
      setError(result.error);
      setPending(false);
      return;
    }

    toast.success("Tarjeta registrada");
    router.replace(`/tarjetas/${result.data.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-7" noValidate>
      {error && <InlineNotice variant="danger">{error}</InlineNotice>}

      <OptionGrid
        legend="Tipo de producto"
        options={KINDS}
        value={kind}
        onChange={setKind}
      />

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="rev-name">Nombre</Label>
          <Input
            id="rev-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Tarjeta AV Villas"
            maxLength={80}
            required
            disabled={pending}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="rev-entity">Entidad</Label>
            <Input
              id="rev-entity"
              value={entity}
              onChange={(e) => setEntity(e.target.value)}
              placeholder="Banco"
              maxLength={80}
              disabled={pending}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rev-last-four">Últimos 4 dígitos</Label>
            <Input
              id="rev-last-four"
              inputMode="numeric"
              value={lastFour}
              onChange={(e) =>
                setLastFour(e.target.value.replace(/\D/g, "").slice(0, 4))
              }
              placeholder="0074"
              disabled={pending}
            />
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="rev-limit">Cupo total</Label>
        <AmountField
          id="rev-limit"
          value={creditLimit}
          onValueChange={setCreditLimit}
          disabled={pending}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="rev-balance">Cupo ya usado</Label>
        <AmountField
          id="rev-balance"
          value={openingBalance}
          onValueChange={setOpeningBalance}
          disabled={pending}
          aria-describedby="rev-balance-hint"
        />
        <p id="rev-balance-hint" className="text-xs text-muted-foreground">
          Lo que debes hoy. Se registra como el primer movimiento.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="rev-rate">Tasa</Label>
          <div className="relative">
            <Input
              id="rev-rate"
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
          <Label htmlFor="rev-cut">Día de corte</Label>
          <Input
            id="rev-cut"
            inputMode="numeric"
            value={statementDay}
            onChange={(e) =>
              setStatementDay(e.target.value.replace(/\D/g, "").slice(0, 2))
            }
            disabled={pending}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rev-due">Día de pago</Label>
          <Input
            id="rev-due"
            inputMode="numeric"
            value={dueDay}
            onChange={(e) =>
              setDueDay(e.target.value.replace(/\D/g, "").slice(0, 2))
            }
            disabled={pending}
          />
        </div>
      </div>

      <section
        aria-live="polite"
        className="rounded-3xl bg-card p-5"
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Cupo disponible
        </p>
        <p className="tabular mt-2 text-3xl font-bold tracking-tight text-primary">
          {formatMoney(Math.max(0, creditLimit - openingBalance), currency)}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {creditLimit > 0
            ? `${formatPercent(used, 0)} del cupo usado`
            : "Indica el cupo total"}
        </p>
      </section>

      <Button
        type="submit"
        variant="warning"
        size="lg"
        className="w-full"
        disabled={pending || !ready}
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Check className="h-4 w-4" aria-hidden />
        )}
        Registrar tarjeta
      </Button>
    </form>
  );
}
