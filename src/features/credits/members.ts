"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient, getCurrentUser } from "@/infrastructure/supabase/server";
import type { ActionResult } from "@/shared/types/domain";

export interface CreditMember {
  userId: string;
  fullName: string | null;
  email: string | null;
  role: "owner" | "member";
  isYou: boolean;
}

/** Quiénes ven este crédito. El dueño va primero. */
export async function getCreditMembers(
  creditId: string,
): Promise<CreditMember[]> {
  const supabase = await createClient();
  const user = await getCurrentUser();

  const { data, error } = await supabase
    .from("credit_members")
    .select("user_id, role, profiles(full_name, email)")
    .eq("credit_id", creditId);

  if (error) throw new Error(error.message);

  type Joined = {
    user_id: string;
    role: "owner" | "member";
    profiles: { full_name: string | null; email: string | null } | null;
  };

  return ((data ?? []) as unknown as Joined[])
    .map((row) => ({
      userId: row.user_id,
      fullName: row.profiles?.full_name ?? null,
      email: row.profiles?.email ?? null,
      role: row.role,
      isYou: row.user_id === user?.id,
    }))
    .sort((a, b) => (a.role === "owner" ? -1 : b.role === "owner" ? 1 : 0));
}

/**
 * Miembros de TODOS los créditos que ve el usuario, en una sola consulta.
 * La lista tiene una fila por crédito; pedir los miembros de cada uno por
 * separado sería una consulta por tarjeta.
 */
export async function getAllCreditMembers(): Promise<
  Map<string, CreditMember[]>
> {
  const supabase = await createClient();
  const user = await getCurrentUser();

  const { data, error } = await supabase
    .from("credit_members")
    .select("credit_id, user_id, role, profiles(full_name, email)");

  if (error) throw new Error(error.message);

  type Joined = {
    credit_id: string;
    user_id: string;
    role: "owner" | "member";
    profiles: { full_name: string | null; email: string | null } | null;
  };

  const grouped = new Map<string, CreditMember[]>();
  for (const row of (data ?? []) as unknown as Joined[]) {
    const member: CreditMember = {
      userId: row.user_id,
      fullName: row.profiles?.full_name ?? null,
      email: row.profiles?.email ?? null,
      role: row.role,
      isYou: row.user_id === user?.id,
    };
    const list = grouped.get(row.credit_id);
    if (list) list.push(member);
    else grouped.set(row.credit_id, [member]);
  }

  // El dueño primero, igual que en el detalle.
  for (const list of grouped.values()) {
    list.sort((a, b) => (a.role === "owner" ? -1 : b.role === "owner" ? 1 : 0));
  }

  return grouped;
}

const shareSchema = z.object({
  creditId: z.string().uuid(),
  email: z.string().trim().email("Escribe un correo válido."),
});

/**
 * Da acceso a otra persona sobre un crédito.
 * Sólo el dueño puede hacerlo: las RLS de `credit_members` lo comprueban de
 * nuevo en Postgres, esto es únicamente el mensaje de error amable.
 */
export async function shareCredit(
  input: z.input<typeof shareSchema>,
): Promise<ActionResult<CreditMember>> {
  const parsed = shareSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  const { creditId, email } = parsed.data;

  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Tu sesión expiró." };

  const supabase = await createClient();

  const { data: credit } = await supabase
    .from("credits")
    .select("id, name, owner_id")
    .eq("id", creditId)
    .maybeSingle();

  if (!credit) return { ok: false, error: "No encontramos ese crédito." };
  if (credit.owner_id !== user.id) {
    return {
      ok: false,
      error: "Sólo quien creó el crédito puede compartirlo.",
    };
  }

  const { data: found, error: findError } = await supabase
    .rpc("find_profile_by_email", { p_email: email })
    .maybeSingle();

  if (findError) return { ok: false, error: findError.message };
  if (!found) {
    return {
      ok: false,
      error: `${email} todavía no tiene cuenta en CERO. Pídele que se registre primero.`,
    };
  }

  const person = found as { id: string; full_name: string | null; email: string | null };

  const { error } = await supabase
    .from("credit_members")
    .insert({ credit_id: creditId, user_id: person.id, role: "member" });

  if (error) {
    // Clave duplicada: ya tenía acceso.
    if (error.code === "23505") {
      return { ok: false, error: "Esa persona ya tiene acceso al crédito." };
    }
    return { ok: false, error: error.message };
  }

  await supabase.from("activity").insert({
    user_id: user.id,
    credit_id: creditId,
    payment_id: null,
    type: "credit_updated",
    title: "Crédito compartido",
    description: `${credit.name} · con ${person.full_name ?? person.email}`,
    amount: null,
  });

  revalidatePath(`/creditos/${creditId}`);
  revalidatePath("/creditos");

  return {
    ok: true,
    data: {
      userId: person.id,
      fullName: person.full_name,
      email: person.email,
      role: "member",
      isYou: false,
    },
  };
}

/** Retira el acceso de una persona. El dueño no se puede quitar a sí mismo. */
export async function unshareCredit(
  creditId: string,
  userId: string,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Tu sesión expiró." };

  const supabase = await createClient();

  const { data: credit } = await supabase
    .from("credits")
    .select("id, name, owner_id")
    .eq("id", creditId)
    .maybeSingle();

  if (!credit) return { ok: false, error: "No encontramos ese crédito." };
  if (credit.owner_id !== user.id) {
    return { ok: false, error: "Sólo el dueño puede quitar accesos." };
  }
  if (credit.owner_id === userId) {
    return {
      ok: false,
      error: "El dueño no puede quitarse el acceso a su propio crédito.",
    };
  }

  const { error } = await supabase
    .from("credit_members")
    .delete()
    .eq("credit_id", creditId)
    .eq("user_id", userId);

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/creditos/${creditId}`);
  revalidatePath("/creditos");
  return { ok: true, data: undefined };
}
