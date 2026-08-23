"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
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
import { AmountField } from "@/shared/components/amount-field";
import { OptionGrid } from "@/shared/components/option-grid";
import { InlineNotice } from "@/shared/components/states";
import { createCredit } from "@/features/credits/actions";
import { buildSchedule, summarize } from "@/core/amortization";
import type {
  AmortizationSystem,
  ExtraPrincipalMode,
} from "@/core/amortization";
import {
  AMORTIZATION_SYSTEMS,
  CREDIT_TYPES,
  EXTRA_PRINCIPAL_MODES,
} from "@/shared/lib/constants";
import { formatMoney } from "@/shared/lib/format";
import { formatLongDate, todayISO } from "@/shared/lib/dates";
import type { CreditType } from "@/shared/types/domain";

const STEP_LABELS = [
  "¿Qué estás financiando?",
  "Monto del crédito",
  "Tasa mensual",
  "Plazo",
  "Fecha de primera cuota",
  "Sistema de amortización",
] as const;

/**
 * Alta de crédito. El resumen se calcula con el mismo motor que usa el
 * servidor, así que la cuota que se ve antes de guardar es la definitiva.
 */
export function NewCreditForm({ currency }: { currency: string }) {
  const router = useRouter();

  const [type, setType] = React.useState<CreditType | null>(null);
  const [name, setName] = React.useState("");
  const [entity, setEntity] = React.useState("");
  const [principal, setPrincipal] = React.useState(0);
  const [ratePercent, setRatePercent] = React.useState("");
  const [term, setTerm] = React.useState("");
  const [firstPaymentDate, setFirstPaymentDate] = React.useState("");
  const [system, setSystem] = React.useState<AmortizationSystem>("french");
  const [mode, setMode] = React.useState<ExtraPrincipalMode>("reduce_term");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const rate = Number(ratePercent.replace(",", ".")) || 0;
  const termMonths = Number.parseInt(term, 10) || 0;

  const preview = React.useMemo(() => {
    if (!principal || !termMonths || !firstPaymentDate) return null;
    const rows = buildSchedule({
      principal,
      monthlyRate: rate / 100,
      termMonths,
      system,
      firstPaymentDate,
    });
    return rows.length > 0 ? summarize(rows) : null;
  }, [principal, rate, termMonths, system, firstPaymentDate]);

  const ready =
    type != null &&
    name.trim().length > 0 &&
    principal > 0 &&
    termMonths > 0 &&
    firstPaymentDate.length === 10;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending || !ready) return;
    setError(null);
    setPending(true);

    const result = await createCredit({
      name: name.trim(),
      type: type!,
      entity,
      principalAmount: principal,
      interestRateMonthly: system === "zero_interest" ? 0 : rate,
      termMonths,
      amortizationSystem: system,
      extraPrincipalMode: mode,
      firstPaymentDate,
      currency,
    });

    if (!result.ok) {
      setError(result.error);
      setPending(false);
      return;
    }

    toast.success("Crédito creado", {
      description: "Generamos el plan de pagos completo.",
    });
    router.replace(`/creditos/${result.data.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-7" noValidate>
      {error && <InlineNotice variant="danger">{error}</InlineNotice>}

      <Step index={0}>
        <OptionGrid
          legend={STEP_LABELS[0]}
          options={CREDIT_TYPES}
          value={type}
          onChange={(value) => {
            setType(value);
            // El nombre suele coincidir con el tipo; se pre-rellena y el
            // usuario lo cambia si quiere.
            if (!name.trim()) {
              setName(
                CREDIT_TYPES.find((t) => t.value === value)?.label ?? "",
              );
            }
          }}
        />
      </Step>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="credit-name">Nombre del crédito</Label>
          <Input
            id="credit-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Carro, Lote, Tarjeta…"
            maxLength={80}
            required
            disabled={pending}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="credit-entity">Entidad (opcional)</Label>
          <Input
            id="credit-entity"
            value={entity}
            onChange={(e) => setEntity(e.target.value)}
            placeholder="Banco, concesionario…"
            maxLength={80}
            disabled={pending}
          />
        </div>
      </div>

      <Step index={1}>
        <AmountField
          id="credit-principal"
          value={principal}
          onValueChange={setPrincipal}
          disabled={pending}
        />
      </Step>

      <div className="grid grid-cols-2 gap-3">
        <Step index={2}>
          <div className="relative">
            <Input
              id="credit-rate"
              inputMode="decimal"
              value={system === "zero_interest" ? "" : ratePercent}
              onChange={(e) => setRatePercent(e.target.value)}
              placeholder="0,00"
              disabled={pending || system === "zero_interest"}
              className="pr-9"
              aria-describedby="credit-rate-hint"
            />
            <span
              className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-muted-foreground"
              aria-hidden
            >
              %
            </span>
          </div>
          <p id="credit-rate-hint" className="mt-1.5 text-xs text-muted-foreground">
            Mensual vencida
          </p>
        </Step>

        <Step index={3}>
          <div className="relative">
            <Input
              id="credit-term"
              inputMode="numeric"
              value={term}
              onChange={(e) => setTerm(e.target.value.replace(/\D/g, ""))}
              placeholder="12"
              required
              disabled={pending}
              className="pr-16"
            />
            <span
              className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-muted-foreground"
              aria-hidden
            >
              meses
            </span>
          </div>
        </Step>
      </div>

      <Step index={4}>
        <Input
          id="credit-first-date"
          type="date"
          value={firstPaymentDate}
          min={todayISO().slice(0, 4) + "-01-01"}
          onChange={(e) => setFirstPaymentDate(e.target.value)}
          required
          disabled={pending}
        />
      </Step>

      <Step index={5}>
        <Select
          value={system}
          onValueChange={(v) => setSystem(v as AmortizationSystem)}
          disabled={pending}
        >
          <SelectTrigger id="credit-system" aria-label={STEP_LABELS[5]}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {AMORTIZATION_SYSTEMS.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
          {AMORTIZATION_SYSTEMS.find((s) => s.value === system)?.hint}
        </p>
      </Step>

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

      <section
        aria-labelledby="summary"
        aria-live="polite"
        className="rounded-3xl bg-card p-5"
      >
        <h2
          id="summary"
          className="eyebrow"
        >
          Resumen del crédito
        </h2>

        <p className="figure-lead mt-3 text-primary">
          {formatMoney(preview?.firstPayment ?? 0, currency)}
        </p>
        <p className="text-xs text-muted-foreground">
          {system === "german" ? "primera cuota" : "cuota estimada"}
        </p>

        <dl className="mt-5 space-y-2.5 text-sm">
          <SummaryRow label="Intereses totales">
            {formatMoney(preview?.totalInterest ?? 0, currency)}
          </SummaryRow>
          <SummaryRow label="Costo total del crédito">
            {formatMoney(preview?.totalPaid ?? 0, currency)}
          </SummaryRow>
          <SummaryRow label="Última cuota">
            {preview?.lastDueDate ? formatLongDate(preview.lastDueDate) : "—"}
          </SummaryRow>
        </dl>
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
        Crear crédito
      </Button>
    </form>
  );
}

function Step({
  index,
  children,
}: {
  index: number;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-muted-foreground">
        <span className="text-foreground">{index + 1}.</span>{" "}
        {STEP_LABELS[index]}
      </p>
      {children}
    </div>
  );
}

function SummaryRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular font-medium">{children}</dd>
    </div>
  );
}
