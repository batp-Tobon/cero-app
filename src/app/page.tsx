import { redirect } from "next/navigation";
import { getCurrentUser } from "@/infrastructure/supabase/server";

/** La raíz sólo decide a dónde va el usuario: al inicio o al login. */
export default async function RootPage() {
  const user = await getCurrentUser();
  redirect(user ? "/inicio" : "/login");
}
