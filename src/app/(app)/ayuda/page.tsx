import type { Metadata } from "next";
import { PageHeader } from "@/shared/components/page-header";

export const metadata: Metadata = { title: "Ayuda" };

const TOPICS = [
  {
    title: "Cómo se calcula tu cuota",
    body: "CERO genera el plan completo al crear el crédito. En el sistema francés la cuota es fija y al principio casi todo es interés; en el alemán abonas el mismo capital cada mes y la cuota va bajando; en el americano sólo pagas intereses hasta la última cuota, donde entra todo el capital.",
  },
  {
    title: "Qué pasa al registrar un pago",
    body: "El dinero cubre primero el interés causado y el resto baja el capital. Si pagas más de la cuota, la diferencia se trata como abono a capital y el plan se recalcula.",
  },
  {
    title: "Abonar a capital",
    body: "Puedes elegir entre reducir el plazo (mantienes la cuota y terminas antes, pagando menos intereses) o reducir la cuota (mantienes el plazo y bajas el pago mensual). La preferencia se cambia en los ajustes de cada crédito.",
  },
  {
    title: "Por qué las cuotas se pagan en orden",
    body: "El saldo de cada cuota es el cierre de la anterior. Registrar una cuota salteada rompería esa cadena y el saldo dejaría de ser fiable.",
  },
  {
    title: "Tus datos",
    body: "Cada crédito, cuota y pago está asociado a tu usuario y protegido en la base de datos con Row Level Security: nadie más puede leerlos, ni siquiera si conociera el identificador del crédito.",
  },
];

export default function HelpPage() {
  return (
    <div className="animate-fade-in">
      <PageHeader title="Ayuda y soporte" backHref="/perfil" centered />

      <div className="mt-6 space-y-2.5">
        {TOPICS.map(({ title, body }) => (
          <section key={title} className="rounded-3xl bg-card p-5">
            <h2 className="text-sm font-semibold">{title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {body}
            </p>
          </section>
        ))}
      </div>
    </div>
  );
}
