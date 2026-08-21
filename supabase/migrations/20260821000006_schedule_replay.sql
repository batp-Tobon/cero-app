-- ============================================================================
-- CERO · 0006 · El plan pasa a derivarse del historial
--
-- Hasta ahora el plan se parcheaba pago a pago: cada cuota reescribía la cola.
-- Eso hacía imposible corregir un error, porque no había forma de "deshacer"
-- un pago intermedio.
--
-- Ahora el plan es una FUNCIÓN PURA de (crédito + lista de pagos). Borrar o
-- editar un movimiento es volver a derivarlo entero.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Abono a capital aplicado entre dos cuotas
--
-- Sin esta columna el plan mostraría un salto de saldo sin explicación: la
-- cuota anterior cerró en X y la siguiente abre en X − abono. Guardarlo deja
-- que la pantalla rotule el abono justo donde ocurrió.
-- ---------------------------------------------------------------------------
alter table public.credit_schedule
  add column if not exists extra_principal_before numeric(16,2) not null default 0
  check (extra_principal_before >= 0);

-- ---------------------------------------------------------------------------
-- Fuera el índice único de (credito, cuota)
--
-- Servía para frenar el doble envío del formulario, pero ya no describe un
-- invariante cierto: al borrar el tercero de nueve pagos, los seis siguientes
-- se renumeran y durante la reasignación el índice bloquearía la operación.
--
-- Que un pago no se duplique lo garantiza ahora la acción del servidor, que
-- rechaza un movimiento idéntico (mismo crédito, fecha e importe).
-- ---------------------------------------------------------------------------
drop index if exists public.payments_unique_installment_idx;

-- Al renumerar se pasa por un estado intermedio con installment_number nulo;
-- este índice mantiene rápidas esas dos pasadas.
create index if not exists payments_credit_installment_idx
  on public.payments (credit_id, installment_number);

-- ---------------------------------------------------------------------------
-- La reconstrucción borra y reinserta el plan entero en cada escritura.
-- ---------------------------------------------------------------------------
create index if not exists credit_schedule_rebuild_idx
  on public.credit_schedule (credit_id);
