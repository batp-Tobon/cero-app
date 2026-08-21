-- ============================================================================
-- CERO · 0005 · Productos rotativos (tarjetas de crédito y cupos)
--
-- Una tarjeta NO es un crédito amortizado: no hay plan de cuotas ni saldo
-- final conocido. Lo que la define es un cupo, un saldo que sube y baja, y un
-- corte mensual que fija cuánto hay que pagar. Por eso vive en sus propias
-- tablas en vez de forzarse dentro de `credits`.
--
-- Alcance de esta versión: un producto rotativo tiene un solo dueño. Los
-- créditos amortizados sí se comparten (ver 0004); si más adelante hace falta
-- compartir tarjetas, se añade `revolving_members` igual que `credit_members`.
-- ============================================================================

do $$ begin create type public.revolving_kind as enum ('credit_card','credit_line');
  exception when duplicate_object then null; end $$;

do $$ begin create type public.revolving_status as enum ('active','closed');
  exception when duplicate_object then null; end $$;

do $$ begin create type public.statement_status as enum ('open','paid','overdue');
  exception when duplicate_object then null; end $$;

do $$ begin create type public.movement_kind as enum ('charge','payment','interest','fee');
  exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Cuenta rotativa
-- ---------------------------------------------------------------------------
create table if not exists public.revolving_accounts (
  id                    uuid primary key default gen_random_uuid(),
  owner_id              uuid not null references auth.users(id) on delete cascade,
  name                  text not null check (length(btrim(name)) between 1 and 80),
  kind                  public.revolving_kind not null default 'credit_card',
  entity                text,
  -- Sólo los cuatro últimos dígitos: el número completo no aporta nada aquí
  -- y guardarlo sería asumir un riesgo sin ninguna ganancia.
  last_four             text check (last_four ~ '^[0-9]{4}$'),
  credit_limit          numeric(16,2) not null check (credit_limit > 0),
  interest_rate_monthly numeric(9,6) not null default 0
                        check (interest_rate_monthly >= 0 and interest_rate_monthly < 1),
  statement_day         int not null default 1 check (statement_day between 1 and 31),
  due_day               int not null default 1 check (due_day between 1 and 31),
  currency              text not null default 'COP',
  status                public.revolving_status not null default 'active',
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists revolving_accounts_owner_idx
  on public.revolving_accounts (owner_id, status, created_at desc);

-- ---------------------------------------------------------------------------
-- Extracto mensual: lo que el banco exige pagar en este corte
-- ---------------------------------------------------------------------------
create table if not exists public.revolving_statements (
  id                  uuid primary key default gen_random_uuid(),
  account_id          uuid not null references public.revolving_accounts(id) on delete cascade,
  statement_date      date not null,
  due_date            date not null,
  total_due           numeric(16,2) not null default 0 check (total_due >= 0),
  minimum_due         numeric(16,2) not null default 0 check (minimum_due >= 0),
  reduced_minimum_due numeric(16,2) check (reduced_minimum_due >= 0),
  paid_amount         numeric(16,2) not null default 0 check (paid_amount >= 0),
  status              public.statement_status not null default 'open',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (account_id, statement_date)
);

create index if not exists revolving_statements_account_idx
  on public.revolving_statements (account_id, statement_date desc);

-- ---------------------------------------------------------------------------
-- Movimientos: compras, pagos, intereses y cuotas de manejo
-- ---------------------------------------------------------------------------
create table if not exists public.revolving_movements (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references public.revolving_accounts(id) on delete cascade,
  statement_id  uuid references public.revolving_statements(id) on delete set null,
  user_id       uuid not null references auth.users(id) on delete cascade,
  kind          public.movement_kind not null,
  amount        numeric(16,2) not null check (amount > 0),
  movement_date date not null default current_date,
  description   text,
  created_at    timestamptz not null default now()
);

create index if not exists revolving_movements_account_idx
  on public.revolving_movements (account_id, movement_date desc, created_at desc);

drop trigger if exists revolving_accounts_updated_at on public.revolving_accounts;
create trigger revolving_accounts_updated_at before update on public.revolving_accounts
  for each row execute function extensions.moddatetime (updated_at);

drop trigger if exists revolving_statements_updated_at on public.revolving_statements;
create trigger revolving_statements_updated_at before update on public.revolving_statements
  for each row execute function extensions.moddatetime (updated_at);

-- ---------------------------------------------------------------------------
-- ¿La cuenta es del usuario autenticado?
-- ---------------------------------------------------------------------------
create or replace function public.owns_revolving(p_account_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1 from public.revolving_accounts a
    where a.id = p_account_id and a.owner_id = auth.uid()
  );
$fn$;

revoke all on function public.owns_revolving(uuid) from public;
grant execute on function public.owns_revolving(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.revolving_accounts   enable row level security;
alter table public.revolving_statements enable row level security;
alter table public.revolving_movements  enable row level security;

drop policy if exists revolving_accounts_select on public.revolving_accounts;
drop policy if exists revolving_accounts_insert on public.revolving_accounts;
drop policy if exists revolving_accounts_update on public.revolving_accounts;
drop policy if exists revolving_accounts_delete on public.revolving_accounts;

create policy revolving_accounts_select on public.revolving_accounts
  for select to authenticated using (owner_id = auth.uid() or public.is_admin());
create policy revolving_accounts_insert on public.revolving_accounts
  for insert to authenticated with check (owner_id = auth.uid());
create policy revolving_accounts_update on public.revolving_accounts
  for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy revolving_accounts_delete on public.revolving_accounts
  for delete to authenticated using (owner_id = auth.uid());

drop policy if exists revolving_statements_all on public.revolving_statements;
drop policy if exists revolving_statements_select on public.revolving_statements;

create policy revolving_statements_select on public.revolving_statements
  for select to authenticated
  using (public.owns_revolving(account_id) or public.is_admin());
create policy revolving_statements_all on public.revolving_statements
  for all to authenticated
  using (public.owns_revolving(account_id))
  with check (public.owns_revolving(account_id));

drop policy if exists revolving_movements_all on public.revolving_movements;
drop policy if exists revolving_movements_select on public.revolving_movements;

create policy revolving_movements_select on public.revolving_movements
  for select to authenticated
  using (public.owns_revolving(account_id) or public.is_admin());
create policy revolving_movements_all on public.revolving_movements
  for all to authenticated
  using (public.owns_revolving(account_id) and user_id = auth.uid())
  with check (public.owns_revolving(account_id) and user_id = auth.uid());

revoke all on public.revolving_accounts, public.revolving_statements,
              public.revolving_movements
  from anon;

-- ---------------------------------------------------------------------------
-- Resumen: saldo, disponible y extracto vigente en una sola consulta
-- ---------------------------------------------------------------------------
drop view if exists public.revolving_summary;

create view public.revolving_summary
with (security_invoker = on) as
select
  a.id,
  a.owner_id,
  a.name,
  a.kind,
  a.entity,
  a.last_four,
  a.credit_limit,
  a.interest_rate_monthly,
  a.statement_day,
  a.due_day,
  a.currency,
  a.status,
  a.created_at,

  -- El saldo sale de los movimientos: las compras suman, los pagos restan.
  coalesce(m.balance, 0)                            as balance,
  greatest(a.credit_limit - coalesce(m.balance, 0), 0) as available,
  coalesce(m.total_charged, 0)                      as total_charged,
  coalesce(m.total_paid, 0)                         as total_paid,
  m.last_movement_date,

  s.id                  as statement_id,
  s.statement_date      as statement_date,
  s.due_date            as statement_due_date,
  s.total_due           as statement_total_due,
  s.minimum_due         as statement_minimum_due,
  s.reduced_minimum_due as statement_reduced_minimum_due,
  s.paid_amount         as statement_paid_amount,
  s.status              as statement_status

from public.revolving_accounts a

left join lateral (
  select
    sum(case when mv.kind = 'payment' then -mv.amount else mv.amount end) as balance,
    sum(mv.amount) filter (where mv.kind <> 'payment')                    as total_charged,
    sum(mv.amount) filter (where mv.kind = 'payment')                     as total_paid,
    max(mv.movement_date)                                                 as last_movement_date
  from public.revolving_movements mv
  where mv.account_id = a.id
) m on true

-- El extracto vigente es el último emitido.
left join lateral (
  select st.*
  from public.revolving_statements st
  where st.account_id = a.id
  order by st.statement_date desc
  limit 1
) s on true;

revoke all on public.revolving_summary from anon;
grant select on public.revolving_summary to authenticated;
