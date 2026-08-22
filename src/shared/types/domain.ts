/**
 * Tipos de dominio de la app. La UI trabaja contra estos, no contra las filas
 * crudas de Postgres: así un cambio de columna no se filtra a las pantallas.
 */

import type {
  CreditRow,
  CreditSummaryRow,
  CreditTypeDB,
  PaymentRow,
  ProfileRow,
  ScheduleRowDB,
} from "@/shared/types/database";

export type CreditType = CreditTypeDB;

export type Profile = ProfileRow;
export type Credit = CreditRow;
export type Payment = PaymentRow;
export type PaymentWithReceipt = PaymentRow & { receiptUrl: string | null };
export type CreditSummary = CreditSummaryRow;

/** Estado de una cuota tal y como se pinta en el plan de pagos. */
export type InstallmentState = "paid" | "next" | "pending" | "overdue";

export interface Installment extends ScheduleRowDB {
  /** Derivado en el servidor: depende de la fecha de hoy, no se persiste. */
  state: InstallmentState;
}

/**
 * Todo lo que hace falta para registrar el pago de una cuota: el formulario
 * necesita el interés y el saldo para poder anticipar el saldo resultante.
 */
export interface PaymentTarget {
  creditId: string;
  creditName: string;
  currency: string;
  installmentNumber: number;
  totalInstallments: number;
  dueDate: string;
  paymentAmount: number;
  interestAmount: number;
  principalAmount: number;
  openingBalance: number;
}

/** Cuota de un crédito en "Próximos pagos". */
export interface UpcomingPayment extends PaymentTarget {
  creditType: CreditType;
  color: string;
  icon: string | null;
  state: InstallmentState;
}

/** Pago de tarjeta en "Próximos pagos": no hay cuota, hay corte y mínimo. */
export interface UpcomingStatement {
  accountId: string;
  accountName: string;
  currency: string;
  color: string;
  icon: string | null;
  dueDate: string;
  amount: number;
  minimum: number;
  balance: number;
  available: number;
  state: InstallmentState;
}

/**
 * Lo que hay que pagar pronto, venga de donde venga. El inicio no distingue
 * entre una cuota y un extracto: distingue entre lo que vence antes y después.
 */
export type UpcomingItem = { amountDue: number } & (
  | ({ kind: "credit" } & UpcomingPayment)
  | ({ kind: "revolving" } & UpcomingStatement)
);

/** Cabecera del dashboard: las cinco preguntas que la app debe responder. */
export interface DebtOverview {
  /** Créditos amortizados + saldo usado de tarjetas. */
  totalDebt: number;
  creditDebt: number;
  revolvingDebt: number;
  totalPrincipal: number;
  totalPrincipalPaid: number;
  progressPercent: number;
  monthlyCommitment: number;
  installmentsDue: number;
  /** Vencimiento de la última cuota de todo el portafolio. */
  freeDate: string | null;
  overdueCount: number;
  activeCredits: number;
  currency: string;
}

/**
 * Una deuda en el reparto del inicio, venga de un crédito o de una tarjeta.
 * Se calcula en el servidor para que la pantalla no tenga que saber que un
 * crédito mide su avance en cuotas y una tarjeta en dinero pagado.
 */
export interface DebtSlice {
  kind: "credit" | "revolving";
  id: string;
  name: string;
  creditType: CreditType | null;
  color: string;
  icon: string | null;
  currency: string;
  balance: number;
  /** Cuánto se ha pagado de lo que se debía, en porcentaje. */
  paidPercent: number;
  /** Cuánto pesa esta deuda dentro del total. */
  sharePercent: number;
  /** "0/72 cuotas" o "cupo usado". */
  detail: string;
}

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };
