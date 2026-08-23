-- ============================================================================
-- CERO · El sueldo del mes en Inicio
--
-- Antes de mirar cuánto se debe hay que saber con cuánto se cuenta: el sueldo
-- es la cifra contra la que se deciden los demás pagos. Se añade al snapshot
-- que ya existía en lugar de crear una consulta aparte, porque Inicio se
-- diseñó para resolverse en un solo viaje.
--
-- El mes llega por parámetro: la zona horaria de la app vive en
-- NEXT_PUBLIC_APP_TZ y duplicarla aquí abriría la puerta a que el servidor
-- (UTC) y el teléfono discrepen el día 1 a medianoche.
-- ============================================================================

-- Hay que soltar la versión sin argumentos: con ambas presentes, una llamada
-- sin parámetros quedaría ambigua.
drop function if exists public.current_dashboard_snapshot();

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
        )
      )
      from target left join source on true
    )
  );
$fn$;

revoke all on function public.current_dashboard_snapshot(date)
  from public, anon, authenticated;
grant execute on function public.current_dashboard_snapshot(date) to authenticated;

comment on function public.current_dashboard_snapshot(date)
is 'Snapshot privado de Inicio en un solo viaje, con el sueldo del mes; todas las fuentes conservan RLS.';
