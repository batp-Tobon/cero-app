-- ============================================================================
-- CERO · Borrar movimientos y bolsillos de ahorro
--
-- Un movimiento mal registrado se queda para siempre si no hay forma de
-- retirarlo, y falsea el saldo desde ese día en adelante.
--
-- Sólo se pueden borrar los movimientos MANUALES. Los de tipo
-- `budget_surplus` los deriva `sync_budget_surplus_for_user` del presupuesto
-- en cada carga: borrarlos daría una sensación falsa de control, porque
-- reaparecerían al instante. Para que dejen de existir hay que cambiar el
-- presupuesto del mes, que es su verdadera fuente.
-- ============================================================================

create or replace function private.delete_savings_movement(p_movement_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_user_id uuid := (select auth.uid());
  v_pocket_id uuid;
  v_kind public.savings_movement_kind;
  v_amount numeric(16,2);
  v_balance numeric(16,2);
begin
  if v_user_id is null then
    raise insufficient_privilege using message = 'Authentication required';
  end if;
  if not private.has_saas_write_access() then
    raise insufficient_privilege using message = 'Subscription required';
  end if;

  select movement.pocket_id, movement.kind, movement.amount
  into v_pocket_id, v_kind, v_amount
  from public.savings_movements movement
  where movement.id = p_movement_id
    and movement.user_id = v_user_id;

  if not found then
    raise no_data_found using message = 'Savings movement not found';
  end if;

  if v_kind = 'budget_surplus' then
    raise check_violation using message = 'Automatic surplus cannot be deleted';
  end if;

  -- Mismo candado que al registrar: sin él, dos borrados simultáneos podrían
  -- leer el mismo saldo y dejarlo en negativo entre los dos.
  perform pg_advisory_xact_lock(hashtextextended(v_pocket_id::text, 0));

  -- Retirar una entrada puede dejar el bolsillo en descubierto si ya se
  -- gastó. El saldo se recalcula SIN este movimiento antes de decidir.
  select coalesce(sum(
    case when movement.kind = 'withdrawal' then -movement.amount else movement.amount end
  ), 0)
  into v_balance
  from public.savings_movements movement
  where movement.pocket_id = v_pocket_id
    and movement.id <> p_movement_id;

  if v_balance < 0 then
    raise check_violation using message = 'Deleting leaves a negative balance';
  end if;

  delete from public.savings_movements where id = p_movement_id;
end;
$fn$;

create or replace function public.delete_savings_movement(p_movement_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $fn$
  select private.delete_savings_movement(p_movement_id);
$fn$;

-- ---------------------------------------------------------------------------
-- Borrar un bolsillo entero
--
-- Se borra de verdad, con sus movimientos por cascada: si sigue apareciendo
-- en el historial, para quien lo borró no está borrado. `archived_at` se
-- reserva para un archivado explícito, que hoy no existe.
-- ---------------------------------------------------------------------------
create or replace function private.delete_savings_pocket(p_pocket_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise insufficient_privilege using message = 'Authentication required';
  end if;
  if not private.has_saas_write_access() then
    raise insufficient_privilege using message = 'Subscription required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_pocket_id::text, 0));

  delete from public.savings_pockets
  where id = p_pocket_id
    and user_id = v_user_id;

  if not found then
    raise no_data_found using message = 'Savings pocket not found';
  end if;
end;
$fn$;

create or replace function public.delete_savings_pocket(p_pocket_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $fn$
  select private.delete_savings_pocket(p_pocket_id);
$fn$;

revoke all on function private.delete_savings_movement(uuid) from public, anon, authenticated;
revoke all on function private.delete_savings_pocket(uuid)   from public, anon, authenticated;
grant execute on function private.delete_savings_movement(uuid) to authenticated;
grant execute on function private.delete_savings_pocket(uuid)   to authenticated;

revoke all on function public.delete_savings_movement(uuid) from public, anon;
revoke all on function public.delete_savings_pocket(uuid)   from public, anon;
grant execute on function public.delete_savings_movement(uuid) to authenticated;
grant execute on function public.delete_savings_pocket(uuid)   to authenticated;
