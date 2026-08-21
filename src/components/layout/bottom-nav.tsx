"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Home, User, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/inicio", label: "Inicio", icon: Home },
  { href: "/creditos", label: "Créditos", icon: Wallet },
  { href: "/actividad", label: "Actividad", icon: Activity },
  { href: "/perfil", label: "Perfil", icon: User },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-md border-t border-border/70 bg-background/95 pb-safe backdrop-blur-lg"
    >
      <ul className="flex items-stretch">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-[3.25rem] flex-col items-center justify-center gap-1 pt-2 text-[10px] font-medium transition-colors",
                  active
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-5 w-5" aria-hidden />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
