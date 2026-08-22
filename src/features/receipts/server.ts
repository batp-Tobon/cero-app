import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/shared/types/database";
import { RECEIPT_BUCKET, RECEIPT_MAX_BYTES } from "@/features/receipts/constants";
import { hasValidReceiptSignature } from "@/features/receipts/validation";
import type { PendingReceipt } from "@/features/receipts/constants";

const EXTENSION_BY_MIME = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["application/pdf", "pdf"],
]);

type DB = SupabaseClient<Database>;

export interface UploadedReceipt {
  receipt_path: string;
  receipt_name: string;
  receipt_mime: string;
  receipt_size: number;
}

/** Valida en servidor un archivo ya subido y devuelve metadatos confiables. */
export async function claimUploadedReceipt(
  db: DB,
  userId: string,
  scope: "credits" | "cards",
  entityId: string,
  pending: PendingReceipt | null | undefined,
): Promise<UploadedReceipt | null> {
  if (!pending) return null;

  const safePrefix = `${userId}/${scope}/${entityId}/`;
  const pathIsValid =
    pending.path.startsWith(safePrefix) &&
    /^[0-9a-f-]{36}\.(jpg|png|webp|pdf)$/.test(pending.path.slice(safePrefix.length));
  if (!pathIsValid || pending.name.length < 1 || pending.name.length > 200) {
    throw new Error("La ruta del comprobante no es válida.");
  }

  const { data: file, error } = await db.storage
    .from(RECEIPT_BUCKET)
    .download(pending.path);
  if (error || !file) throw new Error("No pudimos verificar el comprobante.");

  const extension = EXTENSION_BY_MIME.get(file.type);
  const expectedExtension = pending.path.split(".").pop();
  const signature = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (
    !extension ||
    extension !== expectedExtension ||
    file.size <= 0 ||
    file.size > RECEIPT_MAX_BYTES ||
    !hasValidReceiptSignature(file.type, signature)
  ) {
    await removeReceipt(db, pending.path);
    throw new Error("El comprobante no superó la validación de seguridad.");
  }

  return {
    receipt_path: pending.path,
    receipt_name: pending.name,
    receipt_mime: file.type,
    receipt_size: file.size,
  };
}

export async function removeReceipt(
  db: DB,
  path: string | null | undefined,
): Promise<void> {
  if (!path) return;
  await db.storage.from(RECEIPT_BUCKET).remove([path]);
}

/** URLs breves: suficientes para abrir el comprobante sin volverlo público. */
export async function signReceiptPaths(
  db: DB,
  paths: Array<string | null | undefined>,
): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter((path): path is string => Boolean(path)))];
  const signed = new Map<string, string>();

  await Promise.all(
    unique.map(async (path) => {
      const { data } = await db.storage
        .from(RECEIPT_BUCKET)
        .createSignedUrl(path, 10 * 60);
      if (data?.signedUrl) signed.set(path, data.signedUrl);
    }),
  );

  return signed;
}
