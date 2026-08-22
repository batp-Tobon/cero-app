-- Cobros SaaS de CERO: checkout trazable, revisión manual y lectura comercial
-- en un solo viaje. Las cuotas personales continúan en su dominio separado.

alter table public.saas_billing_payments
  add column submitted_reference text
    check (submitted_reference is null or length(btrim(submitted_reference)) between 1 and 200),
  add column proof_path text
    check (proof_path is null or length(proof_path) <= 500),
  add column proof_name text
    check (proof_name is null or length(proof_name) <= 200),
  add column proof_mime text
    check (proof_mime is null or proof_mime in (
      'image/jpeg', 'image/png', 'image/webp', 'application/pdf'
    )),
  add column proof_size integer
    check (proof_size is null or proof_size between 1 and 6291456),
  add column reviewed_at timestamptz,
  add column reviewed_by uuid references public.profiles(id) on delete set null;

create index saas_billing_payments_reviewed_by_idx
  on public.saas_billing_payments (reviewed_by)
  where reviewed_by is not null;

-- Un cliente no puede inundar el backoffice con comprobantes simultáneos.
create unique index saas_billing_payments_one_pending_breb_idx
  on public.saas_billing_payments (user_id)
  where provider = 'bre-b' and status = 'pending';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'saas-payment-proofs',
  'saas-payment-proofs',
  false,
  6291456,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy saas_payment_proofs_select_owner_or_admin
  on storage.objects for select to authenticated
  using (
    bucket_id = 'saas-payment-proofs'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (select private.is_admin())
    )
  );

create policy saas_payment_proofs_insert_owner
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'saas-payment-proofs'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy saas_payment_proofs_delete_owner_or_admin
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'saas-payment-proofs'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (select private.is_admin())
    )
  );

-- Perfil + plan + suscripción en una sola consulta PostgREST. Es SECURITY
-- INVOKER: conserva RLS y sólo expone la cuenta autenticada.
create or replace function public.current_billing_context()
returns table (
  is_admin boolean,
  free_plan_code text,
  free_plan_features jsonb,
  subscription_status public.saas_subscription_status,
  subscription_plan_code text,
  subscription_plan_features jsonb,
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  grace_ends_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $fn$
  select
    coalesce(p.role = 'admin', false),
    free_plan.code,
    free_plan.features,
    subscription.status,
    subscribed_plan.code,
    subscribed_plan.features,
    subscription.trial_ends_at,
    subscription.current_period_end,
    subscription.grace_ends_at
  from public.saas_plans free_plan
  left join public.profiles p
    on p.id = (select auth.uid())
  left join public.saas_subscriptions subscription
    on subscription.user_id = (select auth.uid())
  left join public.saas_plans subscribed_plan
    on subscribed_plan.id = subscription.plan_id
  where free_plan.code = 'free'
  limit 1;
$fn$;

revoke all on function public.current_billing_context()
  from public, anon, authenticated;
grant execute on function public.current_billing_context() to authenticated;

-- Núcleo transaccional compartido por Wompi y la aprobación Bre-B. Bloquea
-- primero el pago y luego la suscripción, siempre en el mismo orden.
create or replace function private.activate_saas_payment(
  p_payment_id uuid,
  p_source text,
  p_external_event_id text,
  p_paid_at timestamptz,
  p_provider_payment_id text,
  p_actor_user_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_payment public.saas_billing_payments%rowtype;
  v_price public.saas_prices%rowtype;
  v_subscription public.saas_subscriptions%rowtype;
  v_subscription_id uuid;
  v_anchor timestamptz;
  v_period_end timestamptz;
  v_before jsonb := '{}'::jsonb;
begin
  select * into v_payment
  from public.saas_billing_payments
  where id = p_payment_id
  for update;

  if not found then
    raise no_data_found using message = 'Payment not found';
  end if;

  -- Un reintento del mismo webhook devuelve el resultado sin renovar dos veces.
  if v_payment.status = 'succeeded' then
    return v_payment.subscription_id;
  end if;

  if v_payment.status not in ('pending', 'failed') then
    raise check_violation using message = 'Payment cannot be activated';
  end if;

  select * into v_price
  from public.saas_prices
  where id = v_payment.price_id;

  if not found
     or v_payment.amount <> v_price.amount
     or v_payment.currency <> v_price.currency then
    raise check_violation using message = 'Payment does not match catalog price';
  end if;

  select * into v_subscription
  from public.saas_subscriptions
  where user_id = v_payment.user_id
  for update;

  if found then
    v_subscription_id := v_subscription.id;
    v_before := to_jsonb(v_subscription);
    v_anchor := greatest(
      coalesce(v_subscription.current_period_end, '-infinity'::timestamptz),
      coalesce(v_subscription.trial_ends_at, '-infinity'::timestamptz),
      coalesce(p_paid_at, now())
    );
    v_period_end := case v_price.billing_interval
      when 'month' then v_anchor + make_interval(months => v_price.interval_count)
      when 'year' then v_anchor + make_interval(years => v_price.interval_count)
      else v_anchor + interval '100 years'
    end;

    update public.saas_subscriptions
    set plan_id = v_price.plan_id,
        price_id = v_price.id,
        status = 'active',
        provider = v_payment.provider,
        current_period_start = coalesce(p_paid_at, now()),
        current_period_end = v_period_end,
        trial_ends_at = null,
        grace_ends_at = null,
        cancel_at_period_end = false,
        canceled_at = null,
        updated_at = now()
    where id = v_subscription_id;
  else
    v_anchor := coalesce(p_paid_at, now());
    v_period_end := case v_price.billing_interval
      when 'month' then v_anchor + make_interval(months => v_price.interval_count)
      when 'year' then v_anchor + make_interval(years => v_price.interval_count)
      else v_anchor + interval '100 years'
    end;

    insert into public.saas_subscriptions (
      user_id, plan_id, price_id, status, provider,
      starts_at, current_period_start, current_period_end
    ) values (
      v_payment.user_id, v_price.plan_id, v_price.id, 'active',
      v_payment.provider, v_anchor, v_anchor, v_period_end
    ) returning id into v_subscription_id;
  end if;

  update public.saas_billing_payments
  set subscription_id = v_subscription_id,
      status = 'succeeded',
      provider_payment_id = coalesce(p_provider_payment_id, provider_payment_id),
      paid_at = coalesce(p_paid_at, now()),
      reviewed_at = case when p_actor_user_id is null then reviewed_at else now() end,
      reviewed_by = coalesce(p_actor_user_id, reviewed_by),
      failure_code = null,
      failure_message = null,
      updated_at = now()
  where id = v_payment.id;

  insert into public.saas_subscription_events (
    subscription_id, user_id, actor_user_id, event_type, source, reason,
    before_state, after_state, external_event_id, occurred_at
  ) values (
    v_subscription_id,
    v_payment.user_id,
    p_actor_user_id,
    'payment_succeeded',
    p_source,
    p_reason,
    v_before,
    jsonb_build_object(
      'plan_id', v_price.plan_id,
      'price_id', v_price.id,
      'status', 'active',
      'current_period_end', v_period_end,
      'payment_id', v_payment.id
    ),
    p_external_event_id,
    coalesce(p_paid_at, now())
  )
  on conflict (source, external_event_id)
    where external_event_id is not null
  do nothing;

  return v_subscription_id;
end;
$fn$;

create or replace function private.process_wompi_saas_payment(
  p_reference text,
  p_provider_payment_id text,
  p_external_event_id text,
  p_amount numeric,
  p_currency text,
  p_paid_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_payment_id uuid;
begin
  if length(p_reference) not between 8 and 100
     or length(p_provider_payment_id) not between 2 and 200
     or length(p_external_event_id) not between 2 and 200 then
    raise check_violation using message = 'Invalid Wompi identifiers';
  end if;

  select id into v_payment_id
  from public.saas_billing_payments
  where provider = 'wompi'
    and idempotency_key = p_reference
    and amount = p_amount
    and currency = p_currency;

  if not found then
    raise no_data_found using message = 'Wompi checkout not found';
  end if;

  return private.activate_saas_payment(
    v_payment_id,
    'wompi',
    p_external_event_id,
    p_paid_at,
    p_provider_payment_id,
    null,
    'Pago Wompi aprobado y verificado'
  );
end;
$fn$;

create or replace function private.admin_review_saas_payment(
  p_payment_id uuid,
  p_approve boolean,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_actor uuid := (select auth.uid());
  v_payment public.saas_billing_payments%rowtype;
  v_subscription_id uuid;
begin
  if v_actor is null or not private.is_admin() then
    raise insufficient_privilege using message = 'Administrator access required';
  end if;
  if length(btrim(coalesce(p_reason, ''))) not between 10 and 500 then
    raise check_violation using message = 'Review reason must be 10 to 500 characters';
  end if;

  select * into v_payment
  from public.saas_billing_payments
  where id = p_payment_id and provider = 'bre-b'
  for update;

  if not found then
    raise no_data_found using message = 'Manual payment not found';
  end if;
  if v_payment.status <> 'pending' then
    raise check_violation using message = 'Manual payment already reviewed';
  end if;

  if p_approve then
    v_subscription_id := private.activate_saas_payment(
      v_payment.id,
      'bre-b',
      v_payment.id::text,
      now(),
      null,
      v_actor,
      btrim(p_reason)
    );
  else
    update public.saas_billing_payments
    set status = 'failed',
        reviewed_at = now(),
        reviewed_by = v_actor,
        failure_code = 'manual_rejected',
        failure_message = btrim(p_reason),
        updated_at = now()
    where id = v_payment.id;
  end if;

  insert into public.admin_audit_log (
    actor_user_id, action, target_type, target_id, reason,
    before_state, after_state
  ) values (
    v_actor,
    case when p_approve then 'payment.approved' else 'payment.rejected' end,
    'saas_payment',
    v_payment.id,
    btrim(p_reason),
    to_jsonb(v_payment),
    jsonb_build_object(
      'status', case when p_approve then 'succeeded' else 'failed' end,
      'subscription_id', v_subscription_id
    )
  );

  return v_subscription_id;
end;
$fn$;

create or replace function public.process_wompi_saas_payment(
  p_reference text,
  p_provider_payment_id text,
  p_external_event_id text,
  p_amount numeric,
  p_currency text,
  p_paid_at timestamptz
)
returns uuid
language sql
security invoker
set search_path = ''
as $fn$
  select private.process_wompi_saas_payment(
    p_reference,
    p_provider_payment_id,
    p_external_event_id,
    p_amount,
    p_currency,
    p_paid_at
  );
$fn$;

create or replace function public.admin_review_saas_payment(
  p_payment_id uuid,
  p_approve boolean,
  p_reason text
)
returns uuid
language sql
security invoker
set search_path = ''
as $fn$
  select private.admin_review_saas_payment(p_payment_id, p_approve, p_reason);
$fn$;

revoke all on function private.activate_saas_payment(
  uuid, text, text, timestamptz, text, uuid, text
) from public, anon, authenticated;
revoke all on function private.process_wompi_saas_payment(
  text, text, text, numeric, text, timestamptz
) from public, anon, authenticated;
revoke all on function private.admin_review_saas_payment(uuid, boolean, text)
  from public, anon, authenticated;
revoke all on function public.process_wompi_saas_payment(
  text, text, text, numeric, text, timestamptz
) from public, anon, authenticated;
revoke all on function public.admin_review_saas_payment(uuid, boolean, text)
  from public, anon, authenticated;

grant execute on function private.activate_saas_payment(
  uuid, text, text, timestamptz, text, uuid, text
) to service_role;
grant execute on function private.process_wompi_saas_payment(
  text, text, text, numeric, text, timestamptz
) to service_role;
grant execute on function public.process_wompi_saas_payment(
  text, text, text, numeric, text, timestamptz
) to service_role;
grant execute on function private.admin_review_saas_payment(uuid, boolean, text)
  to authenticated;
grant execute on function public.admin_review_saas_payment(uuid, boolean, text)
  to authenticated;

comment on function private.process_wompi_saas_payment(
  text, text, text, numeric, text, timestamptz
) is 'Service-role only. Confirma un checkout persistido y extiende el plan una sola vez.';

comment on function public.process_wompi_saas_payment(
  text, text, text, numeric, text, timestamptz
) is 'Entrada Data API para service_role; delega la confirmación Wompi atómica.';
