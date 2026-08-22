import "server-only";

import { getCurrentBillingEntitlement } from "@/features/billing/queries";
import type { ActionResult } from "@/shared/types/domain";

/** Barrera común para crear nuevos datos después de la prueba. */
export async function requireBillingWriteAccess(): Promise<ActionResult> {
  const entitlement = await getCurrentBillingEntitlement();
  if (!entitlement) return { ok: false, error: "Tu sesión expiró." };
  if (!entitlement.canWrite) {
    return {
      ok: false,
      error:
        "Tu prueba terminó. Tus datos siguen disponibles para consultar y exportar; activa CERO Pro para registrar nuevos movimientos.",
    };
  }
  return { ok: true, data: undefined };
}
