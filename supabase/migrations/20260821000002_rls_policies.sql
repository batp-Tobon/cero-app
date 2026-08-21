-- ============================================================================
-- CERO · 0002 · Row Level Security
-- Cada usuario sólo ve y modifica SUS datos. La restricción vive en PostgreSQL:
-- el frontend nunca es la última línea de defensa.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Helper: ¿el crédito pertenece al usuario autenticado?
-- SECURITY DEFINER para no reevaluar las políticas de `credits` en cada fila
-- de credit_schedule / payments (evita trabajo cuadrático en planes largos).
-- ---------------------------------------------------------------------------
create or replace function public.owns_credit(p_credit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1 from public.credits c
    where c.id = p_credit_id and c.owner_id = auth.uid()
  );
$fn$;

revoke all on function public.owns_credit(uuid) from public;
grant execute on function public.owns_credit(uuid) to authenticated;

alter table public.profiles        enable row level security;
alter table public.credits         enable row level security;
alter table public.credit_schedule enable row level security;
alter table public.payments        enable row level security;
alter table public.activity        enable row level security;
alter table public.notifications   enable row level security;

-- ---------------------------------------------------------------------------
-- profiles · sólo el propio perfil
-- ---------------------------------------------------------------------------
drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_insert_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;

create policy profiles_select_own on public.profiles
  for select to authenticated using (id = auth.uid());
create policy profiles_insert_own on public.profiles
  for insert to authenticated with check (id = auth.uid());
create policy profiles_update_own on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- ---------------------------------------------------------------------------
-- credits · sólo los créditos propios
-- ---------------------------------------------------------------------------
drop policy if exists credits_select_own on public.credits;
drop policy if exists credits_insert_own on public.credits;
drop policy if exists credits_update_own on public.credits;
drop policy if exists credits_delete_own on public.credits;

create policy credits_select_own on public.credits
  for select to authenticated using (owner_id = auth.uid());
create policy credits_insert_own on public.credits
  for insert to authenticated with check (owner_id = auth.uid());
create policy credits_update_own on public.credits
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy credits_delete_own on public.credits
  for delete to authenticated using (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- credit_schedule · cuotas de créditos propios
-- ---------------------------------------------------------------------------
drop policy if exists schedule_select_own on public.credit_schedule;
drop policy if exists schedule_insert_own on public.credit_schedule;
drop policy if exists schedule_update_own on public.credit_schedule;
drop policy if exists schedule_delete_own on public.credit_schedule;

create policy schedule_select_own on public.credit_schedule
  for select to authenticated using (public.owns_credit(credit_id));
create policy schedule_insert_own on public.credit_schedule
  for insert to authenticated with check (public.owns_credit(credit_id));
create policy schedule_update_own on public.credit_schedule
  for update to authenticated using (public.owns_credit(credit_id))
  with check (public.owns_credit(credit_id));
create policy schedule_delete_own on public.credit_schedule
  for delete to authenticated using (public.owns_credit(credit_id));

-- ---------------------------------------------------------------------------
-- payments · pagos sobre créditos autorizados, registrados por el propio usuario
-- ---------------------------------------------------------------------------
drop policy if exists payments_select_own on public.payments;
drop policy if exists payments_insert_own on public.payments;
drop policy if exists payments_update_own on public.payments;
drop policy if exists payments_delete_own on public.payments;

create policy payments_select_own on public.payments
  for select to authenticated using (public.owns_credit(credit_id));
create policy payments_insert_own on public.payments
  for insert to authenticated
  with check (user_id = auth.uid() and public.owns_credit(credit_id));
create policy payments_update_own on public.payments
  for update to authenticated using (public.owns_credit(credit_id))
  with check (user_id = auth.uid() and public.owns_credit(credit_id));
create policy payments_delete_own on public.payments
  for delete to authenticated using (public.owns_credit(credit_id));

-- ---------------------------------------------------------------------------
-- activity · timeline propio
-- ---------------------------------------------------------------------------
drop policy if exists activity_select_own on public.activity;
drop policy if exists activity_insert_own on public.activity;
drop policy if exists activity_delete_own on public.activity;

create policy activity_select_own on public.activity
  for select to authenticated using (user_id = auth.uid());
create policy activity_insert_own on public.activity
  for insert to authenticated with check (user_id = auth.uid());
create policy activity_delete_own on public.activity
  for delete to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- notifications · propias
-- ---------------------------------------------------------------------------
drop policy if exists notifications_select_own on public.notifications;
drop policy if exists notifications_insert_own on public.notifications;
drop policy if exists notifications_update_own on public.notifications;
drop policy if exists notifications_delete_own on public.notifications;

create policy notifications_select_own on public.notifications
  for select to authenticated using (user_id = auth.uid());
create policy notifications_insert_own on public.notifications
  for insert to authenticated with check (user_id = auth.uid());
create policy notifications_update_own on public.notifications
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_delete_own on public.notifications
  for delete to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Nadie anónimo toca nada.
-- ---------------------------------------------------------------------------
revoke all on public.profiles, public.credits, public.credit_schedule,
              public.payments, public.activity, public.notifications
  from anon;
