-- Plan, precio, acceso y pagos recientes de la pantalla de suscripción en una
-- sola lectura. SECURITY INVOKER mantiene las políticas de cada tabla.
create or replace function public.current_subscription_snapshot()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $fn$
  select jsonb_build_object(
    'offer', coalesce(
      (
        select jsonb_build_object(
          'plan', to_jsonb(plan_row),
          'price', to_jsonb(price_row)
        )
        from public.saas_plans plan_row
        join public.saas_prices price_row on price_row.plan_id = plan_row.id
        where plan_row.code = 'pro'
          and plan_row.is_active
          and plan_row.is_public
          and price_row.is_active
          and price_row.currency = 'COP'
          and price_row.billing_interval = 'month'
          and price_row.interval_count = 1
        limit 1
      ),
      'null'::jsonb
    ),
    'billing', coalesce(
      (
        select to_jsonb(billing_row)
        from public.current_billing_context() billing_row
      ),
      'null'::jsonb
    ),
    'payments', coalesce(
      (
        select jsonb_agg(to_jsonb(payment_row) order by payment_row.created_at desc)
        from (
          select *
          from public.saas_billing_payments payment
          where payment.user_id = (select auth.uid())
          order by payment.created_at desc
          limit 8
        ) payment_row
      ),
      '[]'::jsonb
    )
  );
$fn$;

revoke all on function public.current_subscription_snapshot()
  from public, anon, authenticated;
grant execute on function public.current_subscription_snapshot() to authenticated;

comment on function public.current_subscription_snapshot()
is 'Snapshot privado de Plan y pagos en un solo viaje; conserva RLS.';
