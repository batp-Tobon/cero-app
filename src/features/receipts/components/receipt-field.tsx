import { FileCheck2, Paperclip } from "lucide-react";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { RECEIPT_ACCEPT } from "@/features/receipts/constants";

export function ReceiptField({
  id,
  disabled,
  existingName,
}: {
  id: string;
  disabled?: boolean;
  existingName?: string | null;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="flex items-center gap-2">
        <Paperclip className="h-4 w-4 text-primary" aria-hidden />
        Comprobante (opcional)
      </Label>
      {existingName && (
        <p className="flex items-center gap-1.5 text-xs text-primary">
          <FileCheck2 className="h-3.5 w-3.5" aria-hidden />
          Guardado: {existingName}
        </p>
      )}
      <Input
        id={id}
        name="receipt"
        type="file"
        accept={RECEIPT_ACCEPT}
        disabled={disabled}
        className="file:mr-3 file:rounded-full file:border-0 file:bg-primary/10 file:px-3 file:py-1 file:text-xs file:font-semibold file:text-primary"
      />
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Foto o PDF, máximo 6 MB. Se guarda privado y sólo lo ven quienes tienen
        acceso al producto.
      </p>
    </div>
  );
}
