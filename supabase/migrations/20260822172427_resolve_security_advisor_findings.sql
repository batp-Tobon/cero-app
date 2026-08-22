-- ============================================================================
-- CERO · Hallazgos del asesor posterior a la migración SaaS
-- ============================================================================

-- Las funciones privilegiadas viven fuera de los esquemas expuestos. El RPC
-- público sólo es un wrapper SECURITY INVOKER y conserva la API de la app.
alter function public.find_profile_by_email(text) set schema private;
alter function public.admin_set_user_role(uuid, public.user_role, text)
  set schema private;
alter function public.admin_set_subscription(
  uuid, uuid, public.saas_subscription_status, timestamptz, text
) set schema private;

-- Corrige el primer alta: SELECT INTO sin filas asigna NULL a la variable,
-- aunque tuviera un valor inicial. El evento exige un objeto JSON no nulo.
create or replace function private.admin_set_subscription(
  p_user_id uuid,
  p_plan_id uuid,
  p_status public.saas_subscription_status,
  p_access_until timestamptz,
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
  v_before jsonb;
  v_after jsonb;
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

  if p_status = 'trialing' and (p_access_until is null or p_access_until <= now()) then
    raise check_violation using message = 'A future trial end is required';
  end if;
  if p_status = 'active' and v_plan_code <> 'free'
     and (p_access_until is null or p_access_until <= now())
  then
    raise check_violation using message = 'A future subscription end is required';
  end if;
  if p_status = 'past_due' and (p_access_until is null or p_access_until <= now()) then
    raise check_violation using message = 'A future grace end is required';
  end if;

  select jsonb_build_object(
    'plan_id', s.plan_id,
    'status', s.status,
    'trial_ends_at', s.trial_ends_at,
    'current_period_end', s.current_period_end,
    'grace_ends_at', s.grace_ends_at
  )
  into v_before
  from public.saas_subscriptions s
  where s.user_id = p_user_id
  for update;

  v_before := coalesce(v_before, '{}'::jsonb);

  insert into public.saas_subscriptions (
    user_id, plan_id, status, provider, starts_at, trial_ends_at,
    current_period_start, current_period_end, grace_ends_at, canceled_at
  ) values (
    p_user_id,
    p_plan_id,
    p_status,
    'manual',
    now(),
    case when p_status = 'trialing' then p_access_until end,
    case when p_status = 'active' then now() end,
    case when p_status in ('active', 'canceled') then p_access_until end,
    case when p_status = 'past_due' then p_access_until end,
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
    'plan_id', s.plan_id,
    'status', s.status,
    'trial_ends_at', s.trial_ends_at,
    'current_period_end', s.current_period_end,
    'grace_ends_at', s.grace_ends_at
  ) into v_after
  from public.saas_subscriptions s
  where s.id = v_subscription_id;

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

create function public.find_profile_by_email(p_email text)
returns table (id uuid, full_name text, email text)
language sql
stable
security invoker
set search_path = ''
as $fn$
  select * from private.find_profile_by_email(p_email);
$fn$;

create function public.admin_set_user_role(
  p_user_id uuid,
  p_role public.user_role,
  p_reason text
)
returns void
language sql
security invoker
set search_path = ''
as $fn$
  select private.admin_set_user_role(p_user_id, p_role, p_reason);
$fn$;

create function public.admin_set_subscription(
  p_user_id uuid,
  p_plan_id uuid,
  p_status public.saas_subscription_status,
  p_access_until timestamptz,
  p_reason text
)
returns uuid
language sql
security invoker
set search_path = ''
as $fn$
  select private.admin_set_subscription(
    p_user_id, p_plan_id, p_status, p_access_until, p_reason
  );
$fn$;

revoke all on function private.find_profile_by_email(text)
  from public, anon, authenticated;
revoke all on function private.admin_set_user_role(uuid, public.user_role, text)
  from public, anon, authenticated;
revoke all on function private.admin_set_subscription(
  uuid, uuid, public.saas_subscription_status, timestamptz, text
) from public, anon, authenticated;

grant execute on function private.find_profile_by_email(text) to authenticated;
grant execute on function private.admin_set_user_role(uuid, public.user_role, text)
  to authenticated;
grant execute on function private.admin_set_subscription(
  uuid, uuid, public.saas_subscription_status, timestamptz, text
) to authenticated;

revoke all on function public.find_profile_by_email(text)
  from public, anon, authenticated;
revoke all on function public.admin_set_user_role(uuid, public.user_role, text)
  from public, anon, authenticated;
revoke all on function public.admin_set_subscription(
  uuid, uuid, public.saas_subscription_status, timestamptz, text
) from public, anon, authenticated;

grant execute on function public.find_profile_by_email(text) to authenticated;
grant execute on function public.admin_set_user_role(uuid, public.user_role, text)
  to authenticated;
grant execute on function public.admin_set_subscription(
  uuid, uuid, public.saas_subscription_status, timestamptz, text
) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS: auth.uid() fijo se evalúa una vez por consulta
-- ---------------------------------------------------------------------------
drop policy if exists credits_insert_own on public.credits;
drop policy if exists credits_update_own on public.credits;
drop policy if exists credits_delete_own on public.credits;
create policy credits_insert_own on public.credits
  for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy credits_update_own on public.credits
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy credits_delete_own on public.credits
  for delete to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists activity_insert_own on public.activity;
create policy activity_insert_own on public.activity
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists notifications_select_own on public.notifications;
drop policy if exists notifications_insert_own on public.notifications;
drop policy if exists notifications_update_own on public.notifications;
drop policy if exists notifications_delete_own on public.notifications;
create policy notifications_select_own on public.notifications
  for select to authenticated
  using (user_id = (select auth.uid()));
create policy notifications_insert_own on public.notifications
  for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy notifications_update_own on public.notifications
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy notifications_delete_own on public.notifications
  for delete to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists revolving_accounts_insert on public.revolving_accounts;
drop policy if exists revolving_accounts_update on public.revolving_accounts;
drop policy if exists revolving_accounts_delete on public.revolving_accounts;
create policy revolving_accounts_insert on public.revolving_accounts
  for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy revolving_accounts_update on public.revolving_accounts
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy revolving_accounts_delete on public.revolving_accounts
  for delete to authenticated
  using (owner_id = (select auth.uid()));

-- FOR ALL también creaba una segunda política SELECT. Se divide por operación.
drop policy if exists revolving_statements_select_own on public.revolving_statements;
drop policy if exists revolving_statements_write_own on public.revolving_statements;
create policy revolving_statements_select_own on public.revolving_statements
  for select to authenticated
  using (private.owns_revolving(account_id));
create policy revolving_statements_insert_own on public.revolving_statements
  for insert to authenticated
  with check (private.owns_revolving(account_id));
create policy revolving_statements_update_own on public.revolving_statements
  for update to authenticated
  using (private.owns_revolving(account_id))
  with check (private.owns_revolving(account_id));
create policy revolving_statements_delete_own on public.revolving_statements
  for delete to authenticated
  using (private.owns_revolving(account_id));

drop policy if exists revolving_movements_select_own on public.revolving_movements;
drop policy if exists revolving_movements_write_own on public.revolving_movements;
create policy revolving_movements_select_own on public.revolving_movements
  for select to authenticated
  using (private.owns_revolving(account_id));
create policy revolving_movements_insert_own on public.revolving_movements
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and private.owns_revolving(account_id)
  );
create policy revolving_movements_update_own on public.revolving_movements
  for update to authenticated
  using (private.owns_revolving(account_id))
  with check (
    user_id = (select auth.uid())
    and private.owns_revolving(account_id)
  );
create policy revolving_movements_delete_own on public.revolving_movements
  for delete to authenticated
  using (private.owns_revolving(account_id));
