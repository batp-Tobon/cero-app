import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Search, ShieldCheck } from "lucide-react";
import { getCurrentProfile } from "@/infrastructure/supabase/server";
import { getAdminOverview } from "@/features/admin/queries";
import { AdminCustomers } from "@/features/admin/components/admin-customers";
import { AdminRecent } from "@/features/admin/components/admin-recent";
import { AdminStats } from "@/features/admin/components/admin-stats";
import { AdminPlans } from "@/features/admin/components/admin-plans";
import { ErrorState } from "@/shared/components/states";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";

export const metadata: Metadata = { title: "Administración" };

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const profile = await getCurrentProfile();
  if (profile?.role !== "admin") notFound();

  const { q = "" } = await searchParams;
  let overview;
  try {
    overview = await getAdminOverview(q);
  } catch (error) {
    return (
      <ErrorState detail={error instanceof Error ? error.message : undefined} />
    );
  }

  return (
    <div className="animate-fade-in">
      <nav className="pt-safe" aria-label="Navegación del backoffice">
        <Link
          href="/perfil"
          aria-label="Volver al perfil"
          className="-ml-2 flex h-10 w-10 items-center justify-center rounded-full text-foreground transition-colors hover:bg-secondary"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden />
        </Link>
      </nav>

      <header className="mt-2 flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
            Backoffice CERO
          </p>
          <h1 className="mt-1 font-serif text-3xl font-semibold leading-none tracking-tight">
            Administración
          </h1>
          <p className="mt-2 max-w-xs text-xs leading-relaxed text-muted-foreground">
            Clientes, acceso comercial y cobros. Sus finanzas permanecen privadas.
          </p>
        </div>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <ShieldCheck className="h-5 w-5" aria-hidden />
        </span>
      </header>

      <section className="mt-6" aria-label="Resumen comercial">
        <AdminStats metrics={overview.metrics} />
      </section>

      <section aria-labelledby="admin-plans" className="mt-8">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="admin-plans" className="text-base font-semibold tracking-tight">
            Planes y precio
          </h2>
          <span className="text-xs text-muted-foreground">Editables</span>
        </div>
        <AdminPlans plans={overview.plans} />
      </section>

      <section aria-labelledby="admin-customers" className="mt-8">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="admin-customers" className="text-base font-semibold tracking-tight">
            Clientes
          </h2>
          <span className="text-xs text-muted-foreground">
            {overview.customerCount} encontrados
          </span>
        </div>

        <form action="/admin" method="get" className="relative mt-3 flex gap-2">
          <Search
            className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            name="q"
            type="search"
            defaultValue={q}
            maxLength={100}
            placeholder="Buscar por correo"
            aria-label="Buscar cliente por correo"
            className="pl-11"
          />
          <Button type="submit" size="icon" aria-label="Buscar">
            <Search aria-hidden />
          </Button>
        </form>

        <AdminCustomers
          customers={overview.customers}
          plans={overview.plans}
          currentUserId={profile.id}
        />

        {overview.customerCount > overview.customers.length && (
          <p className="mt-3 text-center text-[11px] text-muted-foreground">
            Mostrando los primeros 50 resultados. Usa el correo para encontrar una cuenta concreta.
          </p>
        )}
      </section>

      <AdminRecent payments={overview.payments} audit={overview.audit} />
    </div>
  );
}
