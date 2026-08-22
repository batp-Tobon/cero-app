-- ============================================================================
-- CERO · Presupuesto mensual
--
-- El presupuesto no copia cuotas ni extractos: sólo guarda el sueldo y los
-- gastos que el usuario controla. Las obligaciones financieras se derivan de
-- credit_schedule y revolving_statements al consultar cada mes.
-- ============================================================================

do $$ begin create type public.budget_expense_category as enum
  ('housing','food','utilities','transport','health','education','family',
   'leisure','other');
  exception when duplicate_object then null; end $$;

create table if not exists public.monthly_budgets (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  month         date not null,
  income_amount numeric(16,2) not null default 0 check (income_amount >= 0),
  currency      text not null default 'COP' check (length(currency) = 3),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint monthly_budgets_first_day check (month = date_trunc('month', month)::date),
  constraint monthly_budgets_user_month_key unique (user_id, month),
  constraint monthly_budgets_id_user_key unique (id, user_id)
);

create index if not exists monthly_budgets_user_month_idx
  on public.monthly_budgets (user_id, month desc);

create table if not exists public.budget_expenses (
  id         uuid primary key default gen_random_uuid(),
  budget_id  uuid not null,
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null check (length(btrim(name)) between 1 and 80),
  category   public.budget_expense_category not null default 'other',
  amount     numeric(16,2) not null check (amount > 0),
  due_day    int not null default 1 check (due_day between 1 and 31),
  recurring  boolean not null default true,
  position   int not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint budget_expenses_budget_user_fkey
    foreign key (budget_id, user_id)
    references public.monthly_budgets(id, user_id)
    on delete cascade
);

create index if not exists budget_expenses_budget_position_idx
  on public.budget_expenses (budget_id, position, created_at);
create index if not exists budget_expenses_user_idx
  on public.budget_expenses (user_id, budget_id);

drop trigger if exists monthly_budgets_updated_at on public.monthly_budgets;
create trigger monthly_budgets_updated_at before update on public.monthly_budgets
  for each row execute function extensions.moddatetime (updated_at);

drop trigger if exists budget_expenses_updated_at on public.budget_expenses;
create trigger budget_expenses_updated_at before update on public.budget_expenses
  for each row execute function extensions.moddatetime (updated_at);

-- RLS usa la columna de dueño directamente. La FK compuesta impide que un
-- gasto apunte a un presupuesto de otra persona aunque ambas filas existan.
alter table public.monthly_budgets enable row level security;
alter table public.budget_expenses enable row level security;

drop policy if exists monthly_budgets_select_own on public.monthly_budgets;
drop policy if exists monthly_budgets_insert_own on public.monthly_budgets;
drop policy if exists monthly_budgets_update_own on public.monthly_budgets;
drop policy if exists monthly_budgets_delete_own on public.monthly_budgets;

create policy monthly_budgets_select_own on public.monthly_budgets
  for select to authenticated using (user_id = (select auth.uid()));
create policy monthly_budgets_insert_own on public.monthly_budgets
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy monthly_budgets_update_own on public.monthly_budgets
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy monthly_budgets_delete_own on public.monthly_budgets
  for delete to authenticated using (user_id = (select auth.uid()));

drop policy if exists budget_expenses_select_own on public.budget_expenses;
drop policy if exists budget_expenses_insert_own on public.budget_expenses;
drop policy if exists budget_expenses_update_own on public.budget_expenses;
drop policy if exists budget_expenses_delete_own on public.budget_expenses;

create policy budget_expenses_select_own on public.budget_expenses
  for select to authenticated using (user_id = (select auth.uid()));
create policy budget_expenses_insert_own on public.budget_expenses
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy budget_expenses_update_own on public.budget_expenses
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy budget_expenses_delete_own on public.budget_expenses
  for delete to authenticated using (user_id = (select auth.uid()));

-- Supabase está retirando la exposición automática de tablas nuevas. Los
-- grants explícitos hacen que esta migración funcione con ambos defaults.
revoke all on public.monthly_budgets, public.budget_expenses from anon;
grant select, insert, update, delete
  on public.monthly_budgets, public.budget_expenses
  to authenticated;

-- Guarda cabecera y gastos en una sola transacción. Es SECURITY INVOKER: las
-- RLS siguen siendo la autoridad y la función no acepta un user_id del cliente.
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
declare
  v_user_id uuid := (select auth.uid());
  v_budget_id uuid;
begin
  if v_user_id is null then
    raise insufficient_privilege using message = 'Authentication required';
  end if;
  if p_month <> date_trunc('month', p_month)::date then
    raise check_violation using message = 'Month must be its first day';
  end if;
  if p_income_amount < 0 then
    raise check_violation using message = 'Income cannot be negative';
  end if;
  if length(p_currency) <> 3 then
    raise check_violation using message = 'Currency must have three letters';
  end if;
  if jsonb_typeof(p_expenses) <> 'array' or jsonb_array_length(p_expenses) > 100 then
    raise check_violation using message = 'Expenses must be an array of at most 100 items';
  end if;

  insert into public.monthly_budgets (user_id, month, income_amount, currency)
  values (v_user_id, p_month, p_income_amount, upper(p_currency))
  on conflict (user_id, month) do update
    set income_amount = excluded.income_amount,
        currency = excluded.currency
  returning id into v_budget_id;

  delete from public.budget_expenses where budget_id = v_budget_id;

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

revoke all on function public.save_monthly_budget(date, numeric, text, jsonb)
  from public, anon;
grant execute on function public.save_monthly_budget(date, numeric, text, jsonb)
  to authenticated;
