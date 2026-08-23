-- ============================================================================
-- CERO · Ahorros y bolsillos
--
-- Los saldos se derivan de un libro inmutable de movimientos. El excedente
-- de cada presupuesto guardado se sincroniza como un único movimiento por
-- mes: volver a abrir la pantalla actualiza el importe, nunca lo duplica.
-- ============================================================================

do $$ begin
  create type public.savings_movement_kind as enum
    ('deposit', 'withdrawal', 'budget_surplus');
exception when duplicate_object then null;
end $$;

create table public.savings_pockets (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  name         text not null check (length(btrim(name)) between 1 and 60),
  currency     text not null default 'COP' check (currency = upper(currency) and length(currency) = 3),
  goal_amount  numeric(16,2) check (goal_amount > 0),
  color        public.accent_color not null default 'emerald',
  icon         text check (
    icon is null or icon in (
      'car', 'house', 'building', 'card', 'wallet', 'bank',
      'study', 'travel', 'health', 'phone', 'furniture', 'work'
    )
  ),
  is_default   boolean not null default false,
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint savings_pockets_id_user_key unique (id, user_id)
);

create unique index savings_pockets_one_default_idx
  on public.savings_pockets (user_id)
  where is_default and archived_at is null;
create index savings_pockets_user_active_idx
  on public.savings_pockets (user_id, created_at)
  where archived_at is null;

create table public.savings_movements (
  id             uuid primary key default gen_random_uuid(),
  pocket_id      uuid not null,
  user_id        uuid not null references auth.users(id) on delete cascade,
  kind           public.savings_movement_kind not null,
  amount         numeric(16,2) not null check (amount > 0),
  movement_date  date not null default current_date,
  source_month   date,
  description    text check (description is null or length(btrim(description)) between 1 and 120),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint savings_movements_pocket_user_fkey
    foreign key (pocket_id, user_id)
    references public.savings_pockets(id, user_id)
    on delete cascade,
  constraint savings_movements_source_month_check check (
    (kind = 'budget_surplus' and source_month is not null
      and source_month = date_trunc('month', source_month)::date)
    or (kind <> 'budget_surplus' and source_month is null)
  )
);

create index savings_movements_pocket_date_idx
  on public.savings_movements (pocket_id, movement_date desc, created_at desc);
create index savings_movements_user_date_idx
  on public.savings_movements (user_id, movement_date desc);
create unique index savings_movements_one_surplus_month_idx
  on public.savings_movements (user_id, source_month)
  where kind = 'budget_surplus';

create trigger savings_pockets_updated_at before update on public.savings_pockets
  for each row execute function extensions.moddatetime(updated_at);
create trigger savings_movements_updated_at before update on public.savings_movements
  for each row execute function extensions.moddatetime(updated_at);

alter table public.savings_pockets enable row level security;
alter table public.savings_movements enable row level security;

create policy savings_pockets_select_own on public.savings_pockets
  for select to authenticated
  using (user_id = (select auth.uid()));
create policy savings_movements_select_own on public.savings_movements
  for select to authenticated
  using (user_id = (select auth.uid()));

-- El navegador sólo lee el libro. Todas las escrituras pasan por funciones
-- transaccionales que validan dueño, suscripción y saldo.
revoke all on public.savings_pockets, public.savings_movements from anon, authenticated;
grant select on public.savings_pockets, public.savings_movements to authenticated;

create or replace function private.create_savings_pocket(
  p_name text,
  p_currency text,
  p_initial_amount numeric,
  p_goal_amount numeric,
  p_color public.accent_color,
  p_icon text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_user_id uuid := (select auth.uid());
  v_pocket_id uuid;
begin
  if v_user_id is null then
    raise insufficient_privilege using message = 'Authentication required';
  end if;
  if not private.has_saas_write_access() then
    raise insufficient_privilege using message = 'Subscription required';
  end if;
  if length(btrim(p_name)) not between 1 and 60
     or length(p_currency) <> 3
     or p_currency <> upper(p_currency)
     or p_initial_amount < 0
     or (p_goal_amount is not null and p_goal_amount <= 0)
     or p_icon not in (
       'car', 'house', 'building', 'card', 'wallet', 'bank',
       'study', 'travel', 'health', 'phone', 'furniture', 'work'
     ) then
    raise check_violation using message = 'Invalid savings pocket';
  end if;
  if (select count(*) from public.savings_pockets
      where user_id = v_user_id and archived_at is null) >= 20 then
    raise check_violation using message = 'Savings pocket limit reached';
  end if;

  insert into public.savings_pockets (
    user_id, name, currency, goal_amount, color, icon
  ) values (
    v_user_id, btrim(p_name), p_currency, p_goal_amount, p_color, p_icon
  ) returning id into v_pocket_id;

  if p_initial_amount > 0 then
    insert into public.savings_movements (
      pocket_id, user_id, kind, amount, movement_date, description
    ) values (
      v_pocket_id, v_user_id, 'deposit', p_initial_amount,
      (now() at time zone 'America/Bogota')::date, 'Saldo inicial'
    );
  end if;

  return v_pocket_id;
end;
$fn$;

create or replace function public.create_savings_pocket(
  p_name text,
  p_currency text,
  p_initial_amount numeric,
  p_goal_amount numeric,
  p_color public.accent_color,
  p_icon text
)
returns uuid
language sql
security invoker
set search_path = ''
as $fn$
  select private.create_savings_pocket(
    p_name, p_currency, p_initial_amount, p_goal_amount, p_color, p_icon
  );
$fn$;

create or replace function private.register_savings_movement(
  p_pocket_id uuid,
  p_kind public.savings_movement_kind,
  p_amount numeric,
  p_movement_date date,
  p_description text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_user_id uuid := (select auth.uid());
  v_balance numeric(16,2);
  v_movement_id uuid;
begin
  if v_user_id is null then
    raise insufficient_privilege using message = 'Authentication required';
  end if;
  if not private.has_saas_write_access() then
    raise insufficient_privilege using message = 'Subscription required';
  end if;
  if p_kind not in ('deposit', 'withdrawal')
     or p_amount <= 0
     or p_movement_date > (now() at time zone 'America/Bogota')::date
     or p_movement_date < date '2000-01-01'
     or length(coalesce(p_description, '')) > 120 then
    raise check_violation using message = 'Invalid savings movement';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_pocket_id::text, 0));
  perform 1
  from public.savings_pockets pocket
  where pocket.id = p_pocket_id
    and pocket.user_id = v_user_id
    and pocket.archived_at is null
  for update;
  if not found then
    raise no_data_found using message = 'Savings pocket not found';
  end if;

  select coalesce(sum(
    case when movement.kind = 'withdrawal' then -movement.amount else movement.amount end
  ), 0)
  into v_balance
  from public.savings_movements movement
  where movement.pocket_id = p_pocket_id;

  if p_kind = 'withdrawal' and p_amount > v_balance then
    raise check_violation using message = 'Withdrawal exceeds savings balance';
  end if;

  insert into public.savings_movements (
    pocket_id, user_id, kind, amount, movement_date, description
  ) values (
    p_pocket_id, v_user_id, p_kind, p_amount, p_movement_date,
    nullif(btrim(p_description), '')
  ) returning id into v_movement_id;

  return v_movement_id;
end;
$fn$;

create or replace function public.register_savings_movement(
  p_pocket_id uuid,
  p_kind public.savings_movement_kind,
  p_amount numeric,
  p_movement_date date,
  p_description text
)
returns uuid
language sql
security invoker
set search_path = ''
as $fn$
  select private.register_savings_movement(
    p_pocket_id, p_kind, p_amount, p_movement_date, p_description
  );
$fn$;

-- Sincroniza un mes específico. La función es interna porque escribe un tipo
-- de movimiento que el cliente nunca puede registrar manualmente.
create or replace function private.sync_budget_surplus_for_user(
  p_user_id uuid,
  p_month date
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_currency text;
  v_income numeric(16,2);
  v_expenses numeric(16,2);
  v_credit_debt numeric(16,2);
  v_card_debt numeric(16,2);
  v_surplus numeric(16,2);
  v_pocket_id uuid;
  v_pocket_currency text;
  v_today date := (now() at time zone 'America/Bogota')::date;
begin
  if p_user_id is null or p_user_id <> (select auth.uid()) then
    raise insufficient_privilege using message = 'Authentication required';
  end if;
  if p_month <> date_trunc('month', p_month)::date
     or p_month > date_trunc('month', v_today)::date then
    raise check_violation using message = 'Invalid savings month';
  end if;

  select budget.currency,
         coalesce((select sum(income.amount)
                   from public.budget_incomes income
                   where income.budget_id = budget.id), 0),
         coalesce((select sum(expense.amount)
                   from public.budget_expenses expense
                   where expense.budget_id = budget.id), 0)
  into v_currency, v_income, v_expenses
  from public.monthly_budgets budget
  where budget.user_id = p_user_id and budget.month = p_month;

  if not found then
    return null;
  end if;

  select coalesce(sum(schedule.payment_amount), 0)
  into v_credit_debt
  from public.credit_schedule schedule
  where schedule.due_date >= p_month
    and schedule.due_date < (p_month + interval '1 month')::date
    and exists (
      select 1
      from public.credit_members member
      where member.credit_id = schedule.credit_id
        and member.user_id = p_user_id
    );

  select coalesce(sum(statement.total_due), 0)
  into v_card_debt
  from public.revolving_statements statement
  join public.revolving_accounts account on account.id = statement.account_id
  where account.owner_id = p_user_id
    and statement.due_date >= p_month
    and statement.due_date < (p_month + interval '1 month')::date;

  v_surplus := greatest(
    v_income - v_expenses - v_credit_debt - v_card_debt,
    0
  );

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  if v_surplus = 0 then
    delete from public.savings_movements
    where user_id = p_user_id
      and kind = 'budget_surplus'
      and source_month = p_month;
    return 0;
  end if;

  select pocket.id, pocket.currency
  into v_pocket_id, v_pocket_currency
  from public.savings_pockets pocket
  where pocket.user_id = p_user_id
    and pocket.is_default
    and pocket.archived_at is null
  for update;

  if not found then
    insert into public.savings_pockets (
      user_id, name, currency, color, icon, is_default
    ) values (
      p_user_id, 'Ahorro automático', v_currency, 'emerald', 'wallet', true
    )
    on conflict (user_id) where is_default and archived_at is null do nothing
    returning id, currency into v_pocket_id, v_pocket_currency;

    if v_pocket_id is null then
      select pocket.id, pocket.currency
      into v_pocket_id, v_pocket_currency
      from public.savings_pockets pocket
      where pocket.user_id = p_user_id
        and pocket.is_default
        and pocket.archived_at is null;
    end if;
  end if;

  if v_pocket_currency <> v_currency then
    raise check_violation using message = 'Savings and budget currencies differ';
  end if;

  insert into public.savings_movements (
    pocket_id, user_id, kind, amount, movement_date, source_month, description
  ) values (
    v_pocket_id,
    p_user_id,
    'budget_surplus',
    v_surplus,
    least(v_today, (p_month + interval '1 month - 1 day')::date),
    p_month,
    'Excedente del presupuesto'
  )
  on conflict (user_id, source_month) where kind = 'budget_surplus'
  do update set
    pocket_id = excluded.pocket_id,
    amount = excluded.amount,
    movement_date = excluded.movement_date,
    description = excluded.description;

  return v_surplus;
end;
$fn$;

create or replace function private.sync_budget_surpluses(
  p_through_month date
)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_user_id uuid := (select auth.uid());
  v_month date;
  v_current_month date := date_trunc(
    'month', (now() at time zone 'America/Bogota')::date
  )::date;
begin
  if v_user_id is null then
    raise insufficient_privilege using message = 'Authentication required';
  end if;
  if p_through_month <> date_trunc('month', p_through_month)::date then
    raise check_violation using message = 'Invalid savings month';
  end if;

  for v_month in
    select budget.month
    from public.monthly_budgets budget
    where budget.user_id = v_user_id
      and budget.month <= least(p_through_month, v_current_month)
    order by budget.month desc
    limit 120
  loop
    perform private.sync_budget_surplus_for_user(v_user_id, v_month);
  end loop;
end;
$fn$;

create or replace function public.sync_budget_surpluses(p_through_month date)
returns void
language sql
security invoker
set search_path = ''
as $fn$
  select private.sync_budget_surpluses(p_through_month);
$fn$;

-- Snapshot agregado: evita traer todo el libro al servidor para calcular un
-- saldo y mantiene una sola consulta indexada aunque haya años de historial.
create or replace function public.savings_snapshot(p_month date)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $fn$
  with bounds as (
    select p_month as month, (p_month + interval '1 month')::date as next_month
  ),
  pocket_totals as (
    select
      pocket.id,
      pocket.name,
      pocket.currency,
      pocket.goal_amount,
      pocket.color,
      pocket.icon,
      pocket.is_default,
      pocket.created_at,
      coalesce(sum(
        case when movement.kind = 'withdrawal' then -movement.amount else movement.amount end
      ), 0) as balance,
      coalesce(sum(
        case when movement.movement_date < bounds.next_month
          then case when movement.kind = 'withdrawal' then -movement.amount else movement.amount end
          else 0 end
      ), 0) as balance_at_month_end,
      coalesce(sum(
        case when movement.movement_date >= bounds.month
                   and movement.movement_date < bounds.next_month
          then case when movement.kind = 'withdrawal' then -movement.amount else movement.amount end
          else 0 end
      ), 0) as month_net
    from public.savings_pockets pocket
    cross join bounds
    left join public.savings_movements movement on movement.pocket_id = pocket.id
    where pocket.user_id = (select auth.uid())
      and pocket.archived_at is null
    group by
      pocket.id, pocket.name, pocket.currency, pocket.goal_amount,
      pocket.color, pocket.icon, pocket.is_default, pocket.created_at
  ),
  selected_movements as (
    select
      movement.id,
      movement.pocket_id,
      pocket.name as pocket_name,
      movement.kind,
      movement.amount,
      movement.movement_date,
      movement.source_month,
      movement.description,
      movement.created_at
    from public.savings_movements movement
    join public.savings_pockets pocket on pocket.id = movement.pocket_id
    cross join bounds
    where movement.user_id = (select auth.uid())
      and movement.movement_date >= bounds.month
      and movement.movement_date < bounds.next_month
  )
  select jsonb_build_object(
    'month', p_month,
    'currency', coalesce(
      (select profile.currency from public.profiles profile
       where profile.id = (select auth.uid())),
      'COP'
    ),
    'budget_saved', exists (
      select 1 from public.monthly_budgets budget
      where budget.user_id = (select auth.uid()) and budget.month = p_month
    ),
    'total_balance', coalesce((select sum(balance) from pocket_totals), 0),
    'balance_at_month_end', coalesce((select sum(balance_at_month_end) from pocket_totals), 0),
    'month_net', coalesce((select sum(month_net) from pocket_totals), 0),
    'automatic_surplus', coalesce((
      select sum(amount) from selected_movements where kind = 'budget_surplus'
    ), 0),
    'pockets', coalesce((
      select jsonb_agg(to_jsonb(pocket_totals) order by is_default desc, created_at)
      from pocket_totals
    ), '[]'::jsonb),
    'movements', coalesce((
      select jsonb_agg(to_jsonb(selected_movements)
                       order by movement_date desc, created_at desc)
      from selected_movements
    ), '[]'::jsonb)
  );
$fn$;

revoke all on function private.create_savings_pocket(
  text, text, numeric, numeric, public.accent_color, text
) from public, anon, authenticated;
revoke all on function private.register_savings_movement(
  uuid, public.savings_movement_kind, numeric, date, text
) from public, anon, authenticated;
revoke all on function private.sync_budget_surplus_for_user(uuid, date)
  from public, anon, authenticated;
revoke all on function private.sync_budget_surpluses(date)
  from public, anon, authenticated;

grant execute on function private.create_savings_pocket(
  text, text, numeric, numeric, public.accent_color, text
) to authenticated;
grant execute on function private.register_savings_movement(
  uuid, public.savings_movement_kind, numeric, date, text
) to authenticated;
grant execute on function private.sync_budget_surplus_for_user(uuid, date)
  to authenticated;
grant execute on function private.sync_budget_surpluses(date)
  to authenticated;

revoke all on function public.create_savings_pocket(
  text, text, numeric, numeric, public.accent_color, text
) from public, anon;
revoke all on function public.register_savings_movement(
  uuid, public.savings_movement_kind, numeric, date, text
) from public, anon;
revoke all on function public.sync_budget_surpluses(date) from public, anon;
revoke all on function public.savings_snapshot(date) from public, anon;

grant execute on function public.create_savings_pocket(
  text, text, numeric, numeric, public.accent_color, text
) to authenticated;
grant execute on function public.register_savings_movement(
  uuid, public.savings_movement_kind, numeric, date, text
) to authenticated;
grant execute on function public.sync_budget_surpluses(date) to authenticated;
grant execute on function public.savings_snapshot(date) to authenticated;

comment on function public.sync_budget_surpluses(date)
is 'Sincroniza de forma idempotente el excedente de cada presupuesto guardado en el bolsillo automático.';
comment on function public.savings_snapshot(date)
is 'Resumen privado de bolsillos, saldos y movimientos del mes solicitado.';
