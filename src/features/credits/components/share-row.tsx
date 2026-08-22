"use client";

import * as React from "react";
import { Share2, Users } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shared/ui/sheet";
import { SharePanel } from "@/features/credits/components/share-panel";
import { initials } from "@/shared/lib/utils";
import type { CreditMember } from "@/features/credits/members";

/**
 * Fila de compartir al pie de cada crédito. Cuando ya está compartido muestra
 * las iniciales de quién más lo ve, así que la lista responde de un vistazo
 * qué es de los dos y qué es sólo tuyo.
 */
export function ShareRow({
  creditId,
  creditName,
  members,
  isOwner,
}: {
  creditId: string;
  creditName: string;
  members: CreditMember[];
  isOwner: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const others = members.filter((m) => !m.isYou);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2 rounded-2xl px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        {others.length === 0 ? (
          <>
            <Share2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>Compartir</span>
          </>
        ) : (
          <>
            <Users className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
            <span className="truncate">
              Compartido con{" "}
              {others.map((m) => m.fullName ?? m.email).join(", ")}
            </span>
            <span className="ml-auto flex shrink-0 -space-x-1.5">
              {others.slice(0, 3).map((m) => (
                <span
                  key={m.userId}
                  className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-[9px] font-semibold text-primary ring-2 ring-card"
                >
                  {initials(m.fullName ?? m.email)}
                </span>
              ))}
            </span>
          </>
        )}
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Compartir crédito</SheetTitle>
            <SheetDescription>
              {creditName} · quien reciba el acceso verá el plan y podrá
              registrar pagos
            </SheetDescription>
          </SheetHeader>

          <SharePanel creditId={creditId} members={members} isOwner={isOwner} />
        </SheetContent>
      </Sheet>
    </>
  );
}
