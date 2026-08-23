import { Skeleton } from "@/shared/ui/skeleton";

/**
 * Esqueleto compartido de las pantallas privadas. Reproduce la silueta real
 * (cifra grande, barra, tarjetas) para que el contenido no dé un salto al
 * llegar.
 */
export default function AppLoading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando…</span>

      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-10 w-10 rounded-full" />
      </div>

      <Skeleton className="mt-8 h-3 w-24" />
      <Skeleton className="mt-3 h-11 w-64" />
      <Skeleton className="mt-3 h-3 w-28" />

      <Skeleton className="mt-8 h-1.5 w-full rounded-full" />
      <Skeleton className="mt-3 h-3 w-48" />

      <Skeleton className="mt-9 h-5 w-36" />
      <div className="mt-3 space-y-2.5">
        <Skeleton className="h-[5.5rem] w-full rounded-3xl" />
        <Skeleton className="h-[5.5rem] w-full rounded-3xl" />
        <Skeleton className="h-[5.5rem] w-full rounded-3xl" />
      </div>
    </div>
  );
}
