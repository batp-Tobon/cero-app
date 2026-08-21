"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  createClient,
  getCurrentProfile,
  getCurrentUser,
} from "@/infrastructure/supabase/server";
import { loadCredit, rebuildCreditSchedule } from "@/server/services/schedule";
import type { ActionResult } from "@/types/domain";

const roleSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["user", "admin"]),
});

/**
 * Cambia el rol de un usuario.
 *
 * La comprobación de verdad está en Postgres: el trigger `guard_role_change`
 * rechaza el cambio si quien lo pide no es admin, incluso llamando a la API
 * por fuera de la aplicación. Aquí sólo se traduce el fallo a algo legible.
 */
export async function setUserRole(
  input: z.input<typeof roleSchema>,
): Promise<ActionResult> {
  const parsed = roleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Datos no válidos." };
  const { userId, role } = parsed.data;

  const me = await getCurrentProfile();
  if (!me) return { ok: false, error: "Tu sesión expiró." };
  if (me.role !== "admin") {
    return { ok: false, error: "Necesitas permisos de administrador." };
  }

  const supabase = await createClient();

  // Quedarse sin administradores dejaría el backoffice inaccesible para todos.
  if (role === "user") {
    const { count } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin");

    if ((count ?? 0) <= 1) {
      return {
        ok: false,
        error: "No puedes quitar el último administrador que queda.",
      };
    }
  }

  const { error } = await supabase
    .from("profiles")
    .update({ role })
    .eq("id", userId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin");
  return { ok: true, data: undefined };
}

/**
 * Vuelve a derivar el plan de pagos de un crédito desde su historial.
 *
 * Es la herramienta de reparación del backoffice: sirve tras cargar
 * movimientos por fuera de la aplicación, o si alguna escritura quedó a medias
 * y el plan dejó de cuadrar con los pagos.
 */
export async function rebuildCreditPlan(
  creditId: string,
): Promise<ActionResult<{ balance: number; installmentsLeft: number }>> {
  const me = await getCurrentProfile();
  if (!me) return { ok: false, error: "Tu sesión expiró." };

  const user = await getCurrentUser();
  const supabase = await createClient();

  try {
    const credit = await loadCredit(supabase, creditId);
    if (!credit) return { ok: false, error: "No encontramos ese crédito." };

    // Un admin puede reparar cualquier crédito; el resto, sólo el suyo.
    if (me.role !== "admin" && credit.owner_id !== user?.id) {
      return { ok: false, error: "No puedes reconstruir ese crédito." };
    }

    const result = await rebuildCreditSchedule(supabase, credit);

    revalidatePath("/admin");
    revalidatePath(`/creditos/${creditId}`);
    revalidatePath("/creditos");
    revalidatePath("/inicio");

    return {
      ok: true,
      data: {
        balance: result.balance,
        installmentsLeft: result.installmentsLeft,
      },
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "No pudimos reconstruir el plan.",
    };
  }
}
