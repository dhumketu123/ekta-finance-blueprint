import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ReportsMetrics {
  activeMembers: number;
  todaysTransactions: number;
  recoveryRate: number;
  growthVelocity: number;
  isLoading: boolean;
}

export const useReportsMetrics = (): ReportsMetrics => {
  const { data, isLoading } = useQuery({
    queryKey: ["reports_metrics_engine"],
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
      const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000).toISOString().split("T")[0];

      const [
        clientsRes,
        loansRes,
        todayTxRes,
        thisWeekTxRes,
        lastWeekTxRes,
        savingsRes,
      ] = await Promise.all([
        supabase
          .from("clients")
          .select("id, status")
          .is("deleted_at", null),
        supabase
          .from("loans")
          .select("id, status, outstanding_principal, total_principal")
          .is("deleted_at", null),
        supabase
          .from("financial_transactions")
          .select("id")
          .gte("created_at", `${today}T00:00:00`)
          .eq("approval_status", "approved"),
        supabase
          .from("financial_transactions")
          .select("amount")
          .gte("created_at", `${sevenDaysAgo}T00:00:00`)
          .eq("approval_status", "approved")
          .in("transaction_type", ["loan_collection", "emi_collection"]),
        supabase
          .from("financial_transactions")
          .select("amount")
          .gte("created_at", `${fourteenDaysAgo}T00:00:00`)
          .lt("created_at", `${sevenDaysAgo}T00:00:00`)
          .eq("approval_status", "approved")
          .in("transaction_type", ["loan_collection", "emi_collection"]),
        supabase
          .from("savings_accounts")
          .select("id, status")
          .is("deleted_at", null),
      ]);

      const clients = clientsRes.data ?? [];
      const loans = loansRes.data ?? [];
      const todayTxs = todayTxRes.data ?? [];
      const thisWeekCollections = thisWeekTxRes.data ?? [];
      const lastWeekCollections = lastWeekTxRes.data ?? [];

      // Active members = active clients
      const activeMembers = clients.filter((c) => c.status === "active").length;

      // Today's transactions
      const todaysTransactions = todayTxs.length;

      // Recovery rate = (total_principal - outstanding) / total_principal * 100
      const activeLoans = loans.filter((l) => l.status === "active" || l.status === "completed");
      const totalPrincipal = activeLoans.reduce((s, l) => s + (l.total_principal ?? 0), 0);
      const totalOutstanding = activeLoans.reduce((s, l) => s + (l.outstanding_principal ?? 0), 0);
      const recoveryRate = totalPrincipal > 0
        ? Math.round(((totalPrincipal - totalOutstanding) / totalPrincipal) * 100)
        : 0;

      // Growth velocity = ((thisWeek - lastWeek) / lastWeek) * 100
      const thisWeekTotal = thisWeekCollections.reduce((s, t) => s + (t.amount ?? 0), 0);
      const lastWeekTotal = lastWeekCollections.reduce((s, t) => s + (t.amount ?? 0), 0);
      const growthVelocity = lastWeekTotal > 0
        ? Math.round(((thisWeekTotal - lastWeekTotal) / lastWeekTotal) * 100)
        : thisWeekTotal > 0 ? 100 : 0;

      return { activeMembers, todaysTransactions, recoveryRate, growthVelocity };
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  return {
    activeMembers: data?.activeMembers ?? 0,
    todaysTransactions: data?.todaysTransactions ?? 0,
    recoveryRate: data?.recoveryRate ?? 0,
    growthVelocity: data?.growthVelocity ?? 0,
    isLoading,
  };
};
