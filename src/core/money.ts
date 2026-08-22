/**
 * Dinero.
 *
 * La base guarda `numeric(16,2)`, así que todo importe que salga de un cálculo
 * se redondea al centavo antes de persistirse. Vive en el dominio y no en la
 * capa de datos porque es una regla del negocio, no del motor de almacenamiento.
 */

/** Redondea al centavo. */
export function money(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Tolerancia para comparar importes.
 *
 * Un céntimo de diferencia por redondeo no significa que queden deudas: sin
 * esta holgura, un crédito liquidado se quedaría abierto con un saldo de 0,004.
 */
const EPSILON = 0.009;

/** ¿Este saldo puede darse por liquidado? */
export function isSettled(balance: number): boolean {
  return balance <= EPSILON;
}

/** ¿`amount` supera a `ceiling` de forma significativa? */
export function exceeds(amount: number, ceiling: number): boolean {
  return amount > ceiling + EPSILON;
}
