"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient, getCurrentUser } from "@/infrastructure/supabase/server";
import { isAvatarEmoji } from "@/features/profile/avatar-emojis";
import type { ActionResult } from "@/shared/types/domain";
import { publicActionError } from "@/shared/lib/server-errors";

/** Campo opcional: la cadena vacía se guarda como NULL, no como "". */
const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} no puede pasar de ${max} caracteres.`)
    .transform((value) => (value.length === 0 ? null : value))
    .nullable()
    .default(null);

const profileSchema = z.object({
  firstName: z.string().trim().min(1, "Escribe tus nombres.").max(60),
  lastName: optionalText(60, "Los apellidos"),
  profession: optionalText(80, "La profesión"),
  // Se admiten letras porque no todos los documentos son numéricos.
  nationalId: optionalText(20, "El documento").refine(
    (value) => value == null || /^[A-Za-z0-9.\-]+$/.test(value),
    "El documento sólo admite letras, números, puntos y guiones.",
  ),
  phone: optionalText(25, "El teléfono").refine(
    (value) => value == null || /^[+()\d\s-]{7,25}$/.test(value),
    "El teléfono no parece válido.",
  ),
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

  const value = parsed.data;
  // `full_name` sigue siendo el nombre para mostrar de toda la app: se deriva
  // aquí para que no haya dos fuentes de verdad que puedan discrepar.
  const fullName = [value.firstName, value.lastName]
    .filter((part): part is string => Boolean(part))
    .join(" ");

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: fullName,
      first_name: value.firstName,
      last_name: value.lastName,
      profession: value.profession,
      national_id: value.nationalId,
      phone: value.phone,
      currency: value.currency,
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

// ---------------------------------------------------------------------------
// Foto de perfil: emoji o imagen
// ---------------------------------------------------------------------------

const AVATAR_BUCKET = "avatars";
const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const AVATAR_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * Borra las imágenes que el usuario tuviera guardadas.
 *
 * Se llama antes de subir una nueva y al elegir emoji: dejar ficheros
 * huérfanos en el bucket consumiría cuota para siempre, porque una vez que la
 * URL sale del perfil nada vuelve a apuntar a ellos.
 */
async function clearStoredAvatars(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<void> {
  const { data } = await supabase.storage.from(AVATAR_BUCKET).list(userId);
  if (!data?.length) return;
  await supabase.storage
    .from(AVATAR_BUCKET)
    .remove(data.map((file) => `${userId}/${file.name}`));
}

/** Sube una foto de perfil y la deja como avatar activo. */
export async function updateAvatarImage(
  formData: FormData,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Tu sesión expiró." };

  const file = formData.get("avatar");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Elige una imagen." };
  }
  if (file.size > AVATAR_MAX_BYTES) {
    return { ok: false, error: "La imagen no puede pasar de 2 MB." };
  }
  const extension = AVATAR_TYPES[file.type];
  if (!extension) {
    return { ok: false, error: "Formato no admitido. Usa JPG, PNG o WebP." };
  }

  const supabase = await createClient();
  await clearStoredAvatars(supabase, user.id);

  // El nombre lo pone el servidor: el del fichero original viene del
  // dispositivo y no se usa para construir rutas.
  const path = `${user.id}/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) {
    return { ok: false, error: publicActionError("profile.avatar", uploadError) };
  }

  const { data: published } = supabase.storage
    .from(AVATAR_BUCKET)
    .getPublicUrl(path);

  const { error } = await supabase
    .from("profiles")
    .update({ avatar_url: published.publicUrl, avatar_emoji: null })
    .eq("id", user.id);
  if (error) {
    return { ok: false, error: publicActionError("profile.avatar", error) };
  }

  revalidatePath("/perfil");
  revalidatePath("/inicio");
  return { ok: true, data: undefined };
}

/** Deja un emoji como avatar y retira la imagen que hubiera. */
export async function updateAvatarEmoji(emoji: string): Promise<ActionResult> {
  if (!isAvatarEmoji(emoji)) {
    return { ok: false, error: "Ese emoji no está disponible." };
  }

  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Tu sesión expiró." };

  const supabase = await createClient();
  await clearStoredAvatars(supabase, user.id);

  const { error } = await supabase
    .from("profiles")
    .update({ avatar_emoji: emoji, avatar_url: null })
    .eq("id", user.id);
  if (error) {
    return { ok: false, error: publicActionError("profile.avatar", error) };
  }

  revalidatePath("/perfil");
  revalidatePath("/inicio");
  return { ok: true, data: undefined };
}

/** Vuelve a las iniciales. */
export async function removeAvatar(): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Tu sesión expiró." };

  const supabase = await createClient();
  await clearStoredAvatars(supabase, user.id);

  const { error } = await supabase
    .from("profiles")
    .update({ avatar_url: null, avatar_emoji: null })
    .eq("id", user.id);
  if (error) {
    return { ok: false, error: publicActionError("profile.avatar", error) };
  }

  revalidatePath("/perfil");
  revalidatePath("/inicio");
  return { ok: true, data: undefined };
}
