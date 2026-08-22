-- Inicio necesita cuatro lecturas que siempre cambian juntas. Esta función no
-- añade privilegios: SECURITY INVOKER conserva RLS en perfil, vistas y plan.
create or replace function public.current_dashboard_snapshot()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $fn$
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
    )
  );
$fn$;

revoke all on function public.current_dashboard_snapshot()
  from public, anon, authenticated;
grant execute on function public.current_dashboard_snapshot() to authenticated;

comment on function public.current_dashboard_snapshot()
is 'Snapshot privado de Inicio en un solo viaje; todas las fuentes conservan RLS.';
