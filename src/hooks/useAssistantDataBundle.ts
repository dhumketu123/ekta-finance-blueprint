import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ── TX TYPE MAPPING ──
type TransactionBucket = "repayments" | "interest" | "penalty";
const TX_TYPE_MAP: Record<string, TransactionBucket> = {
  loan_repayment: "repayments",
  loan_principal: "repayments",
  loan_interest: "interest",
  loan_penalty: "penalty",
  savings_deposit: "repayments",
  savings_withdrawal: "repayments",
};

export interface RiskItem { name: string; value: number }
export interface TrendItem { date: string; rawDate: string; repayments: number; interest: number; penalty: number; total: number; count: number }
export interface TopClient { client_id: string; name: string; total: number; count: number }
export interface LoanKPIs {
  summary: Record<string, { count: number; amount: number }>;
  totalOutstanding: number;
  totalPenalty: number;
  avgEmi: number;
  totalLoans: number;
  activeRate: number;
  defaultRate: number;
}

// ── 30-Day Collection Summary (for growth comparison) ──
export const useCollectionSummary30d = () =>
  useQuery({
    queryKey: ["collection_summary_30d"],
    queryFn: async (): Promise<{ current30d: number; previous30d: number; growthPct: number }> => {
      const now = new Date();
      const d30 = new Date(); d30.setDate(now.getDate() - 30);
      const d60 = new Date(); d60.setDate(now.getDate() - 60);

      const { data, error } = await supabase
        .from("transactions")
        .select("transaction_date, amount")
        .is("deleted_at", null)
        .gte("transaction_date", d60.toISOString().slice(0, 10));
      if (error) throw error;

      let current30d = 0, previous30d = 0;
      const d30Str = d30.toISOString().slice(0, 10);
      (data ?? []).forEach((tx: any) => {
        const amt = Number(tx.amount) || 0;
        if (tx.transaction_date >= d30Str) current30d += amt;
        else previous30d += amt;
      });

      const growthPct = previous30d > 0 ? Math.round(((current30d - previous30d) / previous30d) * 100) : 0;
      return { current30d: Math.round(current30d), previous30d: Math.round(previous30d), growthPct };
    },
    staleTime: 60_000,
  });

// ── Risk Distribution ──
export const useRiskDistribution = () =>
  useQuery({
    queryKey: ["live_risk_distribution"],
    queryFn: async (): Promise<RiskItem[]> => {
      const { data, error } = await supabase.from("credit_scores").select("risk_level");
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data ?? []).forEach((r) => {
        const key = r.risk_level || "unknown";
        counts[key] = (counts[key] || 0) + 1;
      });
      return Object.entries(counts).map(([name, value]) => ({ name, value }));
    },
    staleTime: 30_000,
  });

// ── Collection Trend ──
export const useCollectionTrend = (days: number) =>
  useQuery({
    queryKey: ["live_collection_trend", days],
    queryFn: async (): Promise<TrendItem[]> => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      const { data, error } = await supabase
        .from("transactions")
        .select("transaction_date, amount, type")
        .is("deleted_at", null)
        .gte("transaction_date", startDate.toISOString().slice(0, 10))
        .order("transaction_date", { ascending: true });
      if (error) throw error;

      const dailyMap = new Map<string, { repayments: number; interest: number; penalty: number; count: number }>();
      (data ?? []).forEach((tx: any) => {
        const day = new Date(tx.transaction_date).toISOString().slice(0, 10);
        const entry = dailyMap.get(day) || { repayments: 0, interest: 0, penalty: 0, count: 0 };
        entry.count++;
        const amt = Number(tx.amount) || 0;
        const bucket = TX_TYPE_MAP[tx.type] || "repayments";
        entry[bucket] += amt;
        dailyMap.set(day, entry);
      });

      return Array.from(dailyMap.entries())
        .map(([date, d]) => {
          const dt = new Date(date);
          const label = `${dt.getDate()} ${dt.toLocaleString("bn-BD", { month: "short" })}`;
          return {
            date: label,
            rawDate: date,
            repayments: Math.round(d.repayments),
            interest: Math.round(d.interest),
            penalty: Math.round(d.penalty),
            total: Math.round(d.repayments + d.interest + d.penalty),
            count: d.count,
          };
        })
        .sort((a, b) => a.rawDate.localeCompare(b.rawDate));
    },
    staleTime: 30_000,
  });

// ── Top Clients ──
export const useTopClients = (days: number) =>
  useQuery({
    queryKey: ["live_top_clients", days],
    queryFn: async (): Promise<TopClient[]> => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      const { data, error } = await supabase
        .from("transactions")
        .select("client_id, amount")
        .is("deleted_at", null)
        .gte("transaction_date", startDate.toISOString().slice(0, 10));
      if (error) throw error;

      const clientMap = new Map<string, { total: number; count: number }>();
      (data ?? []).forEach((tx: any) => {
        const entry = clientMap.get(tx.client_id) || { total: 0, count: 0 };
        entry.total += Number(tx.amount) || 0;
        entry.count++;
        clientMap.set(tx.client_id, entry);
      });

      const sorted = Array.from(clientMap.entries())
        .map(([id, d]) => ({ client_id: id, total: Math.round(d.total), count: d.count }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 10);

      if (!sorted.length) return [];
      const ids = sorted.map((s) => s.client_id);
      const { data: clients } = await supabase.from("clients").select("id, name_bn, name_en").in("id", ids);
      const nameMap = new Map((clients ?? []).map((c) => [c.id, { bn: c.name_bn, en: c.name_en }]));
      return sorted.map((s) => ({
        ...s,
        name: nameMap.get(s.client_id)?.bn || nameMap.get(s.client_id)?.en || "অজানা ক্লায়েন্ট",
      }));
    },
    staleTime: 30_000,
  });

// ── Loan KPIs ──
export const useLoanKPIs = () =>
  useQuery({
    queryKey: ["live_loan_kpis"],
    queryFn: async (): Promise<LoanKPIs> => {
      const { data: loans, error } = await supabase
        .from("loans")
        .select("status, total_principal, total_interest, outstanding_principal, penalty_amount, emi_amount")
        .is("deleted_at", null);
      if (error) throw error;

      const summary: Record<string, { count: number; amount: number }> = {};
      let totalOutstanding = 0, totalPenalty = 0, totalEmi = 0, emiCount = 0;

      (loans ?? []).forEach((l: any) => {
        const s = l.status || "unknown";
        if (!summary[s]) summary[s] = { count: 0, amount: 0 };
        summary[s].count++;
        summary[s].amount += Number(l.total_principal) || 0;
        totalOutstanding += Number(l.outstanding_principal) || 0;
        totalPenalty += Number(l.penalty_amount) || 0;
        if (l.emi_amount > 0) { totalEmi += Number(l.emi_amount); emiCount++; }
      });

      const total = (loans ?? []).length;
      return {
        summary,
        totalOutstanding: Math.round(totalOutstanding),
        totalPenalty: Math.round(totalPenalty),
        avgEmi: emiCount ? Math.round(totalEmi / emiCount) : 0,
        totalLoans: total,
        activeRate: summary.active ? Math.round((summary.active.count / total) * 100) : 0,
        defaultRate: summary.default ? Math.round((summary.default.count / total) * 100) : 0,
      };
    },
    staleTime: 60_000,
  });
