"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Camera, ImageUp, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  removeAvatar,
  updateAvatarEmoji,
  updateAvatarImage,
} from "@/features/profile/actions";
import { AVATAR_EMOJIS } from "@/features/profile/avatar-emojis";
import { UserAvatar } from "@/shared/components/user-avatar";
import { Button } from "@/shared/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shared/ui/sheet";
import { InlineNotice } from "@/shared/components/states";
import { cn } from "@/shared/lib/utils";

/**
 * Foto de perfil: un emoji de la lista o una imagen del dispositivo.
 *
 * Las dos opciones se excluyen —guardar una retira la otra— porque un avatar
 * con dos fuentes obligaría a cada pantalla a decidir cuál gana, y acabarían
 * decidiendo distinto.
 */
export function AvatarPicker({
  name,
  avatarUrl,
  avatarEmoji,
}: {
  name: string | null;
  avatarUrl: string | null;
  avatarEmoji: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const fileInput = React.useRef<HTMLInputElement>(null);

  async function run(task: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    setPending(true);
    const result = await task();
    setPending(false);
    if (!result.ok) {
      setError(result.error ?? "No pudimos guardar el cambio.");
      return;
    }
    toast.success("Foto actualizada");
    setOpen(false);
    router.refresh();
  }

  function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Se limpia el input para que elegir el mismo fichero otra vez —tras un
    // error, por ejemplo— vuelva a disparar el evento.
    event.target.value = "";
    if (!file) return;
    const data = new FormData();
    data.append("avatar", file);
    void run(() => updateAvatarImage(data));
  }

  const hasAvatar = Boolean(avatarUrl || avatarEmoji);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Cambiar foto de perfil"
        className="group relative rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
      >
        <UserAvatar
          name={name}
          avatarUrl={avatarUrl}
          avatarEmoji={avatarEmoji}
          className="h-20 w-20"
        />
        <span className="absolute -bottom-0.5 -right-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground ring-4 ring-card transition-transform group-hover:scale-105">
          <Camera className="h-3.5 w-3.5" aria-hidden />
        </span>
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Foto de perfil</SheetTitle>
            <SheetDescription>
              Elige un emoji o sube una imagen de tu galería.
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-4">
            {error && <InlineNotice variant="danger">{error}</InlineNotice>}

            <div
              role="group"
              aria-label="Emojis disponibles"
              className="grid grid-cols-8 gap-1.5"
            >
              {AVATAR_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  aria-label={`Usar ${emoji}`}
                  aria-pressed={avatarEmoji === emoji}
                  disabled={pending}
                  onClick={() => void run(() => updateAvatarEmoji(emoji))}
                  className={cn(
                    "flex aspect-square items-center justify-center rounded-xl bg-secondary text-xl transition-colors hover:bg-accent disabled:opacity-50",
                    avatarEmoji === emoji && "ring-2 ring-primary",
                  )}
                >
                  {emoji}
                </button>
              ))}
            </div>

            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={onFile}
              disabled={pending}
            />

            <Button
              type="button"
              variant="secondary"
              className="w-full"
              disabled={pending}
              onClick={() => fileInput.current?.click()}
            >
              {pending ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : (
                <ImageUp aria-hidden />
              )}
              Subir una foto
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              JPG, PNG o WebP · máximo 2 MB
            </p>

            {hasAvatar && (
              <Button
                type="button"
                variant="ghost"
                className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
                disabled={pending}
                onClick={() => void run(removeAvatar)}
              >
                <Trash2 aria-hidden />
                Quitar y volver a las iniciales
              </Button>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
