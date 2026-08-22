-- ============================================================================
-- CERO · Comprobantes privados, compras diferidas y configuración SaaS
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Trazabilidad de pagos personales
-- ---------------------------------------------------------------------------
alter table public.payments
  add column other_paid numeric(16,2) not null default 0
    check (other_paid >= 0),
  add column receipt_path text,
  add column receipt_name text,
  add column receipt_mime text,
  add column receipt_size bigint;

alter table public.payments
  add constraint payments_receipt_complete check (
    (receipt_path is null and receipt_name is null and receipt_mime is null and receipt_size is null)
    or (
      receipt_path is not null
      and receipt_name is not null
      and receipt_mime in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
      and receipt_size between 1 and 6291456
      and length(receipt_path) <= 500
      and length(receipt_name) <= 200
    )
  );

alter table public.revolving_movements
  add column installment_count smallint not null default 1,
  add column installments_paid smallint not null default 0,
  add column receipt_path text,
  add column receipt_name text,
  add column receipt_mime text,
  add column receipt_size bigint;

alter table public.revolving_movements
  add constraint revolving_movement_installments_valid check (
    installment_count between 1 and 60
    and installments_paid between 0 and installment_count
  ),
  add constraint revolving_movement_receipt_complete check (
    (receipt_path is null and receipt_name is null and receipt_mime is null and receipt_size is null)
    or (
      receipt_path is not null
      and receipt_name is not null
      and receipt_mime in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
      and receipt_size between 1 and 6291456
      and length(receipt_path) <= 500
      and length(receipt_name) <= 200
    )
  );

alter table public.activity
  add column revolving_movement_id uuid
  references public.revolving_movements(id) on delete cascade;

create index activity_revolving_movement_idx
  on public.activity (revolving_movement_id)
  where revolving_movement_id is not null;

-- Bucket privado: 6 MB bastan para una foto o PDF de comprobante y mantienen
-- la carga estándar dentro del tamaño recomendado por Supabase.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payment-receipts',
  'payment-receipts',
  false,
  6291456,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists payment_receipts_insert_own on storage.objects;
drop policy if exists payment_receipts_select_allowed on storage.objects;
drop policy if exists payment_receipts_delete_own on storage.objects;

create policy payment_receipts_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'payment-receipts'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy payment_receipts_select_allowed on storage.objects
  for select to authenticated
  using (
    bucket_id = 'payment-receipts'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or exists (
        select 1
        from public.payments p
        where p.receipt_path = storage.objects.name
          and private.can_access_credit(p.credit_id)
      )
      or exists (
        select 1
        from public.revolving_movements m
        join public.revolving_accounts a on a.id = m.account_id
        where m.receipt_path = storage.objects.name
          and a.owner_id = (select auth.uid())
      )
    )
  );

create policy payment_receipts_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'payment-receipts'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- ---------------------------------------------------------------------------
-- Prueba de 5 días, precio editable y opción de análisis inteligente
-- ---------------------------------------------------------------------------
alter table public.saas_plans
  add column trial_days smallint not null default 0
  check (trial_days between 0 and 90);

alter table public.saas_subscriptions
  add constraint saas_trial_requires_end check (
    status <> 'trialing' or trial_ends_at is not null
  ),
  add constraint saas_active_requires_end check (
    status <> 'active' or current_period_end is not null
  );

update public.saas_plans
set name = 'Prueba CERO',
    description = 'Acceso completo durante 5 días para conocer CERO.',
    trial_days = 5,
    is_public = true,
    features = features || jsonb_build_object(
      'ai_insights', true,
      'ai_monthly_uses', 5
    )
where code = 'free';

update public.saas_plans
set name = 'CERO Pro',
    description = 'Acceso mensual completo, productos ilimitados y análisis inteligente.',
    trial_days = 0,
    is_public = true,
    features = features || jsonb_build_object(
      'ai_insights', true,
      'ai_monthly_uses', -1
    )
where code = 'pro';

insert into public.saas_prices (
  plan_id, currency, amount, billing_interval, interval_count, provider, is_active
)
select id, 'COP', 10000, 'month', 1, null, true
from public.saas_plans
where code = 'pro'
on conflict (plan_id, currency, billing_interval, interval_count)
  where is_active
do update set amount = excluded.amount;

create or replace function private.start_saas_trial()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_plan_id uuid;
  v_trial_days smallint;
  v_subscription_id uuid;
begin
  select id, trial_days into v_plan_id, v_trial_days
  from public.saas_plans
  where code = 'free' and is_active
  limit 1;

  if v_plan_id is null or v_trial_days <= 0 then
    return new;
  end if;

  insert into public.saas_subscriptions (
    user_id, plan_id, status, provider, starts_at, trial_ends_at
  ) values (
    new.id,
    v_plan_id,
    'trialing',
    'system',
    new.created_at,
    new.created_at + make_interval(days => v_trial_days)
  )
  on conflict (user_id) do nothing
  returning id into v_subscription_id;

  if v_subscription_id is not null then
    insert into public.saas_subscription_events (
      subscription_id, user_id, actor_user_id, event_type, source,
      reason, before_state, after_state
    ) values (
      v_subscription_id,
      new.id,
      null,
      'trial_started',
      'system',
      null,
      '{}'::jsonb,
      jsonb_build_object(
        'plan_id', v_plan_id,
        'status', 'trialing',
        'trial_ends_at', new.created_at + make_interval(days => v_trial_days)
      )
    );
  end if;

  return new;
end;
$fn$;

revoke all on function private.start_saas_trial() from public, anon, authenticated;
grant execute on function private.start_saas_trial() to service_role;

drop trigger if exists profiles_start_saas_trial on public.profiles;
create trigger profiles_start_saas_trial
  after insert on public.profiles
  for each row execute function private.start_saas_trial();

-- Da a las cuentas existentes la misma prueba, calculada desde la creación de
-- la cuenta. No renueva ni altera una suscripción que ya exista.
insert into public.saas_subscriptions (
  user_id, plan_id, status, provider, starts_at, trial_ends_at
)
select
  p.id,
  plan.id,
  'trialing',
  'system',
  p.created_at,
  p.created_at + make_interval(days => plan.trial_days)
from public.profiles p
cross join lateral (
  select id, trial_days
  from public.saas_plans
  where code = 'free' and is_active
  limit 1
) plan
where plan.trial_days > 0
on conflict (user_id) do nothing;

-- Cambio de plan y precio: una sola transacción, con motivo obligatorio y
-- auditoría. La aplicación nunca actualiza estas tablas directamente.
create function private.admin_update_plan(
  p_plan_id uuid,
  p_name text,
  p_description text,
  p_trial_days smallint,
  p_is_public boolean,
  p_ai_insights boolean,
  p_monthly_price numeric,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_actor uuid := (select auth.uid());
  v_code text;
  v_price_id uuid;
  v_before jsonb;
  v_after jsonb;
begin
  if v_actor is null or not private.is_admin() then
    raise insufficient_privilege using message = 'Administrator access required';
  end if;
  if length(btrim(p_reason)) not between 10 and 500 then
    raise check_violation using message = 'A reason between 10 and 500 characters is required';
  end if;
  if length(btrim(p_name)) not between 1 and 80 then
    raise check_violation using message = 'Plan name is invalid';
  end if;
  if p_description is not null and length(p_description) > 500 then
    raise check_violation using message = 'Plan description is too long';
  end if;
  if p_trial_days not between 0 and 90 then
    raise check_violation using message = 'Trial days are invalid';
  end if;
  if p_monthly_price < 0 or p_monthly_price > 99999999999999 then
    raise check_violation using message = 'Plan price is invalid';
  end if;

  select code, jsonb_build_object(
    'name', name,
    'description', description,
    'trial_days', trial_days,
    'is_public', is_public,
    'features', features
  ) into v_code, v_before
  from public.saas_plans
  where id = p_plan_id
  for update;

  if not found then
    raise no_data_found using message = 'Plan not found';
  end if;

  update public.saas_plans
  set name = btrim(p_name),
      description = nullif(btrim(coalesce(p_description, '')), ''),
      trial_days = case when v_code = 'free' then p_trial_days else 0 end,
      is_public = p_is_public,
      features = jsonb_set(
        features,
        '{ai_insights}',
        to_jsonb(p_ai_insights),
        true
      )
  where id = p_plan_id;

  if v_code = 'pro' then
    select id into v_price_id
    from public.saas_prices
    where plan_id = p_plan_id
      and currency = 'COP'
      and billing_interval = 'month'
      and interval_count = 1
      and is_active
    for update;

    if v_price_id is null then
      insert into public.saas_prices (
        plan_id, currency, amount, billing_interval, interval_count, is_active
      ) values (
        p_plan_id, 'COP', p_monthly_price, 'month', 1, true
      ) returning id into v_price_id;
    else
      update public.saas_prices
      set amount = p_monthly_price
      where id = v_price_id;
    end if;
  end if;

  select jsonb_build_object(
    'name', name,
    'description', description,
    'trial_days', trial_days,
    'is_public', is_public,
    'features', features,
    'monthly_price_cop', case when v_code = 'pro' then p_monthly_price else 0 end
  ) into v_after
  from public.saas_plans
  where id = p_plan_id;

  insert into public.admin_audit_log (
    actor_user_id, action, target_type, target_id, reason,
    before_state, after_state
  ) values (
    v_actor,
    'plan.changed',
    'plan',
    p_plan_id,
    btrim(p_reason),
    v_before,
    v_after
  );
end;
$fn$;

create function public.admin_update_plan(
  p_plan_id uuid,
  p_name text,
  p_description text,
  p_trial_days smallint,
  p_is_public boolean,
  p_ai_insights boolean,
  p_monthly_price numeric,
  p_reason text
)
returns void
language sql
security invoker
set search_path = ''
as $fn$
  select private.admin_update_plan(
    p_plan_id, p_name, p_description, p_trial_days, p_is_public,
    p_ai_insights, p_monthly_price, p_reason
  );
$fn$;

revoke all on function private.admin_update_plan(
  uuid, text, text, smallint, boolean, boolean, numeric, text
) from public, anon, authenticated;
revoke all on function public.admin_update_plan(
  uuid, text, text, smallint, boolean, boolean, numeric, text
) from public, anon, authenticated;

grant execute on function private.admin_update_plan(
  uuid, text, text, smallint, boolean, boolean, numeric, text
) to authenticated;
grant execute on function public.admin_update_plan(
  uuid, text, text, smallint, boolean, boolean, numeric, text
) to authenticated;

-- Sólo cuenta accesos comercialmente vigentes.
create or replace function public.admin_billing_metrics()
returns table (
  total_users bigint,
  total_admins bigint,
  active_subscriptions bigint,
  trial_subscriptions bigint,
  past_due_subscriptions bigint,
  revenue_30_days numeric,
  failed_payments_30_days bigint,
  audit_events_30_days bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $fn$
begin
  if (select auth.uid()) is null or not private.is_admin() then
    raise insufficient_privilege using message = 'Administrator access required';
  end if;

  return query
  select
    (select count(*) from public.profiles),
    (select count(*) from public.profiles where role = 'admin'),
    (select count(*) from public.saas_subscriptions
      where status = 'active' and current_period_end > now()),
    (select count(*) from public.saas_subscriptions
      where status = 'trialing' and trial_ends_at > now()),
    (select count(*) from public.saas_subscriptions
      where status = 'past_due' and grace_ends_at > now()),
    coalesce((
      select sum(amount) from public.saas_billing_payments
      where status = 'succeeded' and paid_at >= now() - interval '30 days'
    ), 0),
    (select count(*) from public.saas_billing_payments
      where status = 'failed' and created_at >= now() - interval '30 days'),
    (select count(*) from public.admin_audit_log
      where created_at >= now() - interval '30 days');
end;
$fn$;
