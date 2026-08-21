-- ============================================================================
-- CERO · 0003 · Vista de resumen por crédito
-- Evita traer las 72 filas del plan de pagos sólo para pintar una tarjeta.
-- `security_invoker` hace que la vista respete las RLS de quien consulta.
-- ============================================================================

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

  -- Saldo vivo = saldo inicial de la primera cuota sin pagar.
  -- Sin plan generado todavía -> el capital. Todas las cuotas pagadas -> 0.
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
  p.last_payment_date

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
) p on true;

revoke all on public.credit_summary from anon;
grant select on public.credit_summary to authenticated;
