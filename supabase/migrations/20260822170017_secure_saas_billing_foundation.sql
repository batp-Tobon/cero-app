-- ============================================================================
-- CERO · Seguridad del backoffice y base comercial SaaS
--
-- El administrador gestiona cuentas, roles, planes, suscripciones y pagos del
-- producto. No obtiene acceso implícito a créditos, tarjetas, presupuestos ni
-- movimientos financieros de los clientes.
-- ============================================================================

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

-- Las próximas migraciones deberán publicar cada objeto de forma explícita.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Helpers de autorización fuera del esquema expuesto por la Data API
-- ---------------------------------------------------------------------------
create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'admin'
  );
$fn$;

create or replace function private.owns_credit(p_credit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select exists (
    select 1
    from public.credits c
    where c.id = p_credit_id
      and c.owner_id = (select auth.uid())
  );
$fn$;

create or replace function private.is_credit_member(p_credit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select exists (
    select 1
    from public.credit_members m
    where m.credit_id = p_credit_id
      and m.user_id = (select auth.uid())
  );
$fn$;

create or replace function private.can_access_credit(p_credit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select exists (
    select 1
    from public.credit_members m
    where m.credit_id = p_credit_id
      and m.user_id = (select auth.uid())
  );
$fn$;

create or replace function private.owns_revolving(p_account_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select exists (
    select 1
    from public.revolving_accounts a
    where a.id = p_account_id
      and a.owner_id = (select auth.uid())
  );
$fn$;

create or replace function private.can_view_profile(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select exists (
    select 1
    from public.credit_members mine
    join public.credit_members theirs on theirs.credit_id = mine.credit_id
    where mine.user_id = (select auth.uid())
      and theirs.user_id = p_profile_id
  );
$fn$;

revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function private.is_admin() to authenticated;
grant execute on function private.owns_credit(uuid) to authenticated;
grant execute on function private.is_credit_member(uuid) to authenticated;
grant execute on function private.can_access_credit(uuid) to authenticated;
grant execute on function private.owns_revolving(uuid) to authenticated;
grant execute on function private.can_view_profile(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Los triggers privilegiados tampoco forman parte de la API pública
-- ---------------------------------------------------------------------------
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(public.profiles.full_name, excluded.full_name);
  return new;
end;
$fn$;

create or replace function private.guard_role_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if new.role is distinct from old.role
     and (select auth.uid()) is not null
     and not private.is_admin()
  then
    raise insufficient_privilege
      using message = 'Only an administrator can change user roles';
  end if;
  return new;
end;
$fn$;

create or replace function private.add_owner_as_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  insert into public.credit_members (credit_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (credit_id, user_id) do nothing;
  return new;
end;
$fn$;

revoke all on function private.handle_new_user() from public, anon, authenticated;
revoke all on function private.guard_role_change() from public, anon, authenticated;
revoke all on function private.add_owner_as_member() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

drop trigger if exists profiles_guard_role on public.profiles;
create trigger profiles_guard_role
  before update on public.profiles
  for each row execute function private.guard_role_change();

drop trigger if exists credits_add_owner_member on public.credits;
create trigger credits_add_owner_member
  after insert on public.credits
  for each row execute function private.add_owner_as_member();

-- ---------------------------------------------------------------------------
-- Privacidad financiera: ni siquiera un admin ve los datos del cliente
-- ---------------------------------------------------------------------------
drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_insert_own on public.profiles;
drop policy if exists profiles_update_admin on public.profiles;
drop policy if exists profiles_update_own on public.profiles;

create policy profiles_select_allowed on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or (select private.is_admin())
    or private.can_view_profile(id)
  );

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- El cliente sólo puede editar preferencias. Email, id y rol quedan fuera de
-- los privilegios de columna; el rol se cambia mediante un RPC auditado.
revoke insert, update, delete on public.profiles from authenticated;
grant select on public.profiles to authenticated;
grant update (
  full_name, avatar_url, currency, locale,
  notify_upcoming, notify_overdue, notify_payments
) on public.profiles to authenticated;

drop policy if exists credits_select_own on public.credits;
create policy credits_select_allowed on public.credits
  for select to authenticated
  using (
    owner_id = (select auth.uid())
    or private.is_credit_member(id)
  );

drop policy if exists members_select on public.credit_members;
drop policy if exists members_insert on public.credit_members;
drop policy if exists members_delete on public.credit_members;
create policy members_select_allowed on public.credit_members
  for select to authenticated
  using (private.can_access_credit(credit_id));
create policy members_insert_owner on public.credit_members
  for insert to authenticated
  with check (private.owns_credit(credit_id));
create policy members_delete_owner on public.credit_members
  for delete to authenticated
  using (private.owns_credit(credit_id));

drop policy if exists schedule_select_own on public.credit_schedule;
drop policy if exists schedule_insert_own on public.credit_schedule;
drop policy if exists schedule_update_own on public.credit_schedule;
drop policy if exists schedule_delete_own on public.credit_schedule;
create policy schedule_select_allowed on public.credit_schedule
  for select to authenticated
  using (private.can_access_credit(credit_id));
create policy schedule_insert_allowed on public.credit_schedule
  for insert to authenticated
  with check (private.can_access_credit(credit_id));
create policy schedule_update_allowed on public.credit_schedule
  for update to authenticated
  using (private.can_access_credit(credit_id))
  with check (private.can_access_credit(credit_id));
create policy schedule_delete_allowed on public.credit_schedule
  for delete to authenticated
  using (private.can_access_credit(credit_id));

drop policy if exists payments_select_own on public.payments;
drop policy if exists payments_insert_own on public.payments;
drop policy if exists payments_update_own on public.payments;
drop policy if exists payments_delete_own on public.payments;
create policy payments_select_allowed on public.payments
  for select to authenticated
  using (private.can_access_credit(credit_id));
create policy payments_insert_allowed on public.payments
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and private.can_access_credit(credit_id)
  );
create policy payments_update_allowed on public.payments
  for update to authenticated
  using (private.can_access_credit(credit_id))
  with check (private.can_access_credit(credit_id));
create policy payments_delete_allowed on public.payments
  for delete to authenticated
  using (private.can_access_credit(credit_id));

drop policy if exists activity_select_own on public.activity;
drop policy if exists activity_delete_own on public.activity;
create policy activity_select_allowed on public.activity
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (credit_id is not null and private.can_access_credit(credit_id))
  );
create policy activity_delete_allowed on public.activity
  for delete to authenticated
  using (
    user_id = (select auth.uid())
    or (credit_id is not null and private.can_access_credit(credit_id))
  );

drop policy if exists revolving_accounts_select on public.revolving_accounts;
create policy revolving_accounts_select_own on public.revolving_accounts
  for select to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists revolving_statements_select on public.revolving_statements;
drop policy if exists revolving_statements_all on public.revolving_statements;
create policy revolving_statements_select_own on public.revolving_statements
  for select to authenticated
  using (private.owns_revolving(account_id));
create policy revolving_statements_write_own on public.revolving_statements
  for all to authenticated
  using (private.owns_revolving(account_id))
  with check (private.owns_revolving(account_id));

drop policy if exists revolving_movements_select on public.revolving_movements;
drop policy if exists revolving_movements_all on public.revolving_movements;
create policy revolving_movements_select_own on public.revolving_movements
  for select to authenticated
  using (private.owns_revolving(account_id));
create policy revolving_movements_write_own on public.revolving_movements
  for all to authenticated
  using (private.owns_revolving(account_id))
  with check (
    user_id = (select auth.uid())
    and private.owns_revolving(account_id)
  );

-- Búsqueda exacta para compartir: permanece pública porque la usa la app,
-- pero valida sesión, normaliza la entrada y usa un search_path vacío.
create or replace function public.find_profile_by_email(p_email text)
returns table (id uuid, full_name text, email text)
language plpgsql
stable
security definer
set search_path = ''
as $fn$
begin
  if (select auth.uid()) is null then
    raise insufficient_privilege using message = 'Authentication required';
  end if;
  if length(btrim(p_email)) not between 3 and 254 then
    raise check_violation using message = 'Invalid email';
  end if;

  return query
  select p.id, p.full_name, p.email
  from public.profiles p
  where lower(p.email) = lower(btrim(p_email))
    and p.id <> (select auth.uid())
  limit 1;
end;
$fn$;

revoke all on function public.find_profile_by_email(text)
  from public, anon, authenticated;
grant execute on function public.find_profile_by_email(text) to authenticated;

-- Los helpers antiguos estaban en public y PostgREST podía descubrirlos.
drop function if exists public.handle_new_user();
drop function if exists public.guard_role_change();
drop function if exists public.add_owner_as_member();
drop function if exists public.owns_credit(uuid);
drop function if exists public.is_credit_member(uuid);
drop function if exists public.can_access_credit(uuid);
drop function if exists public.owns_revolving(uuid);
drop function if exists public.is_admin();

-- ---------------------------------------------------------------------------
-- Dominio SaaS: separado del perfil y de los pagos de créditos
-- ---------------------------------------------------------------------------
do $$ begin create type public.saas_subscription_status as enum
  ('trialing', 'active', 'past_due', 'canceled', 'expired');
  exception when duplicate_object then null; end $$;

do $$ begin create type public.saas_billing_interval as enum
  ('month', 'year', 'one_time');
  exception when duplicate_object then null; end $$;

do $$ begin create type public.saas_payment_status as enum
  ('pending', 'succeeded', 'failed', 'refunded', 'canceled');
  exception when duplicate_object then null; end $$;

create table public.saas_plans (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique
              check (code ~ '^[a-z0-9_]{2,40}$'),
  name        text not null check (length(btrim(name)) between 1 and 80),
  description text check (description is null or length(description) <= 500),
  features    jsonb not null default '{}'::jsonb
              check (jsonb_typeof(features) = 'object'),
  is_active   boolean not null default true,
  is_public   boolean not null default false,
  sort_order  smallint not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.saas_prices (
  id                uuid primary key default gen_random_uuid(),
  plan_id           uuid not null references public.saas_plans(id) on delete restrict,
  currency          text not null check (currency ~ '^[A-Z]{3}$'),
  amount            numeric(16,2) not null check (amount >= 0),
  billing_interval  public.saas_billing_interval not null,
  interval_count    smallint not null default 1 check (interval_count between 1 and 36),
  provider          text check (provider is null or length(btrim(provider)) between 2 and 40),
  provider_price_id text,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create unique index saas_prices_active_catalog_idx
  on public.saas_prices (plan_id, currency, billing_interval, interval_count)
  where is_active;
create unique index saas_prices_provider_id_idx
  on public.saas_prices (provider, provider_price_id)
  where provider_price_id is not null;
create index saas_prices_plan_idx on public.saas_prices (plan_id);

create table public.saas_subscriptions (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null unique
                           references public.profiles(id) on delete cascade,
  plan_id                  uuid not null references public.saas_plans(id) on delete restrict,
  price_id                 uuid references public.saas_prices(id) on delete restrict,
  status                   public.saas_subscription_status not null,
  provider                 text not null default 'manual'
                           check (length(btrim(provider)) between 2 and 40),
  provider_customer_id     text,
  provider_subscription_id text,
  starts_at                timestamptz not null default now(),
  trial_ends_at            timestamptz,
  current_period_start     timestamptz,
  current_period_end       timestamptz,
  grace_ends_at            timestamptz,
  cancel_at_period_end     boolean not null default false,
  canceled_at              timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint saas_subscriptions_trial_range check (
    trial_ends_at is null or trial_ends_at > starts_at
  ),
  constraint saas_subscriptions_period_range check (
    current_period_end is null
    or current_period_start is null
    or current_period_end > current_period_start
  ),
  constraint saas_subscriptions_grace_range check (
    grace_ends_at is null or grace_ends_at > starts_at
  )
);

create unique index saas_subscriptions_provider_id_idx
  on public.saas_subscriptions (provider, provider_subscription_id)
  where provider_subscription_id is not null;
create index saas_subscriptions_status_period_idx
  on public.saas_subscriptions (status, current_period_end);
create index saas_subscriptions_plan_idx on public.saas_subscriptions (plan_id);
create index saas_subscriptions_price_idx on public.saas_subscriptions (price_id)
  where price_id is not null;

create table public.saas_subscription_events (
  id                uuid primary key default gen_random_uuid(),
  subscription_id   uuid not null
                    references public.saas_subscriptions(id) on delete cascade,
  user_id           uuid not null references public.profiles(id) on delete cascade,
  actor_user_id     uuid,
  event_type        text not null
                    check (length(btrim(event_type)) between 2 and 60),
  source            text not null
                    check (length(btrim(source)) between 2 and 40),
  reason            text check (reason is null or length(reason) between 10 and 500),
  before_state      jsonb not null default '{}'::jsonb
                    check (jsonb_typeof(before_state) = 'object'),
  after_state       jsonb not null default '{}'::jsonb
                    check (jsonb_typeof(after_state) = 'object'),
  external_event_id text,
  occurred_at       timestamptz not null default now()
);

create unique index saas_subscription_events_external_idx
  on public.saas_subscription_events (source, external_event_id)
  where external_event_id is not null;
create index saas_subscription_events_user_time_idx
  on public.saas_subscription_events (user_id, occurred_at desc);
create index saas_subscription_events_subscription_time_idx
  on public.saas_subscription_events (subscription_id, occurred_at desc);

create table public.saas_billing_payments (
  id                  uuid primary key default gen_random_uuid(),
  subscription_id     uuid references public.saas_subscriptions(id) on delete set null,
  user_id              uuid not null references public.profiles(id) on delete cascade,
  price_id             uuid references public.saas_prices(id) on delete restrict,
  status               public.saas_payment_status not null default 'pending',
  provider             text not null
                       check (length(btrim(provider)) between 2 and 40),
  provider_payment_id  text,
  idempotency_key      text,
  amount               numeric(16,2) not null check (amount > 0),
  currency             text not null check (currency ~ '^[A-Z]{3}$'),
  paid_at              timestamptz,
  refunded_at          timestamptz,
  failure_code         text check (failure_code is null or length(failure_code) <= 100),
  failure_message      text check (failure_message is null or length(failure_message) <= 500),
  metadata             jsonb not null default '{}'::jsonb
                       check (jsonb_typeof(metadata) = 'object'),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create unique index saas_billing_payments_provider_idx
  on public.saas_billing_payments (provider, provider_payment_id)
  where provider_payment_id is not null;
create unique index saas_billing_payments_idempotency_idx
  on public.saas_billing_payments (provider, idempotency_key)
  where idempotency_key is not null;
create index saas_billing_payments_user_time_idx
  on public.saas_billing_payments (user_id, created_at desc);
create index saas_billing_payments_status_time_idx
  on public.saas_billing_payments (status, created_at desc);
create index saas_billing_payments_subscription_idx
  on public.saas_billing_payments (subscription_id)
  where subscription_id is not null;
create index saas_billing_payments_price_idx
  on public.saas_billing_payments (price_id)
  where price_id is not null;

-- Sólo conserva identidad e integridad del evento. El payload crudo del
-- proveedor puede contener datos sensibles y no se almacena.
create table public.saas_webhook_events (
  id             uuid primary key default gen_random_uuid(),
  provider       text not null check (length(btrim(provider)) between 2 and 40),
  event_id       text not null check (length(btrim(event_id)) between 2 and 200),
  event_type     text not null check (length(btrim(event_type)) between 2 and 100),
  payload_sha256 text not null check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  status         text not null default 'received'
                 check (status in ('received', 'processed', 'ignored', 'failed')),
  attempts       smallint not null default 0 check (attempts between 0 and 100),
  last_error     text check (last_error is null or length(last_error) <= 1000),
  received_at    timestamptz not null default now(),
  processed_at   timestamptz,
  unique (provider, event_id)
);

create index saas_webhook_events_pending_idx
  on public.saas_webhook_events (received_at)
  where status in ('received', 'failed');

create table public.saas_usage_counters (
  user_id      uuid not null references public.profiles(id) on delete cascade,
  metric       text not null check (metric ~ '^[a-z0-9_]{2,60}$'),
  period_start date not null,
  period_end   date not null,
  used         bigint not null default 0 check (used >= 0),
  included     bigint not null check (included = -1 or included >= 0),
  updated_at   timestamptz not null default now(),
  primary key (user_id, metric, period_start),
  constraint saas_usage_period_range check (period_end > period_start)
);

create table public.admin_audit_log (
  id            uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null,
  action        text not null check (action ~ '^[a-z0-9_.]{3,100}$'),
  target_type   text not null check (target_type ~ '^[a-z0-9_]{2,60}$'),
  target_id     uuid,
  reason        text not null check (length(btrim(reason)) between 10 and 500),
  before_state  jsonb not null default '{}'::jsonb
                check (jsonb_typeof(before_state) = 'object'),
  after_state   jsonb not null default '{}'::jsonb
                check (jsonb_typeof(after_state) = 'object'),
  metadata      jsonb not null default '{}'::jsonb
                check (jsonb_typeof(metadata) = 'object'),
  created_at    timestamptz not null default now()
);

create index admin_audit_log_actor_time_idx
  on public.admin_audit_log (actor_user_id, created_at desc);
create index admin_audit_log_target_time_idx
  on public.admin_audit_log (target_type, target_id, created_at desc);

create trigger saas_plans_updated_at before update on public.saas_plans
  for each row execute function extensions.moddatetime (updated_at);
create trigger saas_prices_updated_at before update on public.saas_prices
  for each row execute function extensions.moddatetime (updated_at);
create trigger saas_subscriptions_updated_at before update on public.saas_subscriptions
  for each row execute function extensions.moddatetime (updated_at);
create trigger saas_billing_payments_updated_at before update on public.saas_billing_payments
  for each row execute function extensions.moddatetime (updated_at);

insert into public.saas_plans (code, name, description, features, is_public, sort_order)
values
  (
    'free',
    'CERO Gratis',
    'Herramientas esenciales para empezar a ordenar las finanzas.',
    '{"credits":2,"revolving_accounts":1,"shared_members":1,"budget":true,"csv_export":false}'::jsonb,
    true,
    0
  ),
  (
    'pro',
    'CERO Pro',
    'Productos ilimitados, exportación y funciones avanzadas.',
    '{"credits":-1,"revolving_accounts":-1,"shared_members":-1,"budget":true,"csv_export":true}'::jsonb,
    false,
    10
  )
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- RLS y grants mínimos del dominio comercial
-- ---------------------------------------------------------------------------
alter table public.saas_plans enable row level security;
alter table public.saas_prices enable row level security;
alter table public.saas_subscriptions enable row level security;
alter table public.saas_subscription_events enable row level security;
alter table public.saas_billing_payments enable row level security;
alter table public.saas_webhook_events enable row level security;
alter table public.saas_usage_counters enable row level security;
alter table public.admin_audit_log enable row level security;

create policy saas_plans_select_catalog on public.saas_plans
  for select to authenticated
  using (
    (is_active and is_public)
    or (select private.is_admin())
    or exists (
      select 1 from public.saas_subscriptions s
      where s.plan_id = saas_plans.id
        and s.user_id = (select auth.uid())
    )
  );
create policy saas_prices_select_catalog on public.saas_prices
  for select to authenticated
  using (
    (
      is_active
      and exists (
        select 1 from public.saas_plans p
        where p.id = saas_prices.plan_id and p.is_active and p.is_public
      )
    )
    or (select private.is_admin())
    or exists (
      select 1 from public.saas_subscriptions s
      where s.price_id = saas_prices.id
        and s.user_id = (select auth.uid())
    )
  );
create policy saas_subscriptions_select_allowed on public.saas_subscriptions
  for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));
create policy saas_subscription_events_select_allowed on public.saas_subscription_events
  for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));
create policy saas_billing_payments_select_allowed on public.saas_billing_payments
  for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));
create policy saas_usage_counters_select_allowed on public.saas_usage_counters
  for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));
create policy admin_audit_log_select_admin on public.admin_audit_log
  for select to authenticated
  using ((select private.is_admin()));

revoke all on public.saas_plans, public.saas_prices, public.saas_subscriptions,
  public.saas_subscription_events, public.saas_billing_payments,
  public.saas_webhook_events, public.saas_usage_counters,
  public.admin_audit_log from public, anon, authenticated;

grant select on public.saas_plans, public.saas_prices,
  public.saas_subscriptions, public.saas_subscription_events,
  public.saas_billing_payments, public.saas_usage_counters,
  public.admin_audit_log to authenticated;

grant all on public.saas_plans, public.saas_prices, public.saas_subscriptions,
  public.saas_subscription_events, public.saas_billing_payments,
  public.saas_webhook_events, public.saas_usage_counters,
  public.admin_audit_log to service_role;

-- ---------------------------------------------------------------------------
-- Mutaciones administrativas atómicas y siempre auditadas
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_user_role(
  p_user_id uuid,
  p_role public.user_role,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_actor uuid := (select auth.uid());
  v_old_role public.user_role;
begin
  if v_actor is null or not private.is_admin() then
    raise insufficient_privilege using message = 'Administrator access required';
  end if;
  if length(btrim(p_reason)) not between 10 and 500 then
    raise check_violation using message = 'A reason between 10 and 500 characters is required';
  end if;

  -- Serializa ascensos y descensos para que nunca puedan salir dos últimos
  -- administradores al mismo tiempo.
  lock table public.profiles in share row exclusive mode;
  select p.role into v_old_role
  from public.profiles p
  where p.id = p_user_id
  for update;

  if not found then
    raise no_data_found using message = 'User not found';
  end if;
  if v_old_role = p_role then
    return;
  end if;
  if v_old_role = 'admin' and p_role = 'user'
     and (select count(*) from public.profiles where role = 'admin') <= 1
  then
    raise check_violation using message = 'The last administrator cannot be removed';
  end if;

  update public.profiles set role = p_role where id = p_user_id;

  insert into public.admin_audit_log (
    actor_user_id, action, target_type, target_id, reason,
    before_state, after_state
  ) values (
    v_actor, 'user.role_changed', 'user', p_user_id, btrim(p_reason),
    jsonb_build_object('role', v_old_role),
    jsonb_build_object('role', p_role)
  );
end;
$fn$;

create or replace function public.admin_set_subscription(
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
  v_old_status public.saas_subscription_status;
  v_before jsonb := '{}'::jsonb;
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

  select s.id, s.status,
         jsonb_build_object(
           'plan_id', s.plan_id,
           'status', s.status,
           'trial_ends_at', s.trial_ends_at,
           'current_period_end', s.current_period_end,
           'grace_ends_at', s.grace_ends_at
         )
  into v_subscription_id, v_old_status, v_before
  from public.saas_subscriptions s
  where s.user_id = p_user_id
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
    (select count(*) from public.saas_subscriptions where status = 'active'),
    (select count(*) from public.saas_subscriptions where status = 'trialing'),
    (select count(*) from public.saas_subscriptions where status = 'past_due'),
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

revoke all on function public.admin_set_user_role(uuid, public.user_role, text)
  from public, anon, authenticated;
revoke all on function public.admin_set_subscription(
  uuid, uuid, public.saas_subscription_status, timestamptz, text
) from public, anon, authenticated;
revoke all on function public.admin_billing_metrics()
  from public, anon, authenticated;

grant execute on function public.admin_set_user_role(uuid, public.user_role, text)
  to authenticated;
grant execute on function public.admin_set_subscription(
  uuid, uuid, public.saas_subscription_status, timestamptz, text
) to authenticated;
grant execute on function public.admin_billing_metrics() to authenticated;
