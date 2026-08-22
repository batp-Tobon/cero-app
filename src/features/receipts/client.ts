"use client";

import { createClient } from "@/infrastructure/supabase/client";
import {
  RECEIPT_BUCKET,
  RECEIPT_MAX_BYTES,
  type PendingReceipt,
} from "@/features/receipts/constants";
import { hasValidReceiptSignature } from "@/features/receipts/validation";

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

export type { PendingReceipt } from "@/features/receipts/constants";

/**
 * Sube directo al bucket privado para no hacer pasar hasta 6 MB por una
 * Server Action/Vercel. El servidor vuelve a descargar y validar la firma
 * antes de asociar la ruta a un movimiento.
 */
export async function uploadReceiptFromForm(
  form: HTMLFormElement,
  scope: "credits" | "cards",
  entityId: string,
): Promise<PendingReceipt | null> {
  const value = new FormData(form).get("receipt");
  if (!(value instanceof File) || value.size === 0) return null;

  const extension = EXTENSION_BY_MIME[value.type];
  if (!extension || value.size > RECEIPT_MAX_BYTES) {
    throw new Error("El comprobante debe ser JPG, PNG, WebP o PDF y pesar máximo 6 MB.");
  }

  const signature = new Uint8Array(await value.slice(0, 12).arrayBuffer());
  if (!hasValidReceiptSignature(value.type, signature)) {
    throw new Error("El contenido del comprobante no coincide con su tipo de archivo.");
  }

  const supabase = createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) throw new Error("Tu sesión expiró.");

  const path = `${auth.user.id}/${scope}/${entityId}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage
    .from(RECEIPT_BUCKET)
    .upload(path, value, { contentType: value.type, upsert: false });
  if (error) throw new Error("No pudimos subir el comprobante.");

  return { path, name: value.name.slice(0, 200) || `comprobante.${extension}` };
}

export async function discardPendingReceipt(
  receipt: PendingReceipt | null | undefined,
): Promise<void> {
  if (!receipt) return;
  await createClient().storage.from(RECEIPT_BUCKET).remove([receipt.path]);
}
