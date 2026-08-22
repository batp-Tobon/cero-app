import { CeroWordmark } from "@/shared/components/cero-mark";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6"
      style={{
        paddingTop: "calc(env(safe-area-inset-top) + 2rem)",
        paddingBottom: "calc(env(safe-area-inset-bottom) + 2rem)",
      }}
    >
      <CeroWordmark />
      <p className="mx-auto mt-3 max-w-[26ch] text-center text-sm leading-relaxed text-muted-foreground">
        Controla tus créditos. Avanza hacia cero.
      </p>
      <div className="mt-10">{children}</div>
    </div>
  );
}
