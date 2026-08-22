-- Las funciones se crean con EXECUTE para PUBLIC por defecto. Una migración
-- posterior recreó algunas y reabrió ese permiso, así que cerramos cada firma
-- explícitamente. Los triggers no se invocan desde la API; los auxiliares de
-- RLS sí necesitan EXECUTE para el rol authenticated.

revoke all on function public.add_owner_as_member()
  from public, anon, authenticated;
revoke all on function public.guard_role_change()
  from public, anon, authenticated;
revoke all on function public.handle_new_user()
  from public, anon, authenticated;
revoke all on function public.rls_auto_enable()
  from public, anon, authenticated;

revoke all on function public.can_access_credit(uuid)
  from public, anon, authenticated;
revoke all on function public.find_profile_by_email(text)
  from public, anon, authenticated;
revoke all on function public.is_admin()
  from public, anon, authenticated;
revoke all on function public.is_credit_member(uuid)
  from public, anon, authenticated;
revoke all on function public.owns_credit(uuid)
  from public, anon, authenticated;
revoke all on function public.owns_revolving(uuid)
  from public, anon, authenticated;

grant execute on function public.can_access_credit(uuid) to authenticated;
grant execute on function public.find_profile_by_email(text) to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_credit_member(uuid) to authenticated;
grant execute on function public.owns_credit(uuid) to authenticated;
grant execute on function public.owns_revolving(uuid) to authenticated;
