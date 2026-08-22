"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw, ShieldCheck, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import { rebuildCreditPlan, setUserRole } from "@/features/admin/actions";
import { formatMoney } from "@/shared/lib/format";
import { formatShortDate } from "@/shared/lib/dates";
import { initials } from "@/shared/lib/utils";
import type { AdminUser } from "@/features/admin/queries";
import type { CreditSummaryRow } from "@/shared/types/database";

export function AdminUsers({
  users,
  currentUserId,
}: {
  users: AdminUser[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);

  async function toggleRole(user: AdminUser) {
    const next = user.role === "admin" ? "user" : "admin";
    setBusy(user.id);
    const result = await setUserRole({ userId: user.id, role: next });
    setBusy(null);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(
      next === "admin"
        ? `${user.fullName ?? user.email} ahora es administrador`
        : `${user.fullName ?? user.email} vuelve a ser usuario`,
    );
    router.refresh();
  }

  return (
    <ul className="mt-3 space-y-2">
      {users.map((user) => (
        <li key={user.id} className="rounded-2xl bg-card p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-muted-foreground">
              {initials(user.fullName ?? user.email)}
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-semibold">
                  {user.fullName ?? "Sin nombre"}
                </p>
                {user.role === "admin" && (
                  <Badge variant="success">Admin</Badge>
                )}
                {user.id === currentUserId && <Badge>Tú</Badge>}
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {user.email}
              </p>
              <p className="tabular mt-1.5 text-xs text-muted-foreground">
                {user.ownedCredits}{" "}
                {user.ownedCredits === 1 ? "crédito" : "créditos"} ·{" "}
                {formatMoney(user.activeDebt)} pendiente
              </p>
            </div>
          </div>

          <Button
            variant={user.role === "admin" ? "outline" : "secondary"}
            size="sm"
            className="mt-3 w-full"
            onClick={() => toggleRole(user)}
            disabled={busy === user.id}
          >
            {busy === user.id ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : user.role === "admin" ? (
              <ShieldOff className="h-4 w-4" aria-hidden />
            ) : (
              <ShieldCheck className="h-4 w-4" aria-hidden />
            )}
            {user.role === "admin" ? "Quitar administrador" : "Hacer administrador"}
          </Button>
        </li>
      ))}
    </ul>
  );
}

type AdminCredit = CreditSummaryRow & {
  ownerName: string | null;
  ownerEmail: string | null;
};

export function AdminCredits({ credits }: { credits: AdminCredit[] }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);

  async function rebuild(credit: AdminCredit) {
    setBusy(credit.id);
    const result = await rebuildCreditPlan(credit.id);
    setBusy(null);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Plan reconstruido", {
      description: `${credit.name}: ${formatMoney(
        result.data.balance,
        credit.currency,
      )} en ${result.data.installmentsLeft} cuotas.`,
    });
    router.refresh();
  }

  if (credits.length === 0) {
    return (
      <p className="mt-3 rounded-2xl bg-card p-5 text-sm text-muted-foreground">
        Todavía no hay créditos registrados.
      </p>
    );
  }

  return (
    <ul className="mt-3 space-y-2">
      {credits.map((credit) => (
        <li key={credit.id} className="rounded-2xl bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <Link
                href={`/creditos/${credit.id}`}
                className="block truncate text-sm font-semibold hover:underline"
              >
                {credit.name}
              </Link>
              <p className="truncate text-xs text-muted-foreground">
                {credit.ownerName ?? credit.ownerEmail ?? "—"}
              </p>
              <p className="tabular mt-1.5 text-xs text-muted-foreground">
                {formatMoney(credit.balance, credit.currency)} ·{" "}
                {credit.paid_installments}/{credit.total_installments} cuotas
                {credit.next_due_date &&
                  ` · vence ${formatShortDate(credit.next_due_date)}`}
              </p>
            </div>
            {credit.status !== "active" && (
              <Badge variant={credit.status === "paid" ? "success" : "outline"}>
                {credit.status === "paid" ? "Pagado" : "Cancelado"}
              </Badge>
            )}
          </div>

          <Button
            variant="ghost"
            size="sm"
            className="mt-2 w-full"
            onClick={() => rebuild(credit)}
            disabled={busy === credit.id}
          >
            {busy === credit.id ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="h-4 w-4" aria-hidden />
            )}
            Reconstruir plan de pagos
          </Button>
        </li>
      ))}
    </ul>
  );
}
