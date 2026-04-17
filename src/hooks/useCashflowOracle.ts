import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface CashflowPrediction {
  predicted_recovery: number;
  risk_clients_count: number;
  collection_efficiency: number;
  trend_direction: "up" | "down" | "stable";
  avg_last_3: number;
  consistency_factor: number;
  default_ratio: number;
  active_emi_count: number;
  monthly_data: { month: string; amount: number }[];
}

export const useCashflowOracle = () =>
  useQuery({
    queryKey: ["cashflow_oracle"],
    queryFn: async (): Promise<CashflowPrediction> => {
      // Get last 6 months of loan repayments
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      // 🚀 PERF: Parallel-execute all 6 queries (was sequential, ~1000ms saved)
      const [
        repaymentsRes,
        activeLoanRes,
        overdueRes,
        totalSchedulesRes,
        defaultRes,
        riskRes,
      ] = await Promise.all([
        supabase
          .from("transactions")
          .select("amount, created_at")
          .eq("type", "loan_repayment")
          .is("deleted_at", null)
          .gte("created_at", sixMonthsAgo.toISOString())
          .order("created_at", { ascending: true }),
        supabase
          .from("loans")
          .select("id", { count: "exact", head: true })
          .eq("status", "active")
          .is("deleted_at", null),
        supabase
          .from("loan_schedules")
          .select("id", { count: "exact", head: true })
          .eq("status", "overdue"),
        supabase
          .from("loan_schedules")
          .select("id", { count: "exact", head: true })
          .in("status", ["paid", "overdue", "partial", "pending"]),
        supabase
          .from("loans")
          .select("id", { count: "exact", head: true })
          .eq("status", "default")
          .is("deleted_at", null),
        supabase
          .from("credit_scores" as any)
          .select("id", { count: "exact", head: true })
          .lt("score", 40),
      ]);

      const repayments = repaymentsRes.data;
      const activeLoanCount = activeLoanRes.count;
      const overdueCount = overdueRes.count;
      const totalSchedules = totalSchedulesRes.count;
      const defaultCount = defaultRes.count;
      const riskCount = riskRes.count;

      // Group by month
      const monthlyMap = new Map<string, number>();
      (repayments ?? []).forEach((r: any) => {
        const month = new Date(r.created_at).toISOString().slice(0, 7);
        monthlyMap.set(month, (monthlyMap.get(month) ?? 0) + Number(r.amount));
      });

      const monthlyData = Array.from(monthlyMap.entries())
        .map(([month, amount]) => ({ month, amount }))
        .sort((a, b) => a.month.localeCompare(b.month));

      // Last 3 months average
      const last3 = monthlyData.slice(-3);
      const avg_last_3 = last3.length > 0
        ? last3.reduce((s, m) => s + m.amount, 0) / last3.length
        : 0;

      const totalLoans = (activeLoanCount ?? 0) + (defaultCount ?? 0);
      const default_ratio = totalLoans > 0 ? (defaultCount ?? 0) / totalLoans : 0;
      const consistency_factor = 1 - default_ratio;

      // Prediction formula
      const predicted_recovery = Math.round(avg_last_3 * consistency_factor);

      // Collection efficiency
      const paidSchedules = (totalSchedules ?? 0) - (overdueCount ?? 0);
      const collection_efficiency = (totalSchedules ?? 0) > 0
        ? Math.round((paidSchedules / (totalSchedules ?? 1)) * 100)
        : 100;

      // Trend
      const prev_avg = monthlyData.length >= 4
        ? monthlyData.slice(-4, -1).reduce((s, m) => s + m.amount, 0) / 3
        : avg_last_3;
      const trend_direction: "up" | "down" | "stable" =
        avg_last_3 > prev_avg * 1.05 ? "up" :
        avg_last_3 < prev_avg * 0.95 ? "down" : "stable";

      return {
        predicted_recovery,
        risk_clients_count: riskCount ?? 0,
        collection_efficiency,
        trend_direction,
        avg_last_3: Math.round(avg_last_3),
        consistency_factor: Math.round(consistency_factor * 100) / 100,
        default_ratio: Math.round(default_ratio * 100) / 100,
        active_emi_count: activeLoanCount ?? 0,
        monthly_data: monthlyData,
      };
    },
    staleTime: 5 * 60 * 1000, // 5 min cache
  });
