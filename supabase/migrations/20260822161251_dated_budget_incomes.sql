-- ============================================================================
-- CERO · Ingresos fechados del presupuesto
--
-- Un sueldo no es una configuración del mes: es dinero que llega un día
-- concreto. Esta tabla permite registrar sueldo, prima u otros ingresos y
-- mantener `monthly_budgets.income_amount` sólo como total de compatibilidad.
-- ============================================================================

alter table public.monthly_budgets
  add constraint monthly_budgets_id_user_month_key
  unique (id, user_id, month);

create table public.budget_incomes (
  id            uuid primary key default gen_random_uuid(),
  budget_id     uuid not null,
  user_id       uuid not null references auth.users(id) on delete cascade,
  month         date not null,
  name          text not null default 'Sueldo'
                check (length(btrim(name)) between 1 and 80),
  amount        numeric(16,2) not null check (amount > 0),
  received_date date not null,
  recurring     boolean not null default true,
  position      int not null default 0 check (position >= 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint budget_incomes_first_day
    check (month = date_trunc('month', month)::date),
  constraint budget_incomes_date_in_month
    check (
      received_date >= month
      and received_date < (month + interval '1 month')::date
    ),
  constraint budget_incomes_budget_user_month_fkey
    foreign key (budget_id, user_id, month)
    references public.monthly_budgets(id, user_id, month)
    on delete cascade
);

create index budget_incomes_budget_position_idx
  on public.budget_incomes (budget_id, position, received_date);
create index budget_incomes_user_month_idx
  on public.budget_incomes (user_id, month, received_date);

create trigger budget_incomes_updated_at before update on public.budget_incomes
  for each row execute function extensions.moddatetime (updated_at);

alter table public.budget_incomes enable row level security;

create policy budget_incomes_select_own on public.budget_incomes
  for select to authenticated using (user_id = (select auth.uid()));
create policy budget_incomes_insert_own on public.budget_incomes
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy budget_incomes_update_own on public.budget_incomes
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy budget_incomes_delete_own on public.budget_incomes
  for delete to authenticated using (user_id = (select auth.uid()));

revoke all on public.budget_incomes from anon;
grant select, insert, update, delete on public.budget_incomes to authenticated;

-- Convierte el sueldo mensual existente en un ingreso fechado el primer día.
insert into public.budget_incomes (
  budget_id, user_id, month, name, amount, received_date, recurring, position
)
select id, user_id, month, 'Sueldo', income_amount, month, true, 0
from public.monthly_budgets
where income_amount > 0;

-- Guardado v2: cabecera, ingresos y gastos se reemplazan en una transacción.
create function public.save_monthly_budget_v2(
  p_month date,
  p_currency text,
  p_incomes jsonb,
  p_expenses jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $fn$
declare
  v_user_id uuid := (select auth.uid());
  v_budget_id uuid;
  v_income_total numeric(16,2);
begin
  if v_user_id is null then
    raise insufficient_privilege using message = 'Authentication required';
  end if;
  if p_month <> date_trunc('month', p_month)::date then
    raise check_violation using message = 'Month must be its first day';
  end if;
  if length(p_currency) <> 3 then
    raise check_violation using message = 'Currency must have three letters';
  end if;
  if jsonb_typeof(p_incomes) <> 'array' or jsonb_array_length(p_incomes) > 50 then
    raise check_violation using message = 'Incomes must be an array of at most 50 items';
  end if;
  if jsonb_typeof(p_expenses) <> 'array' or jsonb_array_length(p_expenses) > 100 then
    raise check_violation using message = 'Expenses must be an array of at most 100 items';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_incomes) as item(received_date date)
    where item.received_date < p_month
       or item.received_date >= (p_month + interval '1 month')::date
  ) then
    raise check_violation using message = 'Income date must belong to the budget month';
  end if;

  select coalesce(sum(item.amount), 0)
  into v_income_total
  from jsonb_to_recordset(p_incomes) as item(amount numeric);

  insert into public.monthly_budgets (user_id, month, income_amount, currency)
  values (v_user_id, p_month, v_income_total, upper(p_currency))
  on conflict (user_id, month) do update
    set income_amount = excluded.income_amount,
        currency = excluded.currency
  returning id into v_budget_id;

  delete from public.budget_incomes where budget_id = v_budget_id;
  delete from public.budget_expenses where budget_id = v_budget_id;

  insert into public.budget_incomes (
    budget_id, user_id, month, name, amount, received_date, recurring, position
  )
  select
    v_budget_id,
    v_user_id,
    p_month,
    btrim(item.name),
    item.amount,
    item.received_date,
    item.recurring,
    item.position
  from jsonb_to_recordset(p_incomes) as item(
    name text,
    amount numeric,
    received_date date,
    recurring boolean,
    position int
  );

  insert into public.budget_expenses (
    budget_id, user_id, name, category, amount, due_day, recurring, position
  )
  select
    v_budget_id,
    v_user_id,
    btrim(item.name),
    item.category::public.budget_expense_category,
    item.amount,
    item.due_day,
    item.recurring,
    item.position
  from jsonb_to_recordset(p_expenses) as item(
    name text,
    category text,
    amount numeric,
    due_day int,
    recurring boolean,
    position int
  );

  return v_budget_id;
end;
$fn$;

revoke all on function public.save_monthly_budget_v2(date, text, jsonb, jsonb)
  from public, anon;
grant execute on function public.save_monthly_budget_v2(date, text, jsonb, jsonb)
  to authenticated;

-- Compatibilidad con clientes anteriores: un importe se convierte en un
-- ingreso llamado Sueldo y fechado el primer día del mes.
create or replace function public.save_monthly_budget(
  p_month date,
  p_income_amount numeric,
  p_currency text,
  p_expenses jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $fn$
begin
  return public.save_monthly_budget_v2(
    p_month,
    p_currency,
    case
      when p_income_amount > 0 then jsonb_build_array(jsonb_build_object(
        'name', 'Sueldo',
        'amount', p_income_amount,
        'received_date', p_month,
        'recurring', true,
        'position', 0
      ))
      else '[]'::jsonb
    end,
    p_expenses
  );
end;
$fn$;
