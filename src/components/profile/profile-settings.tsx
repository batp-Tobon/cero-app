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
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InlineNotice } from "@/components/common/states";
import {
  signOut,
  updateNotificationPreferences,
  updateProfile,
} from "@/server/actions/profile";
import type { Profile } from "@/types/domain";

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
          hint="Nombre y moneda"
          onClick={() => setPanel("profile")}
        />
        <Row
          icon={ShieldCheck}
          label="Seguridad y privacidad"
          hint="Contraseña y sesión"
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
          icon={LifeBuoy}
          label="Ayuda y soporte"
          hint="Cómo funciona CERO"
          href="/ayuda"
        />
        {isAdmin && (
          <Row
            icon={Shield}
            label="Administración"
            hint="Usuarios, roles y créditos"
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
  const [fullName, setFullName] = React.useState(profile.full_name ?? "");
  const [currency, setCurrency] = React.useState(profile.currency);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const result = await updateProfile({ fullName, currency });
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

          <div className="space-y-1.5">
            <Label htmlFor="profile-name">Nombre</Label>
            <Input
              id="profile-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              maxLength={80}
              required
              disabled={pending}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="profile-currency">Moneda</Label>
            <Input
              id="profile-currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              maxLength={3}
              minLength={3}
              required
              disabled={pending}
              aria-describedby="profile-currency-hint"
            />
            <p id="profile-currency-hint" className="text-xs text-muted-foreground">
              Código de tres letras: COP, USD, EUR…
            </p>
          </div>

          <Button type="submit" className="w-full" disabled={pending}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Guardar
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function SecurityPanel({
  email,
  open,
  onOpenChange,
}: {
  email: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
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

          <p className="text-sm leading-relaxed text-muted-foreground">
            Las contraseñas las gestiona Supabase Auth: CERO nunca las almacena
            ni puede leerlas. Para cambiarla te enviamos un enlace al correo.
          </p>

          <Button asChild variant="secondary" className="w-full">
            <Link href="/recuperar">Cambiar contraseña</Link>
          </Button>
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
