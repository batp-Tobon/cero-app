import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CeroMark } from "@/components/common/cero-mark";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center px-6 text-center">
      <CeroMark size={56} />
      <h1 className="mt-6 text-base font-semibold">
        Esta página no existe
      </h1>
      <p className="mt-2 max-w-[32ch] text-sm leading-relaxed text-muted-foreground">
        Puede que el crédito se haya eliminado o que el enlace esté mal.
      </p>
      <Button asChild className="mt-7">
        <Link href="/inicio">Volver al inicio</Link>
      </Button>
    </div>
  );
}
