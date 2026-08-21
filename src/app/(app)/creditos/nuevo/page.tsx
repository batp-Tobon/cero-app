import type { Metadata } from "next";
import { getCurrentProfile } from "@/infrastructure/supabase/server";
import { NewCreditForm } from "@/components/credits/new-credit-form";
import { PageHeader } from "@/components/layout/page-header";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Nuevo crédito" };

export default async function NewCreditPage() {
  const profile = await getCurrentProfile();

  return (
    <div className="animate-fade-in pb-6">
      <PageHeader title="Nuevo crédito" backHref="/creditos" centered />
      <NewCreditForm currency={profile?.currency ?? env.defaultCurrency} />
    </div>
  );
}
