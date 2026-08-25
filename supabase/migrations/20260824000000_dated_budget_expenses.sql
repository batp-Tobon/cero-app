-- ============================================================================
-- CERO · Gastos con fecha, no con día del mes
--
-- Un arriendo no se paga "el 5": se paga el 5 de septiembre. Guardar sólo el
-- día obligaba a recomponer la fecha en cada pantalla y dejaba casos sin
-- respuesta —el día 31 en febrero— que cada sitio resolvía a su manera.
--
-- Es el mismo movimiento que ya se hizo con los ingresos en
-- 20260822161251_dated_budget_incomes.sql; los gastos se habían quedado atrás.
-- ============================================================================

alter table public.budget_expenses
  add column if not exists month    date,
  add column if not exists due_date date;

-- Relleno: el día del mes se ancla al mes del presupuesto al que pertenece.
-- `least` cubre el día 31 en meses cortos, que es justo el caso que antes
-- quedaba indefinido.
update public.budget_expenses expense
set month = budget.month,
    due_date = least(
      budget.month + make_interval(days => expense.due_day - 1),
      budget.month + interval '1 month' - interval '1 day'
    )::date
from public.monthly_budgets budget
where budget.id = expense.budget_id
  and (expense.month is null or expense.due_date is null);

alter table public.budget_expenses
  alter column month set not null,
  alter column due_date set not null;

do $$ begin
  alter table public.budget_expenses
    add constraint budget_expenses_first_day
      check (month = date_trunc('month', month)::date),
    add constraint budget_expenses_date_in_month
      check (
        due_date >= month
        and due_date < (month + interval '1 month')::date
      );
exception when duplicate_object then null; end $$;

-- La clave foránea pasa a incluir el mes para que la base garantice lo que
-- antes era sólo una convención: un gasto no puede quedar colgado de un
-- presupuesto de otro mes.
alter table public.budget_expenses
  drop constraint if exists budget_expenses_budget_user_fkey;

do $$ begin
  alter table public.budget_expenses
    add constraint budget_expenses_budget_user_month_fkey
      foreign key (budget_id, user_id, month)
      references public.monthly_budgets(id, user_id, month)
      on delete cascade;
exception when duplicate_object then null; end $$;

create index if not exists budget_expenses_user_month_idx
  on public.budget_expenses (user_id, month, due_date);

alter table public.budget_expenses drop column if exists due_day;

-- ---------------------------------------------------------------------------
-- El guardado acepta la fecha y comprueba que caiga dentro del mes, igual que
-- ya hacía con los ingresos.
-- ---------------------------------------------------------------------------
create or replace function public.save_monthly_budget_v2(
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
  if exists (
    select 1
    from jsonb_to_recordset(p_expenses) as item(due_date date)
    where item.due_date < p_month
       or item.due_date >= (p_month + interval '1 month')::date
  ) then
    raise check_violation using message = 'Expense date must belong to the budget month';
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
    budget_id, user_id, month, name, category, amount, due_date, recurring, position
  )
  select
    v_budget_id,
    v_user_id,
    p_month,
    btrim(item.name),
    item.category::public.budget_expense_category,
    item.amount,
    item.due_date,
    item.recurring,
    item.position
  from jsonb_to_recordset(p_expenses) as item(
    name text,
    category text,
    amount numeric,
    due_date date,
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
