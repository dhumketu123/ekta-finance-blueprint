import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ReportsMetrics {
  activeMembers: number;
  todaysTransactions: number;
  recoveryRate: number;
  growthVelocity: number;
  aum: number;
  riskIndex: number;
  weightedRisk: number;
  projected30DayCollections: number;
  prev30DayCollections: number;
  alerts: string[];
  isLoading: boolean;
  isError: boolean;
}

export const useReportsMetrics = (): ReportsMetrics => {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["reports_metrics_engine_v3"],
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
      const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000).toISOString().split("T")[0];
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
      const sixtyDaysAgo = new Date(Date.now() - 60 * 86400000).toISOString().split("T")[0];

      const [
        clientsRes,
        loansRes,
        todayTxRes,
        thisWeekTxRes,
        lastWeekTxRes,
        savingsRes,
        overdueRes,
        last30TxRes,
        prev30TxRes,
      ] = await Promise.all([
        supabase.from("clients").select("id, status").is("deleted_at", null),
        supabase.from("loans").select("id, status, outstanding_principal, total_principal").is("deleted_at", null),
        supabase.from("financial_transactions").select("id").gte("created_at", `${today}T00:00:00`).eq("approval_status", "approved"),
        supabase.from("financial_transactions").select("amount").gte("created_at", `${sevenDaysAgo}T00:00:00`).eq("approval_status", "approved").in("transaction_type", ["loan_repayment"] as any[]),
        supabase.from("financial_transactions").select("amount").gte("created_at", `${fourteenDaysAgo}T00:00:00`).lt("created_at", `${sevenDaysAgo}T00:00:00`).eq("approval_status", "approved").in("transaction_type", ["loan_repayment"] as any[]),
        supabase.from("savings_accounts").select("id, status, balance").is("deleted_at", null),
        supabase.from("loan_schedules").select("total_due, principal_paid, interest_paid").eq("status", "overdue"),
        // Last 30 days collections
        supabase.from("financial_transactions").select("amount").gte("created_at", `${thirtyDaysAgo}T00:00:00`).eq("approval_status", "approved").in("transaction_type", ["loan_repayment"] as any[]),
        // Previous 30 days (30-60 days ago)
        supabase.from("financial_transactions").select("amount").gte("created_at", `${sixtyDaysAgo}T00:00:00`).lt("created_at", `${thirtyDaysAgo}T00:00:00`).eq("approval_status", "approved").in("transaction_type", ["loan_repayment"] as any[]),
      ]);

      const clients = clientsRes.data ?? [];
      const loans = loansRes.data ?? [];
      const todayTxs = todayTxRes.data ?? [];
      const thisWeekCollections = thisWeekTxRes.data ?? [];
      const lastWeekCollections = lastWeekTxRes.data ?? [];
      const savings = savingsRes.data ?? [];
      const overdueSchedules = overdueRes.data ?? [];
      const last30Collections = last30TxRes.data ?? [];
      const prev30Collections = prev30TxRes.data ?? [];

      const activeMembers = clients.filter((c) => c.status === "active").length;
      const todaysTransactions = todayTxs.length;

      const activeLoans = loans.filter((l) => l.status === "active" || l.status === "closed");
      const totalLoanPrincipal = activeLoans.reduce((s, l) => s + (l.total_principal ?? 0), 0);
      const totalOutstanding = activeLoans.reduce((s, l) => s + (l.outstanding_principal ?? 0), 0);

      const totalSavings = savings
        .filter((s) => s.status === "active")
        .reduce((s, a) => s + (Number((a as any).balance) || 0), 0);
      const aum = (totalLoanPrincipal - totalOutstanding) + totalSavings;

      const recoveryRate = totalLoanPrincipal > 0
        ? Math.round(((totalLoanPrincipal - totalOutstanding) / totalLoanPrincipal) * 100)
        : 0;

      const thisWeekTotal = thisWeekCollections.reduce((s, t) => s + (t.amount ?? 0), 0);
      const lastWeekTotal = lastWeekCollections.reduce((s, t) => s + (t.amount ?? 0), 0);
      const rawGrowth = lastWeekTotal > 0
        ? ((thisWeekTotal - lastWeekTotal) / lastWeekTotal) * 100
        : thisWeekTotal > 0 ? 100 : 0;
      const growthVelocity = Math.round(rawGrowth * 0.8);

      const overdueAmount = overdueSchedules.reduce((s, sch) => {
        const due = Number((sch as any).total_due) || 0;
        const paidP = Number((sch as any).principal_paid) || 0;
        const paidI = Number((sch as any).interest_paid) || 0;
        return s + Math.max(due - paidP - paidI, 0);
      }, 0);
      const riskIndex = totalLoanPrincipal > 0
        ? Math.round((overdueAmount / totalLoanPrincipal) * 100 * 10) / 10
        : 0;

      const weightedRisk = aum > 0
        ? Math.round(riskIndex * (totalLoanPrincipal / aum) * 10) / 10
        : riskIndex;

      const avgDailyCollection = thisWeekTotal / 7;
      const projected30DayCollections = Math.round(avgDailyCollection * 30);

      const prev30DayCollections = prev30Collections.reduce((s, t) => s + (t.amount ?? 0), 0);

      const alerts: string[] = [];
      if (weightedRisk > 6) alerts.push("high_risk");
      if (growthVelocity > 10) alerts.push("expansion_opportunity");
      if (projected30DayCollections <= 0 && totalLoanPrincipal > 0) alerts.push("liquidity_warning");
      if (recoveryRate < 50 && totalLoanPrincipal > 0) alerts.push("low_recovery");

      return {
        activeMembers,
        todaysTransactions,
        recoveryRate,
        growthVelocity,
        aum,
        riskIndex,
        weightedRisk,
        projected30DayCollections,
        prev30DayCollections,
        alerts,
      };
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  return {
    activeMembers: data?.activeMembers ?? 0,
    todaysTransactions: data?.todaysTransactions ?? 0,
    recoveryRate: data?.recoveryRate ?? 0,
    growthVelocity: data?.growthVelocity ?? 0,
    aum: data?.aum ?? 0,
    riskIndex: data?.riskIndex ?? 0,
    weightedRisk: data?.weightedRisk ?? 0,
    projected30DayCollections: data?.projected30DayCollections ?? 0,
    prev30DayCollections: data?.prev30DayCollections ?? 0,
    alerts: isError ? ["data_unavailable"] : (data?.alerts ?? []),
    isLoading,
    isError,
  };
};
