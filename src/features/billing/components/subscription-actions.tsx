"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Copy,
  CreditCard,
  FileUp,
  Loader2,
  MessageCircle,
  Download,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import {
  createWompiCheckout,
  submitManualPayment,
} from "@/features/billing/actions";
import type { PaymentCodes } from "@/features/billing/payment-qr";
import { RECEIPT_ACCEPT } from "@/features/receipts/constants";
import { RECEIPT_MAX_BYTES } from "@/features/receipts/constants";
import { createClient } from "@/infrastructure/supabase/client";
import { InlineNotice } from "@/shared/components/states";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";

export function SubscriptionActions({
  userId,
  amountLabel,
  wompiEnabled,
  paymentKey,
  paymentLink,
  codes,
  supportWhatsapp,
  hasPendingManualPayment,
  processingReturn,
}: {
  userId: string;
  amountLabel: string;
  wompiEnabled: boolean;
  paymentKey: string;
  /** Link que abre el cobro por PSE. Vacío si no está configurado. */
  paymentLink: string;
  codes: PaymentCodes;
  supportWhatsapp: string;
  hasPendingManualPayment: boolean;
  processingReturn: boolean;
}) {
  const router = useRouter();
  const [paying, startPaying] = React.useTransition();
  const [submitting, startSubmitting] = React.useTransition();
  const [fileName, setFileName] = React.useState("");
  const [proofFile, setProofFile] = React.useState<File | null>(null);
  const [reference, setReference] = React.useState("");

  /**
   * Descarga el QR como SVG. Se arma en el navegador desde el mismo marcado
   * que ya se está mostrando, así que no hay una segunda fuente que pueda
   * quedar desalineada con lo que el usuario ve.
   */
  function downloadQr() {
    if (!codes.qrSvg) return;
    const blob = new Blob([codes.qrSvg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "cero-pago-qr.svg";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function payOnline() {
    startPaying(async () => {
      const result = await createWompiCheckout();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      window.location.assign(result.data.url);
    });
  }

  function sendProof(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startSubmitting(async () => {
      if (!proofFile) {
        toast.error("Adjunta el comprobante del pago.");
        return;
      }
      const extensionByMime: Record<string, string> = {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
        "application/pdf": "pdf",
      };
      const extension = extensionByMime[proofFile.type];
      if (!extension || proofFile.size <= 0 || proofFile.size > RECEIPT_MAX_BYTES) {
        toast.error("El comprobante debe ser JPG, PNG, WebP o PDF y pesar máximo 6 MB.");
        return;
      }

      const path = `${userId}/${crypto.randomUUID()}.${extension}`;
      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from("saas-payment-proofs")
        .upload(path, proofFile, { contentType: proofFile.type, upsert: false });
      if (uploadError) {
        toast.error("No pudimos subir el comprobante.");
        return;
      }

      const result = await submitManualPayment({
        reference,
        proofPath: path,
        proofName: proofFile.name.slice(0, 200),
      });
      if (!result.ok) {
        await supabase.storage.from("saas-payment-proofs").remove([path]);
        toast.error(result.error);
        return;
      }
      toast.success("Comprobante recibido. Lo revisaremos pronto.");
      setReference("");
      setProofFile(null);
      setFileName("");
      router.refresh();
    });
  }

  async function copyPaymentKey() {
    if (!paymentKey) return;
    try {
      await navigator.clipboard.writeText(paymentKey);
      toast.success("Llave copiada");
    } catch {
      toast.error("No pudimos copiar la llave.");
    }
  }

  const whatsappDigits = supportWhatsapp.replace(/\D/g, "");
  const whatsappUrl = whatsappDigits
    ? `https://wa.me/${whatsappDigits}?text=${encodeURIComponent(
        `Hola, hice el pago de CERO Pro por ${amountLabel} y envié mi comprobante.`,
      )}`
    : null;

  return (
    <div className="space-y-4">
      {processingReturn && (
        <InlineNotice variant="muted">
          Estamos confirmando el resultado con Wompi. La activación ocurre al
          recibir su notificación segura; puedes volver a esta pantalla en unos segundos.
        </InlineNotice>
      )}

      {/* Sin Wompi configurado la tarjeta no se muestra: un botón muerto que
          dice "por configurar" no le sirve a quien viene a pagar. */}
      {wompiEnabled && (
      <section aria-labelledby="online-payment" className="rounded-3xl bg-card p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
              <CreditCard className="h-4 w-4" aria-hidden />
            </span>
            <div>
              <h2 id="online-payment" className="title-sub">
                Pago en línea
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Tarjeta, PSE, Nequi o Bancolombia. Wompi confirma y activa el plan automáticamente.
              </p>
            </div>
          </div>
          <Button
            type="button"
            className="mt-4 w-full"
            onClick={payOnline}
            disabled={paying}
          >
            {paying ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : (
              <CreditCard aria-hidden />
            )}
            Pagar {amountLabel}
          </Button>
        </section>
      )}

      <section aria-labelledby="manual-payment" className="rounded-3xl bg-card p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="manual-payment" className="title-sub">
              Pago por Bre-B
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Transfiere {amountLabel} a la llave de abajo y adjunta el comprobante.
            </p>
          </div>
          <span className="rounded-full bg-warning/15 px-2.5 py-1 text-[10px] font-semibold text-warning">
            Manual
          </span>
        </div>

        {paymentLink && (
          <Button asChild className="mt-4 w-full">
            <a href={paymentLink} target="_blank" rel="noopener noreferrer">
              <ExternalLink aria-hidden />
              Pagar {amountLabel} por PSE
            </a>
          </Button>
        )}

        {codes.qrSvg && (
          <div className="mt-4 flex flex-col items-center gap-3 rounded-2xl bg-secondary p-4">
            <div
              className="w-40 overflow-hidden rounded-xl bg-[#F7F8F6] p-2 [&>svg]:h-auto [&>svg]:w-full"
              aria-hidden
              dangerouslySetInnerHTML={{ __html: codes.qrSvg }}
            />
            <p className="text-center text-xs leading-relaxed text-muted-foreground">
              {codes.qrPays
                ? "Escanéalo con tu banco y paga directamente."
                : "Al escanearlo obtienes la llave para pegarla en tu banco."}
            </p>
            <Button type="button" variant="ghost" size="sm" onClick={downloadQr}>
              <Download aria-hidden />
              Descargar QR
            </Button>
          </div>
        )}

        {codes.bankQrUrl && (
          <div className="mt-3 flex flex-col items-center gap-3 rounded-2xl bg-secondary p-4">
            <p className="eyebrow-sm">QR del banco</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={codes.bankQrUrl}
              alt="Código QR de cobro emitido por el banco"
              className="w-40 rounded-xl bg-[#F7F8F6] p-2"
            />
            <Button asChild variant="ghost" size="sm">
              <a href={codes.bankQrUrl} download="cero-pago-qr-banco.png">
                <Download aria-hidden />
                Descargar
              </a>
            </Button>
          </div>
        )}

        <div className="mt-4 flex items-center gap-2 rounded-2xl bg-secondary p-3">
          <div className="min-w-0 flex-1">
            <p className="eyebrow-sm">
              Llave Bre-B
            </p>
            <p className="mt-0.5 truncate text-sm font-semibold">
              {paymentKey || "Configúrala en Vercel"}
            </p>
          </div>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="Copiar llave Bre-B"
            onClick={copyPaymentKey}
            disabled={!paymentKey}
          >
            <Copy aria-hidden />
          </Button>
        </div>

        {hasPendingManualPayment ? (
          <div className="mt-4 flex items-start gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-4">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
            <div>
              <p className="text-sm font-semibold">Comprobante en revisión</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                Ya lo recibimos. El administrador puede aprobarlo desde el backoffice.
              </p>
            </div>
          </div>
        ) : (
          <form onSubmit={sendProof} className="mt-4 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="manual-reference">Referencia del pago</Label>
              <Input
                id="manual-reference"
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                maxLength={200}
                placeholder="Opcional"
                disabled={submitting}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="manual-proof">Comprobante</Label>
              <label
                htmlFor="manual-proof"
                className="flex min-h-24 cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-border bg-secondary/50 px-4 py-3 transition-colors hover:border-primary/50"
              >
                <FileUp className="h-5 w-5 shrink-0 text-primary" aria-hidden />
                <span className="min-w-0 text-sm">
                  <span className="block truncate font-medium">
                    {fileName || "Seleccionar JPG, PNG, WebP o PDF"}
                  </span>
                  <span className="block text-xs text-muted-foreground">Máximo 6 MB</span>
                </span>
              </label>
              <input
                id="manual-proof"
                type="file"
                accept={RECEIPT_ACCEPT}
                required
                disabled={submitting}
                className="sr-only"
                onChange={(event) => {
                  const selected = event.target.files?.[0] ?? null;
                  setProofFile(selected);
                  setFileName(selected?.name ?? "");
                }}
              />
            </div>

            <Button type="submit" variant="secondary" className="w-full" disabled={submitting}>
              {submitting && <Loader2 className="animate-spin" aria-hidden />}
              Enviar comprobante
            </Button>
          </form>
        )}

        {whatsappUrl && (
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <MessageCircle className="h-3.5 w-3.5" aria-hidden />
            Contactar por WhatsApp
          </a>
        )}
      </section>
    </div>
  );
}
