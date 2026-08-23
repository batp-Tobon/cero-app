"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bell,
  ChevronRight,
  Coins,
  Download,
  LifeBuoy,
  Loader2,
  LogOut,
  Shield,
  ShieldCheck,
  Sparkles,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shared/ui/sheet";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { InlineNotice } from "@/shared/components/states";
import {
  signOut,
  updateNotificationPreferences,
  updateProfile,
} from "@/features/profile/actions";
import { createClient } from "@/infrastructure/supabase/client";
import type { Profile } from "@/shared/types/domain";

type Panel = "profile" | "notifications" | "export" | "security" | null;

export function ProfileSettings({ profile }: { profile: Profile }) {
  const [panel, setPanel] = React.useState<Panel>(null);
  const isAdmin = profile.role === "admin";

  return (
    <>
      <ul className="mt-6 space-y-2">
        <Row
          icon={UserRound}
          label="Datos personales"
          hint="Nombre, documento y contacto"
          onClick={() => setPanel("profile")}
        />
        <Row
          icon={ShieldCheck}
          label="Seguridad y privacidad"
          hint="Cambiar contraseña y cerrar sesión"
          onClick={() => setPanel("security")}
        />
        <Row
          icon={Bell}
          label="Notificaciones"
          hint="Avisos de cuotas y pagos"
          onClick={() => setPanel("notifications")}
        />
        <Row
          icon={Download}
          label="Exportar datos"
          hint="CSV de créditos, cuotas y pagos"
          onClick={() => setPanel("export")}
        />
        <Row
          icon={Sparkles}
          label="Plan y pagos"
          hint="Prueba, CERO Pro y comprobantes"
          href="/suscripcion"
        />
        <Row
          icon={LifeBuoy}
          label="Ayuda y soporte"
          hint="Cómo funciona CERO"
          href="/ayuda"
        />
        {isAdmin && (
          <Row
            icon={Shield}
            label="Administración"
            hint="Usuarios, planes y cobros"
            href="/admin"
          />
        )}
      </ul>

      <SignOutButton />

      <ProfilePanel
        profile={profile}
        open={panel === "profile"}
        onOpenChange={(v) => setPanel(v ? "profile" : null)}
      />
      <SecurityPanel
        email={profile.email}
        open={panel === "security"}
        onOpenChange={(v) => setPanel(v ? "security" : null)}
      />
      <NotificationsPanel
        profile={profile}
        open={panel === "notifications"}
        onOpenChange={(v) => setPanel(v ? "notifications" : null)}
      />
      <ExportPanel
        open={panel === "export"}
        onOpenChange={(v) => setPanel(v ? "export" : null)}
      />
    </>
  );
}

function Row({
  icon: Icon,
  label,
  hint,
  onClick,
  href,
}: {
  icon: LucideIcon;
  label: string;
  hint?: string;
  onClick?: () => void;
  href?: string;
}) {
  const content = (
    <>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary">
        <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-sm font-medium">{label}</span>
        {hint && (
          <span className="block truncate text-xs text-muted-foreground">
            {hint}
          </span>
        )}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
    </>
  );

  const className =
    "flex w-full items-center gap-3 rounded-2xl bg-card p-4 transition-colors hover:bg-secondary";

  return (
    <li>
      {href ? (
        <Link href={href} className={className}>
          {content}
        </Link>
      ) : (
        <button type="button" onClick={onClick} className={className}>
          {content}
        </button>
      )}
    </li>
  );
}

/** Reparte un nombre guardado antes de que existieran los dos campos. */
function splitLegacyName(fullName: string | null): [string, string] {
  const parts = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return ["", ""];
  // Dos apellidos son lo habitual en Colombia, así que a partir de tres
  // palabras se asume que las dos últimas lo son.
  if (parts.length >= 3) return [parts.slice(0, -2).join(" "), parts.slice(-2).join(" ")];
  return [parts[0], parts.slice(1).join(" ")];
}

function ProfilePanel({
  profile,
  open,
  onOpenChange,
}: {
  profile: Profile;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const [legacyFirst, legacyLast] = splitLegacyName(profile.full_name);
  const [form, setForm] = React.useState({
    firstName: profile.first_name ?? legacyFirst,
    lastName: profile.last_name ?? legacyLast,
    profession: profile.profession ?? "",
    nationalId: profile.national_id ?? "",
    phone: profile.phone ?? "",
    currency: profile.currency,
  });
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const result = await updateProfile(form);
    setPending(false);
    if (!result.ok) return setError(result.error);
    toast.success("Perfil actualizado");
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Datos personales</SheetTitle>
          <SheetDescription>{profile.email}</SheetDescription>
        </SheetHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          {error && <InlineNotice variant="danger">{error}</InlineNotice>}

          <div className="grid grid-cols-2 gap-3">
            <Field
              id="profile-first-name"
              label="Nombres"
              value={form.firstName}
              onChange={(v) => set("firstName", v)}
              maxLength={60}
              required
              autoComplete="given-name"
              disabled={pending}
            />
            <Field
              id="profile-last-name"
              label="Apellidos"
              value={form.lastName}
              onChange={(v) => set("lastName", v)}
              maxLength={60}
              autoComplete="family-name"
              disabled={pending}
            />
          </div>

          <Field
            id="profile-profession"
            label="Profesión"
            value={form.profession}
            onChange={(v) => set("profession", v)}
            maxLength={80}
            autoComplete="organization-title"
            disabled={pending}
          />

          <Field
            id="profile-national-id"
            label="Documento"
            value={form.nationalId}
            onChange={(v) => set("nationalId", v)}
            maxLength={20}
            inputMode="numeric"
            disabled={pending}
            hint="Sólo lo ves tú. No aparece en el panel de administración."
          />

          <Field
            id="profile-phone"
            label="Teléfono"
            value={form.phone}
            onChange={(v) => set("phone", v)}
            maxLength={25}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            disabled={pending}
          />

          <Field
            id="profile-currency"
            label="Moneda"
            value={form.currency}
            onChange={(v) => set("currency", v.toUpperCase())}
            maxLength={3}
            minLength={3}
            required
            disabled={pending}
            hint="Código de tres letras: COP, USD, EUR…"
          />

          <Button type="submit" className="w-full" disabled={pending}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Guardar
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}

/** Campo de texto con etiqueta y ayuda: se repite seis veces en este panel. */
function Field({
  id,
  label,
  value,
  onChange,
  hint,
  ...input
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
} & Omit<React.ComponentProps<typeof Input>, "id" | "value" | "onChange">) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-describedby={hint ? `${id}-hint` : undefined}
        {...input}
      />
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}

const MIN_PASSWORD = 8;

function SecurityPanel({
  email,
  open,
  onOpenChange,
}: {
  email: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [current, setCurrent] = React.useState("");
  const [next, setNext] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  function reset() {
    setCurrent("");
    setNext("");
    setConfirm("");
    setError(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (next.length < MIN_PASSWORD) {
      setError(`La nueva contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`);
      return;
    }
    if (next !== confirm) {
      setError("La confirmación no coincide.");
      return;
    }
    if (next === current) {
      setError("La nueva contraseña debe ser distinta de la actual.");
      return;
    }
    if (!email) {
      setError("No pudimos identificar tu correo. Vuelve a iniciar sesión.");
      return;
    }

    setPending(true);
    const supabase = createClient();

    // Supabase no pide la contraseña actual para cambiarla. Se comprueba aquí
    // a propósito: sin este paso, cualquiera que encontrara la sesión abierta
    // podría cambiarla y dejar fuera al dueño de la cuenta.
    const { error: reauthError } = await supabase.auth.signInWithPassword({
      email,
      password: current,
    });
    if (reauthError) {
      setPending(false);
      setError("La contraseña actual no es correcta.");
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password: next,
    });
    setPending(false);
    if (updateError) {
      setError("No pudimos cambiar la contraseña. Inténtalo de nuevo.");
      return;
    }

    reset();
    toast.success("Contraseña actualizada");
    onOpenChange(false);
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(value) => {
        if (!value) reset();
        onOpenChange(value);
      }}
    >
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Seguridad y privacidad</SheetTitle>
          <SheetDescription>
            Tus datos son privados: sólo tú ves tus créditos.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4">
          <div className="rounded-2xl bg-secondary p-4">
            <p className="text-xs text-muted-foreground">Sesión iniciada como</p>
            <p className="mt-0.5 truncate text-sm font-medium">{email}</p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            {error && <InlineNotice variant="danger">{error}</InlineNotice>}

            <Field
              id="password-current"
              label="Contraseña actual"
              type="password"
              value={current}
              onChange={setCurrent}
              autoComplete="current-password"
              required
              disabled={pending}
            />
            <Field
              id="password-next"
              label="Nueva contraseña"
              type="password"
              value={next}
              onChange={setNext}
              autoComplete="new-password"
              minLength={MIN_PASSWORD}
              required
              disabled={pending}
              hint={`Mínimo ${MIN_PASSWORD} caracteres.`}
            />
            <Field
              id="password-confirm"
              label="Repite la nueva contraseña"
              type="password"
              value={confirm}
              onChange={setConfirm}
              autoComplete="new-password"
              minLength={MIN_PASSWORD}
              required
              disabled={pending}
            />

            <Button type="submit" className="w-full" disabled={pending}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              Cambiar contraseña
            </Button>
          </form>

          <p className="text-xs leading-relaxed text-muted-foreground">
            CERO nunca almacena ni puede leer tu contraseña: la gestiona
            Supabase Auth. Si la olvidaste,{" "}
            <Link href="/recuperar" className="text-primary underline">
              recupérala por correo
            </Link>
            .
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function NotificationsPanel({
  profile,
  open,
  onOpenChange,
}: {
  profile: Profile;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const [prefs, setPrefs] = React.useState({
    notifyUpcoming: profile.notify_upcoming,
    notifyOverdue: profile.notify_overdue,
    notifyPayments: profile.notify_payments,
  });
  const [pending, setPending] = React.useState(false);

  async function save(next: typeof prefs) {
    setPrefs(next);
    setPending(true);
    const result = await updateNotificationPreferences(next);
    setPending(false);
    if (!result.ok) {
      setPrefs(prefs);
      toast.error(result.error);
      return;
    }
    router.refresh();
  }

  const items = [
    {
      key: "notifyUpcoming" as const,
      label: "Cuota próxima",
      hint: "Antes de cada vencimiento",
    },
    {
      key: "notifyOverdue" as const,
      label: "Cuota vencida",
      hint: "Cuando se pasa la fecha",
    },
    {
      key: "notifyPayments" as const,
      label: "Pagos y abonos",
      hint: "Confirmación de cada movimiento",
    },
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Notificaciones</SheetTitle>
          <SheetDescription>
            Elige de qué quieres que CERO te avise.
          </SheetDescription>
        </SheetHeader>

        <ul className="space-y-2">
          {items.map(({ key, label, hint }) => (
            <li key={key}>
              <label className="flex cursor-pointer items-center gap-3 rounded-2xl bg-secondary p-4">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{label}</span>
                  <span className="block text-xs text-muted-foreground">
                    {hint}
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={prefs[key]}
                  disabled={pending}
                  onChange={(e) => save({ ...prefs, [key]: e.target.checked })}
                  className="h-5 w-5 shrink-0 accent-[hsl(var(--primary))]"
                />
              </label>
            </li>
          ))}
        </ul>
      </SheetContent>
    </Sheet>
  );
}

const EXPORTS = [
  { tipo: "creditos", label: "Créditos", hint: "Saldo y progreso de cada uno" },
  { tipo: "cronogramas", label: "Planes de pago", hint: "Todas las cuotas" },
  { tipo: "pagos", label: "Pagos", hint: "Pagos y abonos registrados" },
  { tipo: "ahorros", label: "Ahorros", hint: "Bolsillos, entradas y retiros" },
  { tipo: "actividad", label: "Actividad", hint: "Línea de tiempo completa" },
] as const;

function ExportPanel({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Exportar datos</SheetTitle>
          <SheetDescription>
            Archivos CSV que abren en Excel o Google Sheets.
          </SheetDescription>
        </SheetHeader>

        <ul className="space-y-2">
          {EXPORTS.map(({ tipo, label, hint }) => (
            <li key={tipo}>
              <a
                href={`/api/export?tipo=${tipo}`}
                download
                className="flex items-center gap-3 rounded-2xl bg-secondary p-4 transition-colors hover:bg-accent"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-card">
                  <Coins className="h-4 w-4 text-muted-foreground" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{label}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {hint}
                  </span>
                </span>
                <Download className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              </a>
            </li>
          ))}
        </ul>
      </SheetContent>
    </Sheet>
  );
}

function SignOutButton() {
  const [pending, setPending] = React.useState(false);

  return (
    <form
      action={async () => {
        setPending(true);
        await signOut();
      }}
      className="mt-6"
    >
      <Button
        type="submit"
        variant="ghost"
        className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
        disabled={pending}
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <LogOut className="h-4 w-4" aria-hidden />
        )}
        Cerrar sesión
      </Button>
    </form>
  );
}
