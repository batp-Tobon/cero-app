"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  createClient,
  getCurrentProfile,
} from "@/infrastructure/supabase/server";
import { PAYMENT_QR_BUCKET } from "@/features/billing/payment-qr";
import type { ActionResult } from "@/shared/types/domain";

const reason = z
  .string()
  .trim()
  .min(10, "Escribe un motivo de al menos 10 caracteres.")
  .max(500, "El motivo es demasiado largo.");

const roleSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["user", "admin"]),
  reason,
});

const subscriptionSchema = z
  .object({
    userId: z.string().uuid(),
    planId: z.string().uuid(),
    status: z.enum(["trialing", "active", "past_due", "canceled", "expired"]),
    accessUntil: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable(),
    indefinite: z.boolean(),
    reason,
  })
  .superRefine((value, context) => {
    if (value.indefinite && value.status !== "active") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["indefinite"],
        message: "El acceso indefinido necesita una suscripción activa.",
      });
    }
    const needsDate = ["trialing", "active", "past_due"].includes(value.status);
    if (needsDate && !value.indefinite && !value.accessUntil) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["accessUntil"],
        message: "Selecciona una fecha de finalización.",
      });
    }
  });

const planSchema = z.object({
  planId: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).nullable(),
  trialDays: z.number().int().min(0).max(90),
  isPublic: z.boolean(),
  aiInsights: z.boolean(),
  monthlyPrice: z.number().min(0).max(999_999_999_999.99),
  reason,
});

const paymentReviewSchema = z.object({
  paymentId: z.string().uuid(),
  approve: z.boolean(),
  reason,
});

async function requireAdmin(): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: "Tu sesión expiró." };
  if (profile.role !== "admin") {
    return { ok: false, error: "Necesitas permisos de administrador." };
  }
  return { ok: true, data: undefined };
}

function readableAdminError(message: string): string {
  if (message.includes("last administrator")) {
    return "No puedes quitar el último administrador.";
  }
  if (message.includes("future trial")) {
    return "La prueba necesita una fecha de finalización futura.";
  }
  if (message.includes("future subscription")) {
    return "La suscripción necesita una fecha de finalización futura.";
  }
  if (message.includes("future grace")) {
    return "El periodo de gracia necesita una fecha futura.";
  }
  if (message.includes("Indefinite access requires")) {
    return "El acceso indefinido sólo puede asignarse a una suscripción activa.";
  }
  if (message.includes("Active plan not found")) {
    return "Ese plan ya no está disponible.";
  }
  if (message.includes("already reviewed")) {
    return "Ese pago ya fue revisado.";
  }
  return "No pudimos completar el cambio. Inténtalo nuevamente.";
}

export async function reviewSaasPayment(
  input: z.input<typeof paymentReviewSchema>,
): Promise<ActionResult> {
  const parsed = paymentReviewSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos no válidos." };
  }

  const allowed = await requireAdmin();
  if (!allowed.ok) return allowed;

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_review_saas_payment", {
    p_payment_id: parsed.data.paymentId,
    p_approve: parsed.data.approve,
    p_reason: parsed.data.reason,
  });
  if (error) return { ok: false, error: readableAdminError(error.message) };

  revalidatePath("/admin");
  revalidatePath("/suscripcion");
  revalidatePath("/inicio");
  return { ok: true, data: undefined };
}

export async function setUserRole(
  input: z.input<typeof roleSchema>,
): Promise<ActionResult> {
  const parsed = roleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos no válidos." };
  }

  const allowed = await requireAdmin();
  if (!allowed.ok) return allowed;

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_user_role", {
    p_user_id: parsed.data.userId,
    p_role: parsed.data.role,
    p_reason: parsed.data.reason,
  });

  if (error) return { ok: false, error: readableAdminError(error.message) };

  revalidatePath("/admin");
  return { ok: true, data: undefined };
}

export async function setUserSubscription(
  input: z.input<typeof subscriptionSchema>,
): Promise<ActionResult<{ subscriptionId: string }>> {
  const parsed = subscriptionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos no válidos." };
  }

  const allowed = await requireAdmin();
  if (!allowed.ok) return allowed;

  const accessUntil = parsed.data.accessUntil
    ? `${parsed.data.accessUntil}T23:59:59.999Z`
    : null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_set_subscription_v2", {
    p_user_id: parsed.data.userId,
    p_plan_id: parsed.data.planId,
    p_status: parsed.data.status,
    p_access_until: accessUntil,
    p_indefinite: parsed.data.indefinite,
    p_reason: parsed.data.reason,
  });

  if (error) return { ok: false, error: readableAdminError(error.message) };

  revalidatePath("/admin");
  return { ok: true, data: { subscriptionId: data } };
}

export async function updatePlanSettings(
  input: z.input<typeof planSchema>,
): Promise<ActionResult> {
  const parsed = planSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Datos no válidos.",
    };
  }

  const allowed = await requireAdmin();
  if (!allowed.ok) return allowed;

  const value = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_update_plan", {
    p_plan_id: value.planId,
    p_name: value.name,
    p_description: value.description,
    p_trial_days: value.trialDays,
    p_is_public: value.isPublic,
    p_ai_insights: value.aiInsights,
    p_monthly_price: value.monthlyPrice,
    p_reason: value.reason,
  });

  if (error) return { ok: false, error: readableAdminError(error.message) };

  revalidatePath("/admin");
  // /suscripcion es la pantalla donde el cliente ve el precio: omitirla dejaba
  // el importe viejo en la caché del router tras un cambio de tarifa.
  revalidatePath("/suscripcion");
  revalidatePath("/inicio");
  revalidatePath("/ia");
  return { ok: true, data: undefined };
}


// ---------------------------------------------------------------------------
// QR de cobro del comercio
// ---------------------------------------------------------------------------

const QR_MAX_BYTES = 2 * 1024 * 1024;
const QR_TYPES = ["image/png", "image/jpeg", "image/webp"];

/**
 * Reemplaza el QR oficial del banco que se muestra en la pantalla de cobro.
 *
 * Se borra lo anterior antes de subir: si quedaran dos, el usuario podría ver
 * el viejo y pagar a una cuenta que ya no es la del negocio. Con un solo
 * archivo en el bucket no hay ambigüedad posible.
 *
 * Las políticas de Storage vuelven a exigir rol admin, así que esta
 * comprobación es sólo el mensaje amable.
 */
export async function replacePaymentQr(
  formData: FormData,
): Promise<ActionResult> {
  const me = await getCurrentProfile();
  if (!me) return { ok: false, error: "Tu sesión expiró." };
  if (me.role !== "admin") {
    return { ok: false, error: "Necesitas permisos de administrador." };
  }

  const file = formData.get("qr");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Elige la imagen del QR." };
  }
  if (file.size > QR_MAX_BYTES) {
    return { ok: false, error: "La imagen supera los 2 MB." };
  }
  if (!QR_TYPES.includes(file.type)) {
    return { ok: false, error: "Sube una imagen PNG, JPG o WebP." };
  }

  const supabase = await createClient();

  const { data: existing } = await supabase.storage
    .from(PAYMENT_QR_BUCKET)
    .list("", { limit: 100 });
  if (existing?.length) {
    await supabase.storage
      .from(PAYMENT_QR_BUCKET)
      .remove(existing.map((item) => item.name));
  }

  const extension = file.type.split("/")[1].replace("jpeg", "jpg");
  const { error } = await supabase.storage
    .from(PAYMENT_QR_BUCKET)
    .upload(`qr-${Date.now()}.${extension}`, file, {
      contentType: file.type,
      upsert: false,
    });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin");
  revalidatePath("/suscripcion");
  return { ok: true, data: undefined };
}

/** Retira el QR oficial; la pantalla vuelve a mostrar sólo la llave. */
export async function removePaymentQr(): Promise<ActionResult> {
  const me = await getCurrentProfile();
  if (!me) return { ok: false, error: "Tu sesión expiró." };
  if (me.role !== "admin") {
    return { ok: false, error: "Necesitas permisos de administrador." };
  }

  const supabase = await createClient();
  const { data: existing } = await supabase.storage
    .from(PAYMENT_QR_BUCKET)
    .list("", { limit: 100 });

  if (existing?.length) {
    const { error } = await supabase.storage
      .from(PAYMENT_QR_BUCKET)
      .remove(existing.map((item) => item.name));
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/admin");
  revalidatePath("/suscripcion");
  return { ok: true, data: undefined };
}
