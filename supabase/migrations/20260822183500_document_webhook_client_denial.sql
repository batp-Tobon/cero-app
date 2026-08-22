-- Los webhooks se procesan únicamente con service_role. La política negativa
-- hace explícito que ninguna sesión de navegador puede leerlos ni mutarlos.
create policy saas_webhook_events_no_client_access
  on public.saas_webhook_events
  for all
  to anon, authenticated
  using (false)
  with check (false);
