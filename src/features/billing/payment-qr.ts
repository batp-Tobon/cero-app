import "server-only";

import QRCode from "qrcode";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/shared/types/database";

/**
 * Los códigos de cobro de la pantalla de suscripción.
 *
 * Hay tres cosas distintas y conviene no confundirlas, porque prometer que un
 * código cobra cuando sólo copia texto deja al usuario esperando un pago que
 * nunca llega:
 *
 *  1. LINK DE PAGO (RappiPay PSE, Wompi, etc.) — una URL que abre el flujo del
 *     banco. Es lo único que cobra de verdad. Su QR es esa misma URL, así que
 *     CERO lo genera: no hay que subir ninguna imagen.
 *
 *  2. QR OFICIAL DEL BANCO (Nequi «Mi QR», Bancolombia) — para entidades que
 *     entregan una imagen y no una URL. Ése sí se sube, porque su contenido lo
 *     define el banco y no se puede fabricar desde fuera.
 *
 *  3. LLAVE Bre-B — un alias, no un cobro. Su QR sólo ahorra teclear.
 */

export const PAYMENT_QR_BUCKET = "payment-qr";

const QR_OPTIONS = {
  type: "svg",
  errorCorrectionLevel: "M",
  margin: 1,
  // El QR se lee igual en cualquier color siempre que haya contraste; estos
  // son los de la app para que no rompa la pantalla oscura.
  color: { dark: "#0B1720", light: "#F7F8F6" },
} as const;

export interface PaymentCodes {
  /** SVG del QR que se muestra, o `null` si no hay nada que codificar. */
  qrSvg: string | null;
  /** `true` sólo cuando escanearlo abre un cobro real. */
  qrPays: boolean;
  /** URL firmada del QR que subió el administrador, si existe. */
  bankQrUrl: string | null;
}

/**
 * Decide qué código enseñar, en orden de utilidad para quien va a pagar:
 * el link si lo hay, y si no la llave.
 */
export async function getPaymentCodes(
  supabase: SupabaseClient<Database>,
  input: { paymentLink: string; paymentKey: string },
): Promise<PaymentCodes> {
  const link = input.paymentLink.trim();
  const key = input.paymentKey.trim();
  const contenido = link || key;

  const [qrSvg, bankQrUrl] = await Promise.all([
    contenido ? QRCode.toString(contenido, QR_OPTIONS) : Promise.resolve(null),
    getBankQrUrl(supabase),
  ]);

  return { qrSvg, qrPays: Boolean(link), bankQrUrl };
}

/**
 * URL firmada del QR oficial que subió el administrador.
 *
 * El archivo más reciente del bucket es el vigente: cambiar el QR es subir uno
 * nuevo, sin tabla de ajustes ni ruta con nombre fijo que obligue a conocer la
 * extensión de antemano.
 */
export async function getBankQrUrl(
  supabase: SupabaseClient<Database>,
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(PAYMENT_QR_BUCKET)
    .list("", { limit: 1, sortBy: { column: "created_at", order: "desc" } });

  if (error || !data?.length) return null;

  const { data: signed } = await supabase.storage
    .from(PAYMENT_QR_BUCKET)
    .createSignedUrl(data[0].name, 10 * 60);

  return signed?.signedUrl ?? null;
}
