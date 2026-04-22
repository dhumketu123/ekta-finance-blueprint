import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Client = Tables<"clients">;
export type Investor = Tables<"investors">;
export type LoanProduct = Tables<"loan_products">;
export type SavingsProduct = Tables<"savings_products">;
export type Transaction = Tables<"transactions">;
export type Notification = Tables<"notifications">;

// 🚀 PERF: Cache clients list for 60s — avoid duplicate fetches across pages
export const useClients = () =>
  useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Client[];
    },
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

export const useClient = (id: string) =>
  useQuery({
    queryKey: ["clients", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*, loan_products(*), savings_products(*)")
        .eq("id", id)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

export const useInvestors = () =>
  useQuery({
    queryKey: ["investors"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("investors")
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Investor[];
    },
    staleTime: 60 * 1000,
    gcTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

export const useInvestor = (id: string) =>
  useQuery({
    queryKey: ["investors", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("investors")
        .select("*")
        .eq("id", id)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

export const useLoanProducts = () =>
  useQuery({
    queryKey: ["loan_products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("loan_products")
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as LoanProduct[];
    },
  });

export const useLoanProduct = (id: string) =>
  useQuery({
    queryKey: ["loan_products", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("loan_products")
        .select("*")
        .eq("id", id)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

export const useSavingsProducts = () =>
  useQuery({
    queryKey: ["savings_products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("savings_products")
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as SavingsProduct[];
    },
  });

export const useSavingsProduct = (id: string) =>
  useQuery({
    queryKey: ["savings_products", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("savings_products")
        .select("*")
        .eq("id", id)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

export const useTransactions = (filters?: { client_id?: string; investor_id?: string; type?: string }) =>
  useQuery({
    queryKey: ["transactions", filters],
    queryFn: async () => {
      let query = supabase
        .from("transactions")
        .select("*, clients(name_en, name_bn), investors(name_en, name_bn)")
        .is("deleted_at", null)
        .order("transaction_date", { ascending: false });

      if (filters?.client_id) query = query.eq("client_id", filters.client_id);
      if (filters?.investor_id) query = query.eq("investor_id", filters.investor_id);
      if (filters?.type) query = query.eq("type", filters.type as any);

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

export const useOwners = () =>
  useQuery({
    queryKey: ["owners"],
    queryFn: async () => {
      const { data: roles, error: rolesErr } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "owner");
      if (rolesErr) throw rolesErr;
      if (!roles?.length) return [];
      const ids = roles.map((r) => r.user_id);
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .in("id", ids);
      if (error) throw error;
      return data ?? [];
    },
  });

export const useOwner = (id: string) =>
  useQuery({
    queryKey: ["owners", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

export const useFieldOfficers = () =>
  useQuery({
    queryKey: ["field_officers"],
    queryFn: async () => {
      const { data: roles, error: rolesErr } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "field_officer");
      if (rolesErr) throw rolesErr;
      if (!roles?.length) return [];
      const ids = roles.map((r) => r.user_id);
      const [profilesRes, clientsRes] = await Promise.all([
        supabase.from("profiles").select("*").in("id", ids),
        supabase.from("clients").select("id, assigned_officer").is("deleted_at", null),
      ]);
      if (profilesRes.error) throw profilesRes.error;
      const clients = clientsRes.data ?? [];
      return (profilesRes.data ?? []).map((p) => ({
        ...p,
        clientCount: clients.filter((c) => c.assigned_officer === p.id).length,
      }));
    },
  });

export const useFieldOfficer = (id: string) =>
  useQuery({
    queryKey: ["field_officers", id],
    queryFn: async () => {
      const [profileRes, clientsRes] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", id).maybeSingle(),
        supabase.from("clients").select("id, area").eq("assigned_officer", id).is("deleted_at", null),
      ]);
      if (profileRes.error) throw profileRes.error;
      if (!profileRes.data) return null;
      const areas = [...new Set((clientsRes.data ?? []).map((c) => c.area).filter(Boolean))];
      return {
        ...profileRes.data,
        clientCount: clientsRes.data?.length ?? 0,
        assignedAreas: areas as string[],
      };
    },
    enabled: !!id,
  });

// 🚀 PERF V2: Single consolidated RPC (replaces 4-query Promise.all + JS aggregation)
// Backend does ALL the COUNTs / SUMs in one round-trip via get_dashboard_summary_v2.
import { useTenantId } from "@/hooks/useTenantId";

export const useDashboardMetrics = () => {
  const { tenantId } = useTenantId();
  return useQuery({
    queryKey: ["dashboard_summary_v2", tenantId],
    enabled: !!tenantId,
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      // Reserve Architecture v3: parallel fetch — RPC summary + snapshot balances + liquidity + reconciliation
      const [rpcRes, snapRes, liqRes, reconRes] = await Promise.all([
        supabase.rpc("get_dashboard_summary_v2" as any, { p_tenant_id: tenantId }),
        supabase
          .from("account_balance_snapshot_v2")
          .select("account_id, balance, last_run_at, accounts:account_id(account_code)")
          .eq("tenant_id", tenantId)
          .eq("snapshot_date", new Date().toISOString().slice(0, 10)),
        supabase
          .from("daily_financial_summary")
          .select("liquidity_ratio, summary_date")
          .order("summary_date", { ascending: false })
          .limit(1)
          .maybeSingle(),
        // Live reconciliation check — flags ledger imbalances
        supabase.rpc("rpc_reconcile_ledger" as any),
      ]);

      if (rpcRes.error) throw rpcRes.error;
      const r = (rpcRes.data ?? {}) as Record<string, any>;

      // Index snapshot balances by account_code (sub-millisecond reads)
      const snapByCode: Record<string, number> = {};
      let snapshotLastRun: string | null = null;
      for (const row of (snapRes.data ?? []) as any[]) {
        const code = row?.accounts?.account_code;
        if (code) snapByCode[code] = (snapByCode[code] ?? 0) + Number(row.balance ?? 0);
        if (row?.last_run_at && (!snapshotLastRun || row.last_run_at > snapshotLastRun)) {
          snapshotLastRun = row.last_run_at;
        }
      }
      const pickSnap = (code: string, fallback: number) =>
        snapByCode[code] != null ? Math.abs(snapByCode[code]) : fallback;

      const rpcTotalLoan = Number(r.total_loan_amount ?? 0);
      const rpcTotalCapital = Number(r.total_capital ?? 0);
      const rpcSavings = Number(r.savings_this_month ?? 0);

      // Reconciliation status (issue_count > 0 → red pulsing alert)
      const reconData = (reconRes.data ?? {}) as Record<string, any>;
      const reconciliationIssueCount = Number(reconData.issue_count ?? 0);
      const reconciliationStatus = (reconData.reconciliation_status as string) ?? "UNKNOWN";

      return {
        totalClients: Number(r.total_clients ?? 0),
        activeLoansCount: Number(r.active_loans_count ?? 0),
        // Snapshot-first reads (Reserve Architecture v2)
        totalLoanAmount: pickSnap("LOAN_PRINCIPAL", rpcTotalLoan),
        totalCapital: pickSnap("INVESTOR_CAPITAL", rpcTotalCapital),
        totalPrincipalInvested: pickSnap("INVESTOR_CAPITAL", Number(r.total_principal_invested ?? 0)),
        totalAccumulatedProfit: Number(r.total_accumulated_profit ?? 0),
        totalProfitDistributed: Number(r.total_profit_distributed ?? 0),
        investorCount: Number(r.investor_count ?? 0),
        activeInvestorCount: Number(r.active_investor_count ?? 0),
        reinvestorCount: Number(r.reinvestor_count ?? 0),
        overdueCount: Number(r.overdue_count ?? 0),
        pendingCount: Number(r.pending_count ?? 0),
        savingsThisMonth: pickSnap("SAVINGS_LIABILITY", rpcSavings),
        profitThisMonth: Number(r.profit_this_month ?? 0),
        // v3: Risk Reserve Fund (ঝুঁকি সঞ্চিতি) — equity account, credit-balance polarity
        riskReserve: snapByCode["RISK_RESERVE"] != null ? Math.abs(snapByCode["RISK_RESERVE"]) : 0,
        // Liquidity ratio from daily_financial_summary (Reserve Architecture v2)
        liquidityRatio: liqRes.data?.liquidity_ratio != null ? Number(liqRes.data.liquidity_ratio) : null,
        liquiditySnapshotDate: liqRes.data?.summary_date ?? null,
        // Snapshot freshness (v3 last_run_at)
        snapshotLastRun,
        // Reconciliation alert signal
        reconciliationIssueCount,
        reconciliationStatus,
        // Extra fields exposed for cashflow oracle reuse
        _activeLoans: Number(r.active_loans ?? 0),
        _defaultLoans: Number(r.default_loans ?? 0),
        _overdueSchedules: Number(r.overdue_schedules ?? 0),
        _totalSchedules: Number(r.total_schedules ?? 0),
        _riskClients: Number(r.risk_clients ?? 0),
        _monthlyRepayment: (r.monthly_repayment ?? []) as { month: string; amount: number }[],
      };
    },
  });
};
