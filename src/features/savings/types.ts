import type {
  AccentColorDB,
  SavingsMovementKindDB,
} from "@/shared/types/database";

export interface SavingsPocket {
  id: string;
  name: string;
  currency: string;
  goalAmount: number | null;
  color: AccentColorDB;
  icon: string | null;
  isDefault: boolean;
  balance: number;
  balanceAtMonthEnd: number;
  monthNet: number;
}

export interface SavingsMovement {
  id: string;
  pocketId: string;
  pocketName: string;
  kind: SavingsMovementKindDB;
  amount: number;
  movementDate: string;
  sourceMonth: string | null;
  description: string | null;
}

export interface SavingsSnapshot {
  month: string;
  currency: string;
  budgetSaved: boolean;
  totalBalance: number;
  balanceAtMonthEnd: number;
  monthNet: number;
  automaticSurplus: number;
  pockets: SavingsPocket[];
  movements: SavingsMovement[];
}
