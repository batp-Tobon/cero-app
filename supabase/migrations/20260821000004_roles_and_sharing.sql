-- ============================================================================
-- CERO · 0004 · Roles y créditos compartidos
--
-- Dos cambios que tocan la seguridad, así que van juntos y explicados:
--
--  1. ROLES. `profiles.role` distingue usuario de administrador. El admin LEE
--     todo para poder administrar, pero no escribe datos financieros ajenos.
--
--  2. COMPARTIR. Un crédito puede tener varios miembros (una pareja comparte
--     el carro y la casa, pero cada uno guarda lo suyo aparte). El dueño manda;
--     los miembros ven y registran pagos.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1 · Rol de usuario
-- ---------------------------------------------------------------------------
do $$ begin create type public.user_role as enum ('user','admin');
  exception when duplicate_object then null; end $$;

alter table public.profiles
  add column if not exists role public.user_role not null default 'user';

create index if not exists profiles_role_idx on public.profiles (role);

/**
 * ¿El usuario autenticado es administrador?
 * SECURITY DEFINER a propósito: las políticas de `profiles` no pueden
 * consultarse a sí mismas sin entrar en recursión infinita.
 */
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$fn$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

/**
 * Nadie se asciende a sí mismo.
 *
 * `profiles_update_own` deja a cada usuario editar su fila, y sin esta barrera
 * bastaría un PATCH a /rest/v1/profiles con {"role":"admin"} para tomar el
 * control. El rol sólo lo cambia un admin.
 */
create or replace function public.guard_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if new.role is distinct from old.role and not public.is_admin() then
    raise exception 'Sólo un administrador puede cambiar el rol de un usuario'
      using errcode = '42501';
  end if;
  return new;
end;
$fn$;

drop trigger if exists profiles_guard_role on public.profiles;
create trigger profiles_guard_role
  before update on public.profiles
  for each row execute function public.guard_role_change();

-- ---------------------------------------------------------------------------
-- 2 · Miembros de un crédito
-- ---------------------------------------------------------------------------
create table if not exists public.credit_members (
  credit_id  uuid not null references public.credits(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null default 'member' check (role in ('owner','member')),
  created_at timestamptz not null default now(),
  primary key (credit_id, user_id)
);

create index if not exists credit_members_user_idx
  on public.credit_members (user_id);

-- El dueño siempre es miembro: así una sola consulta responde "¿quién ve esto?"
create or replace function public.add_owner_as_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  insert into public.credit_members (credit_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (credit_id, user_id) do nothing;
  return new;
end;
$fn$;

drop trigger if exists credits_add_owner_member on public.credits;
create trigger credits_add_owner_member
  after insert on public.credits
  for each row execute function public.add_owner_as_member();

-- Créditos que ya existían antes de esta migración.
insert into public.credit_members (credit_id, user_id, role)
select c.id, c.owner_id, 'owner' from public.credits c
on conflict (credit_id, user_id) do nothing;

-- ---------------------------------------------------------------------------
-- 3 · Funciones de acceso
-- ---------------------------------------------------------------------------

/** ¿El usuario figura como miembro? No mira `credits`, así que no recursa. */
create or replace function public.is_credit_member(p_credit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1 from public.credit_members m
    where m.credit_id = p_credit_id and m.user_id = auth.uid()
  );
$fn$;

/** ¿Puede ver este crédito? Dueño o miembro. */
create or replace function public.can_access_credit(p_credit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1 from public.credits c
    where c.id = p_credit_id
      and (
        c.owner_id = auth.uid()
        or exists (
          select 1 from public.credit_members m
          where m.credit_id = c.id and m.user_id = auth.uid()
        )
      )
  );
$fn$;

revoke all on function public.is_credit_member(uuid) from public;
revoke all on function public.can_access_credit(uuid) from public;
grant execute on function public.is_credit_member(uuid) to authenticated;
grant execute on function public.can_access_credit(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4 · Políticas actualizadas
-- ---------------------------------------------------------------------------
alter table public.credit_members enable row level security;

-- profiles ------------------------------------------------------------------
drop policy if exists profiles_select_own   on public.profiles;
drop policy if exists profiles_select_admin on public.profiles;
drop policy if exists profiles_update_admin on public.profiles;

-- Los miembros de un crédito compartido necesitan verse el nombre entre sí.
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or public.is_admin()
    or exists (
      select 1
      from public.credit_members mine
      join public.credit_members theirs on theirs.credit_id = mine.credit_id
      where mine.user_id = auth.uid() and theirs.user_id = public.profiles.id
    )
  );

create policy profiles_update_admin on public.profiles
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- credits -------------------------------------------------------------------
drop policy if exists credits_select_own on public.credits;
create policy credits_select_own on public.credits
  for select to authenticated
  using (
    owner_id = auth.uid()
    or public.is_credit_member(id)
    or public.is_admin()
  );

-- Modificar y borrar sigue siendo cosa del dueño: un miembro invitado no
-- puede eliminar el crédito de otro.
drop policy if exists credits_update_own on public.credits;
drop policy if exists credits_delete_own on public.credits;
create policy credits_update_own on public.credits
  for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy credits_delete_own on public.credits
  for delete to authenticated using (owner_id = auth.uid());

-- credit_members ------------------------------------------------------------
drop policy if exists members_select on public.credit_members;
drop policy if exists members_insert on public.credit_members;
drop policy if exists members_delete on public.credit_members;

create policy members_select on public.credit_members
  for select to authenticated
  using (
    user_id = auth.uid() or public.owns_credit(credit_id) or public.is_admin()
  );
create policy members_insert on public.credit_members
  for insert to authenticated
  with check (public.owns_credit(credit_id) or public.is_admin());
create policy members_delete on public.credit_members
  for delete to authenticated
  using (public.owns_credit(credit_id) or public.is_admin());

-- credit_schedule · cualquier miembro puede registrar pagos, y registrar un
-- pago reescribe la cola del plan.
drop policy if exists schedule_select_own on public.credit_schedule;
drop policy if exists schedule_insert_own on public.credit_schedule;
drop policy if exists schedule_update_own on public.credit_schedule;
drop policy if exists schedule_delete_own on public.credit_schedule;

create policy schedule_select_own on public.credit_schedule
  for select to authenticated
  using (public.can_access_credit(credit_id) or public.is_admin());
create policy schedule_insert_own on public.credit_schedule
  for insert to authenticated with check (public.can_access_credit(credit_id));
create policy schedule_update_own on public.credit_schedule
  for update to authenticated
  using (public.can_access_credit(credit_id))
  with check (public.can_access_credit(credit_id));
create policy schedule_delete_own on public.credit_schedule
  for delete to authenticated using (public.can_access_credit(credit_id));

-- payments ------------------------------------------------------------------
drop policy if exists payments_select_own on public.payments;
drop policy if exists payments_insert_own on public.payments;
drop policy if exists payments_update_own on public.payments;
drop policy if exists payments_delete_own on public.payments;

create policy payments_select_own on public.payments
  for select to authenticated
  using (public.can_access_credit(credit_id) or public.is_admin());
create policy payments_insert_own on public.payments
  for insert to authenticated
  with check (user_id = auth.uid() and public.can_access_credit(credit_id));
-- Corregir un error es tan necesario como registrarlo: cualquier miembro del
-- crédito compartido puede editar o borrar el movimiento.
create policy payments_update_own on public.payments
  for update to authenticated
  using (public.can_access_credit(credit_id))
  with check (public.can_access_credit(credit_id));
create policy payments_delete_own on public.payments
  for delete to authenticated using (public.can_access_credit(credit_id));

-- activity ------------------------------------------------------------------
drop policy if exists activity_select_own on public.activity;
drop policy if exists activity_delete_own on public.activity;

create policy activity_select_own on public.activity
  for select to authenticated
  using (
    user_id = auth.uid()
    or (credit_id is not null and public.can_access_credit(credit_id))
    or public.is_admin()
  );
create policy activity_delete_own on public.activity
  for delete to authenticated
  using (
    user_id = auth.uid()
    or (credit_id is not null and public.can_access_credit(credit_id))
  );

revoke all on public.credit_members from anon;
