import {
  Briefcase,
  Building2,
  Car,
  CreditCard,
  GraduationCap,
  Heart,
  House,
  Landmark,
  Plane,
  Smartphone,
  Sofa,
  Wallet,
  type LucideIcon,
} from "lucide-react";

/**
 * Apariencia de cada producto: color e icono.
 *
 * Los tokens se guardan en la base ('emerald', 'car'); las clases viven aquí.
 * Dos razones: el diseño no se puede romper desde los datos, y las clases son
 * literales completos, que es lo único que Tailwind sabe extraer del código
 * (una clase construida con plantillas no llegaría al CSS final).
 */

export type AccentColor =
  | "emerald"
  | "sky"
  | "violet"
  | "rose"
  | "amber"
  | "orange"
  | "teal"
  | "indigo";

interface AccentClasses {
  /** Círculo del icono. */
  chip: string;
  /** Color del icono y de los acentos de texto. */
  text: string;
  /** Relleno de las barras de progreso. */
  bar: string;
  /** Muestra sólida del selector de color. */
  swatch: string;
}

export const ACCENT_COLORS: Array<{
  value: AccentColor;
  label: string;
  classes: AccentClasses;
}> = [
  {
    value: "emerald",
    label: "Verde",
    classes: {
      chip: "bg-emerald-400/15",
      text: "text-emerald-400",
      bar: "bg-emerald-400",
      swatch: "bg-emerald-400",
    },
  },
  {
    value: "sky",
    label: "Azul",
    classes: {
      chip: "bg-sky-400/15",
      text: "text-sky-400",
      bar: "bg-sky-400",
      swatch: "bg-sky-400",
    },
  },
  {
    value: "violet",
    label: "Violeta",
    classes: {
      chip: "bg-violet-400/15",
      text: "text-violet-400",
      bar: "bg-violet-400",
      swatch: "bg-violet-400",
    },
  },
  {
    value: "rose",
    label: "Rosa",
    classes: {
      chip: "bg-rose-400/15",
      text: "text-rose-400",
      bar: "bg-rose-400",
      swatch: "bg-rose-400",
    },
  },
  {
    value: "amber",
    label: "Ámbar",
    classes: {
      chip: "bg-amber-400/15",
      text: "text-amber-400",
      bar: "bg-amber-400",
      swatch: "bg-amber-400",
    },
  },
  {
    value: "orange",
    label: "Naranja",
    classes: {
      chip: "bg-orange-400/15",
      text: "text-orange-400",
      bar: "bg-orange-400",
      swatch: "bg-orange-400",
    },
  },
  {
    value: "teal",
    label: "Turquesa",
    classes: {
      chip: "bg-teal-400/15",
      text: "text-teal-400",
      bar: "bg-teal-400",
      swatch: "bg-teal-400",
    },
  },
  {
    value: "indigo",
    label: "Índigo",
    classes: {
      chip: "bg-indigo-400/15",
      text: "text-indigo-400",
      bar: "bg-indigo-400",
      swatch: "bg-indigo-400",
    },
  },
];

const COLOR_MAP = new Map(ACCENT_COLORS.map((c) => [c.value, c.classes]));
const FALLBACK = ACCENT_COLORS[0].classes;

/** Clases de un token de color. Un valor desconocido cae al de por defecto. */
export function accent(color: string | null | undefined): AccentClasses {
  return COLOR_MAP.get(color as AccentColor) ?? FALLBACK;
}

// ---------------------------------------------------------------------------
// Iconos
// ---------------------------------------------------------------------------

export type IconName =
  | "car"
  | "house"
  | "building"
  | "card"
  | "wallet"
  | "bank"
  | "study"
  | "travel"
  | "health"
  | "phone"
  | "furniture"
  | "work";

export const PRODUCT_ICONS: Array<{
  value: IconName;
  label: string;
  icon: LucideIcon;
}> = [
  { value: "car", label: "Vehículo", icon: Car },
  { value: "house", label: "Vivienda", icon: House },
  { value: "building", label: "Inmueble", icon: Building2 },
  { value: "card", label: "Tarjeta", icon: CreditCard },
  { value: "wallet", label: "Libre", icon: Wallet },
  { value: "bank", label: "Banco", icon: Landmark },
  { value: "study", label: "Estudio", icon: GraduationCap },
  { value: "travel", label: "Viaje", icon: Plane },
  { value: "health", label: "Salud", icon: Heart },
  { value: "phone", label: "Tecnología", icon: Smartphone },
  { value: "furniture", label: "Hogar", icon: Sofa },
  { value: "work", label: "Negocio", icon: Briefcase },
];

const ICON_MAP = new Map(PRODUCT_ICONS.map((i) => [i.value, i.icon]));

/**
 * Icono elegido, o el que corresponde al tipo de producto si no se eligió
 * ninguno: un crédito recién creado ya se ve bien sin tocar nada.
 */
export function productIcon(
  icon: string | null | undefined,
  fallback: LucideIcon,
): LucideIcon {
  return ICON_MAP.get(icon as IconName) ?? fallback;
}
