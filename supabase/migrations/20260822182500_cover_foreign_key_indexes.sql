-- Índices de soporte para claves foráneas detectadas por el asesor de
-- rendimiento. Aceleran cascadas, validaciones y joins sin cambiar datos.

create index if not exists activity_payment_idx
  on public.activity (payment_id)
  where payment_id is not null;

create index if not exists budget_expenses_budget_user_idx
  on public.budget_expenses (budget_id, user_id);

create index if not exists budget_incomes_budget_user_month_idx
  on public.budget_incomes (budget_id, user_id, month);

create index if not exists notifications_credit_idx
  on public.notifications (credit_id)
  where credit_id is not null;

create index if not exists revolving_movements_statement_idx
  on public.revolving_movements (statement_id)
  where statement_id is not null;

create index if not exists revolving_movements_user_idx
  on public.revolving_movements (user_id);
