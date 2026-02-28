export type { BankAccount } from "@/lib/finance-store";
export type { Store } from "@/lib/store-store";

export type AccountSummary = {
  totalCount: number;
  primaryCount: number;
  virtualCount: number;
  avgBalance: number;
  avgRMBBalance: number;
};

export type AccountStatsRates = {
  USD: number;
  JPY: number;
  THB?: number;
  lastUpdated?: string;
} | null;

export type CashFlowLike = {
  id: string;
  date: string;
  summary: string;
  category: string;
  type: "income" | "expense";
  amount: number;
  accountId: string;
  accountName?: string;
  currency: string;
  remark: string;
  relatedId?: string;
  businessNumber?: string;
  status: "confirmed" | "pending";
  isReversal?: boolean;
  voucher?: string;
  createdAt: string;
};
