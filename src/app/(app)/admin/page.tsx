import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/infrastructure/supabase/server";
import { getAdminOverview } from "@/features/admin/queries";
import { AdminCredits, AdminUsers } from "@/features/admin/components/admin-panels";
import { PageHeader } from "@/shared/components/page-header";
import { ErrorState } from "@/shared/components/states";
import { formatMoney } from "@/shared/lib/format";

export const metadata: Metadata = { title: "Administración" };

export default async function AdminPage() {
  const profile = await getCurrentProfile();

  // Un 404 en vez de un "no tienes permiso": para quien no es admin, la
  // pantalla sencillamente no existe.
  if (profile?.role !== "admin") notFound();

  let overview;
  try {
    overview = await getAdminOverview();
  } catch (error) {
    return (
      <ErrorState detail={error instanceof Error ? error.message : undefined} />
    );
  }

  const { totals } = overview;

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Administración"
        subtitle={`${totals.users} usuarios · ${totals.credits} créditos`}
        backHref="/perfil"
      />

      <dl className="mt-5 grid grid-cols-2 gap-2.5">
        <Stat label="Deuda activa total" value={formatMoney(totals.activeDebt)} />
        <Stat
          label="Total pagado"
          value={formatMoney(totals.totalPaid)}
          accent
        />
        <Stat label="Usuarios" value={String(totals.users)} />
        <Stat label="Administradores" value={String(totals.admins)} />
      </dl>

      <section aria-labelledby="admin-users" className="mt-8">
        <h2 id="admin-users" className="text-base font-semibold tracking-tight">
          Usuarios
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Un administrador ve todos los datos para poder administrar, pero no
          puede registrar pagos en créditos ajenos.
        </p>
        <AdminUsers users={overview.users} currentUserId={profile.id} />
      </section>

      <section aria-labelledby="admin-credits" className="mt-8">
        <h2
          id="admin-credits"
          className="text-base font-semibold tracking-tight"
        >
          Créditos
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Reconstruir vuelve a derivar el plan desde los pagos registrados. Úsalo
          si cargaste movimientos por fuera de la app.
        </p>
        <AdminCredits credits={overview.credits} />
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-2xl bg-card px-4 py-3.5">
      <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd
        className={`tabular mt-1 text-base font-semibold ${
          accent ? "text-primary" : ""
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
