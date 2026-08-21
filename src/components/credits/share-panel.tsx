"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, UserMinus, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { InlineNotice } from "@/components/common/states";
import { shareCredit, unshareCredit } from "@/server/actions/members";
import { initials } from "@/lib/utils";
import type { CreditMember } from "@/server/actions/members";

/**
 * Con quién se comparte el crédito.
 *
 * Compartir da acceso completo al crédito: ver el plan y registrar pagos.
 * Eliminar el crédito sigue siendo cosa del dueño.
 */
export function SharePanel({
  creditId,
  members: initialMembers,
  isOwner,
}: {
  creditId: string;
  members: CreditMember[];
  isOwner: boolean;
}) {
  const router = useRouter();
  const [members, setMembers] = React.useState(initialMembers);
  const [email, setEmail] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [removing, setRemoving] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => setMembers(initialMembers), [initialMembers]);

  async function onShare(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);

    const result = await shareCredit({ creditId, email });
    setPending(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setMembers((current) => [...current, result.data]);
    setEmail("");
    toast.success(`Compartido con ${result.data.fullName ?? result.data.email}`);
    router.refresh();
  }

  async function onRemove(member: CreditMember) {
    setError(null);
    setRemoving(member.userId);
    const result = await unshareCredit(creditId, member.userId);
    setRemoving(null);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setMembers((current) =>
      current.filter((m) => m.userId !== member.userId),
    );
    toast.success("Acceso retirado");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {error && <InlineNotice variant="danger">{error}</InlineNotice>}

      <ul className="space-y-2">
        {members.map((member) => (
          <li
            key={member.userId}
            className="flex items-center gap-3 rounded-2xl bg-secondary p-3"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-card text-xs font-semibold text-muted-foreground">
              {initials(member.fullName ?? member.email)}
            </span>

            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="truncate text-sm font-medium">
                  {member.fullName ?? member.email ?? "Sin nombre"}
                </span>
                {member.role === "owner" && <Badge>Dueño</Badge>}
                {member.isYou && <Badge variant="success">Tú</Badge>}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {member.email}
              </span>
            </span>

            {isOwner && member.role !== "owner" && (
              <button
                type="button"
                onClick={() => onRemove(member)}
                disabled={removing === member.userId}
                aria-label={`Quitar acceso a ${member.fullName ?? member.email}`}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
              >
                {removing === member.userId ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <UserMinus className="h-4 w-4" aria-hidden />
                )}
              </button>
            )}
          </li>
        ))}
      </ul>

      {isOwner ? (
        <form onSubmit={onShare} className="space-y-2">
          <Label htmlFor="share-email">Compartir con</Label>
          <div className="flex gap-2">
            <Input
              id="share-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="correo@ejemplo.com"
              autoCapitalize="none"
              spellCheck={false}
              required
              disabled={pending}
            />
            <Button
              type="submit"
              size="icon"
              className="h-12 w-12 shrink-0"
              disabled={pending || !email}
              aria-label="Compartir crédito"
            >
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <UserPlus className="h-4 w-4" aria-hidden />
              )}
            </Button>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Quien reciba el acceso podrá ver el plan y registrar pagos. Debe
            tener cuenta en CERO.
          </p>
        </form>
      ) : (
        <p className="text-xs leading-relaxed text-muted-foreground">
          Este crédito lo comparte contigo su dueño. Puedes ver el plan y
          registrar pagos.
        </p>
      )}
    </div>
  );
}
