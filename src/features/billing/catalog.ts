import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Database,
  SaasPlanRow,
  SaasPriceRow,
} from "@/shared/types/database";

export interface ProOffer {
  plan: SaasPlanRow;
  price: SaasPriceRow;
}

/** Precio siempre leído de la base; nunca se acepta un monto del navegador. */
export async function getProOffer(
  supabase: SupabaseClient<Database>,
): Promise<ProOffer> {
  const { data: planData, error: planError } = await supabase
    .from("saas_plans")
    .select("*")
    .eq("code", "pro")
    .eq("is_active", true)
    .eq("is_public", true)
    .single();
  if (planError) throw new Error(planError.message);

  const plan = planData as SaasPlanRow;
  const { data: priceData, error: priceError } = await supabase
    .from("saas_prices")
    .select("*")
    .eq("plan_id", plan.id)
    .eq("currency", "COP")
    .eq("billing_interval", "month")
    .eq("interval_count", 1)
    .eq("is_active", true)
    .single();
  if (priceError) throw new Error(priceError.message);

  return { plan, price: priceData as SaasPriceRow };
}
