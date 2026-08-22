"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, ExternalLink, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { reviewSaasPayment } from "@/features/admin/actions";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";

export function AdminPaymentReview({
  paymentId,
  proofUrl,
  submittedReference,
}: {
  paymentId: string;
  proofUrl: string | null;
  submittedReference: string | null;
}) {
  const router = useRouter();
  const [reason, setReason] = React.useState("");
  const [pending, startTransition] = React.useTransition();

  function review(approve: boolean) {
    startTransition(async () => {
      const result = await reviewSaasPayment({ paymentId, approve, reason });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(approve ? "Pago aprobado y plan activado" : "Pago rechazado");
      router.refresh();
    });
  }

  return (
    <div className="mt-3 space-y-2 rounded-2xl bg-secondary/60 p-3">
      {(proofUrl || submittedReference) && (
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="min-w-0 truncate text-muted-foreground">
            {submittedReference ? `Ref. ${submittedReference}` : "Sin referencia"}
          </span>
          {proofUrl && (
            <a
              href={proofUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex shrink-0 items-center gap-1 font-semibold text-primary"
            >
              Ver comprobante
              <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
          )}
        </div>
      )}
      <Input
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Motivo de revisión (mín. 10 caracteres)"
        minLength={10}
        maxLength={500}
        disabled={pending}
        aria-label="Motivo de la revisión"
        className="h-10 text-sm"
      />
      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending || reason.trim().length < 10}
          onClick={() => review(false)}
        >
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <X aria-hidden />}
          Rechazar
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={pending || reason.trim().length < 10}
          onClick={() => review(true)}
        >
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />}
          Aprobar
        </Button>
      </div>
    </div>
  );
}
