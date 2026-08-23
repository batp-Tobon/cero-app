import "server-only";

const wompiPublicKey = process.env.NEXT_PUBLIC_WOMPI_PUBLIC_KEY?.trim() ?? "";
const wompiIntegritySecret = process.env.WOMPI_INTEGRITY_SECRET?.trim() ?? "";
const wompiEventsSecret = process.env.WOMPI_EVENTS_SECRET?.trim() ?? "";

export const billingConfig = {
  wompiPublicKey,
  wompiIntegritySecret,
  wompiEventsSecret,
  paymentKey: process.env.NEXT_PUBLIC_PAYMENT_KEY?.trim() ?? "",
  /**
   * Link de cobro del banco (RappiPay PSE, Nequi, etc.). Es lo único de esta
   * lista que abre un pago de verdad; la llave sólo identifica la cuenta.
   * Ojo: estos links caducan. Si deja de funcionar, se renueva aquí.
   */
  paymentLink: process.env.NEXT_PUBLIC_PAYMENT_LINK?.trim() ?? "",
  supportWhatsapp: process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP?.trim() ?? "",
};

export function isWompiCheckoutConfigured(): boolean {
  const environment = expectedWompiEnvironment();
  return Boolean(
    environment &&
      wompiIntegritySecret.startsWith(`${environment}_integrity_`),
  );
}

export function isWompiWebhookConfigured(): boolean {
  const environment = expectedWompiEnvironment();
  return Boolean(
    environment && wompiEventsSecret.startsWith(`${environment}_events_`),
  );
}

export function expectedWompiEnvironment(): "prod" | "test" | null {
  if (wompiPublicKey.startsWith("pub_prod_")) return "prod";
  if (wompiPublicKey.startsWith("pub_test_")) return "test";
  return null;
}
