export type InsightTone = "positive" | "warning" | "danger" | "neutral";

export interface FinancialInsight {
  id: string;
  title: string;
  detail: string;
  tone: InsightTone;
}

export interface FinancialInsightInput {
  income: number;
  remaining: number;
  committedPercent: number;
  monthlyDebtPayments: number;
  totalDebt: number;
  cardBalance: number;
  cardLimit: number;
  overdueCount: number;
}

/**
 * Primera capacidad de CERO Inteligente. Es local y determinista: analiza sólo
 * agregados ya calculados por la app y no envía movimientos a un tercero.
 */
export function buildFinancialInsights(
  input: FinancialInsightInput,
): FinancialInsight[] {
  const insights: FinancialInsight[] = [];

  if (input.overdueCount > 0) {
    insights.push({
      id: "overdue",
      title: "Prioriza los pagos vencidos",
      detail: `Tienes ${input.overdueCount} ${input.overdueCount === 1 ? "obligación vencida" : "obligaciones vencidas"}. Resuélvelas antes de hacer nuevos abonos extraordinarios.`,
      tone: "danger",
    });
  }

  if (input.income <= 0) {
    insights.push({
      id: "income",
      title: "Registra el ingreso del mes",
      detail:
        "Con el sueldo y su fecha CERO podrá medir qué porcentaje queda libre después de deudas y gastos.",
      tone: "neutral",
    });
  } else if (input.remaining < 0) {
    insights.push({
      id: "cashflow",
      title: "El mes está en déficit",
      detail:
        "Tus compromisos superan el ingreso disponible. Revisa primero gastos no esenciales y fechas de pago.",
      tone: "danger",
    });
  } else if (input.committedPercent >= 70) {
    insights.push({
      id: "cashflow",
      title: "Tu margen mensual es estrecho",
      detail: `${input.committedPercent.toFixed(0)}% del ingreso ya está comprometido. Conserva el saldo restante como colchón antes de abonar más capital.`,
      tone: "warning",
    });
  } else {
    insights.push({
      id: "cashflow",
      title: "El flujo del mes tiene margen",
      detail: `${Math.max(0, 100 - input.committedPercent).toFixed(0)}% del ingreso queda libre después de los compromisos registrados.`,
      tone: "positive",
    });
  }

  const cardUse = input.cardLimit > 0
    ? (input.cardBalance / input.cardLimit) * 100
    : 0;
  if (cardUse >= 50) {
    insights.push({
      id: "card",
      title: "Reduce el uso de la tarjeta",
      detail: `${cardUse.toFixed(0)}% del cupo está utilizado. Evita nuevas compras diferidas hasta bajar ese porcentaje.`,
      tone: "warning",
    });
  } else if (input.cardBalance > 0) {
    insights.push({
      id: "card",
      title: "La tarjeta sigue controlada",
      detail: `${cardUse.toFixed(0)}% del cupo está utilizado. Mantén las cuotas dentro del presupuesto mensual.`,
      tone: "positive",
    });
  }

  if (input.totalDebt > 0 && input.monthlyDebtPayments > 0) {
    insights.push({
      id: "debt",
      title: "Compromiso de deuda identificado",
      detail:
        "CERO ya cruza créditos y tarjetas con el presupuesto; registra cada comprobante para que la recomendación conserve una historia verificable.",
      tone: "neutral",
    });
  }

  return insights.slice(0, 4);
}
