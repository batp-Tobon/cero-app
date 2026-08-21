import { NextResponse } from "next/server";
import { createClient, getCurrentUser } from "@/infrastructure/supabase/server";
import { todayISO } from "@/lib/dates";

export const dynamic = "force-dynamic";

type Dataset = "creditos" | "cronogramas" | "pagos" | "actividad";

const DATASETS: Dataset[] = ["creditos", "cronogramas", "pagos", "actividad"];

/** Escapa un valor para CSV (RFC 4180). */
function cell(value: unknown): string {
  if (value == null) return "";
  const text = String(value);
  return /[",;\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * `;` como separador: Excel en español interpreta la coma como decimal y
 * partiría los importes en dos columnas. El BOM le dice que el archivo es UTF-8.
 */
function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.join(";"), ...rows.map((r) => r.map(cell).join(";"))];
  return `﻿${lines.join("\r\n")}`;
}

/**
 * Exporta los datos del usuario en CSV. Las RLS acotan las filas, así que
 * nunca puede descargarse lo de otra persona.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const dataset = (searchParams.get("tipo") ?? "creditos") as Dataset;
  if (!DATASETS.includes(dataset)) {
    return NextResponse.json({ error: "Tipo no válido" }, { status: 400 });
  }

  const supabase = await createClient();
  let csv: string;

  switch (dataset) {
    case "creditos": {
      const { data, error } = await supabase
        .from("credit_summary")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      csv = toCsv(
        [
          "nombre",
          "tipo",
          "entidad",
          "monto",
          "tasa_mensual",
          "plazo_meses",
          "sistema",
          "primera_cuota",
          "estado",
          "saldo",
          "cuotas_pagadas",
          "cuotas_totales",
          "total_pagado",
          "capital_pagado",
          "intereses_pagados",
        ],
        (data ?? []).map((c) => [
          c.name,
          c.type,
          c.entity,
          c.principal_amount,
          c.interest_rate_monthly,
          c.term_months,
          c.amortization_system,
          c.first_payment_date,
          c.status,
          c.balance,
          c.paid_installments,
          c.total_installments,
          c.total_paid,
          c.total_principal_paid,
          c.total_interest_paid,
        ]),
      );
      break;
    }

    case "cronogramas": {
      const { data, error } = await supabase
        .from("credit_schedule")
        .select("*, credits(name)")
        .order("credit_id", { ascending: true })
        .order("installment_number", { ascending: true });
      if (error) throw new Error(error.message);
      type Row = (typeof data)[number] & { credits: { name: string } | null };
      csv = toCsv(
        [
          "credito",
          "cuota",
          "vencimiento",
          "saldo_inicial",
          "cuota_valor",
          "interes",
          "capital",
          "saldo_final",
          "estado",
        ],
        ((data ?? []) as unknown as Row[]).map((r) => [
          r.credits?.name,
          r.installment_number,
          r.due_date,
          r.opening_balance,
          r.payment_amount,
          r.interest_amount,
          r.principal_amount,
          r.closing_balance,
          r.status,
        ]),
      );
      break;
    }

    case "pagos": {
      const { data, error } = await supabase
        .from("payments")
        .select("*, credits(name)")
        .order("payment_date", { ascending: false });
      if (error) throw new Error(error.message);
      type Row = (typeof data)[number] & { credits: { name: string } | null };
      csv = toCsv(
        [
          "credito",
          "cuota",
          "fecha",
          "valor_pagado",
          "capital",
          "interes",
          "abono_capital",
          "saldo_despues",
          "notas",
        ],
        ((data ?? []) as unknown as Row[]).map((p) => [
          p.credits?.name,
          p.installment_number,
          p.payment_date,
          p.amount_paid,
          p.principal_paid,
          p.interest_paid,
          p.extra_principal,
          p.balance_after,
          p.notes,
        ]),
      );
      break;
    }

    case "actividad": {
      const { data, error } = await supabase
        .from("activity")
        .select("*, credits(name)")
        .order("occurred_at", { ascending: false });
      if (error) throw new Error(error.message);
      type Row = (typeof data)[number] & { credits: { name: string } | null };
      csv = toCsv(
        ["fecha", "tipo", "titulo", "credito", "descripcion", "monto"],
        ((data ?? []) as unknown as Row[]).map((a) => [
          a.occurred_at,
          a.type,
          a.title,
          a.credits?.name,
          a.description,
          a.amount,
        ]),
      );
      break;
    }
  }

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="cero-${dataset}-${todayISO()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
