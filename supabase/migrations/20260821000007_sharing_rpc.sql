-- ============================================================================
-- CERO · 0007 · Buscar a quién invitar
--
-- Para compartir un crédito hace falta el id del otro usuario, pero las RLS de
-- `profiles` (con razón) no dejan leer perfiles ajenos. Esta función abre una
-- rendija mínima: dado un correo exacto devuelve el id y el nombre, nada más.
--
-- Qué revela: si un correo tiene cuenta en CERO. Es lo mismo que ya deduce
-- cualquiera del formulario de registro ("ese correo ya tiene una cuenta"), así
-- que no añade superficie de ataque. No devuelve datos financieros.
-- ============================================================================

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
    -- Nunca a sí mismo: compartir contigo mismo no significa nada.
    and p.id <> auth.uid()
  limit 1;
$fn$;

revoke all on function public.find_profile_by_email(text) from public;
grant execute on function public.find_profile_by_email(text) to authenticated;

-- Búsqueda por correo en minúsculas: la usa la función de arriba y el admin.
create index if not exists profiles_email_lower_idx
  on public.profiles (lower(email));
