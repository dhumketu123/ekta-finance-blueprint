import { useState, useMemo, useCallback, useRef } from "react";
import {
  Landmark, TrendingUp, TrendingDown, Wallet, Scale, BarChart3,
  FileSpreadsheet, ArrowLeft, Sparkles, BookOpen, Network, PiggyBank,
  Lock, ShieldCheck, Settings, Eye, Play, ChevronRight, ChevronDown,
  Plus, Trash2, LockOpen, Clock, User, Loader2, AlertCircle,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import TransactionAuthModal from "@/components/security/TransactionAuthModal";

const fmt = (n: number) => `৳${Math.abs(n).toLocaleString("en-IN")}`;

// ═══════════════════════════════════════
// TYPES
// ═══════════════════════════════════════

interface TrialRow {
  coa_id: string;
  code: string;
  name: string;
  name_bn: string;
  account_type: string;
  total_debit: number;
  total_credit: number;
  balance: number;
}

interface PnlRow {
  coa_id: string;
  code: string;
  name: string;
  name_bn: string;
  account_type: string;
  amount: number;
}

interface BsRow {
  coa_id: string;
  code: string;
  name: string;
  name_bn: string;
  account_type: string;
  balance: number;
}

interface CoaNode {
  id: string;
  code: string;
  name: string;
  name_bn: string;
  account_type: string;
  parent_id: string | null;
  children: CoaNode[];
}

interface AuditRow {
  id: string;
  user_id: string | null;
  action_type: string;
  entity_type: string;
  entity_id: string | null;
  created_at: string;
  new_value: Record<string, unknown> | null;
}

interface PeriodRow {
  id: string;
  period_month: string;
  is_locked: boolean;
  locked_at: string | null;
}

// ═══════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════

const TYPE_COLORS: Record<string, string> = {
  asset: "text-blue-300",
  liability: "text-orange-300",
  equity: "text-purple-300",
  income: "text-[#48FF73]",
  expense: "text-red-300",
};

function buildTree(flat: Omit<CoaNode, "children">[]): CoaNode[] {
  try {
    const map = new Map<string, CoaNode>();
    const roots: CoaNode[] = [];
    for (const item of flat) {
      map.set(item.id, { ...item, children: [] });
    }
    for (const node of Array.from(map.values())) {
      if (node.parent_id && map.has(node.parent_id)) {
        map.get(node.parent_id)!.children.push(node);
      } else {
        roots.push(node);
      }
    }
    return roots;
  } catch {
    return [];
  }
}

// ═══════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════

const GlassCard = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div className={`relative bg-white/[0.07] backdrop-blur-xl border border-white/[0.15] rounded-2xl shadow-2xl p-6 transition-all duration-500 hover:bg-white/[0.12] hover:border-white/[0.25] hover:shadow-[0_8px_40px_rgba(72,255,115,0.08)] group ${className}`}>
    <div className="absolute -top-px -left-px w-20 h-20 bg-gradient-to-br from-white/20 to-transparent rounded-tl-2xl pointer-events-none opacity-60 group-hover:opacity-100 transition-opacity duration-500" />
    {children}
  </div>
);

const TreeNode = ({ node, depth = 0 }: { node: CoaNode; depth?: number }) => {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children.length > 0;
  return (
    <div>
      <button
        onClick={() => hasChildren && setExpanded(!expanded)}
        className="w-full flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-white/[0.06] transition-colors duration-200 text-left"
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {hasChildren ? (
          expanded ? <ChevronDown className="w-3 h-3 text-white/40 shrink-0" /> : <ChevronRight className="w-3 h-3 text-white/40 shrink-0" />
        ) : (
          <span className="w-3 shrink-0" />
        )}
        <span className={`text-[11px] font-mono ${TYPE_COLORS[node.account_type] ?? "text-white/70"}`}>{node.code}</span>
        <span className="text-xs text-white/80 truncate">{node.name}</span>
      </button>
      {expanded && hasChildren && node.children.map((child) => (
        <TreeNode key={child.id} node={child} depth={depth + 1} />
      ))}
    </div>
  );
};

const StatusBadgeIntel = ({ status }: { status: "active" | "warning" | "locked" }) => {
  const config = {
    active: { bg: "bg-[#48FF73]/15", text: "text-[#48FF73]", dot: "bg-[#48FF73]", label: "Active", pulse: true },
    warning: { bg: "bg-yellow-400/15", text: "text-yellow-300", dot: "bg-yellow-300", label: "Warning", pulse: true },
    locked: { bg: "bg-red-400/15", text: "text-red-300", dot: "bg-red-300", label: "Locked", pulse: false },
  }[status];
  return (
    <span className={`inline-flex items-center gap-1.5 ${config.bg} ${config.text} text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full`}>
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot} ${config.pulse ? "animate-pulse" : ""}`} />
      {config.label}
    </span>
  );
};

const MiniLoader = () => (
  <div className="flex items-center justify-center py-6">
    <Loader2 className="w-5 h-5 text-[#48FF73]/60 animate-spin" />
  </div>
);

const EmptyState = ({ text }: { text: string }) => (
  <div className="flex flex-col items-center justify-center py-6 gap-2">
    <AlertCircle className="w-5 h-5 text-white/20" />
    <span className="text-[11px] text-white/30">{text}</span>
  </div>
);

const ErrorState = ({ onRetry }: { onRetry?: () => void }) => (
  <div className="flex flex-col items-center justify-center py-8 gap-3">
    <AlertCircle className="w-6 h-6 text-red-400/60" />
    <span className="text-xs text-red-300/70">Something went wrong. Please try again.</span>
    {onRetry && (
      <button onClick={onRetry} className="text-[10px] font-bold text-[#48FF73] hover:underline">Retry</button>
    )}
  </div>
);

// ═══════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════

const AccountingDashboard = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // ── UI toggle state ──
  const [showRules, setShowRules] = useState(false);
  const [showTree, setShowTree] = useState(false);
  const [showAudit, setShowAudit] = useState(false);
  const [showPeriods, setShowPeriods] = useState(false);
  const [showRetained, setShowRetained] = useState(false);

  // PIN verification state for period lock
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const pendingLockAction = useRef<{ month: string; lock: boolean } | null>(null);

  const handlePeriodLockClick = useCallback((month: string, lock: boolean) => {
    pendingLockAction.current = { month, lock };
    setPinModalOpen(true);
  }, []);

  // handlePinAuthorized defined after lockMutation below

  // ═══════════════════════════════════════
  // STEP B — CORE ACCOUNTING RPC QUERIES
  // ═══════════════════════════════════════

  // 1. Trial Balance (LIVE RPC)
  const { data: trialData, isLoading: trialLoading, error: trialError, refetch: refetchTrial } = useQuery({
    queryKey: ["trial-balance-dashboard"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase.rpc("get_trial_balance" as any);
        if (error) throw error;
        return (data || []) as TrialRow[];
      } catch (err) {
        console.error("Trial balance RPC failed:", err);
        throw err;
      }
    },
  });

  // 2. Profit & Loss (LIVE RPC)
  const { data: pnlData, isLoading: pnlLoading, error: pnlError, refetch: refetchPnl } = useQuery({
    queryKey: ["profit-loss-dashboard"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase.rpc("get_profit_loss" as any, {
          p_from: null,
          p_to: null,
        });
        if (error) throw error;
        return (data || []) as PnlRow[];
      } catch (err) {
        console.error("Profit & Loss RPC failed:", err);
        throw err;
      }
    },
  });

  // 3. Balance Sheet (LIVE RPC)
  const { data: bsData, isLoading: bsLoading, error: bsError, refetch: refetchBs } = useQuery({
    queryKey: ["balance-sheet-dashboard"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase.rpc("get_balance_sheet" as any, {
          p_as_of: null,
        });
        if (error) throw error;
        return (data || []) as BsRow[];
      } catch (err) {
        console.error("Balance sheet RPC failed:", err);
        throw err;
      }
    },
  });

  // ═══════════════════════════════════════
  // STEP C — DERIVED CALCULATIONS (REAL DATA)
  // ═══════════════════════════════════════

  const totalDebit = useMemo(() => {
    try { return trialData?.reduce((s, r) => s + Number(r.total_debit), 0) || 0; } catch { return 0; }
  }, [trialData]);

  const totalCredit = useMemo(() => {
    try { return trialData?.reduce((s, r) => s + Number(r.total_credit), 0) || 0; } catch { return 0; }
  }, [trialData]);

  const incomeRows = useMemo(() => {
    try { return pnlData?.filter(r => r.account_type === "income") || []; } catch { return []; }
  }, [pnlData]);

  const expenseRows = useMemo(() => {
    try { return pnlData?.filter(r => r.account_type === "expense") || []; } catch { return []; }
  }, [pnlData]);

  const totalIncome = useMemo(() => {
    try { return incomeRows.reduce((s, r) => s + Number(r.amount), 0); } catch { return 0; }
  }, [incomeRows]);

  const totalExpense = useMemo(() => {
    try { return expenseRows.reduce((s, r) => s + Number(r.amount), 0); } catch { return 0; }
  }, [expenseRows]);

  const netProfit = useMemo(() => {
    try { return totalIncome - totalExpense; } catch { return 0; }
  }, [totalIncome, totalExpense]);

  const assetRows = useMemo(() => {
    try { return bsData?.filter(r => r.account_type === "asset") || []; } catch { return []; }
  }, [bsData]);

  const liabEqRows = useMemo(() => {
    try { return bsData?.filter(r => r.account_type !== "asset") || []; } catch { return []; }
  }, [bsData]);

  const totalAssets = useMemo(() => {
    try { return assetRows.reduce((s, r) => s + Number(r.balance), 0); } catch { return 0; }
  }, [assetRows]);

  const totalLiabEq = useMemo(() => {
    try { return liabEqRows.reduce((s, r) => s + Number(r.balance), 0); } catch { return 0; }
  }, [liabEqRows]);

  // STEP D — Retained Earnings (derived from netProfit, no RPC call)
  const retainedEarnings = useMemo(() => {
    try { return netProfit; } catch { return 0; }
  }, [netProfit]);

  // Top metrics (all derived from live data)
  const metrics = useMemo(() => [
    { label: "Total Assets", value: totalAssets, icon: Landmark },
    { label: "Total Liabilities", value: totalLiabEq, icon: TrendingDown },
    { label: "Net Profit", value: netProfit, icon: TrendingUp },
    { label: "Cash Balance", value: totalAssets - totalLiabEq, icon: Wallet },
  ], [totalAssets, totalLiabEq, netProfit]);

  const coreLoading = trialLoading || pnlLoading || bsLoading;
  const coreError = trialError || pnlError || bsError;

  // ═══════════════════════════════════════
  // INTELLIGENCE LAYER QUERIES
  // ═══════════════════════════════════════

  // Journal Rules
  const { data: rulesData, isLoading: rulesLoading } = useQuery({
    queryKey: ["journal-rules"],
    queryFn: async () => {
      try {
        const { data, error } = await (supabase as any)
          .from("journal_rules")
          .select("id, trigger_type, description, is_active, debit_coa_id, credit_coa_id")
          .eq("is_active", true)
          .order("trigger_type");
        if (error) throw error;

        const rows = (data || []) as any[];
        const coaIds = new Set<string>();
        for (const r of rows) {
          if (r.debit_coa_id) coaIds.add(r.debit_coa_id);
          if (r.credit_coa_id) coaIds.add(r.credit_coa_id);
        }

        let coaMap: Record<string, string> = {};
        if (coaIds.size > 0) {
          const { data: coaD } = await (supabase as any)
            .from("chart_of_accounts")
            .select("id, code")
            .in("id", Array.from(coaIds));
          if (coaD) {
            coaMap = Object.fromEntries((coaD as any[]).map((c: any) => [c.id, c.code]));
          }
        }

        return rows.map((r: any) => ({
          id: r.id,
          trigger_type: r.trigger_type,
          description: r.description,
          is_active: r.is_active,
          debit_code: coaMap[r.debit_coa_id] || "—",
          credit_code: coaMap[r.credit_coa_id] || "—",
        }));
      } catch (err) {
        console.error("Failed to fetch journal rules:", err);
        return [];
      }
    },
  });

  const rules = rulesData || [];

  // Chart of Accounts (Tree)
  const { data: coaData, isLoading: coaLoading } = useQuery({
    queryKey: ["chart-of-accounts-tree"],
    queryFn: async () => {
      try {
        const { data, error } = await (supabase as any)
          .from("chart_of_accounts")
          .select("id, code, name, name_bn, account_type, parent_id")
          .eq("is_active", true)
          .order("code");
        if (error) throw error;
        return (data || []) as unknown as Omit<CoaNode, "children">[];
      } catch (err) {
        console.error("Failed to fetch CoA:", err);
        return [];
      }
    },
  });

  const coaTree = useMemo(() => buildTree(coaData || []), [coaData]);
  const coaCount = coaData?.length || 0;

  // Accounting Periods
  const { data: periodsData, isLoading: periodsLoading } = useQuery({
    queryKey: ["accounting-periods"],
    queryFn: async () => {
      try {
        const { data, error } = await (supabase as any)
          .from("accounting_periods")
          .select("id, period_month, is_locked, locked_at")
          .order("period_month");
        if (error) throw error;
        return (data || []) as unknown as PeriodRow[];
      } catch (err) {
        console.error("Failed to fetch periods:", err);
        return [];
      }
    },
  });

  const periods = periodsData || [];
  const lockedCount = periods.filter((p) => p.is_locked).length;

  // Audit Logs (last 10)
  const { data: auditData, isLoading: auditLoading } = useQuery({
    queryKey: ["audit-logs-recent"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("audit_logs")
          .select("id, user_id, action_type, entity_type, entity_id, created_at, new_value")
          .order("created_at", { ascending: false })
          .limit(10);
        if (error) throw error;
        return (data || []) as AuditRow[];
      } catch (err) {
        console.error("Failed to fetch audit logs:", err);
        return [];
      }
    },
  });

  const auditEntries = auditData || [];

  // ═══════════════════════════════════════
  // MUTATIONS
  // ═══════════════════════════════════════

  // Lock/unlock period
  const lockMutation = useMutation({
    mutationFn: async ({ month, lock }: { month: string; lock: boolean }) => {
      const { data, error } = await supabase.rpc("lock_accounting_period" as any, {
        p_month: month,
        p_lock: lock,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["accounting-periods"] });
      queryClient.invalidateQueries({ queryKey: ["audit-logs-recent"] });
      toast({
        title: vars.lock ? "🔒 Period Locked" : "🔓 Period Unlocked",
        description: `Period ${vars.month} has been ${vars.lock ? "locked" : "unlocked"}.`,
      });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  // Delete journal rule (soft-delete)
  const deleteRuleMutation = useMutation({
    mutationFn: async (ruleId: string) => {
      const { error } = await supabase
        .from("journal_rules" as any)
        .update({ is_active: false } as any)
        .eq("id", ruleId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["journal-rules"] });
      toast({ title: "Rule deactivated" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  // Create journal rule
  const createRuleMutation = useMutation({
    mutationFn: async (payload: { trigger_type: string; debit_coa_id: string; credit_coa_id: string; description: string; tenant_id: string }) => {
      const { error } = await supabase.from("journal_rules" as any).insert(payload as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["journal-rules"] });
      toast({ title: "Rule created" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  // Update journal rule
  const updateRuleMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }) => {
      const { error } = await supabase
        .from("journal_rules" as any)
        .update(data as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["journal-rules"] });
      toast({ title: "Rule updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  // ═══════════════════════════════════════
  // DERIVED STATUS
  // ═══════════════════════════════════════

  const rulesStatus = useMemo<"active" | "warning">(() => {
    try { return rules.length < 3 ? "warning" : "active"; } catch { return "warning"; }
  }, [rules]);

  const periodStatus = useMemo<"active" | "locked">(() => {
    try { return lockedCount > 0 ? "locked" : "active"; } catch { return "active"; }
  }, [lockedCount]);

  const availableMonths = useMemo(() => {
    try {
      const now = new Date();
      const months: string[] = [];
      for (let m = 1; m <= now.getMonth() + 1; m++) {
        months.push(`${now.getFullYear()}-${String(m).padStart(2, "0")}-01`);
      }
      return months;
    } catch { return []; }
  }, []);

  const formatMonth = (d: string) => {
    try { return d.substring(0, 7); } catch { return d; }
  };

  const isMonthLocked = useCallback((month: string) => {
    try {
      return periods.some((p) => p.period_month === month && p.is_locked);
    } catch { return false; }
  }, [periods]);

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Animated gradient mesh background */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, #0052D4 0%, #4364F7 40%, #6FB1FC 70%, #0052D4 100%)", backgroundSize: "400% 400%", animation: "meshMove 30s ease infinite" }} />
        <div className="absolute inset-0 opacity-30" style={{ backgroundImage: "radial-gradient(circle at 20% 50%, rgba(72,255,115,0.15) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(99,102,241,0.2) 0%, transparent 50%), radial-gradient(circle at 50% 80%, rgba(72,255,115,0.1) 0%, transparent 50%)" }} />
      </div>
      <style>{`@keyframes meshMove{0%,100%{background-position:0% 50%}50%{background-position:100% 50%}}`}</style>

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10 pb-28">
        {/* Back button */}
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-white/60 hover:text-white text-xs mb-6 transition-colors duration-200">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        {/* Page header */}
        <div className="text-center mb-8 sm:mb-12">
          <div className="inline-flex items-center gap-2 bg-white/[0.08] backdrop-blur-xl border border-white/[0.15] rounded-full px-5 py-2 mb-4">
            <Sparkles className="w-4 h-4 text-[#48FF73]" />
            <span className="text-[11px] font-semibold text-white/80 uppercase tracking-widest">Accounting Engine</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">Accounting Engine</h1>
          <p className="text-sm text-white/60 mt-2">Real-time financial intelligence — Live Data</p>
        </div>

        {/* Global error state */}
        {coreError && !coreLoading && (
          <ErrorState onRetry={() => { refetchTrial(); refetchPnl(); refetchBs(); }} />
        )}

        {/* Top metrics (LIVE) */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {metrics.map((m, i) => (
            <GlassCard key={i} className="!p-4 sm:!p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="p-2 rounded-xl bg-white/[0.08] border border-white/[0.1]"><m.icon className="w-4 h-4 text-[#48FF73]" /></div>
                {coreLoading && <Loader2 className="w-3 h-3 text-[#48FF73]/40 animate-spin" />}
              </div>
              <p className="text-[11px] text-white/50 mb-1">{m.label}</p>
              <p className="text-lg sm:text-xl font-extrabold text-white font-mono">
                {coreLoading ? "—" : fmt(m.value)}
              </p>
            </GlassCard>
          ))}
        </div>

        {/* Main accounting sections (LIVE RPC DATA) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-6">
          {/* Trial Balance */}
          <GlassCard>
            <div className="flex items-center gap-2 mb-5">
              <Scale className="w-4 h-4 text-[#48FF73]" />
              <h2 className="text-sm font-bold text-white">Trial Balance</h2>
            </div>
            {trialLoading ? <MiniLoader /> : trialError ? <ErrorState onRetry={() => refetchTrial()} /> : (
              <>
                <div className="space-y-0">
                  <div className="flex justify-between text-[10px] font-bold text-white/40 uppercase tracking-wider pb-2 border-b border-white/10 mb-1">
                    <span>Account</span>
                    <div className="flex gap-6"><span>Debit</span><span>Credit</span></div>
                  </div>
                  {(trialData || []).length === 0 ? <EmptyState text="No trial balance data" /> : (
                    (trialData || []).map((r) => (
                      <div key={r.coa_id} className="flex justify-between items-center py-1.5 hover:bg-white/5 rounded-lg px-2 transition-colors duration-200">
                        <span className="text-[12px] text-white/80 truncate max-w-[120px]">{r.name}</span>
                        <div className="flex gap-4">
                          <span className="text-[12px] font-mono font-semibold text-white/90 w-20 text-right">{Number(r.total_debit) ? fmt(Number(r.total_debit)) : "—"}</span>
                          <span className="text-[12px] font-mono font-semibold text-white/90 w-20 text-right">{Number(r.total_credit) ? fmt(Number(r.total_credit)) : "—"}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <div className="mt-3 pt-3 border-t border-white/10 flex justify-between items-center px-2">
                  <span className="text-xs font-bold text-white">Total</span>
                  <div className="flex gap-4">
                    <span className="text-xs font-mono font-extrabold text-[#48FF73] w-20 text-right">{fmt(totalDebit)}</span>
                    <span className="text-xs font-mono font-extrabold text-[#48FF73] w-20 text-right">{fmt(totalCredit)}</span>
                  </div>
                </div>
                {Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0 && (
                  <div className="mt-3 flex items-center gap-2 bg-[#48FF73]/10 text-[#48FF73] text-[10px] font-bold px-3 py-1.5 rounded-lg">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#48FF73] animate-pulse" /> Balanced ✓
                  </div>
                )}
              </>
            )}
          </GlassCard>

          {/* Profit & Loss */}
          <GlassCard>
            <div className="flex items-center gap-2 mb-5">
              <BarChart3 className="w-4 h-4 text-[#48FF73]" />
              <h2 className="text-sm font-bold text-white">Profit & Loss</h2>
            </div>
            {pnlLoading ? <MiniLoader /> : pnlError ? <ErrorState onRetry={() => refetchPnl()} /> : (
              <>
                <div className="mb-4">
                  <p className="text-[10px] font-bold text-white/40 uppercase tracking-wider mb-2">Income</p>
                  {incomeRows.length === 0 ? (
                    <p className="text-[11px] text-white/30 px-2 py-1">No income accounts</p>
                  ) : (
                    incomeRows.map((r) => (
                      <div key={r.coa_id} className="flex justify-between items-center py-1.5 hover:bg-white/5 rounded-lg px-2 transition-colors duration-200">
                        <span className="text-[12px] text-white/80 truncate">{r.name}</span>
                        <span className="text-[12px] font-mono font-semibold text-[#48FF73]">{fmt(Number(r.amount))}</span>
                      </div>
                    ))
                  )}
                </div>
                <div className="mb-4">
                  <p className="text-[10px] font-bold text-white/40 uppercase tracking-wider mb-2">Expenses</p>
                  {expenseRows.length === 0 ? (
                    <p className="text-[11px] text-white/30 px-2 py-1">No expense accounts</p>
                  ) : (
                    expenseRows.map((r) => (
                      <div key={r.coa_id} className="flex justify-between items-center py-1.5 hover:bg-white/5 rounded-lg px-2 transition-colors duration-200">
                        <span className="text-[12px] text-white/80 truncate">{r.name}</span>
                        <span className="text-[12px] font-mono font-semibold text-red-300">{fmt(Number(r.amount))}</span>
                      </div>
                    ))
                  )}
                </div>
                <div className="pt-3 border-t border-white/10 flex justify-between items-center px-2">
                  <span className="text-xs font-bold text-white">Net Profit</span>
                  <span className={`text-sm font-mono font-extrabold ${netProfit >= 0 ? "text-[#48FF73]" : "text-red-300"}`}>{netProfit < 0 ? "-" : ""}{fmt(netProfit)}</span>
                </div>
              </>
            )}
          </GlassCard>

          {/* Balance Sheet */}
          <GlassCard>
            <div className="flex items-center gap-2 mb-5">
              <FileSpreadsheet className="w-4 h-4 text-[#48FF73]" />
              <h2 className="text-sm font-bold text-white">Balance Sheet</h2>
            </div>
            {bsLoading ? <MiniLoader /> : bsError ? <ErrorState onRetry={() => refetchBs()} /> : (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[10px] font-bold text-white/40 uppercase tracking-wider mb-2">Assets</p>
                    {assetRows.length === 0 ? (
                      <p className="text-[11px] text-white/30 px-2 py-1">No assets</p>
                    ) : (
                      assetRows.map((r) => (
                        <div key={r.coa_id} className="flex justify-between items-center py-1.5 hover:bg-white/5 rounded-lg px-2 transition-colors duration-200">
                          <span className="text-[12px] text-white/80 truncate">{r.name}</span>
                          <span className="text-[12px] font-mono font-semibold text-white/90">{fmt(Number(r.balance))}</span>
                        </div>
                      ))
                    )}
                    <div className="mt-3 pt-3 border-t border-white/10 flex justify-between items-center px-2">
                      <span className="text-xs font-bold text-white">Total</span>
                      <span className="text-sm font-mono font-extrabold text-[#48FF73]">{fmt(totalAssets)}</span>
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-white/40 uppercase tracking-wider mb-2">Liabilities + Equity</p>
                    {liabEqRows.length === 0 ? (
                      <p className="text-[11px] text-white/30 px-2 py-1">No liabilities</p>
                    ) : (
                      liabEqRows.map((r) => (
                        <div key={r.coa_id} className="flex justify-between items-center py-1.5 hover:bg-white/5 rounded-lg px-2 transition-colors duration-200">
                          <span className="text-[12px] text-white/80 truncate">{r.name}</span>
                          <span className="text-[12px] font-mono font-semibold text-white/90">{fmt(Number(r.balance))}</span>
                        </div>
                      ))
                    )}
                    <div className="mt-3 pt-3 border-t border-white/10 flex justify-between items-center px-2">
                      <span className="text-xs font-bold text-white">Total</span>
                      <span className="text-sm font-mono font-extrabold text-[#48FF73]">{fmt(totalLiabEq)}</span>
                    </div>
                  </div>
                </div>
                {Math.abs(totalAssets - totalLiabEq) < 0.01 && totalAssets > 0 && (
                  <div className="mt-5 flex items-center gap-2 bg-[#48FF73]/10 text-[#48FF73] text-xs font-bold px-3 py-2 rounded-lg">
                    <span className="w-2 h-2 rounded-full bg-[#48FF73] animate-pulse" /> Assets = Liabilities + Equity ✓
                  </div>
                )}
              </>
            )}
          </GlassCard>
        </div>

        {/* ═══════════════════════════════════════ */}
        {/* FINANCIAL INTELLIGENCE LAYER (LIVE)     */}
        {/* ═══════════════════════════════════════ */}
        <div className="mt-12 sm:mt-16">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 bg-white/[0.08] backdrop-blur-xl border border-white/[0.15] rounded-full px-5 py-2 mb-4">
              <ShieldCheck className="w-4 h-4 text-[#48FF73]" />
              <span className="text-[11px] font-semibold text-white/80 uppercase tracking-widest">Intelligence Layer</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">Financial Intelligence Layer</h2>
            <p className="text-sm text-white/60 mt-2 max-w-md mx-auto">Autonomous Control & Audit System — Live Data</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

            {/* ─── 1. Journal Rules Engine (LIVE) ─── */}
            <GlassCard>
              <div className="flex items-start justify-between mb-4">
                <div className="p-2.5 rounded-xl bg-white/[0.08] border border-white/[0.1]">
                  <BookOpen className="w-5 h-5 text-[#48FF73]" />
                </div>
                <StatusBadgeIntel status={rulesStatus} />
              </div>
              <h3 className="text-base font-bold text-white mb-1">Journal Rules Engine</h3>
              <p className="text-xs text-white/50 leading-relaxed mb-1">
                {rules.length} active rules. Dynamic mapping from <code className="text-[#48FF73]/70">journal_rules</code> table.
              </p>

              {showRules && (
                <div className="mt-3 space-y-2 max-h-52 overflow-y-auto pr-1">
                  {rulesLoading ? <MiniLoader /> : rules.length === 0 ? <EmptyState text="No journal rules configured" /> : (
                    rules.map((rule: any) => (
                      <div key={rule.id} className="flex items-center justify-between bg-white/[0.05] rounded-lg px-3 py-2 border border-white/[0.08]">
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-mono font-bold text-[#48FF73] truncate">{rule.trigger_type}</p>
                          <p className="text-[10px] text-white/40">DR: {rule.debit_code} → CR: {rule.credit_code}</p>
                        </div>
                        <button
                          onClick={() => deleteRuleMutation.mutate(rule.id)}
                          disabled={deleteRuleMutation.isPending}
                          className="ml-2 p-1 rounded hover:bg-red-400/20 transition-colors"
                        >
                          <Trash2 className="w-3 h-3 text-red-300/60 hover:text-red-300" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}

              <button onClick={() => setShowRules(!showRules)} className="w-full mt-4 flex items-center justify-center gap-2 bg-[#48FF73] text-black font-bold text-xs px-4 py-2.5 rounded-full hover:scale-[0.97] active:scale-[0.94] transition-transform duration-200 shadow-[0_0_20px_rgba(72,255,115,0.2)]">
                <Settings className="w-3.5 h-3.5" />
                {showRules ? "Hide Rules" : "Configure"}
              </button>
            </GlassCard>

            {/* ─── 2. Account Hierarchy Tree (LIVE) ─── */}
            <GlassCard>
              <div className="flex items-start justify-between mb-4">
                <div className="p-2.5 rounded-xl bg-white/[0.08] border border-white/[0.1]">
                  <Network className="w-5 h-5 text-[#48FF73]" />
                </div>
                <StatusBadgeIntel status={coaCount > 0 ? "active" : "warning"} />
              </div>
              <h3 className="text-base font-bold text-white mb-1">Account Hierarchy Tree</h3>
              <p className="text-xs text-white/50 leading-relaxed mb-1">
                {coaCount} accounts from <code className="text-[#48FF73]/70">chart_of_accounts</code>. Expandable tree.
              </p>

              {showTree && (
                <div className="mt-3 max-h-60 overflow-y-auto pr-1 border border-white/[0.08] rounded-lg bg-white/[0.03] py-2">
                  {coaLoading ? <MiniLoader /> : coaTree.length === 0 ? <EmptyState text="No accounts found. Seed CoA first." /> : (
                    coaTree.map((root) => <TreeNode key={root.id} node={root} />)
                  )}
                </div>
              )}

              <button onClick={() => setShowTree(!showTree)} className="w-full mt-4 flex items-center justify-center gap-2 bg-[#48FF73] text-black font-bold text-xs px-4 py-2.5 rounded-full hover:scale-[0.97] active:scale-[0.94] transition-transform duration-200 shadow-[0_0_20px_rgba(72,255,115,0.2)]">
                <Eye className="w-3.5 h-3.5" />
                {showTree ? "Hide Tree" : "View"}
              </button>
            </GlassCard>

            {/* ─── 3. Retained Earnings Control (LIVE — derived) ─── */}
            <GlassCard>
              <div className="flex items-start justify-between mb-4">
                <div className="p-2.5 rounded-xl bg-white/[0.08] border border-white/[0.1]">
                  <PiggyBank className="w-5 h-5 text-[#48FF73]" />
                </div>
                <StatusBadgeIntel status={retainedEarnings > 0 ? "active" : retainedEarnings < 0 ? "warning" : "active"} />
              </div>
              <h3 className="text-base font-bold text-white mb-1">Retained Earnings Control</h3>
              <p className="text-xs text-white/50 leading-relaxed mb-1">
                Derived from P&L live data. No separate RPC needed.
              </p>

              {showRetained && (
                <div className="mt-3 space-y-2">
                  {pnlLoading ? <MiniLoader /> : (
                    <>
                      <div className="flex justify-between items-center bg-white/[0.05] rounded-lg px-3 py-2.5 border border-white/[0.08]">
                        <span className="text-[11px] text-white/60">Total Income</span>
                        <span className="text-xs font-mono font-bold text-[#48FF73]">{fmt(totalIncome)}</span>
                      </div>
                      <div className="flex justify-between items-center bg-white/[0.05] rounded-lg px-3 py-2.5 border border-white/[0.08]">
                        <span className="text-[11px] text-white/60">– Total Expense</span>
                        <span className="text-xs font-mono font-bold text-red-300">{fmt(totalExpense)}</span>
                      </div>
                      <div className="flex justify-between items-center bg-[#48FF73]/10 rounded-lg px-3 py-3 border border-[#48FF73]/20">
                        <span className="text-xs font-bold text-white">= Retained Earnings</span>
                        <span className={`text-sm font-mono font-extrabold ${retainedEarnings >= 0 ? "text-[#48FF73]" : "text-red-300"}`}>
                          {retainedEarnings < 0 ? "-" : ""}{fmt(retainedEarnings)}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              )}

              <button onClick={() => setShowRetained(!showRetained)} className="w-full mt-4 flex items-center justify-center gap-2 bg-[#48FF73] text-black font-bold text-xs px-4 py-2.5 rounded-full hover:scale-[0.97] active:scale-[0.94] transition-transform duration-200 shadow-[0_0_20px_rgba(72,255,115,0.2)]">
                <Play className="w-3.5 h-3.5" />
                {showRetained ? "Hide" : "Run"}
              </button>
            </GlassCard>

            {/* ─── 4. Period Lock System (LIVE) ─── */}
            <GlassCard>
              <div className="flex items-start justify-between mb-4">
                <div className="p-2.5 rounded-xl bg-white/[0.08] border border-white/[0.1]">
                  <Lock className="w-5 h-5 text-[#48FF73]" />
                </div>
                <StatusBadgeIntel status={periodStatus} />
              </div>
              <h3 className="text-base font-bold text-white mb-1">Period Lock System</h3>
              <p className="text-xs text-white/50 leading-relaxed mb-1">
                {lockedCount} period{lockedCount !== 1 ? "s" : ""} locked. Blocks ledger inserts via trigger.
              </p>

              {showPeriods && (
                <div className="mt-3 space-y-2">
                  {periodsLoading ? <MiniLoader /> : (
                    availableMonths.map((month) => {
                      const locked = isMonthLocked(month);
                      return (
                        <div key={month} className="flex items-center justify-between bg-white/[0.05] rounded-lg px-3 py-2.5 border border-white/[0.08]">
                          <div className="flex items-center gap-2">
                            <Clock className="w-3.5 h-3.5 text-white/40" />
                            <span className="text-xs font-mono text-white/80">{formatMonth(month)}</span>
                          </div>
                          <button
                            onClick={() => handlePeriodLockClick(month, !locked)}
                            disabled={lockMutation.isPending}
                            className={`flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full transition-all duration-200 ${
                              locked ? "bg-red-400/15 text-red-300 hover:bg-red-400/25" : "bg-[#48FF73]/15 text-[#48FF73] hover:bg-[#48FF73]/25"
                            }`}
                          >
                            {lockMutation.isPending ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : locked ? (
                              <><LockOpen className="w-3 h-3" /> Unlock</>
                            ) : (
                              <><Lock className="w-3 h-3" /> Lock</>
                            )}
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              <button onClick={() => setShowPeriods(!showPeriods)} className="w-full mt-4 flex items-center justify-center gap-2 bg-[#48FF73] text-black font-bold text-xs px-4 py-2.5 rounded-full hover:scale-[0.97] active:scale-[0.94] transition-transform duration-200 shadow-[0_0_20px_rgba(72,255,115,0.2)]">
                <Settings className="w-3.5 h-3.5" />
                {showPeriods ? "Hide" : "Configure"}
              </button>
            </GlassCard>

            {/* ─── 5. Audit Trail Monitor (LIVE) ─── */}
            <GlassCard className="md:col-span-2">
              <div className="flex items-start justify-between mb-4">
                <div className="p-2.5 rounded-xl bg-white/[0.08] border border-white/[0.1]">
                  <ShieldCheck className="w-5 h-5 text-[#48FF73]" />
                </div>
                <StatusBadgeIntel status="active" />
              </div>
              <h3 className="text-base font-bold text-white mb-1">Audit Trail Monitor</h3>
              <p className="text-xs text-white/50 leading-relaxed mb-1">
                Last {auditEntries.length} entries from <code className="text-[#48FF73]/70">audit_logs</code>. Real-time.
              </p>

              {showAudit && (
                <div className="mt-3 space-y-1.5 max-h-64 overflow-y-auto pr-1">
                  {auditLoading ? <MiniLoader /> : auditEntries.length === 0 ? <EmptyState text="No audit entries yet" /> : (
                    auditEntries.map((entry) => (
                      <div key={entry.id} className="flex items-center gap-3 bg-white/[0.04] rounded-lg px-3 py-2 border border-white/[0.06] hover:bg-white/[0.07] transition-colors">
                        <div className="p-1.5 rounded-lg bg-white/[0.06]">
                          <User className="w-3 h-3 text-white/40" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-bold text-white/80">{entry.entity_type}</span>
                            <span className="text-[10px] text-white/30">→</span>
                            <span className="text-[11px] text-white/60 truncate">{entry.action_type}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] font-mono text-[#48FF73]/60">{entry.entity_id?.substring(0, 8) || "—"}</span>
                            <span className="text-[9px] text-white/25">{new Date(entry.created_at).toLocaleString("en-GB", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              <button onClick={() => setShowAudit(!showAudit)} className="w-full sm:w-auto mt-4 flex items-center justify-center gap-2 bg-[#48FF73] text-black font-bold text-xs px-6 py-2.5 rounded-full hover:scale-[0.97] active:scale-[0.94] transition-transform duration-200 shadow-[0_0_20px_rgba(72,255,115,0.2)]">
                <Eye className="w-3.5 h-3.5" />
                {showAudit ? "Hide Audit Log" : "View Audit Log"}
              </button>
            </GlassCard>
          </div>
        </div>

        {/* Footer CTA */}
        <div className="mt-8 sm:mt-10 flex justify-center">
          <button className="bg-[#48FF73] text-black font-bold text-sm px-8 py-3 rounded-full hover:scale-95 active:scale-90 transition-transform duration-200 shadow-[0_0_30px_rgba(72,255,115,0.3)] hover:shadow-[0_0_50px_rgba(72,255,115,0.5)]">
            Generate Full Report
          </button>
        </div>
      </div>

      {/* PIN Verification Modal for Period Lock */}
      <TransactionAuthModal
        open={pinModalOpen}
        onClose={() => { setPinModalOpen(false); pendingLockAction.current = null; }}
        onAuthorized={handlePinAuthorized}
      />
    </div>
  );
};

export default AccountingDashboard;
