"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { BrainCircuit, Eye, EyeOff, Loader2, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { updatePlanSettings } from "@/features/admin/actions";
import type { AdminPlan } from "@/features/admin/queries";
import { AmountField } from "@/shared/components/amount-field";
import { formatMoney } from "@/shared/lib/format";
import { Badge } from "@/shared/ui/badge";
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

export function AdminPlans({ plans }: { plans: AdminPlan[] }) {
  return (
    <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
      {plans.map((plan) => (
        <PlanCard key={plan.id} plan={plan} />
      ))}
    </div>
  );
}

function PlanCard({ plan }: { plan: AdminPlan }) {
  const [open, setOpen] = React.useState(false);
  const aiEnabled = plan.features.ai_insights === true;

  return (
    <article className="rounded-3xl bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="text-sm font-semibold">{plan.name}</h3>
            <Badge variant={plan.isPublic ? "success" : "outline"}>
              {plan.isPublic ? "Visible" : "Oculto"}
            </Badge>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {plan.description ?? "Sin descripción"}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Configurar ${plan.name}`}
          onClick={() => setOpen(true)}
        >
          <Settings2 aria-hidden />
        </Button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
        <span className="rounded-full bg-secondary px-2.5 py-1 font-medium">
          {plan.code === "free"
            ? `${plan.trialDays} días gratis`
            : `${formatMoney(plan.monthlyPrice, plan.currency)} / mes`}
        </span>
        {aiEnabled && (
          <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 font-medium text-primary">
            <BrainCircuit className="h-3.5 w-3.5" aria-hidden />
            Análisis inteligente
          </span>
        )}
      </div>

      {open ? (
        <PlanEditor plan={plan} open onOpenChange={setOpen} />
      ) : null}
    </article>
  );
}

function PlanEditor({
  plan,
  open,
  onOpenChange,
}: {
  plan: AdminPlan;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [name, setName] = React.useState(plan.name);
  const [description, setDescription] = React.useState(plan.description ?? "");
  const [trialDays, setTrialDays] = React.useState(plan.trialDays);
  const [monthlyPrice, setMonthlyPrice] = React.useState(plan.monthlyPrice);
  const [isPublic, setIsPublic] = React.useState(plan.isPublic);
  const [aiInsights, setAiInsights] = React.useState(
    plan.features.ai_insights === true,
  );
  const [reason, setReason] = React.useState("");
  const [pending, setPending] = React.useState(false);

  async function onSave(event: React.FormEvent) {
    event.preventDefault();
    if (pending || reason.trim().length < 10) return;
    setPending(true);
    const result = await updatePlanSettings({
      planId: plan.id,
      name,
      description: description || null,
      trialDays: plan.code === "free" ? trialDays : 0,
      isPublic,
      aiInsights,
      monthlyPrice: plan.code === "pro" ? monthlyPrice : 0,
      reason,
    });
    setPending(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    toast.success("Plan actualizado");
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Configurar plan</SheetTitle>
          <SheetDescription>
            Los cambios quedan registrados en la auditoría del backoffice.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={onSave} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor={`plan-name-${plan.id}`}>Nombre</Label>
            <Input
              id={`plan-name-${plan.id}`}
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={80}
              required
              disabled={pending}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`plan-description-${plan.id}`}>Descripción</Label>
            <textarea
              id={`plan-description-${plan.id}`}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={500}
              rows={3}
              disabled={pending}
              className="flex w-full resize-none rounded-xl border border-input bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            />
          </div>

          {plan.code === "free" ? (
            <div className="space-y-1.5">
              <Label htmlFor={`trial-${plan.id}`}>Días de prueba</Label>
              <Input
                id={`trial-${plan.id}`}
                type="number"
                min={0}
                max={90}
                value={trialDays}
                onChange={(event) => setTrialDays(Number(event.target.value))}
                disabled={pending}
              />
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor={`price-${plan.id}`}>Precio mensual · COP</Label>
              <AmountField
                id={`price-${plan.id}`}
                value={monthlyPrice}
                onValueChange={setMonthlyPrice}
                disabled={pending}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-2.5">
            <Button
              type="button"
              variant={isPublic ? "secondary" : "outline"}
              aria-pressed={isPublic}
              onClick={() => setIsPublic((value) => !value)}
              disabled={pending}
            >
              {isPublic ? <Eye aria-hidden /> : <EyeOff aria-hidden />}
              {isPublic ? "Visible" : "Oculto"}
            </Button>
            <Button
              type="button"
              variant={aiInsights ? "secondary" : "outline"}
              aria-pressed={aiInsights}
              onClick={() => setAiInsights((value) => !value)}
              disabled={pending}
            >
              <BrainCircuit aria-hidden />
              {aiInsights ? "IA incluida" : "Sin IA"}
            </Button>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`plan-reason-${plan.id}`}>Motivo del cambio</Label>
            <Input
              id={`plan-reason-${plan.id}`}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              minLength={10}
              maxLength={500}
              placeholder="Ej. Ajuste de precio comercial"
              required
              disabled={pending}
            />
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={
              pending ||
              name.trim().length === 0 ||
              reason.trim().length < 10 ||
              monthlyPrice < 0
            }
          >
            {pending && <Loader2 className="animate-spin" aria-hidden />}
            Guardar configuración
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
