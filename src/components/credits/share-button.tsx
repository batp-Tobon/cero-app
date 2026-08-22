"use client";

import * as React from "react";
import { Share2, Users } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { SharePanel } from "@/components/credits/share-panel";
import type { CreditMember } from "@/server/actions/members";

/**
 * Acceso directo a compartir, en vez de esconderlo dentro de los ajustes.
 *
 * Cuando ya está compartido el propio botón dice con quién: la respuesta a
 * "¿mi pareja ve esto?" está a la vista, sin abrir nada.
 */
export function ShareButton({
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

  const label =
    others.length === 0
      ? "Compartir crédito"
      : others.length === 1
        ? `Compartido con ${others[0].fullName ?? others[0].email}`
        : `Compartido con ${others.length} personas`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mx-auto mt-4 flex items-center gap-2 rounded-full bg-secondary px-4 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        {others.length === 0 ? (
          <Share2 className="h-3.5 w-3.5" aria-hidden />
        ) : (
          <Users className="h-3.5 w-3.5 text-primary" aria-hidden />
        )}
        {label}
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

          <SharePanel
            creditId={creditId}
            members={members}
            isOwner={isOwner}
          />
        </SheetContent>
      </Sheet>
    </>
  );
}
