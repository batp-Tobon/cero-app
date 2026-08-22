-- ============================================================================
-- CERO · 0009 · Color e icono por producto
--
-- Con dos créditos y una tarjeta en la misma lista, el nombre en texto pequeño
-- es lo único que los distingue. Un color y un icono propios los hacen
-- reconocibles de un vistazo, que es de lo que va esta pantalla.
--
-- Se guarda un TOKEN ('emerald', 'car'), no un valor CSS. Así el diseño no
-- puede romperse desde la base de datos: la aplicación decide qué significa
-- cada token, y un valor desconocido cae al de por defecto.
-- ============================================================================

do $$ begin create type public.accent_color as enum
  ('emerald','sky','violet','rose','amber','orange','teal','indigo');
  exception when duplicate_object then null; end $$;

alter table public.credits
  add column if not exists color public.accent_color not null default 'emerald';
alter table public.credits
  add column if not exists icon text;

alter table public.revolving_accounts
  add column if not exists color public.accent_color not null default 'sky';
alter table public.revolving_accounts
  add column if not exists icon text;

-- Los iconos vienen de una lista cerrada en la app; aquí sólo se acota la
-- longitud para que nadie meta un texto arbitrario.
alter table public.credits
  drop constraint if exists credits_icon_len;
alter table public.credits
  add constraint credits_icon_len check (icon is null or length(icon) <= 32);

alter table public.revolving_accounts
  drop constraint if exists revolving_icon_len;
alter table public.revolving_accounts
  add constraint revolving_icon_len check (icon is null or length(icon) <= 32);

-- ---------------------------------------------------------------------------
-- Las vistas se recrean para exponer las columnas nuevas.
-- ---------------------------------------------------------------------------
drop view if exists public.credit_summary;

create view public.credit_summary
with (security_invoker = on) as
select
  c.id,
  c.owner_id,
  c.name,
  c.type,
  c.entity,
  c.currency,
  c.status,
  c.color,
  c.icon,
  c.principal_amount,
  c.interest_rate_monthly,
  c.term_months,
  c.amortization_system,
  c.extra_principal_mode,
  c.first_payment_date,
  c.created_at,

  coalesce(s.total_installments, 0) as total_installments,
  coalesce(s.paid_installments, 0)  as paid_installments,
  coalesce(s.overdue_count, 0)      as overdue_count,
  coalesce(s.scheduled_interest, 0) as scheduled_interest,
  coalesce(s.remaining_interest, 0) as remaining_interest,

  case
    when coalesce(s.total_installments, 0) = 0 then c.principal_amount
    when s.next_installment_number is null     then 0::numeric
    else s.outstanding_balance
  end as balance,

  s.next_installment_number,
  s.next_due_date,
  s.next_payment_amount,
  s.next_interest_amount,
  s.next_principal_amount,

  coalesce(p.total_paid, 0)            as total_paid,
  coalesce(p.total_principal_paid, 0)  as total_principal_paid,
  coalesce(p.total_interest_paid, 0)   as total_interest_paid,
  coalesce(p.total_extra_principal, 0) as total_extra_principal,
  p.last_payment_date,

  -- Con quién se comparte: evita una consulta por tarjeta en la lista.
  coalesce(m.member_count, 1) as member_count

from public.credits c

left join lateral (
  select
    count(*)                                                   as total_installments,
    count(*) filter (where cs.status = 'paid')                 as paid_installments,
    count(*) filter (where cs.status <> 'paid'
                       and cs.due_date < current_date)         as overdue_count,
    sum(cs.interest_amount)                                    as scheduled_interest,
    sum(cs.interest_amount) filter (where cs.status <> 'paid') as remaining_interest,
    (array_agg(cs.opening_balance    order by cs.installment_number)
       filter (where cs.status <> 'paid'))[1]                  as outstanding_balance,
    (array_agg(cs.installment_number order by cs.installment_number)
       filter (where cs.status <> 'paid'))[1]                  as next_installment_number,
    (array_agg(cs.due_date           order by cs.installment_number)
       filter (where cs.status <> 'paid'))[1]                  as next_due_date,
    (array_agg(cs.payment_amount     order by cs.installment_number)
       filter (where cs.status <> 'paid'))[1]                  as next_payment_amount,
    (array_agg(cs.interest_amount    order by cs.installment_number)
       filter (where cs.status <> 'paid'))[1]                  as next_interest_amount,
    (array_agg(cs.principal_amount   order by cs.installment_number)
       filter (where cs.status <> 'paid'))[1]                  as next_principal_amount
  from public.credit_schedule cs
  where cs.credit_id = c.id
) s on true

left join lateral (
  select
    sum(pm.amount_paid + pm.extra_principal)    as total_paid,
    sum(pm.principal_paid + pm.extra_principal) as total_principal_paid,
    sum(pm.interest_paid)                       as total_interest_paid,
    sum(pm.extra_principal)                     as total_extra_principal,
    max(pm.payment_date)                        as last_payment_date
  from public.payments pm
  where pm.credit_id = c.id
) p on true

left join lateral (
  select count(*) as member_count
  from public.credit_members cm
  where cm.credit_id = c.id
) m on true;

revoke all on public.credit_summary from anon;
grant select on public.credit_summary to authenticated;

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
  a.color,
  a.icon,
  a.created_at,

  coalesce(m.balance, 0)                               as balance,
  greatest(a.credit_limit - coalesce(m.balance, 0), 0) as available,
  coalesce(m.total_charged, 0)                         as total_charged,
  coalesce(m.total_paid, 0)                            as total_paid,
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

left join lateral (
  select st.*
  from public.revolving_statements st
  where st.account_id = a.id
  order by st.statement_date desc
  limit 1
) s on true;

revoke all on public.revolving_summary from anon;
grant select on public.revolving_summary to authenticated;
