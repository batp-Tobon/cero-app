"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FileUp, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { removePaymentQr, replacePaymentQr } from "@/features/admin/actions";
import { Button } from "@/shared/ui/button";
import { InlineNotice } from "@/shared/components/states";

/**
 * QR oficial del banco para la pantalla de cobro.
 *
 * Sólo hace falta cuando la entidad entrega una imagen en vez de un link: si
 * hay link de pago configurado, CERO ya genera el QR y esto sobra.
 */
export function AdminPaymentQr({
  currentUrl,
  generatedFromLink,
}: {
  currentUrl: string | null;
  generatedFromLink: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [fileName, setFileName] = React.useState("");

  function upload(formData: FormData) {
    startTransition(async () => {
      const result = await replacePaymentQr(formData);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("QR actualizado");
      setFileName("");
      router.refresh();
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await removePaymentQr();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("QR retirado");
      router.refresh();
    });
  }

  return (
    <section aria-labelledby="admin-qr" className="mt-8">
      <h2 id="admin-qr" className="title-section">
        QR de cobro
      </h2>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        Sólo si tu banco entrega una imagen en vez de un link. Quien pueda
        cambiar este archivo redirige los cobros, así que la subida está
        limitada a administradores.
      </p>

      <div className="mt-3 rounded-3xl bg-card p-5">
        {generatedFromLink && !currentUrl && (
          <InlineNotice>
            Ya hay un link de pago configurado y CERO genera su QR
            automáticamente. Sube una imagen sólo si prefieres mostrar la del
            banco.
          </InlineNotice>
        )}

        {currentUrl && (
          <div className="mb-4 flex items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={currentUrl}
              alt="QR de cobro vigente"
              className="w-28 rounded-xl bg-[#F7F8F6] p-2"
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">QR vigente</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Es el que ven tus clientes al pagar.
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={remove}
                disabled={pending}
              >
                {pending ? (
                  <Loader2 className="animate-spin" aria-hidden />
                ) : (
                  <Trash2 aria-hidden />
                )}
                Retirar
              </Button>
            </div>
          </div>
        )}

        <form action={upload} className="space-y-3">
          <label
            htmlFor="admin-qr-file"
            className="flex min-h-20 cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-border bg-secondary/50 px-4 py-3 transition-colors hover:border-primary/50"
          >
            <FileUp className="h-5 w-5 shrink-0 text-primary" aria-hidden />
            <span className="min-w-0 text-sm">
              <span className="block truncate font-medium">
                {fileName || "Seleccionar PNG, JPG o WebP"}
              </span>
              <span className="block text-xs text-muted-foreground">
                Máximo 2 MB · reemplaza el anterior
              </span>
            </span>
          </label>
          <input
            id="admin-qr-file"
            name="qr"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            required
            disabled={pending}
            className="sr-only"
            onChange={(event) =>
              setFileName(event.target.files?.[0]?.name ?? "")
            }
          />

          <Button type="submit" className="w-full" disabled={pending || !fileName}>
            {pending && <Loader2 className="animate-spin" aria-hidden />}
            Subir QR
          </Button>
        </form>
      </div>
    </section>
  );
}
