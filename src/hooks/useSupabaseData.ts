import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Client = Tables<"clients">;
export type Investor = Tables<"investors">;
export type LoanProduct = Tables<"loan_products">;
export type SavingsProduct = Tables<"savings_products">;
export type Transaction = Tables<"transactions">;
export type Notification = Tables<"notifications">;

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

export const useDashboardMetrics = () =>
  useQuery({
    queryKey: ["dashboard_metrics"],
    queryFn: async () => {
      const [clientsRes, investorsRes, transactionsRes, profitTxRes] = await Promise.all([
        supabase.from("clients").select("id, status, loan_amount").is("deleted_at", null),
        supabase.from("investors").select("id, capital, principal_amount, accumulated_profit, monthly_profit_percent, reinvest, status").is("deleted_at", null),
        supabase
          .from("transactions")
          .select("id, type, amount, status, transaction_date")
          .is("deleted_at", null)
          .gte("transaction_date", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0]),
        supabase
          .from("transactions")
          .select("amount")
          .eq("type", "investor_profit")
          .eq("status", "paid")
          .is("deleted_at", null),
      ]);

      const clients = clientsRes.data ?? [];
      const investors = investorsRes.data ?? [];
      const transactions = transactionsRes.data ?? [];
      const allProfitTxs = profitTxRes.data ?? [];

      const activeLoans = clients.filter((c) => c.status === "active" && (c.loan_amount ?? 0) > 0);
      const totalLoanAmount = activeLoans.reduce((s, c) => s + (c.loan_amount ?? 0), 0);
      const totalCapital = investors.reduce((s, i) => s + i.capital, 0);
      const totalPrincipalInvested = investors.reduce((s, i) => s + i.principal_amount, 0);
      const totalAccumulatedProfit = investors.reduce((s, i) => s + i.accumulated_profit, 0);
      const totalProfitDistributed = allProfitTxs.reduce((s, t) => s + t.amount, 0);
      const activeInvestorCount = investors.filter((i) => i.status === "active").length;
      const reinvestorCount = investors.filter((i) => i.reinvest).length;
      const overdueCount = clients.filter((c) => c.status === "overdue").length;
      const pendingCount = clients.filter((c) => c.status === "pending").length;

      const savingsThisMonth = transactions
        .filter((t) => t.type === "savings_deposit" && t.status === "paid")
        .reduce((s, t) => s + t.amount, 0);

      const profitThisMonth = transactions
        .filter((t) => t.type === "investor_profit")
        .reduce((s, t) => s + t.amount, 0);

      return {
        totalClients: clients.length,
        activeLoansCount: activeLoans.length,
        totalLoanAmount,
        totalCapital,
        totalPrincipalInvested,
        totalAccumulatedProfit,
        totalProfitDistributed,
        investorCount: investors.length,
        activeInvestorCount,
        reinvestorCount,
        overdueCount,
        pendingCount,
        savingsThisMonth,
        profitThisMonth,
      };
    },
  });
