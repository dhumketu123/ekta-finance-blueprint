import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface OperationalExpense {
  id: string;
  amount: number;
  approval_status: "pending" | "approved" | "rejected";
  created_at: string;
  receipt_number: string | null;
  notes: string | null;
  allocation_breakdown: {
    is_operational_expense: boolean;
    expense_category: string;
    expense_category_label_bn: string;
    expense_category_label_en: string;
    expense_date: string;
    receipt_url: string | null;
    description: string | null;
  };
}

/** Fetch all adjustment_entry transactions that are operational expenses */
export const useOperationalExpenses = (statusFilter?: "pending" | "approved" | "rejected") =>
  useQuery({
    queryKey: ["operational_expenses", statusFilter],
    queryFn: async () => {
      let query = supabase
        .from("financial_transactions" as any)
        .select("id, amount, approval_status, created_at, receipt_number, notes, allocation_breakdown")
        .eq("transaction_type", "adjustment_entry")
        .order("created_at", { ascending: false });

      if (statusFilter) query = query.eq("approval_status", statusFilter);

      const { data, error } = await query;
      if (error) throw error;

      // Filter in JS to those with the operational expense flag in JSONB
      return ((data ?? []) as OperationalExpense[]).filter(
        (row) => row.allocation_breakdown?.is_operational_expense === true,
      );
    },
    staleTime: 30_000,
  });

/** Aggregate approved operational expenses by category for P&L */
export const useApprovedExpensesByCategory = () =>
  useQuery({
    queryKey: ["operational_expenses_by_category"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_transactions" as any)
        .select("amount, allocation_breakdown")
        .eq("transaction_type", "adjustment_entry")
        .eq("approval_status", "approved");

      if (error) throw error;

      const rows = ((data ?? []) as Pick<OperationalExpense, "amount" | "allocation_breakdown">[])
        .filter((row) => row.allocation_breakdown?.is_operational_expense === true);

      // Group by category
      const map: Record<string, { labelBn: string; labelEn: string; total: number; emoji: string }> = {};

      const EMOJI_MAP: Record<string, string> = {
        office_rent: "🏢", staff_salary: "👥", utilities: "⚡",
        transport: "🛺", hospitality: "☕", maintenance: "🛠️", stationery: "📄",
      };

      for (const row of rows) {
        const cat = row.allocation_breakdown?.expense_category ?? "other";
        if (!map[cat]) {
          map[cat] = {
            labelBn: row.allocation_breakdown?.expense_category_label_bn ?? cat,
            labelEn: row.allocation_breakdown?.expense_category_label_en ?? cat,
            total: 0,
            emoji: EMOJI_MAP[cat] ?? "📦",
          };
        }
        map[cat].total += Number(row.amount);
      }

      return Object.entries(map).map(([key, val]) => ({ key, ...val }));
    },
    staleTime: 30_000,
  });
