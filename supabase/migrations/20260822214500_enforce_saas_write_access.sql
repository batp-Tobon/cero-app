-- Impide que una suscripcion vencida eluda la barrera comercial llamando a
-- PostgREST directamente. La lectura, exportacion y eliminacion de los datos
-- propios siguen disponibles; crear o modificar informacion financiera exige
-- una prueba, periodo o gracia vigente (o rol administrador).

create or replace function private.has_saas_write_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select
    private.is_admin()
    or exists (
      select 1
      from public.saas_subscriptions subscription
      where subscription.user_id = (select auth.uid())
        and (
          (
            subscription.status = 'trialing'
            and subscription.trial_ends_at > now()
          )
          or (
            subscription.status = 'active'
            and subscription.current_period_end > now()
          )
          or (
            subscription.status = 'past_due'
            and subscription.grace_ends_at > now()
          )
          or (
            subscription.status = 'canceled'
            and subscription.current_period_end > now()
          )
        )
    );
$fn$;

revoke all on function private.has_saas_write_access()
  from public, anon, authenticated;
grant execute on function private.has_saas_write_access() to authenticated;

drop policy if exists credits_insert_own on public.credits;
drop policy if exists credits_update_own on public.credits;
create policy credits_insert_own on public.credits
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and private.has_saas_write_access()
  );
create policy credits_update_own on public.credits
  for update to authenticated
  using (
    owner_id = (select auth.uid())
    and private.has_saas_write_access()
  )
  with check (
    owner_id = (select auth.uid())
    and private.has_saas_write_access()
  );

drop policy if exists members_insert_owner on public.credit_members;
create policy members_insert_owner on public.credit_members
  for insert to authenticated
  with check (
    private.owns_credit(credit_id)
    and private.has_saas_write_access()
  );

drop policy if exists revolving_accounts_insert on public.revolving_accounts;
drop policy if exists revolving_accounts_update on public.revolving_accounts;
create policy revolving_accounts_insert on public.revolving_accounts
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and private.has_saas_write_access()
  );
create policy revolving_accounts_update on public.revolving_accounts
  for update to authenticated
  using (
    owner_id = (select auth.uid())
    and private.has_saas_write_access()
  )
  with check (
    owner_id = (select auth.uid())
    and private.has_saas_write_access()
  );

drop policy if exists revolving_statements_insert_own on public.revolving_statements;
drop policy if exists revolving_statements_update_own on public.revolving_statements;
create policy revolving_statements_insert_own on public.revolving_statements
  for insert to authenticated
  with check (
    private.owns_revolving(account_id)
    and private.has_saas_write_access()
  );
create policy revolving_statements_update_own on public.revolving_statements
  for update to authenticated
  using (
    private.owns_revolving(account_id)
    and private.has_saas_write_access()
  )
  with check (
    private.owns_revolving(account_id)
    and private.has_saas_write_access()
  );

drop policy if exists monthly_budgets_insert_own on public.monthly_budgets;
drop policy if exists monthly_budgets_update_own on public.monthly_budgets;
create policy monthly_budgets_insert_own on public.monthly_budgets
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and private.has_saas_write_access()
  );
create policy monthly_budgets_update_own on public.monthly_budgets
  for update to authenticated
  using (
    user_id = (select auth.uid())
    and private.has_saas_write_access()
  )
  with check (
    user_id = (select auth.uid())
    and private.has_saas_write_access()
  );

drop policy if exists budget_incomes_insert_own on public.budget_incomes;
drop policy if exists budget_incomes_update_own on public.budget_incomes;
create policy budget_incomes_insert_own on public.budget_incomes
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and private.has_saas_write_access()
  );
create policy budget_incomes_update_own on public.budget_incomes
  for update to authenticated
  using (
    user_id = (select auth.uid())
    and private.has_saas_write_access()
  )
  with check (
    user_id = (select auth.uid())
    and private.has_saas_write_access()
  );

drop policy if exists budget_expenses_insert_own on public.budget_expenses;
drop policy if exists budget_expenses_update_own on public.budget_expenses;
create policy budget_expenses_insert_own on public.budget_expenses
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and private.has_saas_write_access()
  );
create policy budget_expenses_update_own on public.budget_expenses
  for update to authenticated
  using (
    user_id = (select auth.uid())
    and private.has_saas_write_access()
  )
  with check (
    user_id = (select auth.uid())
    and private.has_saas_write_access()
  );
