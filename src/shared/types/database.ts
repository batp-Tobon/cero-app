/**
 * Tipos de la base de datos, alineados a mano con supabase/migrations.
 * Se pueden regenerar con:
 *   npx supabase gen types typescript --project-id <ref> > src/types/database.ts
 */

export type CreditTypeDB =
  | "vehicle"
  | "property"
  | "card"
  | "free_investment"
  | "other";

export type AmortizationSystemDB =
  | "french"
  | "german"
  | "american"
  | "zero_interest";

export type CreditStatusDB = "active" | "paid" | "cancelled";
export type UserRoleDB = "user" | "admin";
export type AccentColorDB =
  | "emerald"
  | "sky"
  | "violet"
  | "rose"
  | "amber"
  | "orange"
  | "teal"
  | "indigo";
export type RevolvingKindDB = "credit_card" | "credit_line";
export type RevolvingStatusDB = "active" | "closed";
export type StatementStatusDB = "open" | "paid" | "overdue";
export type MovementKindDB = "charge" | "payment" | "interest" | "fee";
export type BudgetExpenseCategoryDB =
  | "housing"
  | "food"
  | "utilities"
  | "transport"
  | "health"
  | "education"
  | "family"
  | "leisure"
  | "other";
export type SaasSubscriptionStatusDB =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "expired";
export type SaasBillingIntervalDB = "month" | "year" | "one_time";
export type SaasPaymentStatusDB =
  | "pending"
  | "succeeded"
  | "failed"
  | "refunded"
  | "canceled";
export type InstallmentStatusDB = "pending" | "partial" | "paid";
export type ExtraPrincipalModeDB = "reduce_term" | "reduce_installment";
export type ActivityTypeDB =
  | "credit_created"
  | "credit_updated"
  | "credit_deleted"
  | "credit_paid"
  | "payment"
  | "extra_principal";

export type ProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  role: UserRoleDB;
  currency: string;
  locale: string;
  notify_upcoming: boolean;
  notify_overdue: boolean;
  notify_payments: boolean;
  created_at: string;
  updated_at: string;
}

export type CreditRow = {
  id: string;
  owner_id: string;
  name: string;
  type: CreditTypeDB;
  entity: string | null;
  principal_amount: number;
  interest_rate_monthly: number;
  term_months: number;
  amortization_system: AmortizationSystemDB;
  extra_principal_mode: ExtraPrincipalModeDB;
  first_payment_date: string;
  currency: string;
  status: CreditStatusDB;
  color: AccentColorDB;
  icon: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type ScheduleRowDB = {
  id: string;
  credit_id: string;
  installment_number: number;
  due_date: string;
  opening_balance: number;
  payment_amount: number;
  interest_amount: number;
  principal_amount: number;
  closing_balance: number;
  extra_principal_before: number;
  paid_amount: number;
  status: InstallmentStatusDB;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}

export type PaymentRow = {
  id: string;
  credit_id: string;
  user_id: string;
  installment_number: number | null;
  payment_date: string;
  amount_paid: number;
  principal_paid: number;
  interest_paid: number;
  extra_principal: number;
  other_paid: number;
  balance_after: number | null;
  notes: string | null;
  receipt_path: string | null;
  receipt_name: string | null;
  receipt_mime: string | null;
  receipt_size: number | null;
  created_at: string;
}

export type ActivityRow = {
  id: string;
  user_id: string;
  credit_id: string | null;
  payment_id: string | null;
  revolving_movement_id: string | null;
  type: ActivityTypeDB;
  title: string;
  description: string | null;
  amount: number | null;
  occurred_at: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export type NotificationRow = {
  id: string;
  user_id: string;
  credit_id: string | null;
  kind: string;
  title: string;
  body: string | null;
  read_at: string | null;
  scheduled_for: string | null;
  created_at: string;
}

export type CreditMemberRow = {
  credit_id: string;
  user_id: string;
  role: "owner" | "member";
  created_at: string;
}

export type RevolvingAccountRow = {
  id: string;
  owner_id: string;
  name: string;
  kind: RevolvingKindDB;
  entity: string | null;
  last_four: string | null;
  credit_limit: number;
  interest_rate_monthly: number;
  statement_day: number;
  due_day: number;
  currency: string;
  status: RevolvingStatusDB;
  color: AccentColorDB;
  icon: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type RevolvingStatementRow = {
  id: string;
  account_id: string;
  statement_date: string;
  due_date: string;
  total_due: number;
  minimum_due: number;
  reduced_minimum_due: number | null;
  paid_amount: number;
  status: StatementStatusDB;
  created_at: string;
  updated_at: string;
}

export type RevolvingMovementRow = {
  id: string;
  account_id: string;
  statement_id: string | null;
  user_id: string;
  kind: MovementKindDB;
  amount: number;
  movement_date: string;
  description: string | null;
  installment_count: number;
  installments_paid: number;
  statement_applied_amount: number;
  receipt_path: string | null;
  receipt_name: string | null;
  receipt_mime: string | null;
  receipt_size: number | null;
  created_at: string;
}

export type MonthlyBudgetRow = {
  id: string;
  user_id: string;
  month: string;
  income_amount: number;
  currency: string;
  created_at: string;
  updated_at: string;
}

export type BudgetIncomeRow = {
  id: string;
  budget_id: string;
  user_id: string;
  month: string;
  name: string;
  amount: number;
  received_date: string;
  recurring: boolean;
  position: number;
  created_at: string;
  updated_at: string;
};

export type BudgetExpenseRow = {
  id: string;
  budget_id: string;
  user_id: string;
  name: string;
  category: BudgetExpenseCategoryDB;
  amount: number;
  due_day: number;
  recurring: boolean;
  position: number;
  created_at: string;
  updated_at: string;
}

export type SaasPlanRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  features: Record<string, boolean | number | string | null>;
  is_active: boolean;
  is_public: boolean;
  sort_order: number;
  trial_days: number;
  created_at: string;
  updated_at: string;
};

export type SaasPriceRow = {
  id: string;
  plan_id: string;
  currency: string;
  amount: number;
  billing_interval: SaasBillingIntervalDB;
  interval_count: number;
  provider: string | null;
  provider_price_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type SaasSubscriptionRow = {
  id: string;
  user_id: string;
  plan_id: string;
  price_id: string | null;
  status: SaasSubscriptionStatusDB;
  provider: string;
  provider_customer_id: string | null;
  provider_subscription_id: string | null;
  starts_at: string;
  trial_ends_at: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  grace_ends_at: string | null;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SaasSubscriptionEventRow = {
  id: string;
  subscription_id: string;
  user_id: string;
  actor_user_id: string | null;
  event_type: string;
  source: string;
  reason: string | null;
  before_state: Record<string, unknown>;
  after_state: Record<string, unknown>;
  external_event_id: string | null;
  occurred_at: string;
};

export type SaasBillingPaymentRow = {
  id: string;
  subscription_id: string | null;
  user_id: string;
  price_id: string | null;
  status: SaasPaymentStatusDB;
  provider: string;
  provider_payment_id: string | null;
  idempotency_key: string | null;
  amount: number;
  currency: string;
  paid_at: string | null;
  refunded_at: string | null;
  failure_code: string | null;
  failure_message: string | null;
  submitted_reference: string | null;
  proof_path: string | null;
  proof_name: string | null;
  proof_mime: string | null;
  proof_size: number | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type CurrentBillingContextRow = {
  is_admin: boolean;
  free_plan_code: string;
  free_plan_features: Record<string, boolean | number | string | null>;
  subscription_status: SaasSubscriptionStatusDB | null;
  subscription_plan_code: string | null;
  subscription_plan_features: Record<string, boolean | number | string | null> | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
  grace_ends_at: string | null;
};

export type CurrentDashboardSnapshotRow = {
  profile: Pick<ProfileRow, "full_name" | "avatar_url" | "role"> | null;
  credits: CreditSummaryRow[];
  cards: RevolvingSummaryRow[];
  billing: CurrentBillingContextRow | null;
};

export type CurrentSubscriptionSnapshotRow = {
  offer: { plan: SaasPlanRow; price: SaasPriceRow } | null;
  billing: CurrentBillingContextRow | null;
  payments: SaasBillingPaymentRow[];
};

export type SaasWebhookEventRow = {
  id: string;
  provider: string;
  event_id: string;
  event_type: string;
  payload_sha256: string;
  status: "received" | "processed" | "ignored" | "failed";
  attempts: number;
  last_error: string | null;
  received_at: string;
  processed_at: string | null;
};

export type SaasUsageCounterRow = {
  user_id: string;
  metric: string;
  period_start: string;
  period_end: string;
  used: number;
  included: number;
  updated_at: string;
};

export type AdminAuditLogRow = {
  id: string;
  actor_user_id: string;
  action: string;
  target_type: string;
  target_id: string | null;
  reason: string;
  before_state: Record<string, unknown>;
  after_state: Record<string, unknown>;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type AdminBillingMetricsRow = {
  total_users: number;
  total_admins: number;
  active_subscriptions: number;
  trial_subscriptions: number;
  past_due_subscriptions: number;
  revenue_30_days: number;
  failed_payments_30_days: number;
  audit_events_30_days: number;
};

/** Vista `revolving_summary` — saldo, disponible y extracto vigente. */
export type RevolvingSummaryRow = {
  id: string;
  owner_id: string;
  name: string;
  kind: RevolvingKindDB;
  entity: string | null;
  last_four: string | null;
  credit_limit: number;
  interest_rate_monthly: number;
  statement_day: number;
  due_day: number;
  currency: string;
  status: RevolvingStatusDB;
  color: AccentColorDB;
  icon: string | null;
  created_at: string;
  balance: number;
  available: number;
  total_charged: number;
  total_paid: number;
  last_movement_date: string | null;
  statement_id: string | null;
  statement_date: string | null;
  statement_due_date: string | null;
  statement_total_due: number | null;
  statement_minimum_due: number | null;
  statement_reduced_minimum_due: number | null;
  statement_paid_amount: number | null;
  statement_status: StatementStatusDB | null;
}

/** Vista `credit_summary` — resumen sin traer el plan de pagos completo. */
export type CreditSummaryRow = {
  id: string;
  owner_id: string;
  name: string;
  type: CreditTypeDB;
  entity: string | null;
  currency: string;
  status: CreditStatusDB;
  principal_amount: number;
  interest_rate_monthly: number;
  term_months: number;
  amortization_system: AmortizationSystemDB;
  extra_principal_mode: ExtraPrincipalModeDB;
  first_payment_date: string;
  created_at: string;
  color: AccentColorDB;
  icon: string | null;
  member_count: number;
  total_installments: number;
  paid_installments: number;
  overdue_count: number;
  scheduled_interest: number;
  remaining_interest: number;
  balance: number;
  next_installment_number: number | null;
  next_due_date: string | null;
  next_payment_amount: number | null;
  next_interest_amount: number | null;
  next_principal_amount: number | null;
  total_paid: number;
  total_principal_paid: number;
  total_interest_paid: number;
  total_extra_principal: number;
  last_payment_date: string | null;
}

/**
 * Insert de una tabla: todo lo de la fila salvo las columnas que Postgres
 * rellena solo (`Optional`), que pasan a ser opcionales.
 */
type Insertable<Row, Optional extends keyof Row> = Omit<Row, Optional> &
  Partial<Pick<Row, Optional>>;

type Table<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

/** Columnas con valor por defecto en la BD, comunes a casi todas las tablas. */
type Generated = "id" | "created_at" | "updated_at";

export type Database = {
  public: {
    Tables: {
      profiles: Table<ProfileRow, Partial<ProfileRow> & { id: string }>;
      credits: Table<
        CreditRow,
        Insertable<
          CreditRow,
          | Generated
          | "entity"
          | "currency"
          | "status"
          | "notes"
          | "color"
          | "icon"
          | "extra_principal_mode"
          | "interest_rate_monthly"
        >
      >;
      credit_schedule: Table<
        ScheduleRowDB,
        Insertable<ScheduleRowDB, Generated | "paid_amount" | "status" | "paid_at">
      >;
      payments: Table<
        PaymentRow,
        Insertable<
          PaymentRow,
          | "id"
          | "created_at"
          | "installment_number"
          | "payment_date"
          | "principal_paid"
          | "interest_paid"
          | "extra_principal"
          | "other_paid"
          | "amount_paid"
          | "balance_after"
          | "notes"
          | "receipt_path"
          | "receipt_name"
          | "receipt_mime"
          | "receipt_size"
        >
      >;
      activity: Table<
        ActivityRow,
        Insertable<
          ActivityRow,
          | "id"
          | "created_at"
          | "metadata"
          | "occurred_at"
          | "description"
          | "amount"
          | "credit_id"
          | "payment_id"
          | "revolving_movement_id"
        >
      >;
      credit_members: Table<
        CreditMemberRow,
        Insertable<CreditMemberRow, "created_at" | "role">
      >;
      revolving_accounts: Table<
        RevolvingAccountRow,
        Insertable<
          RevolvingAccountRow,
          | Generated
          | "kind"
          | "entity"
          | "last_four"
          | "interest_rate_monthly"
          | "statement_day"
          | "due_day"
          | "currency"
          | "status"
          | "notes"
          | "color"
          | "icon"
        >
      >;
      revolving_statements: Table<
        RevolvingStatementRow,
        Insertable<
          RevolvingStatementRow,
          | Generated
          | "total_due"
          | "minimum_due"
          | "reduced_minimum_due"
          | "paid_amount"
          | "status"
        >
      >;
      revolving_movements: Table<
        RevolvingMovementRow,
        Insertable<
          RevolvingMovementRow,
          | "id"
          | "created_at"
          | "statement_id"
          | "movement_date"
          | "description"
          | "installment_count"
          | "installments_paid"
          | "statement_applied_amount"
          | "receipt_path"
          | "receipt_name"
          | "receipt_mime"
          | "receipt_size"
        >
      >;
      monthly_budgets: Table<
        MonthlyBudgetRow,
        Insertable<
          MonthlyBudgetRow,
          Generated | "income_amount" | "currency"
        >
      >;
      budget_incomes: Table<
        BudgetIncomeRow,
        Insertable<
          BudgetIncomeRow,
          Generated | "recurring" | "position"
        >
      >;
      budget_expenses: Table<
        BudgetExpenseRow,
        Insertable<
          BudgetExpenseRow,
          Generated | "category" | "due_day" | "recurring" | "position"
        >
      >;
      saas_plans: Table<
        SaasPlanRow,
        Insertable<
          SaasPlanRow,
          | Generated
          | "description"
          | "features"
          | "is_active"
          | "is_public"
          | "sort_order"
          | "trial_days"
        >
      >;
      saas_prices: Table<
        SaasPriceRow,
        Insertable<
          SaasPriceRow,
          Generated | "provider" | "provider_price_id" | "is_active" | "interval_count"
        >
      >;
      saas_subscriptions: Table<
        SaasSubscriptionRow,
        Insertable<
          SaasSubscriptionRow,
          | Generated
          | "price_id"
          | "provider"
          | "provider_customer_id"
          | "provider_subscription_id"
          | "starts_at"
          | "trial_ends_at"
          | "current_period_start"
          | "current_period_end"
          | "grace_ends_at"
          | "cancel_at_period_end"
          | "canceled_at"
        >
      >;
      saas_subscription_events: Table<
        SaasSubscriptionEventRow,
        Insertable<
          SaasSubscriptionEventRow,
          | "id"
          | "actor_user_id"
          | "reason"
          | "before_state"
          | "after_state"
          | "external_event_id"
          | "occurred_at"
        >
      >;
      saas_billing_payments: Table<
        SaasBillingPaymentRow,
        Insertable<
          SaasBillingPaymentRow,
          | Generated
          | "subscription_id"
          | "price_id"
          | "status"
          | "provider_payment_id"
          | "idempotency_key"
          | "paid_at"
          | "refunded_at"
          | "failure_code"
          | "failure_message"
          | "submitted_reference"
          | "proof_path"
          | "proof_name"
          | "proof_mime"
          | "proof_size"
          | "reviewed_at"
          | "reviewed_by"
          | "metadata"
        >
      >;
      saas_webhook_events: Table<
        SaasWebhookEventRow,
        Insertable<
          SaasWebhookEventRow,
          "id" | "status" | "attempts" | "last_error" | "received_at" | "processed_at"
        >
      >;
      saas_usage_counters: Table<
        SaasUsageCounterRow,
        Insertable<SaasUsageCounterRow, "used" | "updated_at">
      >;
      admin_audit_log: Table<
        AdminAuditLogRow,
        Insertable<
          AdminAuditLogRow,
          "id" | "target_id" | "before_state" | "after_state" | "metadata" | "created_at"
        >
      >;
      notifications: Table<
        NotificationRow,
        Insertable<
          NotificationRow,
          "id" | "created_at" | "body" | "read_at" | "scheduled_for" | "credit_id"
        >
      >;
    };
    Views: {
      credit_summary: { Row: CreditSummaryRow; Relationships: [] };
      revolving_summary: { Row: RevolvingSummaryRow; Relationships: [] };
    };
    Functions: {
      save_monthly_budget: {
        Args: {
          p_month: string;
          p_income_amount: number;
          p_currency: string;
          p_expenses: unknown;
        };
        Returns: string;
      };
      save_monthly_budget_v2: {
        Args: {
          p_month: string;
          p_currency: string;
          p_incomes: unknown;
          p_expenses: unknown;
        };
        Returns: string;
      };
      find_profile_by_email: {
        Args: { p_email: string };
        Returns: { id: string; full_name: string | null; email: string | null }[];
      };
      admin_set_user_role: {
        Args: { p_user_id: string; p_role: UserRoleDB; p_reason: string };
        Returns: undefined;
      };
      admin_set_subscription: {
        Args: {
          p_user_id: string;
          p_plan_id: string;
          p_status: SaasSubscriptionStatusDB;
          p_access_until: string | null;
          p_reason: string;
        };
        Returns: string;
      };
      admin_set_subscription_v2: {
        Args: {
          p_user_id: string;
          p_plan_id: string;
          p_status: SaasSubscriptionStatusDB;
          p_access_until: string | null;
          p_indefinite: boolean;
          p_reason: string;
        };
        Returns: string;
      };
      admin_update_plan: {
        Args: {
          p_plan_id: string;
          p_name: string;
          p_description: string | null;
          p_trial_days: number;
          p_is_public: boolean;
          p_ai_insights: boolean;
          p_monthly_price: number;
          p_reason: string;
        };
        Returns: undefined;
      };
      admin_billing_metrics: {
        Args: Record<string, never>;
        Returns: AdminBillingMetricsRow[];
      };
      current_billing_context: {
        Args: Record<string, never>;
        Returns: CurrentBillingContextRow[];
      };
      current_dashboard_snapshot: {
        Args: Record<string, never>;
        Returns: CurrentDashboardSnapshotRow;
      };
      current_subscription_snapshot: {
        Args: Record<string, never>;
        Returns: CurrentSubscriptionSnapshotRow;
      };
      process_wompi_saas_payment: {
        Args: {
          p_reference: string;
          p_provider_payment_id: string;
          p_external_event_id: string;
          p_amount: number;
          p_currency: string;
          p_paid_at: string;
        };
        Returns: string;
      };
      admin_review_saas_payment: {
        Args: {
          p_payment_id: string;
          p_approve: boolean;
          p_reason: string;
        };
        Returns: string | null;
      };
      replace_credit_replay: {
        Args: {
          p_credit_id: string;
          p_expected_history: unknown;
          p_schedule: unknown;
          p_allocations: unknown;
          p_next_status: CreditStatusDB;
        };
        Returns: undefined;
      };
      register_revolving_movement: {
        Args: {
          p_user_id: string;
          p_account_id: string;
          p_kind: MovementKindDB;
          p_amount: number;
          p_movement_date: string;
          p_description: string | null;
          p_installment_count: number;
          p_receipt_path: string | null;
          p_receipt_name: string | null;
          p_receipt_mime: string | null;
          p_receipt_size: number | null;
        };
        Returns: Record<string, unknown>;
      };
      delete_revolving_movement: {
        Args: { p_user_id: string; p_movement_id: string };
        Returns: Record<string, unknown>;
      };
    };
    Enums: {
      credit_type: CreditTypeDB;
      amortization_system: AmortizationSystemDB;
      credit_status: CreditStatusDB;
      installment_status: InstallmentStatusDB;
      extra_principal_mode: ExtraPrincipalModeDB;
      activity_type: ActivityTypeDB;
      user_role: UserRoleDB;
      accent_color: AccentColorDB;
      revolving_kind: RevolvingKindDB;
      revolving_status: RevolvingStatusDB;
      statement_status: StatementStatusDB;
      movement_kind: MovementKindDB;
      budget_expense_category: BudgetExpenseCategoryDB;
      saas_subscription_status: SaasSubscriptionStatusDB;
      saas_billing_interval: SaasBillingIntervalDB;
      saas_payment_status: SaasPaymentStatusDB;
    };
    CompositeTypes: Record<string, never>;
  };
}
