"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient, getCurrentUser } from "@/infrastructure/supabase/server";
import type { ActionResult } from "@/shared/types/domain";
import { publicActionError } from "@/shared/lib/server-errors";

const profileSchema = z.object({
  fullName: z.string().trim().min(1, "Escribe tu nombre.").max(80),
  currency: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{3}$/, "La moneda debe tener tres letras.")
    .transform((value) => value.toUpperCase()),
});

/** Actualiza los datos del perfil del usuario autenticado. */
export async function updateProfile(
  input: z.input<typeof profileSchema>,
): Promise<ActionResult> {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Tu sesión expiró." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: parsed.data.fullName,
      currency: parsed.data.currency,
    })
    .eq("id", user.id);

  if (error) return { ok: false, error: publicActionError("profile.update", error) };

  revalidatePath("/perfil");
  revalidatePath("/inicio");
  return { ok: true, data: undefined };
}

const notificationSchema = z.object({
  notifyUpcoming: z.boolean(),
  notifyOverdue: z.boolean(),
  notifyPayments: z.boolean(),
});

/**
 * Guarda las preferencias de aviso. Hoy sólo alimentan la app; la tabla
 * `notifications` deja la puerta abierta a un envío push más adelante.
 */
export async function updateNotificationPreferences(
  input: z.input<typeof notificationSchema>,
): Promise<ActionResult> {
  const parsed = notificationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Preferencias no válidas." };

  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Tu sesión expiró." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      notify_upcoming: parsed.data.notifyUpcoming,
      notify_overdue: parsed.data.notifyOverdue,
      notify_payments: parsed.data.notifyPayments,
    })
    .eq("id", user.id);

  if (error) {
    return { ok: false, error: publicActionError("profile.notifications", error) };
  }

  revalidatePath("/perfil");
  return { ok: true, data: undefined };
}

/** Cierra la sesión de verdad: invalida el token y limpia las cookies. */
export async function signOut(): Promise<never> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
