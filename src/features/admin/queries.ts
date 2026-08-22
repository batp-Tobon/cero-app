import "server-only";

import { createClient } from "@/infrastructure/supabase/server";
import type { CreditSummaryRow, ProfileRow, UserRoleDB } from "@/shared/types/database";


export interface AdminUser {
  id: string;
  email: string | null;
  fullName: string | null;
  role: UserRoleDB;
  createdAt: string;
  ownedCredits: number;
  activeDebt: number;
  totalPaid: number;
}

interface AdminOverview {
  users: AdminUser[];
  credits: Array<
    CreditSummaryRow & { ownerName: string | null; ownerEmail: string | null }
  >;
  totals: {
    users: number;
    admins: number;
    credits: number;
    activeDebt: number;
    totalPaid: number;
  };
}

/**
 * Panel del administrador.
 *
 * Las RLS ya dan al admin lectura global, así que aquí no hay ningún privilegio
 * extra escondido: si quien consulta no es admin, Postgres devuelve sólo lo
 * suyo y el panel se queda vacío en vez de filtrar datos ajenos.
 */
export async function getAdminOverview(): Promise<AdminOverview> {
  const supabase = await createClient();

  const [profilesRes, creditsRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: true }),
    supabase
      .from("credit_summary")
      .select("*")
      .order("created_at", { ascending: false }),
  ]);

  if (profilesRes.error) throw new Error(profilesRes.error.message);
  if (creditsRes.error) throw new Error(creditsRes.error.message);

  const profiles = (profilesRes.data ?? []) as ProfileRow[];
  const credits = (creditsRes.data ?? []) as CreditSummaryRow[];
  const byId = new Map(profiles.map((p) => [p.id, p]));

  const users: AdminUser[] = profiles.map((profile) => {
    const owned = credits.filter((c) => c.owner_id === profile.id);
    return {
      id: profile.id,
      email: profile.email,
      fullName: profile.full_name,
      role: profile.role,
      createdAt: profile.created_at,
      ownedCredits: owned.length,
      activeDebt: owned
        .filter((c) => c.status === "active")
        .reduce((s, c) => s + Number(c.balance), 0),
      totalPaid: owned.reduce((s, c) => s + Number(c.total_paid), 0),
    };
  });

  return {
    users,
    credits: credits.map((c) => ({
      ...c,
      ownerName: byId.get(c.owner_id)?.full_name ?? null,
      ownerEmail: byId.get(c.owner_id)?.email ?? null,
    })),
    totals: {
      users: users.length,
      admins: users.filter((u) => u.role === "admin").length,
      credits: credits.length,
      activeDebt: credits
        .filter((c) => c.status === "active")
        .reduce((s, c) => s + Number(c.balance), 0),
      totalPaid: credits.reduce((s, c) => s + Number(c.total_paid), 0),
    },
  };
}
