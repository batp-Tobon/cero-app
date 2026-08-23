import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/ui/avatar";
import { initials } from "@/shared/lib/utils";
import { cn } from "@/shared/lib/utils";

/**
 * El avatar de la persona, en un solo sitio.
 *
 * El orden manda: emoji, imagen, iniciales. Si cada pantalla lo decidiera por
 * su cuenta acabarían discrepando —la portada mostrando la foto vieja y el
 * perfil el emoji nuevo— y el usuario no sabría cuál es el suyo.
 */
export function UserAvatar({
  name,
  avatarUrl,
  avatarEmoji = null,
  className,
  href,
}: {
  name: string | null;
  avatarUrl: string | null;
  avatarEmoji?: string | null;
  className?: string;
  /** Si se pasa, el avatar navega (en el inicio lleva al perfil). */
  href?: string;
}) {
  const avatar = avatarEmoji ? (
    <span
      role="img"
      aria-label="Avatar"
      className={cn(
        // `leading-none` y `select-none`: un emoji hereda la altura de línea
        // del texto y se descentraría dentro del círculo.
        "flex h-10 w-10 select-none items-center justify-center rounded-full bg-secondary text-lg leading-none",
        className,
      )}
    >
      {avatarEmoji}
    </span>
  ) : (
    <Avatar className={cn("h-10 w-10", className)}>
      {avatarUrl && <AvatarImage src={avatarUrl} alt="" />}
      <AvatarFallback>{initials(name)}</AvatarFallback>
    </Avatar>
  );

  if (!href) return avatar;

  return (
    <Link
      href={href}
      aria-label="Ir a tu perfil"
      className="rounded-full transition-opacity hover:opacity-80"
    >
      {avatar}
    </Link>
  );
}
