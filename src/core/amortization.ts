/**
 * Motor de amortización de CERO.
 *
 * Reglas de la casa:
 *  - Toda la aritmética ocurre en CENTAVOS enteros. Los flotantes acumulan
 *    error y en un plan de 72 cuotas ese error se ve en pantalla.
 *  - La última cuota siempre liquida el saldo exacto: el plan cierra en 0.
 *  - Este módulo es puro: no conoce Supabase, React ni fechas del sistema.
 *    Se puede testear entero (ver amortization.test.ts).
 */

import { addMonths, type DateISO } from "@/shared/lib/dates";

export type AmortizationSystem =
  | "french"
  | "german"
  | "american"
  | "zero_interest";

export type ExtraPrincipalMode = "reduce_term" | "reduce_installment";

export interface ScheduleRow {
  installment: number;
  dueDate: DateISO;
  openingBalance: number;
  payment: number;
  interest: number;
  principal: number;
  closingBalance: number;
}

interface BuildScheduleInput {
  /** Capital a amortizar. */
  principal: number;
  /** Tasa mensual en decimal (1,89 % m.v. -> 0.0189). */
  monthlyRate: number;
  /** Número de cuotas a generar. */
  termMonths: number;
  system: AmortizationSystem;
  /** Fecha de la primera cuota generada. */
  firstPaymentDate: DateISO;
  /** Número de la primera cuota (para regenerar la cola de un plan). */
  startInstallment?: number;
  /** Cuota fija impuesta — francés con plazo reducido tras un abono. */
  fixedPayment?: number;
  /** Abono a capital fijo por cuota — alemán / sin interés. */
  fixedPrincipal?: number;
  /** Fechas exactas de vencimiento; si faltan se derivan mes a mes. */
  dueDates?: DateISO[];
}

interface ScheduleTotals {
  installments: number;
  totalPaid: number;
  totalInterest: number;
  totalPrincipal: number;
  firstPayment: number;
  lastPayment: number;
  firstDueDate: DateISO | null;
  lastDueDate: DateISO | null;
}

// ---------------------------------------------------------------------------
// Centavos
// ---------------------------------------------------------------------------

const toCents = (n: number): number => Math.round(n * 100);
const fromCents = (c: number): number => c / 100;

// ---------------------------------------------------------------------------
// Fórmulas base
// ---------------------------------------------------------------------------

/**
 * Cuota fija del sistema francés: A = P · i / (1 − (1+i)^−n).
 * Con tasa 0 degenera correctamente en P/n.
 */
export function frenchPayment(
  principal: number,
  monthlyRate: number,
  termMonths: number,
): number {
  if (termMonths <= 0) return 0;
  const p = toCents(principal);
  if (monthlyRate <= 0) return fromCents(Math.round(p / termMonths));
  const factor = Math.pow(1 + monthlyRate, termMonths);
  return fromCents(Math.round((p * monthlyRate * factor) / (factor - 1)));
}

/**
 * Cuántas cuotas faltan para liquidar `balance` pagando `payment` cada mes.
 * Devuelve `null` si la cuota no alcanza a cubrir ni el interés del período
 * (el saldo nunca bajaría: la deuda sería perpetua).
 */
export function termForPayment(
  balance: number,
  monthlyRate: number,
  payment: number,
): number | null {
  const b = toCents(balance);
  const a = toCents(payment);
  if (b <= 0) return 0;
  if (a <= 0) return null;
  if (monthlyRate <= 0) return Math.ceil(b / a);
  const interestOnly = b * monthlyRate;
  if (a <= interestOnly) return null;
  const n = Math.log(a / (a - interestOnly)) / Math.log(1 + monthlyRate);
  // Tolerancia: la cuota viene redondeada al centavo, y sin holgura ese
  // redondeo empujaría 72,0000002 cuotas a 73.
  return Math.max(1, Math.ceil(n - 1e-6));
}

// ---------------------------------------------------------------------------
// Generación del plan de pagos
// ---------------------------------------------------------------------------

/**
 * Genera el plan de pagos completo. Es la única función que decide cuánto
 * capital e interés lleva cada cuota; todo lo demás en la app lee de aquí.
 */
export function buildSchedule(input: BuildScheduleInput): ScheduleRow[] {
  const {
    principal,
    monthlyRate,
    termMonths,
    system,
    firstPaymentDate,
    startInstallment = 1,
    fixedPayment,
    fixedPrincipal,
    dueDates,
  } = input;

  const rate = system === "zero_interest" ? 0 : Math.max(0, monthlyRate);
  let balance = toCents(principal);
  const n = Math.max(0, Math.floor(termMonths));
  if (balance <= 0 || n === 0) return [];

  // Anclas de cada sistema, calculadas una sola vez sobre el capital inicial.
  const frenchAnchor =
    fixedPayment != null
      ? toCents(fixedPayment)
      : toCents(frenchPayment(principal, rate, n));
  const flatPrincipal =
    fixedPrincipal != null ? toCents(fixedPrincipal) : Math.round(balance / n);

  const rows: ScheduleRow[] = [];

  for (let k = 0; k < n && balance > 0; k++) {
    const opening = balance;
    const interest = rate > 0 ? Math.round(opening * rate) : 0;

    let principalPart: number;
    switch (system) {
      case "french":
        principalPart = frenchAnchor - interest;
        break;
      case "german":
      case "zero_interest":
        principalPart = flatPrincipal;
        break;
      case "american":
        // Sólo intereses durante el período; el capital entra al final.
        principalPart = k === n - 1 ? opening : 0;
        break;
    }

    // La última cuota (o cualquiera que se pase) liquida el saldo exacto.
    const isLast = k === n - 1;
    if (isLast || principalPart > opening) principalPart = opening;
    if (principalPart < 0) principalPart = 0;

    const closing = opening - principalPart;

    rows.push({
      installment: startInstallment + k,
      dueDate: dueDates?.[k] ?? addMonths(firstPaymentDate, k),
      openingBalance: fromCents(opening),
      payment: fromCents(principalPart + interest),
      interest: fromCents(interest),
      principal: fromCents(principalPart),
      closingBalance: fromCents(closing),
    });

    balance = closing;
  }

  return rows;
}

/** Totales del plan — se muestran en el resumen antes de crear el crédito. */
export function summarize(rows: ScheduleRow[]): ScheduleTotals {
  const totalInterest = rows.reduce((s, r) => s + toCents(r.interest), 0);
  const totalPrincipal = rows.reduce((s, r) => s + toCents(r.principal), 0);
  return {
    installments: rows.length,
    totalPaid: fromCents(totalInterest + totalPrincipal),
    totalInterest: fromCents(totalInterest),
    totalPrincipal: fromCents(totalPrincipal),
    firstPayment: rows[0]?.payment ?? 0,
    lastPayment: rows[rows.length - 1]?.payment ?? 0,
    firstDueDate: rows[0]?.dueDate ?? null,
    lastDueDate: rows[rows.length - 1]?.dueDate ?? null,
  };
}

// ---------------------------------------------------------------------------
// Recálculo tras un abono a capital
// ---------------------------------------------------------------------------

interface RecalculateInput {
  /** Saldo vivo YA descontado el abono extraordinario. */
  balance: number;
  monthlyRate: number;
  system: AmortizationSystem;
  mode: ExtraPrincipalMode;
  /** Fechas de vencimiento de las cuotas que siguen pendientes, en orden. */
  remainingDueDates: DateISO[];
  /** Número de la primera cuota pendiente. */
  startInstallment: number;
  /** Cuota vigente antes del abono (ancla de `reduce_term` en francés). */
  currentPayment: number;
  /** Capital por cuota vigente (ancla de `reduce_term` en alemán / sin interés). */
  currentPrincipal?: number;
}

/**
 * Recalcula la cola del plan después de un abono a capital.
 *
 *  - `reduce_term`        se mantiene la cuota y se acortan los meses.
 *  - `reduce_installment` se mantiene el número de meses y baja la cuota.
 *
 * En el sistema americano el capital vive hasta el final, así que un abono
 * siempre baja el interés periódico (equivale a `reduce_installment`).
 */
export function recalculateRemaining(input: RecalculateInput): ScheduleRow[] {
  const {
    balance,
    monthlyRate,
    system,
    mode,
    remainingDueDates,
    startInstallment,
    currentPayment,
    currentPrincipal,
  } = input;

  if (balance <= 0 || remainingDueDates.length === 0) return [];

  const rate = system === "zero_interest" ? 0 : monthlyRate;
  const maxTerm = remainingDueDates.length;
  const wantsShorterTerm = mode === "reduce_term" && system !== "american";

  let term = maxTerm;
  let fixedPayment: number | undefined;
  let fixedPrincipal: number | undefined;

  if (wantsShorterTerm) {
    if (system === "french") {
      const solved = termForPayment(balance, rate, currentPayment);
      // Si la cuota vigente no cubre el interés, no hay plazo posible:
      // caemos a "mantener plazo" en vez de generar un plan imposible.
      if (solved && solved > 0) {
        term = Math.min(solved, maxTerm);
        fixedPayment = currentPayment;
      }
    } else {
      const flat = currentPrincipal ?? balance / maxTerm;
      if (flat > 0) {
        term = Math.min(Math.ceil(toCents(balance) / toCents(flat)), maxTerm);
        fixedPrincipal = flat;
      }
    }
  }

  return buildSchedule({
    principal: balance,
    monthlyRate: rate,
    termMonths: term,
    system,
    firstPaymentDate: remainingDueDates[0],
    startInstallment,
    fixedPayment,
    fixedPrincipal,
    dueDates: remainingDueDates.slice(0, term),
  });
}

// ---------------------------------------------------------------------------
// Reparto de un pago entre interés y capital
// ---------------------------------------------------------------------------

interface AllocationInput {
  /** Efectivo aplicado a la cuota. */
  amount: number;
  /** Interés que trae programada la cuota. */
  scheduledInterest: number;
  /** Saldo vivo antes del pago (techo del capital que se puede abonar). */
  openingBalance: number;
}

interface Allocation {
  interestPaid: number;
  principalPaid: number;
  /** Sobrante que no cabe como capital de esta cuota. */
  surplus: number;
}

/**
 * Reparte un pago: primero el interés causado, el resto contra capital.
 * Es el orden con el que imputan los bancos y evita que un pago corto
 * "amortice" capital que en realidad no se abonó.
 */
export function allocatePayment(input: AllocationInput): Allocation {
  const amount = toCents(input.amount);
  const interestDue = toCents(input.scheduledInterest);
  const balance = toCents(input.openingBalance);

  const interestPaid = Math.min(amount, interestDue);
  const principalPaid = Math.min(amount - interestPaid, balance);
  const surplus = amount - interestPaid - principalPaid;

  return {
    interestPaid: fromCents(interestPaid),
    principalPaid: fromCents(principalPaid),
    surplus: fromCents(surplus),
  };
}

// ---------------------------------------------------------------------------
// Reconstrucción del plan a partir del historial de pagos
// ---------------------------------------------------------------------------

/** Un movimiento tal y como lo registró el usuario. */
export interface PaymentEvent {
  /** Identificador del pago; se devuelve en la imputación resultante. */
  id?: string;
  /** Fecha del movimiento — determina el orden de aplicación. */
  date: DateISO;
  /** `true` si salda una cuota; `false` si es un abono a capital suelto. */
  settlesInstallment: boolean;
  /** Efectivo aplicado a la cuota. */
  amountPaid: number;
  /** Abono extraordinario a capital. */
  extraPrincipal: number;
}

export interface ReplayedRow extends ScheduleRow {
  paid: boolean;
  paidAmount: number;
  /**
   * Abono a capital aplicado ENTRE la cuota anterior y ésta.
   *
   * Sin este dato el plan mostraría un salto inexplicable: el saldo baja más
   * de lo que amortizó la cuota previa. Con él se cumple
   *   `opening[i] === closing[i-1] − extraPrincipalBefore[i]`
   * y la pantalla puede rotular el abono donde de verdad ocurrió.
   */
  extraPrincipalBefore: number;
}

/** Imputación real de un pago, recalculada sobre el plan vigente. */
export interface EventAllocation {
  id?: string;
  installment: number | null;
  interestPaid: number;
  principalPaid: number;
  extraPrincipal: number;
  paidAmount: number;
  balanceAfter: number;
}

export interface ReplayResult {
  rows: ReplayedRow[];
  allocations: EventAllocation[];
  /** Movimientos que ya no caben en el plan (por ejemplo, tras saldarlo). */
  rejected: Array<{ id?: string; reason: string }>;
  balance: number;
  settled: boolean;
}

export interface ReplayInput {
  principal: number;
  monthlyRate: number;
  termMonths: number;
  system: AmortizationSystem;
  firstPaymentDate: DateISO;
  mode: ExtraPrincipalMode;
  events: PaymentEvent[];
}

const round2 = (n: number): number => fromCents(toCents(n));

/**
 * Regenera la cola del plan a partir de `fromIndex`, conservando las fechas de
 * vencimiento que ya existían.
 */
function regenerateTail(
  rows: ReplayedRow[],
  fromIndex: number,
  balance: number,
  anchor: { payment: number; principal: number },
  input: ReplayInput,
): ReplayedRow[] {
  const head = rows.slice(0, fromIndex);
  if (balance <= 0.009) return head;

  const tail = rows.slice(fromIndex);
  // Si el saldo sobrevive a la última cuota programada hay que abrir otra:
  // una deuda sin fecha de pago no es un plan.
  const dueDates =
    tail.length > 0
      ? tail.map((r) => r.dueDate)
      : [addMonths(rows[rows.length - 1].dueDate, 1)];

  const next = recalculateRemaining({
    balance,
    monthlyRate: input.monthlyRate,
    system: input.system,
    mode: input.mode,
    remainingDueDates: dueDates,
    startInstallment: head.length + 1,
    currentPayment: anchor.payment,
    currentPrincipal: anchor.principal,
  });

  return [
    ...head,
    ...next.map((r) => ({
      ...r,
      paid: false,
      paidAmount: 0,
      extraPrincipalBefore: 0,
    })),
  ];
}

/**
 * Reconstruye el plan de pagos completo desde el crédito y su historial.
 *
 * Esta es la pieza que permite corregir errores: el plan no se va parcheando
 * pago a pago, se vuelve a derivar entero. Borrar o editar un movimiento es
 * simplemente volver a llamar aquí con la lista nueva.
 *
 * Las cuotas se reasignan por orden cronológico: si borras el tercer pago de
 * nueve, los seis siguientes pasan a ser las cuotas 3 a 8. Por eso el número
 * de cuota que traiga el evento no se usa — manda el orden real de los hechos.
 */
export function replaySchedule(input: ReplayInput): ReplayResult {
  const rate = input.system === "zero_interest" ? 0 : input.monthlyRate;

  let rows: ReplayedRow[] = buildSchedule({
    principal: input.principal,
    monthlyRate: rate,
    termMonths: input.termMonths,
    system: input.system,
    firstPaymentDate: input.firstPaymentDate,
  }).map((r) => ({
    ...r,
    paid: false,
    paidAmount: 0,
    extraPrincipalBefore: 0,
  }));

  const allocations: EventAllocation[] = [];
  const rejected: ReplayResult["rejected"] = [];

  // Cronológico. A igual fecha, la cuota antes que el abono suelto: es el
  // orden con el que el banco imputa el dinero de ese día.
  const ordered = [...input.events].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return Number(b.settlesInstallment) - Number(a.settlesInstallment);
  });

  for (const event of ordered) {
    const index = rows.findIndex((r) => !r.paid);

    if (index === -1) {
      rejected.push({
        id: event.id,
        reason: "El crédito ya estaba saldado en esa fecha.",
      });
      continue;
    }

    const row = rows[index];

    if (event.settlesInstallment) {
      const allocation = allocatePayment({
        amount: event.amountPaid,
        scheduledInterest: row.interest,
        openingBalance: row.openingBalance,
      });

      const room = round2(row.openingBalance - allocation.principalPaid);
      const extraApplied = Math.min(
        round2(event.extraPrincipal + allocation.surplus),
        room,
      );
      const settledAmount = round2(event.amountPaid - allocation.surplus);
      const balanceAfter = round2(
        row.openingBalance - allocation.principalPaid - extraApplied,
      );

      // La cuota pagada deja de ser una previsión y pasa a ser un hecho:
      // se guarda lo que realmente se imputó.
      const paidRow: ReplayedRow = {
        ...row,
        paid: true,
        paidAmount: settledAmount,
        interest: allocation.interestPaid,
        principal: round2(allocation.principalPaid + extraApplied),
        payment: round2(settledAmount + extraApplied),
        closingBalance: balanceAfter,
      };
      rows = [...rows.slice(0, index), paidRow, ...rows.slice(index + 1)];

      allocations.push({
        id: event.id,
        installment: row.installment,
        interestPaid: allocation.interestPaid,
        principalPaid: allocation.principalPaid,
        extraPrincipal: extraApplied,
        paidAmount: settledAmount,
        balanceAfter,
      });

      const followsPlan =
        extraApplied === 0 &&
        Math.abs(balanceAfter - row.closingBalance) < 0.01;

      if (!followsPlan) {
        rows = regenerateTail(
          rows,
          index + 1,
          balanceAfter,
          { payment: row.payment, principal: row.principal },
          { ...input, monthlyRate: rate },
        );
      }
    } else {
      const amount = Math.min(round2(event.extraPrincipal), row.openingBalance);
      const balanceAfter = round2(row.openingBalance - amount);

      allocations.push({
        id: event.id,
        installment: null,
        interestPaid: 0,
        principalPaid: 0,
        extraPrincipal: amount,
        paidAmount: 0,
        balanceAfter,
      });

      const carried = row.extraPrincipalBefore;
      rows = regenerateTail(
        rows,
        index,
        balanceAfter,
        { payment: row.payment, principal: row.principal },
        { ...input, monthlyRate: rate },
      );

      // El abono se anota en la cuota que queda por delante: ahí es donde el
      // saldo da el salto y donde hay que explicarlo.
      if (rows[index]) {
        rows[index] = {
          ...rows[index],
          extraPrincipalBefore: round2(carried + amount),
        };
      }
    }
  }

  const firstUnpaid = rows.find((r) => !r.paid);
  const balance = firstUnpaid ? firstUnpaid.openingBalance : 0;

  return {
    rows,
    allocations,
    rejected,
    balance,
    settled: balance <= 0.009,
  };
}
