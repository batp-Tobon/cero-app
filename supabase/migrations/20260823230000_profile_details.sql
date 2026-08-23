-- ============================================================================
-- CERO · Datos personales y foto de perfil
--
-- `full_name` se conserva como nombre para mostrar —lo escriben el trigger de
-- alta y media app— pero pasa a derivarse de nombres + apellidos al guardar
-- desde el perfil. Separarlos permite saludar por el nombre de pila sin
-- adivinar dónde corta el espacio.
--
-- La cédula y el teléfono son datos personales: quedan bajo la misma RLS que
-- el resto del perfil y NO se exponen en el backoffice, que sigue leyendo
-- sólo id, email, nombre, rol y fecha de alta.
-- ============================================================================

alter table public.profiles
  add column if not exists first_name   text,
  add column if not exists last_name    text,
  add column if not exists profession   text,
  add column if not exists national_id  text,
  add column if not exists phone        text,
  -- Alternativa a la foto: un emoji. Se guarda aparte de `avatar_url` para
  -- que elegir uno no borre la imagen subida y viceversa; la app decide cuál
  -- muestra y limpia el otro al cambiar.
  add column if not exists avatar_emoji text;

do $$ begin
  alter table public.profiles
    add constraint profiles_first_name_len  check (length(first_name)  <= 60),
    add constraint profiles_last_name_len   check (length(last_name)   <= 60),
    add constraint profiles_profession_len  check (length(profession)  <= 80),
    add constraint profiles_national_id_len check (length(national_id) <= 20),
    add constraint profiles_phone_len       check (length(phone)       <= 25),
    -- Un emoji puede ocupar varios puntos de código (familias, tonos de piel):
    -- 32 caracteres cubren cualquier secuencia razonable sin dejar meter texto.
    add constraint profiles_avatar_emoji_len check (length(avatar_emoji) <= 32);
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Sin ampliar este grant los campos nuevos serían de sólo lectura: el cliente
-- tiene privilegios de UPDATE por columna, no sobre la tabla entera, para que
-- `role`, `email` e `id` queden estructuralmente fuera de su alcance.
-- ---------------------------------------------------------------------------
grant update (
  full_name, avatar_url, avatar_emoji, currency, locale,
  first_name, last_name, profession, national_id, phone,
  notify_upcoming, notify_overdue, notify_payments
) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Bucket de fotos de perfil
--
-- Público, a diferencia de comprobantes y QR: el avatar se pinta en cada
-- pantalla y firmar una URL por render añadiría un viaje de red a la portada,
-- que está optimizada para resolverse en uno solo. La ruta lleva un UUID
-- aleatorio, así que la imagen no es enumerable, y escribir sigue restringido
-- a la carpeta del propio usuario.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists avatars_read on storage.objects;
drop policy if exists avatars_insert_own on storage.objects;
drop policy if exists avatars_update_own on storage.objects;
drop policy if exists avatars_delete_own on storage.objects;

-- El bucket es público, así que la lectura la sirve el CDN sin pasar por RLS;
-- esta política sólo cubre a quien liste el bucket desde la API.
create policy avatars_read on storage.objects
  for select to authenticated, anon
  using (bucket_id = 'avatars');

create policy avatars_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy avatars_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy avatars_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- ---------------------------------------------------------------------------
-- El avatar de la portada
--
-- El snapshot de Inicio devolvía sólo `avatar_url`. Sin `avatar_emoji`, quien
-- eligiera un emoji lo vería en su perfil pero seguiría con las iniciales en
-- la portada, que es justo la incoherencia que el selector evita.
-- ---------------------------------------------------------------------------
create or replace function public.current_dashboard_snapshot(p_month date default null)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $fn$
  with target as (
    select date_trunc(
      'month',
      coalesce(p_month, (now() at time zone 'America/Bogota')::date)
    )::date as month
  ),
  bounds as (
    select month, (month + interval '1 month')::date as next_month from target
  ),
  -- Presupuesto vigente: el del mes pedido o, si aún no existe, el último
  -- guardado. RLS ya limita la tabla al dueño.
  source as (
    select budget.id, budget.month, budget.currency
    from public.monthly_budgets budget, target
    where budget.month <= target.month
    order by budget.month desc
    limit 1
  ),
  -- Cuando el presupuesto es de un mes anterior sólo se arrastran los ingresos
  -- recurrentes, y su fecha se corre tantos meses como haga falta. Sumar un
  -- intervalo ancla al último día del mes destino (31-ene + 1 mes = 28-feb),
  -- igual que `addMonths` en el cliente.
  income as (
    select
      entry.name,
      entry.amount,
      (
        entry.received_date
        + make_interval(months => (
            (extract(year from target.month)::int * 12
              + extract(month from target.month)::int)
            - (extract(year from source.month)::int * 12
              + extract(month from source.month)::int)
          ))
      )::date as received_date
    from public.budget_incomes entry
      join source on source.id = entry.budget_id
      cross join target
    where source.month = target.month or entry.recurring
  ),
  -- Misma regla de arrastre que los ingresos: de un mes anterior sólo viajan
  -- los gastos marcados como recurrentes.
  expense as (
    select greatest(entry.amount, 0) as amount
    from public.budget_expenses entry
      join source on source.id = entry.budget_id
      cross join target
    where source.month = target.month or entry.recurring
  ),
  -- Cuotas y extractos que vencen dentro del mes, por su importe completo:
  -- es lo que /presupuesto descuenta, y las dos pantallas deben coincidir.
  obligation as (
    select greatest(sched.payment_amount, 0) as amount
    from public.credit_schedule sched, bounds
    where sched.due_date >= bounds.month and sched.due_date < bounds.next_month
    union all
    select greatest(stmt.total_due, 0)
    from public.revolving_statements stmt, bounds
    where stmt.due_date >= bounds.month and stmt.due_date < bounds.next_month
  )
  select jsonb_build_object(
    'profile', coalesce(
      (
        select jsonb_build_object(
          'full_name', profile.full_name,
          'avatar_url', profile.avatar_url,
          'avatar_emoji', profile.avatar_emoji,
          'role', profile.role
        )
        from public.profiles profile
        where profile.id = (select auth.uid())
      ),
      'null'::jsonb
    ),
    'credits', coalesce(
      (
        select jsonb_agg(
          to_jsonb(credit_row)
          order by credit_row.status, credit_row.next_due_date nulls last
        )
        from public.credit_summary credit_row
      ),
      '[]'::jsonb
    ),
    'cards', coalesce(
      (
        select jsonb_agg(
          to_jsonb(card_row)
          order by card_row.status, card_row.created_at desc
        )
        from public.revolving_summary card_row
      ),
      '[]'::jsonb
    ),
    'billing', coalesce(
      (
        select to_jsonb(billing_row)
        from public.current_billing_context() billing_row
      ),
      'null'::jsonb
    ),
    'budget', (
      select jsonb_build_object(
        'month', target.month,
        -- `projected` avisa de que la cifra es un arrastre y no un ingreso
        -- confirmado; Inicio lo etiqueta para no dar por cobrado lo que no está.
        'source', case
          when source.id is null then 'empty'
          when source.month = target.month then 'saved'
          else 'projected'
        end,
        'currency', source.currency,
        'incomes', coalesce(
          (
            select jsonb_agg(to_jsonb(paid) order by paid.received_date, paid.name)
            from income paid
          ),
          '[]'::jsonb
        ),
        'expense_total', coalesce((select sum(amount) from expense), 0),
        'obligation_total', coalesce((select sum(amount) from obligation), 0)
      )
      from target left join source on true
    )
  );
$fn$;

