-- Permite al administrador conceder acceso sin vencimiento sin añadir una
-- fecha artificial. PostgreSQL representa esta vigencia con `infinity`, que
-- sigue siendo comparable con `now()` en todas las barreras RLS existentes.
-- La función nueva evita sobrecargar el RPC anterior (PostgREST no admite
-- funciones sobrecargadas de forma fiable) y mantiene toda la auditoría.

create or replace function public.admin_set_subscription_v2(
  p_user_id uuid,
  p_plan_id uuid,
  p_status public.saas_subscription_status,
  p_access_until timestamptz,
  p_indefinite boolean,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_actor uuid := (select auth.uid());
  v_plan_code text;
  v_subscription_id uuid;
  v_before jsonb := '{}'::jsonb;
  v_after jsonb;
  v_indefinite boolean := coalesce(p_indefinite, false);
  v_access_until timestamptz;
begin
  if v_actor is null or not private.is_admin() then
    raise insufficient_privilege using message = 'Administrator access required';
  end if;
  if length(btrim(p_reason)) not between 10 and 500 then
    raise check_violation using message = 'A reason between 10 and 500 characters is required';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise no_data_found using message = 'User not found';
  end if;

  select code into v_plan_code
  from public.saas_plans
  where id = p_plan_id and is_active
  for share;
  if not found then
    raise no_data_found using message = 'Active plan not found';
  end if;

  if v_indefinite and p_status <> 'active' then
    raise check_violation using message = 'Indefinite access requires an active subscription';
  end if;

  v_access_until := case
    when v_indefinite then 'infinity'::timestamptz
    else p_access_until
  end;

  if p_status = 'trialing'
     and (v_access_until is null or v_access_until <= now())
  then
    raise check_violation using message = 'A future trial end is required';
  end if;
  if p_status = 'active' and v_plan_code <> 'free'
     and (v_access_until is null or v_access_until <= now())
  then
    raise check_violation using message = 'A future subscription end is required';
  end if;
  if p_status = 'past_due'
     and (v_access_until is null or v_access_until <= now())
  then
    raise check_violation using message = 'A future grace end is required';
  end if;

  select
    subscription.id,
    jsonb_build_object(
      'plan_id', subscription.plan_id,
      'status', subscription.status,
      'trial_ends_at', subscription.trial_ends_at,
      'current_period_end', subscription.current_period_end,
      'grace_ends_at', subscription.grace_ends_at,
      'indefinite', subscription.current_period_end = 'infinity'::timestamptz
    )
  into v_subscription_id, v_before
  from public.saas_subscriptions subscription
  where subscription.user_id = p_user_id
  for update;

  insert into public.saas_subscriptions (
    user_id, plan_id, status, provider, starts_at, trial_ends_at,
    current_period_start, current_period_end, grace_ends_at, canceled_at
  ) values (
    p_user_id,
    p_plan_id,
    p_status,
    'manual',
    now(),
    case when p_status = 'trialing' then v_access_until end,
    case when p_status = 'active' then now() end,
    case when p_status in ('active', 'canceled') then v_access_until end,
    case when p_status = 'past_due' then v_access_until end,
    case when p_status = 'canceled' then now() end
  )
  on conflict (user_id) do update
    set plan_id = excluded.plan_id,
        price_id = null,
        status = excluded.status,
        provider = 'manual',
        provider_customer_id = null,
        provider_subscription_id = null,
        trial_ends_at = excluded.trial_ends_at,
        current_period_start = excluded.current_period_start,
        current_period_end = excluded.current_period_end,
        grace_ends_at = excluded.grace_ends_at,
        cancel_at_period_end = false,
        canceled_at = excluded.canceled_at
  returning id into v_subscription_id;

  select jsonb_build_object(
    'plan_id', subscription.plan_id,
    'status', subscription.status,
    'trial_ends_at', subscription.trial_ends_at,
    'current_period_end', subscription.current_period_end,
    'grace_ends_at', subscription.grace_ends_at,
    'indefinite', subscription.current_period_end = 'infinity'::timestamptz
  ) into v_after
  from public.saas_subscriptions subscription
  where subscription.id = v_subscription_id;

  insert into public.saas_subscription_events (
    subscription_id, user_id, actor_user_id, event_type, source, reason,
    before_state, after_state
  ) values (
    v_subscription_id, p_user_id, v_actor, 'admin_override', 'admin',
    btrim(p_reason), v_before, v_after
  );

  insert into public.admin_audit_log (
    actor_user_id, action, target_type, target_id, reason,
    before_state, after_state
  ) values (
    v_actor, 'subscription.changed', 'subscription', v_subscription_id,
    btrim(p_reason), v_before, v_after
  );

  return v_subscription_id;
end;
$fn$;

revoke all on function public.admin_set_subscription_v2(
  uuid, uuid, public.saas_subscription_status, timestamptz, boolean, text
) from public, anon, authenticated;
grant execute on function public.admin_set_subscription_v2(
  uuid, uuid, public.saas_subscription_status, timestamptz, boolean, text
) to authenticated;

comment on function public.admin_set_subscription_v2(
  uuid, uuid, public.saas_subscription_status, timestamptz, boolean, text
) is 'Administra una suscripción manual, incluida vigencia indefinida, con auditoría obligatoria.';

notify pgrst, 'reload schema';
