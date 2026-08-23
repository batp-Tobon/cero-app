import { WifiOff } from "lucide-react";
import { CeroMark } from "@/shared/components/cero-mark";

export const metadata = { title: "Sin conexión" };

/** Página de reserva del service worker cuando no hay red. */
export default function OfflinePage() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center px-6 text-center">
      <CeroMark size={56} />
      <WifiOff className="mt-8 h-6 w-6 text-muted-foreground" aria-hidden />
      <h1 className="mt-4 title-section">Sin conexión</h1>
      <p className="mt-2 max-w-[32ch] text-sm leading-relaxed text-muted-foreground">
        CERO necesita conexión para mostrar saldos al día. Vuelve a intentarlo
        cuando recuperes la red.
      </p>
    </div>
  );
}
