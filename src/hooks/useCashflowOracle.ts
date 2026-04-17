import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantId } from "@/hooks/useTenantId";

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

/**
 * 🚀 PERF V2: Reuses get_dashboard_summary_v2 RPC.
 * No extra Supabase calls — derives prediction from the already-cached
 * dashboard summary ("dashboard_summary_v2" query key).
 */
export const useCashflowOracle = () => {
  const { tenantId } = useTenantId();
  return useQuery({
    queryKey: ["cashflow_oracle", tenantId],
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<CashflowPrediction> => {
      const { data, error } = await supabase.rpc("get_dashboard_summary_v2" as any, {
        p_tenant_id: tenantId,
      });
      if (error) throw error;
      const r = (data ?? {}) as Record<string, any>;

      const monthly_data = ((r.monthly_repayment ?? []) as { month: string; amount: number }[])
        .map((m) => ({ month: m.month, amount: Number(m.amount) }))
        .sort((a, b) => a.month.localeCompare(b.month));

      const activeLoanCount = Number(r.active_loans ?? 0);
      const defaultCount = Number(r.default_loans ?? 0);
      const overdueCount = Number(r.overdue_schedules ?? 0);
      const totalSchedules = Number(r.total_schedules ?? 0);
      const riskCount = Number(r.risk_clients ?? 0);

      const last3 = monthly_data.slice(-3);
      const avg_last_3 =
        last3.length > 0 ? last3.reduce((s, m) => s + m.amount, 0) / last3.length : 0;

      const totalLoans = activeLoanCount + defaultCount;
      const default_ratio = totalLoans > 0 ? defaultCount / totalLoans : 0;
      const consistency_factor = 1 - default_ratio;
      const predicted_recovery = Math.round(avg_last_3 * consistency_factor);

      const paidSchedules = totalSchedules - overdueCount;
      const collection_efficiency =
        totalSchedules > 0 ? Math.round((paidSchedules / totalSchedules) * 100) : 100;

      const prev_avg =
        monthly_data.length >= 4
          ? monthly_data.slice(-4, -1).reduce((s, m) => s + m.amount, 0) / 3
          : avg_last_3;
      const trend_direction: "up" | "down" | "stable" =
        avg_last_3 > prev_avg * 1.05 ? "up" : avg_last_3 < prev_avg * 0.95 ? "down" : "stable";

      return {
        predicted_recovery,
        risk_clients_count: riskCount,
        collection_efficiency,
        trend_direction,
        avg_last_3: Math.round(avg_last_3),
        consistency_factor: Math.round(consistency_factor * 100) / 100,
        default_ratio: Math.round(default_ratio * 100) / 100,
        active_emi_count: activeLoanCount,
        monthly_data,
      };
    },
  });
};
