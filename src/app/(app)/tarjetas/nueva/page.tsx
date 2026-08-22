import type { Metadata } from "next";
import { getCurrentProfile } from "@/infrastructure/supabase/server";
import { NewRevolvingForm } from "@/features/revolving/components/new-revolving-form";
import { PageHeader } from "@/shared/components/page-header";
import { env } from "@/shared/lib/env";

export const metadata: Metadata = { title: "Nueva tarjeta" };

export default async function NewRevolvingPage() {
  const profile = await getCurrentProfile();

  return (
    <div className="animate-fade-in pb-6">
      <PageHeader title="Nueva tarjeta" backHref="/creditos" centered />
      <NewRevolvingForm currency={profile?.currency ?? env.defaultCurrency} />
    </div>
  );
}
