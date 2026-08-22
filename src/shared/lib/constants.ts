import {
  Building2,
  Car,
  CreditCard,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type {
  AmortizationSystem,
  ExtraPrincipalMode,
} from "@/core/amortization";
import type { CreditType } from "@/shared/types/domain";

export const CREDIT_TYPES: Array<{
  value: CreditType;
  label: string;
  icon: LucideIcon;
}> = [
  { value: "vehicle", label: "Vehículo", icon: Car },
  { value: "property", label: "Inmueble", icon: Building2 },
  { value: "card", label: "Tarjeta", icon: CreditCard },
  { value: "free_investment", label: "Libre inversión", icon: Wallet },
];

const CREDIT_TYPE_MAP = new Map(CREDIT_TYPES.map((t) => [t.value, t]));

export function creditTypeLabel(type: CreditType): string {
  return CREDIT_TYPE_MAP.get(type)?.label ?? "Otro";
}

export function creditTypeIcon(type: CreditType): LucideIcon {
  return CREDIT_TYPE_MAP.get(type)?.icon ?? Wallet;
}

export const AMORTIZATION_SYSTEMS: Array<{
  value: AmortizationSystem;
  label: string;
  hint: string;
}> = [
  {
    value: "french",
    label: "Francés (cuota fija)",
    hint: "Pagas siempre lo mismo. Al principio casi todo es interés.",
  },
  {
    value: "german",
    label: "Alemán (cuota decreciente)",
    hint: "Abonas el mismo capital cada mes; la cuota va bajando.",
  },
  {
    value: "american",
    label: "Americano (capital al final)",
    hint: "Sólo intereses durante el plazo y el capital en la última cuota.",
  },
  {
    value: "zero_interest",
    label: "Sin interés",
    hint: "El capital repartido entre las cuotas, sin coste financiero.",
  },
];

export function amortizationLabel(system: AmortizationSystem): string {
  return (
    AMORTIZATION_SYSTEMS.find((s) => s.value === system)?.label ?? "Francés"
  );
}

export const EXTRA_PRINCIPAL_MODES: Array<{
  value: ExtraPrincipalMode;
  label: string;
  hint: string;
}> = [
  {
    value: "reduce_term",
    label: "Reducir plazo",
    hint: "Mantienes la cuota y terminas antes. Pagas menos intereses.",
  },
  {
    value: "reduce_installment",
    label: "Reducir cuota",
    hint: "Mantienes el plazo y bajas la cuota mensual.",
  },
];
