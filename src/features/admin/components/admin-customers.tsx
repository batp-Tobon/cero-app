"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Loader2, Settings2, ShieldCheck, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import {
  setUserRole,
  setUserSubscription,
} from "@/features/admin/actions";
import type {
  AdminCustomer,
  AdminPlan,
} from "@/features/admin/queries";
import { initials } from "@/shared/lib/utils";
import { Badge } from "@/shared/ui/badge";
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
import type { SaasSubscriptionStatusDB } from "@/shared/types/database";

const STATUS_LABELS: Record<SaasSubscriptionStatusDB, string> = {
  trialing: "En prueba",
  active: "Activa",
  past_due: "Pago pendiente",
  canceled: "Cancelada",
  expired: "Vencida",
};

function statusVariant(status: SaasSubscriptionStatusDB | undefined) {
  if (status === "active" || status === "trialing") return "success" as const;
  if (status === "past_due") return "warning" as const;
  if (status === "canceled" || status === "expired") return "danger" as const;
  return "outline" as const;
}

function formatAccountDate(value: string): string {
  return new Intl.DateTimeFormat("es-CO", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    timeZone: "UTC",
  }).format(new Date(value));
}

export function AdminCustomers({
  customers,
  plans,
  currentUserId,
}: {
  customers: AdminCustomer[];
  plans: AdminPlan[];
  currentUserId: string;
}) {
  if (customers.length === 0) {
    return (
      <p className="mt-3 rounded-3xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        No encontramos clientes con ese correo.
      </p>
    );
  }

  return (
    <ul className="mt-3 space-y-2.5">
      {customers.map((customer) => (
        <CustomerCard
          key={customer.id}
          customer={customer}
          plans={plans}
          currentUserId={currentUserId}
        />
      ))}
    </ul>
  );
}

function CustomerCard({
  customer,
  plans,
  currentUserId,
}: {
  customer: AdminCustomer;
  plans: AdminPlan[];
  currentUserId: string;
}) {
  const [open, setOpen] = React.useState(false);
  const subscription = customer.subscription;

  return (
    <li className="rounded-3xl bg-card p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-muted-foreground">
          {initials(customer.fullName ?? customer.email)}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="truncate text-sm font-semibold">
              {customer.fullName ?? "Sin nombre"}
            </p>
            {customer.role === "admin" && <Badge variant="success">Admin</Badge>}
            {customer.id === currentUserId && <Badge>Tú</Badge>}
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {customer.email ?? "Sin correo"}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge variant={statusVariant(subscription?.status)}>
              {subscription?.planName ?? "CERO Gratis"}
            </Badge>
            <span className="text-[11px] text-muted-foreground">
              {subscription?.isIndefinite
                ? "Sin vencimiento"
                : subscription
                  ? STATUS_LABELS[subscription.status]
                  : "Sin suscripción"}
            </span>
          </div>
        </div>

        <Button
          variant="ghost"
          size="icon"
          aria-label={`Administrar a ${customer.fullName ?? customer.email}`}
          onClick={() => setOpen(true)}
        >
          <Settings2 aria-hidden />
        </Button>
      </div>

      <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <CalendarDays className="h-3.5 w-3.5" aria-hidden />
        Cuenta creada el {formatAccountDate(customer.createdAt)}
      </p>

      <CustomerManager
        key={`${subscription?.id ?? "free"}-${subscription?.status ?? "none"}-${subscription?.accessUntil ?? ""}-${subscription?.isIndefinite ?? false}`}
        open={open}
        onOpenChange={setOpen}
        customer={customer}
        plans={plans}
        isCurrentUser={customer.id === currentUserId}
      />
    </li>
  );
}

function CustomerManager({
  open,
  onOpenChange,
  customer,
  plans,
  isCurrentUser,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: AdminCustomer;
  plans: AdminPlan[];
  isCurrentUser: boolean;
}) {
  const router = useRouter();
  const defaultPlan =
    plans.find((plan) => plan.id === customer.subscription?.planId) ??
    plans.find((plan) => plan.code === "free") ??
    plans[0];
  const [planId, setPlanId] = React.useState(defaultPlan?.id ?? "");
  const [status, setStatus] = React.useState<SaasSubscriptionStatusDB>(
    customer.subscription?.status ?? "trialing",
  );
  const [accessUntil, setAccessUntil] = React.useState(
    customer.subscription?.accessUntil?.slice(0, 10) ?? "",
  );
  const [indefinite, setIndefinite] = React.useState(
    customer.subscription?.isIndefinite ?? false,
  );
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState<"subscription" | "role" | null>(null);

  const needsDate =
    !indefinite &&
    (status === "trialing" || status === "active" || status === "past_due");
  const canSubmit = reason.trim().length >= 10;

  function changePlan(value: string) {
    setPlanId(value);
    const plan = plans.find((item) => item.id === value);
    if (plan?.code === "free") {
      setIndefinite(false);
      setStatus("trialing");
      const end = new Date();
      end.setUTCDate(end.getUTCDate() + Math.max(1, plan.trialDays));
      setAccessUntil(end.toISOString().slice(0, 10));
    }
  }

  function changeStatus(value: SaasSubscriptionStatusDB) {
    setStatus(value);
    if (value !== "active") setIndefinite(false);
  }

  async function saveSubscription() {
    if (!planId || !canSubmit || (needsDate && !accessUntil)) return;
    setBusy("subscription");
    const result = await setUserSubscription({
      userId: customer.id,
      planId,
      status,
      accessUntil: accessUntil || null,
      indefinite,
      reason,
    });
    setBusy(null);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    toast.success("Suscripción actualizada");
    setReason("");
    onOpenChange(false);
    router.refresh();
  }

  async function toggleRole() {
    if (!canSubmit || isCurrentUser) return;
    const nextRole = customer.role === "admin" ? "user" : "admin";
    setBusy("role");
    const result = await setUserRole({
      userId: customer.id,
      role: nextRole,
      reason,
    });
    setBusy(null);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    toast.success(
      nextRole === "admin"
        ? "Administrador habilitado"
        : "Permisos administrativos retirados",
    );
    setReason("");
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Administrar cliente</SheetTitle>
          <SheetDescription>
            {customer.fullName ?? "Sin nombre"} · {customer.email}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5">
          <section aria-labelledby={`subscription-${customer.id}`}>
            <h3 id={`subscription-${customer.id}`} className="title-sub">
              Suscripción
            </h3>
            <div className="mt-3 space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor={`plan-${customer.id}`}>Plan</Label>
                <Select value={planId} onValueChange={changePlan}>
                  <SelectTrigger id={`plan-${customer.id}`}>
                    <SelectValue placeholder="Selecciona un plan" />
                  </SelectTrigger>
                  <SelectContent>
                    {plans.map((plan) => (
                      <SelectItem key={plan.id} value={plan.id}>
                        {plan.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor={`status-${customer.id}`}>Estado</Label>
                <Select
                  value={status}
                  onValueChange={(value) =>
                    changeStatus(value as SaasSubscriptionStatusDB)
                  }
                >
                  <SelectTrigger id={`status-${customer.id}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {status === "active" && (
                <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border bg-secondary px-4 py-3.5">
                  <input
                    type="checkbox"
                    checked={indefinite}
                    onChange={(event) => setIndefinite(event.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-[hsl(var(--primary))]"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">
                      Acceso indefinido
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">
                      Mantiene el plan activo hasta que un administrador lo cambie.
                    </span>
                  </span>
                </label>
              )}

              {needsDate && (
                <div className="space-y-1.5">
                  <Label htmlFor={`access-until-${customer.id}`}>
                    Acceso hasta <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id={`access-until-${customer.id}`}
                    type="date"
                    value={accessUntil}
                    onChange={(event) => setAccessUntil(event.target.value)}
                    required={needsDate}
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor={`reason-${customer.id}`}>Motivo del cambio</Label>
                <Input
                  id={`reason-${customer.id}`}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  minLength={10}
                  maxLength={500}
                  placeholder="Ej. Pago verificado manualmente"
                />
                <p className="text-[11px] text-muted-foreground">
                  Obligatorio. Quedará guardado en la auditoría.
                </p>
              </div>

              <Button
                className="w-full"
                onClick={saveSubscription}
                disabled={!planId || !canSubmit || (needsDate && !accessUntil) || busy !== null}
              >
                {busy === "subscription" && <Loader2 className="animate-spin" aria-hidden />}
                Guardar suscripción
              </Button>
            </div>
          </section>

          <section className="border-t border-border pt-5" aria-labelledby={`role-${customer.id}`}>
            <h3 id={`role-${customer.id}`} className="title-sub">
              Permisos del backoffice
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              El rol administra cuentas y suscripciones, pero nunca abre los datos financieros del cliente.
            </p>
            <Button
              variant={customer.role === "admin" ? "outline" : "secondary"}
              className="mt-3 w-full"
              onClick={toggleRole}
              disabled={!canSubmit || isCurrentUser || busy !== null}
            >
              {busy === "role" ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : customer.role === "admin" ? (
                <ShieldOff aria-hidden />
              ) : (
                <ShieldCheck aria-hidden />
              )}
              {isCurrentUser
                ? "Tu rol no se cambia aquí"
                : customer.role === "admin"
                  ? "Quitar administrador"
                  : "Hacer administrador"}
            </Button>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
