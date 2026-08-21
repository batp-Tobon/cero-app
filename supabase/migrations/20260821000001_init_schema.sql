-- ============================================================================
-- CERO · 0001 · Esquema inicial
-- Tablas, enums, índices y triggers. Idempotente: se puede reejecutar.
-- ============================================================================

create extension if not exists "pgcrypto";                      -- gen_random_uuid()
create extension if not exists "moddatetime" schema extensions; -- updated_at automático

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin create type public.credit_type as enum
  ('vehicle','property','card','free_investment','other');
  exception when duplicate_object then null; end $$;

do $$ begin create type public.amortization_system as enum
  ('french','german','american','zero_interest');
  exception when duplicate_object then null; end $$;

do $$ begin create type public.credit_status as enum
  ('active','paid','cancelled');
  exception when duplicate_object then null; end $$;

do $$ begin create type public.installment_status as enum
  ('pending','partial','paid');
  exception when duplicate_object then null; end $$;

-- Qué hace el sistema con un abono extraordinario a capital:
--   reduce_term        -> se mantiene la cuota, se acorta el plazo
--   reduce_installment -> se mantiene el plazo, baja la cuota
do $$ begin create type public.extra_principal_mode as enum
  ('reduce_term','reduce_installment');
  exception when duplicate_object then null; end $$;

do $$ begin create type public.activity_type as enum
  ('credit_created','credit_updated','credit_deleted','credit_paid',
   'payment','extra_principal');
  exception when duplicate_object then null; end $$;

-- ============================================================================
-- profiles  (1:1 con auth.users — auth.users ES la tabla de usuarios)
-- ============================================================================
create table if not exists public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  email           text,
  full_name       text,
  avatar_url      text,
  currency        text not null default 'COP',
  locale          text not null default 'es-CO',
  -- Preferencias de notificación (arquitectura lista para push)
  notify_upcoming boolean not null default true,
  notify_overdue  boolean not null default true,
  notify_payments boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ============================================================================
-- credits
-- ============================================================================
create table if not exists public.credits (
  id                    uuid primary key default gen_random_uuid(),
  owner_id              uuid not null references auth.users(id) on delete cascade,
  name                  text not null check (length(btrim(name)) between 1 and 80),
  type                  public.credit_type not null default 'other',
  entity                text,
  principal_amount      numeric(16,2) not null check (principal_amount > 0),
  -- Tasa mensual en decimal: 1,89% m.v. -> 0.018900
  interest_rate_monthly numeric(9,6) not null default 0
                        check (interest_rate_monthly >= 0 and interest_rate_monthly < 1),
  term_months           int not null check (term_months between 1 and 600),
  amortization_system   public.amortization_system not null default 'french',
  extra_principal_mode  public.extra_principal_mode not null default 'reduce_term',
  first_payment_date    date not null,
  currency              text not null default 'COP',
  status                public.credit_status not null default 'active',
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists credits_owner_status_idx
  on public.credits (owner_id, status, created_at desc);

-- ============================================================================
-- credit_schedule  (plan de pagos · fuente de verdad del saldo)
-- ============================================================================
create table if not exists public.credit_schedule (
  id                 uuid primary key default gen_random_uuid(),
  credit_id          uuid not null references public.credits(id) on delete cascade,
  installment_number int  not null check (installment_number > 0),
  due_date           date not null,
  opening_balance    numeric(16,2) not null check (opening_balance >= 0),
  payment_amount     numeric(16,2) not null check (payment_amount >= 0),
  interest_amount    numeric(16,2) not null check (interest_amount >= 0),
  principal_amount   numeric(16,2) not null check (principal_amount >= 0),
  closing_balance    numeric(16,2) not null check (closing_balance >= 0),
  paid_amount        numeric(16,2) not null default 0 check (paid_amount >= 0),
  status             public.installment_status not null default 'pending',
  paid_at            timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (credit_id, installment_number)
);

create index if not exists credit_schedule_credit_idx
  on public.credit_schedule (credit_id, installment_number);
create index if not exists credit_schedule_pending_due_idx
  on public.credit_schedule (credit_id, due_date)
  where status <> 'paid';

-- ============================================================================
-- payments  (pagos de cuota y abonos a capital)
-- installment_number NULL = abono a capital sin cuota asociada
-- ============================================================================
create table if not exists public.payments (
  id                 uuid primary key default gen_random_uuid(),
  credit_id          uuid not null references public.credits(id) on delete cascade,
  user_id            uuid not null references auth.users(id) on delete cascade,
  installment_number int  check (installment_number > 0),
  payment_date       date not null default current_date,
  amount_paid        numeric(16,2) not null default 0 check (amount_paid >= 0),
  principal_paid     numeric(16,2) not null default 0 check (principal_paid >= 0),
  interest_paid      numeric(16,2) not null default 0 check (interest_paid >= 0),
  extra_principal    numeric(16,2) not null default 0 check (extra_principal >= 0),
  balance_after      numeric(16,2),
  notes              text,
  created_at         timestamptz not null default now(),
  constraint payments_amount_positive check (amount_paid + extra_principal > 0)
);

-- Un único pago por cuota: bloquea duplicados por doble envío del formulario.
create unique index if not exists payments_unique_installment_idx
  on public.payments (credit_id, installment_number)
  where installment_number is not null;

create index if not exists payments_credit_date_idx
  on public.payments (credit_id, payment_date desc);
create index if not exists payments_user_date_idx
  on public.payments (user_id, payment_date desc, created_at desc);

-- ============================================================================
-- activity  (timeline de la pantalla Actividad)
-- ============================================================================
create table if not exists public.activity (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  credit_id   uuid references public.credits(id) on delete cascade,
  payment_id  uuid references public.payments(id) on delete set null,
  type        public.activity_type not null,
  title       text not null,
  description text,
  amount      numeric(16,2),
  occurred_at timestamptz not null default now(),
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists activity_user_time_idx
  on public.activity (user_id, occurred_at desc);
create index if not exists activity_credit_time_idx
  on public.activity (credit_id, occurred_at desc);

-- ============================================================================
-- notifications  (arquitectura lista; el transporte push se conecta después)
-- ============================================================================
create table if not exists public.notifications (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  credit_id     uuid references public.credits(id) on delete cascade,
  kind          text not null,   -- upcoming | overdue | payment | extra_principal
  title         text not null,
  body          text,
  read_at       timestamptz,
  scheduled_for timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists notifications_user_idx
  on public.notifications (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- updated_at automático
-- ---------------------------------------------------------------------------
drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles
  for each row execute function extensions.moddatetime (updated_at);

drop trigger if exists credits_updated_at on public.credits;
create trigger credits_updated_at before update on public.credits
  for each row execute function extensions.moddatetime (updated_at);

drop trigger if exists credit_schedule_updated_at on public.credit_schedule;
create trigger credit_schedule_updated_at before update on public.credit_schedule
  for each row execute function extensions.moddatetime (updated_at);

-- ---------------------------------------------------------------------------
-- Alta automática de perfil al registrarse
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
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
    set email     = excluded.email,
        full_name = coalesce(public.profiles.full_name, excluded.full_name);
  return new;
end;
$fn$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
