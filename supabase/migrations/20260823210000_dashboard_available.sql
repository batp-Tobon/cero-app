-- ============================================================================
-- CERO · Lo que queda del sueldo, en Inicio
--
-- El sueldo solo no dice si alcanza. Esta migración añade al snapshot los dos
-- sumandos que lo recortan —gastos del hogar y cuotas del mes— para que Inicio
-- pueda mostrar "disponible" junto al sueldo.
--
-- Devuelve TOTALES y no listas: Inicio no dibuja el detalle, y traer decenas de
-- filas para sumarlas en el cliente encarecería la pantalla sin necesidad.
--
-- Las fuentes son exactamente las de /presupuesto (mismas tablas, mismo filtro
-- de recurrencia, mismo mes). Si divergieran, las dos pantallas darían números
-- distintos para la misma pregunta y ninguna de las dos sería creíble.
-- ============================================================================

create or replace function public.current_dashboard_snapshot(p_month date default null)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $fn$
  with target as (
    select date_trunc(
      'month',
      coalesce(p_month, (now() at time zone 'America/Bogota')::date)
    )::date as month
  ),
  bounds as (
    select month, (month + interval '1 month')::date as next_month from target
  ),
  -- Presupuesto vigente: el del mes pedido o, si aún no existe, el último
  -- guardado. RLS ya limita la tabla al dueño.
  source as (
    select budget.id, budget.month, budget.currency
    from public.monthly_budgets budget, target
    where budget.month <= target.month
    order by budget.month desc
    limit 1
  ),
  -- Cuando el presupuesto es de un mes anterior sólo se arrastran los ingresos
  -- recurrentes, y su fecha se corre tantos meses como haga falta. Sumar un
  -- intervalo ancla al último día del mes destino (31-ene + 1 mes = 28-feb),
  -- igual que `addMonths` en el cliente.
  income as (
    select
      entry.name,
      entry.amount,
      (
        entry.received_date
        + make_interval(months => (
            (extract(year from target.month)::int * 12
              + extract(month from target.month)::int)
            - (extract(year from source.month)::int * 12
              + extract(month from source.month)::int)
          ))
      )::date as received_date
    from public.budget_incomes entry
      join source on source.id = entry.budget_id
      cross join target
    where source.month = target.month or entry.recurring
  ),
  -- Misma regla de arrastre que los ingresos: de un mes anterior sólo viajan
  -- los gastos marcados como recurrentes.
  expense as (
    select greatest(entry.amount, 0) as amount
    from public.budget_expenses entry
      join source on source.id = entry.budget_id
      cross join target
    where source.month = target.month or entry.recurring
  ),
  -- Cuotas y extractos que vencen dentro del mes, por su importe completo:
  -- es lo que /presupuesto descuenta, y las dos pantallas deben coincidir.
  obligation as (
    select greatest(sched.payment_amount, 0) as amount
    from public.credit_schedule sched, bounds
    where sched.due_date >= bounds.month and sched.due_date < bounds.next_month
    union all
    select greatest(stmt.total_due, 0)
    from public.revolving_statements stmt, bounds
    where stmt.due_date >= bounds.month and stmt.due_date < bounds.next_month
  )
  select jsonb_build_object(
    'profile', coalesce(
      (
        select jsonb_build_object(
          'full_name', profile.full_name,
          'avatar_url', profile.avatar_url,
          'role', profile.role
        )
        from public.profiles profile
        where profile.id = (select auth.uid())
      ),
      'null'::jsonb
    ),
    'credits', coalesce(
      (
        select jsonb_agg(
          to_jsonb(credit_row)
          order by credit_row.status, credit_row.next_due_date nulls last
        )
        from public.credit_summary credit_row
      ),
      '[]'::jsonb
    ),
    'cards', coalesce(
      (
        select jsonb_agg(
          to_jsonb(card_row)
          order by card_row.status, card_row.created_at desc
        )
        from public.revolving_summary card_row
      ),
      '[]'::jsonb
    ),
    'billing', coalesce(
      (
        select to_jsonb(billing_row)
        from public.current_billing_context() billing_row
      ),
      'null'::jsonb
    ),
    'budget', (
      select jsonb_build_object(
        'month', target.month,
        -- `projected` avisa de que la cifra es un arrastre y no un ingreso
        -- confirmado; Inicio lo etiqueta para no dar por cobrado lo que no está.
        'source', case
          when source.id is null then 'empty'
          when source.month = target.month then 'saved'
          else 'projected'
        end,
        'currency', source.currency,
        'incomes', coalesce(
          (
            select jsonb_agg(to_jsonb(paid) order by paid.received_date, paid.name)
            from income paid
          ),
          '[]'::jsonb
        ),
        'expense_total', coalesce((select sum(amount) from expense), 0),
        'obligation_total', coalesce((select sum(amount) from obligation), 0)
      )
      from target left join source on true
    )
  );
$fn$;

comment on function public.current_dashboard_snapshot(date)
is 'Snapshot privado de Inicio en un solo viaje: sueldo, gastos y cuotas del mes. Todas las fuentes conservan RLS.';
