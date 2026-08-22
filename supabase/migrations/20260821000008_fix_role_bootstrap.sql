-- ============================================================================
-- CERO · 0008 · Tres correcciones a la migración de roles y compartir
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1 · No había forma de crear el PRIMER administrador
--
-- `guard_role_change` (0004) exigía ser admin para cambiar un rol. Con la tabla
-- recién creada no existe ningún admin, así que la condición no se podía
-- cumplir nunca — ni desde el SQL editor:
--
--   ERROR 42501: Sólo un administrador puede cambiar el rol de un usuario
--
-- El trigger existe para impedir que un usuario autenticado se ascienda solo
-- con un PATCH a /rest/v1/profiles. Ese ataque siempre llega con un JWT y por
-- tanto con `auth.uid()` informado.
--
-- Con `auth.uid()` NULL la conexión es directa a Postgres (SQL editor,
-- migraciones) o usa la service_role key. Quien tiene ese acceso ya puede
-- reescribir la base entera: bloquearle un UPDATE no aporta seguridad, sólo
-- impide arrancar.
-- ---------------------------------------------------------------------------
create or replace function public.guard_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if new.role is distinct from old.role
     and auth.uid() is not null
     and not public.is_admin()
  then
    raise exception 'Sólo un administrador puede cambiar el rol de un usuario'
      using errcode = '42501';
  end if;
  return new;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 2 · Un miembro invitado no veía con quién comparte el crédito
--
-- `members_select` sólo dejaba ver la propia fila o, si eras el dueño, todas.
-- Resultado: a quien le comparten un crédito, el panel "Compartido con" le
-- salía con una sola persona — ella misma.
--
-- Si puedes ver el crédito, puedes ver quién más lo ve. `can_access_credit` es
-- SECURITY DEFINER, así que no reentra en las RLS de `credit_members`.
-- ---------------------------------------------------------------------------
drop policy if exists members_select on public.credit_members;

create policy members_select on public.credit_members
  for select to authenticated
  using (public.can_access_credit(credit_id) or public.is_admin());

-- ---------------------------------------------------------------------------
-- 3 · PostgREST no podía unir `credit_members` con `profiles`
--
-- `user_id` apuntaba a `auth.users(id)`, un esquema que la API no expone, así
-- que el embed `profiles(full_name, email)` fallaba con "Could not find a
-- relationship" y la pantalla de detalle del crédito se caía entera.
--
-- Se cambia la referencia a `public.profiles(id)`. El borrado sigue en cascada
-- igual: profiles.id ya referencia a auth.users(id) con ON DELETE CASCADE.
--
-- Se deja UNA sola clave foránea sobre la columna a propósito: con dos, el
-- embed quedaría ambiguo y PostgREST volvería a rechazarlo.
-- ---------------------------------------------------------------------------
alter table public.credit_members
  drop constraint if exists credit_members_user_id_fkey;

alter table public.credit_members
  drop constraint if exists credit_members_user_id_profiles_fkey;

-- Cualquier fila huérfana impediría crear la restricción.
delete from public.credit_members m
where not exists (select 1 from public.profiles p where p.id = m.user_id);

alter table public.credit_members
  add constraint credit_members_user_id_profiles_fkey
  foreign key (user_id) references public.profiles(id) on delete cascade;

-- ---------------------------------------------------------------------------
-- 4 · `find_profile_by_email` no devolvía nada con la service_role key
--
-- `p.id <> auth.uid()` con `auth.uid()` NULL evalúa a NULL, que no es TRUE:
-- la fila se filtraba siempre. Sólo afectaba a llamadas fuera de una sesión de
-- usuario, pero es el tipo de fallo que aparece justo cuando se automatiza algo.
-- ---------------------------------------------------------------------------
create or replace function public.find_profile_by_email(p_email text)
returns table (id uuid, full_name text, email text)
language sql
stable
security definer
set search_path = public
as $fn$
  select p.id, p.full_name, p.email
  from public.profiles p
  where lower(p.email) = lower(btrim(p_email))
    and (auth.uid() is null or p.id <> auth.uid())
  limit 1;
$fn$;
