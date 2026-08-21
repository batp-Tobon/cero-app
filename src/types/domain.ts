/**
 * Tipos de dominio de la app. La UI trabaja contra estos, no contra las filas
 * crudas de Postgres: así un cambio de columna no se filtra a las pantallas.
 */

import type {
  AmortizationSystem,
  ExtraPrincipalMode,
} from "@/core/domain/amortization";
import type {
  ActivityRow,
  CreditRow,
  CreditSummaryRow,
  CreditTypeDB,
  PaymentRow,
  ProfileRow,
  ScheduleRowDB,
} from "@/types/database";

export type CreditType = CreditTypeDB;
export type { AmortizationSystem, ExtraPrincipalMode };

export type Profile = ProfileRow;
export type Credit = CreditRow;
export type Payment = PaymentRow;
export type Activity = ActivityRow;
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

/** Cuota que aparece en "Próximos pagos" del inicio. */
export interface UpcomingPayment extends PaymentTarget {
  creditType: CreditType;
  state: InstallmentState;
}

/** Cabecera del dashboard: las cinco preguntas que la app debe responder. */
export interface DebtOverview {
  totalDebt: number;
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

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };
