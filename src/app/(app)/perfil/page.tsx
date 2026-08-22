import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  getCurrentProfile,
  getCurrentUser,
} from "@/infrastructure/supabase/server";
import { getCreditSummaries } from "@/server/queries/credits";
import { ProfileSettings } from "@/components/profile/profile-settings";
import { PageHeader } from "@/components/layout/page-header";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatMoney } from "@/lib/format";
import { initials } from "@/lib/utils";
import type { Profile } from "@/types/domain";

export const metadata: Metadata = { title: "Perfil" };

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?motivo=sesion");

  const [stored, summaries] = await Promise.all([
    getCurrentProfile(),
    getCreditSummaries().catch(() => []),
  ]);

  // Si el trigger de alta no llegó a correr, la pantalla sigue funcionando
  // con los datos de la sesión en vez de romperse.
  const profile: Profile = stored ?? {
    id: user.id,
    email: user.email ?? null,
    full_name: user.email?.split("@")[0] ?? null,
    avatar_url: null,
    role: "user",
    currency: "COP",
    locale: "es-CO",
    notify_upcoming: true,
    notify_overdue: true,
    notify_payments: true,
    // Sólo se usa si el trigger de alta no llegó a crear el perfil.
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const active = summaries.filter((c) => c.status === "active");
  const totalDebt = active.reduce((s, c) => s + Number(c.balance), 0);
  const totalPaid = summaries.reduce((s, c) => s + Number(c.total_paid), 0);

  return (
    <div className="animate-fade-in">
      <PageHeader title="Perfil" />

      <section className="mt-5 flex flex-col items-center rounded-3xl bg-card px-5 py-7 text-center">
        <Avatar className="h-20 w-20">
          {profile.avatar_url && <AvatarImage src={profile.avatar_url} alt="" />}
          <AvatarFallback className="text-xl">
            {initials(profile.full_name)}
          </AvatarFallback>
        </Avatar>

        <h2 className="mt-4 text-lg font-semibold tracking-tight">
          {profile.full_name ?? "Sin nombre"}
        </h2>
        <p className="mt-0.5 text-sm text-muted-foreground">{profile.email}</p>

        <dl className="mt-6 grid w-full grid-cols-2 gap-2.5">
          <div className="rounded-2xl bg-secondary px-3 py-3.5">
            <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Deuda activa
            </dt>
            <dd className="tabular mt-1 text-sm font-semibold">
              {formatMoney(totalDebt, profile.currency)}
            </dd>
          </div>
          <div className="rounded-2xl bg-secondary px-3 py-3.5">
            <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Total pagado
            </dt>
            <dd className="tabular mt-1 text-sm font-semibold text-primary">
              {formatMoney(totalPaid, profile.currency)}
            </dd>
          </div>
        </dl>
      </section>

      <ProfileSettings profile={profile} />
    </div>
  );
}
