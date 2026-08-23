-- ============================================================================
-- CERO · QR de cobro del comercio
--
-- El QR que emite el banco (Nequi, Bancolombia) es un activo del NEGOCIO, no
-- de cada usuario: hay uno solo y lo sube el administrador. Por eso no lleva
-- carpeta por usuario como los comprobantes.
--
-- El bucket es privado y se sirve con URL firmada. Un QR de cobro no es un
-- secreto —está hecho para enseñarse— pero tampoco tiene por qué quedar
-- indexable desde fuera de la aplicación.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payment-qr',
  'payment-qr',
  false,
  2 * 1024 * 1024,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Sin las políticas de abajo el bucket queda sólo para service_role: la app no
-- podría ni mostrar el QR ni dejar que el administrador lo cambie.

-- ---------------------------------------------------------------------------
-- Lectura: cualquier usuario autenticado. Es lo que tiene que escanear para
-- pagar; ocultárselo haría inútil la función.
-- ---------------------------------------------------------------------------
drop policy if exists payment_qr_read on storage.objects;

create policy payment_qr_read on storage.objects
  for select to authenticated
  using (bucket_id = 'payment-qr');

-- ---------------------------------------------------------------------------
-- Escritura: sólo administradores. Quien pueda cambiar este archivo puede
-- redirigir los cobros a otra cuenta, así que es la política más restrictiva
-- del proyecto.
--
-- El helper vive en `private`, no en `public`: la Data API sólo expone `public`,
-- así que dejarlo ahí permitiría a cualquier cliente invocarlo por HTTP. La
-- migración 20260822170017 hizo ese traslado y borró `public.is_admin()`.
-- ---------------------------------------------------------------------------
drop policy if exists payment_qr_write on storage.objects;
drop policy if exists payment_qr_update on storage.objects;
drop policy if exists payment_qr_delete on storage.objects;

create policy payment_qr_write on storage.objects
  for insert to authenticated
  with check (bucket_id = 'payment-qr' and (select private.is_admin()));

create policy payment_qr_update on storage.objects
  for update to authenticated
  using (bucket_id = 'payment-qr' and (select private.is_admin()))
  with check (bucket_id = 'payment-qr' and (select private.is_admin()));

create policy payment_qr_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'payment-qr' and (select private.is_admin()));
