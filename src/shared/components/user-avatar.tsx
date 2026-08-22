import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/ui/avatar";
import { initials } from "@/shared/lib/utils";
import { cn } from "@/shared/lib/utils";

export function UserAvatar({
  name,
  avatarUrl,
  className,
  href,
}: {
  name: string | null;
  avatarUrl: string | null;
  className?: string;
  /** Si se pasa, el avatar navega (en el inicio lleva al perfil). */
  href?: string;
}) {
  const avatar = (
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
