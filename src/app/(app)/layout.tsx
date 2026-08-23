import { redirect } from "next/navigation";
import { getCurrentUser } from "@/infrastructure/supabase/server";
import { BottomNav } from "@/shared/components/bottom-nav";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Segunda barrera tras el middleware: si la sesión caduca entre la request
  // y el render, la página privada no se llega a pintar.
  const user = await getCurrentUser();
  if (!user) redirect("/login?motivo=sesion");

  return (
    <div className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col bg-background">
      <main className="px-safe pt-safe flex-1 pb-nav">{children}</main>
      <BottomNav />
    </div>
  );
}
