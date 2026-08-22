-- Escrituras financieras atómicas. El navegador conserva SELECT con RLS, pero
-- no puede reescribir cronogramas, imputaciones ni saldos calculados.

alter table public.revolving_movements
  add column statement_applied_amount numeric(16,2) not null default 0
  check (statement_applied_amount >= 0 and statement_applied_amount <= amount);

create or replace function private.replace_credit_replay(
  p_credit_id uuid,
  p_expected_history jsonb,
  p_schedule jsonb,
  p_allocations jsonb,
  p_next_status public.credit_status
)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_history jsonb;
begin
  if jsonb_typeof(p_expected_history) <> 'array'
     or jsonb_typeof(p_schedule) <> 'array'
     or jsonb_typeof(p_allocations) <> 'array'
     or jsonb_array_length(p_schedule) > 600
     or p_next_status not in ('active', 'paid') then
    raise check_violation using message = 'Invalid credit replay payload';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_credit_id::text, 0));
  perform 1 from public.credits where id = p_credit_id for update;
  if not found then raise no_data_found using message = 'Credit not found'; end if;

  -- Bloquea los hechos mientras verifica que el cálculo se hizo sobre la misma
  -- versión del historial que continúa en la base.
  perform 1 from public.payments where credit_id = p_credit_id for update;
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', payment.id::text,
        'payment_date', payment.payment_date::text,
        'amount_paid', payment.amount_paid,
        'extra_principal', payment.extra_principal
      ) order by payment.payment_date, payment.created_at, payment.id
    ),
    '[]'::jsonb
  ) into v_history
  from public.payments payment
  where payment.credit_id = p_credit_id;

  if v_history <> p_expected_history then
    raise serialization_failure using message = 'Credit history changed during replay';
  end if;

  delete from public.credit_schedule where credit_id = p_credit_id;
  insert into public.credit_schedule (
    credit_id, installment_number, due_date, opening_balance, payment_amount,
    interest_amount, principal_amount, closing_balance,
    extra_principal_before, paid_amount, status, paid_at
  )
  select
    p_credit_id, row.installment_number, row.due_date, row.opening_balance,
    row.payment_amount, row.interest_amount, row.principal_amount,
    row.closing_balance, row.extra_principal_before, row.paid_amount,
    row.status, row.paid_at
  from jsonb_to_recordset(p_schedule) as row(
    installment_number integer,
    due_date date,
    opening_balance numeric,
    payment_amount numeric,
    interest_amount numeric,
    principal_amount numeric,
    closing_balance numeric,
    extra_principal_before numeric,
    paid_amount numeric,
    status public.installment_status,
    paid_at timestamptz
  );

  update public.payments
  set installment_number = null,
      principal_paid = 0,
      interest_paid = 0,
      balance_after = null
  where credit_id = p_credit_id;

  update public.payments payment
  set installment_number = allocation.installment_number,
      amount_paid = allocation.amount_paid,
      principal_paid = allocation.principal_paid,
      interest_paid = allocation.interest_paid,
      extra_principal = allocation.extra_principal,
      balance_after = allocation.balance_after
  from jsonb_to_recordset(p_allocations) as allocation(
    id uuid,
    installment_number integer,
    amount_paid numeric,
    principal_paid numeric,
    interest_paid numeric,
    extra_principal numeric,
    balance_after numeric
  )
  where payment.id = allocation.id and payment.credit_id = p_credit_id;

  update public.credits
  set status = p_next_status
  where id = p_credit_id and status <> 'cancelled';
end;
$fn$;

create or replace function public.replace_credit_replay(
  p_credit_id uuid,
  p_expected_history jsonb,
  p_schedule jsonb,
  p_allocations jsonb,
  p_next_status public.credit_status
)
returns void
language sql
security invoker
set search_path = ''
as $fn$
  select private.replace_credit_replay(
    p_credit_id, p_expected_history, p_schedule, p_allocations, p_next_status
  );
$fn$;

revoke all on function private.replace_credit_replay(uuid, jsonb, jsonb, jsonb, public.credit_status)
  from public, anon, authenticated;
revoke all on function public.replace_credit_replay(uuid, jsonb, jsonb, jsonb, public.credit_status)
  from public, anon, authenticated;
grant execute on function private.replace_credit_replay(uuid, jsonb, jsonb, jsonb, public.credit_status)
  to service_role;
grant execute on function public.replace_credit_replay(uuid, jsonb, jsonb, jsonb, public.credit_status)
  to service_role;

-- Registro de tarjeta serializado: dos compras simultáneas no pueden superar
-- el cupo y dos pagos simultáneos no pueden abonar más que el saldo.
create or replace function private.register_revolving_movement(
  p_user_id uuid,
  p_account_id uuid,
  p_kind public.movement_kind,
  p_amount numeric,
  p_movement_date date,
  p_description text,
  p_installment_count smallint,
  p_receipt_path text,
  p_receipt_name text,
  p_receipt_mime text,
  p_receipt_size bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_account public.revolving_accounts%rowtype;
  v_balance numeric(16,2);
  v_new_balance numeric(16,2);
  v_movement_id uuid;
  v_statement public.revolving_statements%rowtype;
  v_applied numeric(16,2);
begin
  if p_amount <= 0 or p_installment_count not between 1 and 60 then
    raise check_violation using message = 'Invalid movement amount';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_account_id::text, 0));
  select * into v_account
  from public.revolving_accounts
  where id = p_account_id and owner_id = p_user_id and status = 'active'
  for update;
  if not found then raise no_data_found using message = 'Account not found'; end if;

  select coalesce(sum(case when kind = 'payment' then -amount else amount end), 0)
  into v_balance
  from public.revolving_movements
  where account_id = p_account_id;

  if p_kind = 'payment' and p_amount > v_balance then
    raise check_violation using message = 'Payment exceeds balance';
  elsif p_kind <> 'payment' and p_amount > v_account.credit_limit - v_balance then
    raise check_violation using message = 'Movement exceeds credit limit';
  end if;

  if p_kind = 'payment' then
    select * into v_statement
    from public.revolving_statements
    where account_id = p_account_id and status in ('open', 'overdue')
    order by statement_date desc
    limit 1
    for update;
  end if;

  v_applied := case
    when v_statement.id is null then 0
    else least(p_amount, greatest(v_statement.total_due - v_statement.paid_amount, 0))
  end;

  insert into public.revolving_movements (
    account_id, statement_id, user_id, kind, amount, movement_date,
    description, installment_count, installments_paid, statement_applied_amount,
    receipt_path, receipt_name, receipt_mime, receipt_size
  ) values (
    p_account_id,
    case when v_statement.id is null then null else v_statement.id end,
    p_user_id, p_kind, p_amount, p_movement_date, nullif(btrim(p_description), ''),
    case when p_kind = 'charge' then p_installment_count else 1 end,
    0, v_applied, p_receipt_path, p_receipt_name, p_receipt_mime, p_receipt_size
  ) returning id into v_movement_id;

  if v_statement.id is not null then
    update public.revolving_statements
    set paid_amount = paid_amount + v_applied,
        status = case
          when paid_amount + v_applied >= total_due then 'paid'::public.statement_status
          when due_date < current_date then 'overdue'::public.statement_status
          else 'open'::public.statement_status
        end
    where id = v_statement.id;
  end if;

  v_new_balance := case
    when p_kind = 'payment' then v_balance - p_amount
    else v_balance + p_amount
  end;

  return jsonb_build_object(
    'movement_id', v_movement_id,
    'name', v_account.name,
    'currency', v_account.currency,
    'credit_limit', v_account.credit_limit,
    'balance', v_new_balance,
    'available', greatest(v_account.credit_limit - v_new_balance, 0)
  );
end;
$fn$;

create or replace function public.register_revolving_movement(
  p_user_id uuid,
  p_account_id uuid,
  p_kind public.movement_kind,
  p_amount numeric,
  p_movement_date date,
  p_description text,
  p_installment_count smallint,
  p_receipt_path text,
  p_receipt_name text,
  p_receipt_mime text,
  p_receipt_size bigint
)
returns jsonb
language sql
security invoker
set search_path = ''
as $fn$
  select private.register_revolving_movement(
    p_user_id, p_account_id, p_kind, p_amount, p_movement_date, p_description,
    p_installment_count, p_receipt_path, p_receipt_name, p_receipt_mime, p_receipt_size
  );
$fn$;

revoke all on function private.register_revolving_movement(
  uuid, uuid, public.movement_kind, numeric, date, text, smallint, text, text, text, bigint
) from public, anon, authenticated;
revoke all on function public.register_revolving_movement(
  uuid, uuid, public.movement_kind, numeric, date, text, smallint, text, text, text, bigint
) from public, anon, authenticated;
grant execute on function private.register_revolving_movement(
  uuid, uuid, public.movement_kind, numeric, date, text, smallint, text, text, text, bigint
) to service_role;
grant execute on function public.register_revolving_movement(
  uuid, uuid, public.movement_kind, numeric, date, text, smallint, text, text, text, bigint
) to service_role;

create or replace function private.delete_revolving_movement(
  p_user_id uuid,
  p_movement_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_account_id uuid;
  v_movement public.revolving_movements%rowtype;
begin
  select movement.account_id into v_account_id
  from public.revolving_movements movement
  join public.revolving_accounts account on account.id = movement.account_id
  where movement.id = p_movement_id and account.owner_id = p_user_id;
  if not found then raise no_data_found using message = 'Movement not found'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_account_id::text, 0));
  select movement.* into v_movement
  from public.revolving_movements movement
  join public.revolving_accounts account on account.id = movement.account_id
  where movement.id = p_movement_id and account.owner_id = p_user_id
  for update of movement;
  if not found then raise no_data_found using message = 'Movement not found'; end if;

  if v_movement.statement_id is not null and v_movement.statement_applied_amount > 0 then
    update public.revolving_statements
    set paid_amount = greatest(0, paid_amount - v_movement.statement_applied_amount),
        status = case
          when due_date < current_date then 'overdue'::public.statement_status
          else 'open'::public.statement_status
        end
    where id = v_movement.statement_id;
  end if;

  delete from public.revolving_movements where id = v_movement.id;
  return jsonb_build_object(
    'account_id', v_movement.account_id,
    'receipt_path', v_movement.receipt_path
  );
end;
$fn$;

create or replace function public.delete_revolving_movement(
  p_user_id uuid,
  p_movement_id uuid
)
returns jsonb
language sql
security invoker
set search_path = ''
as $fn$
  select private.delete_revolving_movement(p_user_id, p_movement_id);
$fn$;

revoke all on function private.delete_revolving_movement(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.delete_revolving_movement(uuid, uuid)
  from public, anon, authenticated;
grant execute on function private.delete_revolving_movement(uuid, uuid)
  to service_role;
grant execute on function public.delete_revolving_movement(uuid, uuid)
  to service_role;

-- Incluso una escritura privilegiada rechaza un cupo inferior al saldo vivo.
create or replace function private.guard_revolving_credit_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare v_balance numeric(16,2);
begin
  if new.credit_limit >= old.credit_limit then return new; end if;
  select coalesce(sum(case when kind = 'payment' then -amount else amount end), 0)
  into v_balance from public.revolving_movements where account_id = new.id;
  if new.credit_limit < v_balance then
    raise check_violation using message = 'Credit limit cannot be below current balance';
  end if;
  return new;
end;
$fn$;

revoke all on function private.guard_revolving_credit_limit()
  from public, anon, authenticated;
drop trigger if exists revolving_accounts_guard_limit on public.revolving_accounts;
create trigger revolving_accounts_guard_limit
  before update of credit_limit on public.revolving_accounts
  for each row execute function private.guard_revolving_credit_limit();

-- Sólo las acciones de servidor, después de autorizar con la sesión RLS,
-- ejecutan las mutaciones calculadas mediante service_role.
revoke insert, update, delete on public.credit_schedule from authenticated;
revoke insert, update, delete on public.payments from authenticated;
revoke insert, update, delete on public.revolving_movements from authenticated;

comment on function public.replace_credit_replay(uuid, jsonb, jsonb, jsonb, public.credit_status)
is 'Service-role only. Reemplaza plan e imputaciones en una única transacción optimista.';
comment on function public.register_revolving_movement(
  uuid, uuid, public.movement_kind, numeric, date, text, smallint, text, text, text, bigint
) is 'Service-role only. Serializa cupo, saldo, movimiento y pago de extracto.';
