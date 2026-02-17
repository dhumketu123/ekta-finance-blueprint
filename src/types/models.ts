export interface Client {
  id: string;
  nameBn: string;
  nameEn: string;
  phone: string;
  area: string;
  assignedOfficer: string;
  status: "active" | "inactive";
  loanStatus: "active" | "closed" | "none";
  loanAmount?: number;
  interestRate?: number;
  tenure?: number;
  paymentType?: "monthly_profit" | "emi" | "bullet";
  savingsType?: "dbs" | "general";
  depositFrequency?: "daily" | "weekly" | "monthly";
  nextDepositDate?: string;
}

export interface Investor {
  id: string;
  nameBn: string;
  nameEn: string;
  phone: string;
  capital: number;
  monthlyProfitPercent: number;
  reinvest: boolean;
}

export interface Owner {
  id: string;
  nameEn: string;
  nameBn: string;
  phone: string;
  weeklyDeposit: number;
  advanceDepositStatus: boolean;
}

export interface FieldOfficer {
  id: string;
  nameEn: string;
  nameBn: string;
  phone: string;
  assignedAreas: string[];
  clientCount: number;
}

export interface LoanProduct {
  id: string;
  nameEn: string;
  nameBn: string;
  interestRate: number;
  tenure: number;
  paymentType: "monthly_profit" | "emi" | "bullet";
  minAmount: number;
  maxAmount: number;
  maxConcurrent: number;
}

export interface SavingsProduct {
  id: string;
  nameEn: string;
  nameBn: string;
  frequency: "daily" | "weekly" | "monthly";
  minAmount: number;
  maxAmount: number;
}

export type UserRole = "admin" | "field_officer" | "owner" | "investor" | "treasurer";
