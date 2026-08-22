import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/shared/types/database";
import {
  RECEIPT_BUCKET,
  RECEIPT_MAX_BYTES,
} from "@/features/receipts/constants";
import { hasValidReceiptSignature } from "@/features/receipts/validation";

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

/**
 * Guarda un comprobante en un bucket privado. El nombre físico nunca reutiliza
 * el nombre suministrado por el navegador y no se usa upsert, evitando tanto
 * colisiones como permisos de actualización innecesarios.
 */
export async function uploadReceipt(
  db: DB,
  userId: string,
  scope: "credits" | "cards",
  entityId: string,
  file: File | null | undefined,
): Promise<UploadedReceipt | null> {
  if (!file || file.size === 0) return null;

  const extension = EXTENSION_BY_MIME.get(file.type);
  if (!extension) {
    throw new Error("El comprobante debe ser JPG, PNG, WebP o PDF.");
  }
  if (file.size > RECEIPT_MAX_BYTES) {
    throw new Error("El comprobante no puede superar 6 MB.");
  }
  const signature = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (!hasValidReceiptSignature(file.type, signature)) {
    throw new Error("El contenido del comprobante no coincide con su tipo de archivo.");
  }

  const path = `${userId}/${scope}/${entityId}/${crypto.randomUUID()}.${extension}`;
  const { error } = await db.storage.from(RECEIPT_BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) throw new Error(`No pudimos subir el comprobante: ${error.message}`);

  return {
    receipt_path: path,
    receipt_name: file.name.slice(0, 200) || `comprobante.${extension}`,
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
