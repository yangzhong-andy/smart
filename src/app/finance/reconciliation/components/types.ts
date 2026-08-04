export type {
  BillStatus,
  BillType,
  BillCategory,
  MonthlyBill,
} from "@/lib/reconciliation-store";

export type InventoryStats = {
  totalValue: number;
  factoryQty: number;
  factoryValue: number;
  domesticQty: number;
  domesticValue: number;
  transitQty: number;
  transitValue: number;
};

export { formatCurrency } from "@/lib/currency-utils";
