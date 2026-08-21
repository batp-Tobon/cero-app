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
  balance_after: number | null;
  notes: string | null;
  created_at: string;
}

export type ActivityRow = {
  id: string;
  user_id: string;
  credit_id: string | null;
  payment_id: string | null;
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
          | "payment_date"
          | "principal_paid"
          | "interest_paid"
          | "extra_principal"
          | "amount_paid"
          | "balance_after"
          | "notes"
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
    };
    Functions: {
      owns_credit: { Args: { p_credit_id: string }; Returns: boolean };
    };
    Enums: {
      credit_type: CreditTypeDB;
      amortization_system: AmortizationSystemDB;
      credit_status: CreditStatusDB;
      installment_status: InstallmentStatusDB;
      extra_principal_mode: ExtraPrincipalModeDB;
      activity_type: ActivityTypeDB;
    };
    CompositeTypes: Record<string, never>;
  };
}
