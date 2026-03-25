import { useState, useMemo, useCallback } from "react";
import {
  Landmark,
  TrendingUp,
  TrendingDown,
  Wallet,
  Scale,
  BarChart3,
  FileSpreadsheet,
  ArrowLeft,
  Sparkles,
  BookOpen,
  Network,
  PiggyBank,
  Lock,
  ShieldCheck,
  Settings,
  Eye,
  Play,
  ChevronRight,
  ChevronDown,
  Plus,
  Trash2,
  LockOpen,
  Clock,
  User,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

const fmt = (n: number) => `৳${n.toLocaleString("en-IN")}`;

const metrics = [
  { label: "Total Assets", value: 1250000, icon: Landmark, change: "+12.4%" },
  { label: "Total Liabilities", value: 420000, icon: TrendingDown, change: "-3.1%" },
  { label: "Net Profit", value: 230000, icon: TrendingUp, change: "+18.7%" },
  { label: "Cash Balance", value: 310000, icon: Wallet, change: "+5.2%" },
];

const trialRows = [
  { name: "Cash", debit: 300000, credit: 0 },
  { name: "Loans Receivable", debit: 500000, credit: 0 },
  { name: "Equipment", debit: 150000, credit: 0 },
  { name: "Investor Capital", debit: 0, credit: 400000 },
  { name: "Owner Equity", debit: 0, credit: 320000 },
  { name: "Revenue", debit: 0, credit: 230000 },
];

const income = [
  { name: "Loan Interest", amount: 150000 },
  { name: "Processing Fees", amount: 30000 },
  { name: "Penalty Income", amount: 25000 },
  { name: "Other Income", amount: 25000 },
];

const expenses = [
  { name: "Staff Salary", amount: 50000 },
  { name: "Office Rent", amount: 20000 },
  { name: "Utilities", amount: 8000 },
  { name: "Marketing", amount: 12000 },
];

const assets = [
  { name: "Cash & Bank", amount: 310000 },
  { name: "Loans Receivable", amount: 500000 },
  { name: "Equipment", amount: 150000 },
  { name: "Other Assets", amount: 290000 },
];

const liabilitiesEquity = [
  { name: "Investor Capital", amount: 400000 },
  { name: "Owner Equity", amount: 320000 },
  { name: "Retained Earnings", amount: 230000 },
  { name: "Accounts Payable", amount: 300000 },
];

const GlassCard = ({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <div
    className={`relative bg-white/[0.07] backdrop-blur-xl border border-white/[0.15] rounded-2xl shadow-2xl p-6 transition-all duration-500 hover:bg-white/[0.12] hover:border-white/[0.25] hover:shadow-[0_8px_40px_rgba(72,255,115,0.08)] group ${className}`}
  >
    {/* Corner glow */}
    <div className="absolute -top-px -left-px w-20 h-20 bg-gradient-to-br from-white/20 to-transparent rounded-tl-2xl pointer-events-none opacity-60 group-hover:opacity-100 transition-opacity duration-500" />
    {children}
  </div>
);

// ═══════════════════════════════════════
// TYPES & MOCK DATA for Intelligence Layer
// ═══════════════════════════════════════

interface JournalRule {
  id: string;
  trigger_type: string;
  debit_account: string;
  credit_account: string;
  description: string;
}

interface CoaNode {
  id: string;
  code: string;
  name: string;
  account_type: string;
  parent_id: string | null;
  children: CoaNode[];
}

interface AuditEntry {
  id: string;
  user: string;
  action: string;
  timestamp: string;
  entity: string;
}

const INITIAL_RULES: JournalRule[] = [
  { id: "r1", trigger_type: "loan_disbursement", debit_account: "LOAN_RECEIVABLE", credit_account: "CASH", description: "Loan disbursement creates receivable" },
  { id: "r2", trigger_type: "emi_payment", debit_account: "CASH", credit_account: "LOAN_RECEIVABLE", description: "EMI payment reduces receivable" },
  { id: "r3", trigger_type: "penalty_income", debit_account: "CASH", credit_account: "PENALTY_INCOME", description: "Late penalty credited as income" },
  { id: "r4", trigger_type: "interest_income", debit_account: "CASH", credit_account: "INTEREST_INCOME", description: "Interest earned on loans" },
  { id: "r5", trigger_type: "savings_deposit", debit_account: "CASH", credit_account: "SAVINGS_LIABILITY", description: "Member savings deposit" },
];

const MOCK_COA: Omit<CoaNode, "children">[] = [
  { id: "a1", code: "ASSETS", name: "Assets", account_type: "asset", parent_id: null },
  { id: "a2", code: "CASH", name: "Cash on Hand", account_type: "asset", parent_id: "a1" },
  { id: "a3", code: "LOAN_RECEIVABLE", name: "Loan Receivable", account_type: "asset", parent_id: "a1" },
  { id: "a4", code: "BANK_BALANCE", name: "Bank Balance", account_type: "asset", parent_id: "a1" },
  { id: "l1", code: "LIABILITIES", name: "Liabilities", account_type: "liability", parent_id: null },
  { id: "l2", code: "SAVINGS_LIABILITY", name: "Savings Liability", account_type: "liability", parent_id: "l1" },
  { id: "l3", code: "INSURANCE_PAYABLE", name: "Insurance Payable", account_type: "liability", parent_id: "l1" },
  { id: "l4", code: "INVESTOR_CAPITAL", name: "Investor Capital", account_type: "liability", parent_id: "l1" },
  { id: "e1", code: "EQUITY", name: "Equity", account_type: "equity", parent_id: null },
  { id: "e2", code: "OWNER_EQUITY", name: "Owner Equity", account_type: "equity", parent_id: "e1" },
  { id: "e3", code: "RETAINED_EARNINGS", name: "Retained Earnings", account_type: "equity", parent_id: "e1" },
  { id: "i1", code: "INCOME", name: "Income", account_type: "income", parent_id: null },
  { id: "i2", code: "INTEREST_INCOME", name: "Loan Interest Income", account_type: "income", parent_id: "i1" },
  { id: "i3", code: "PENALTY_INCOME", name: "Penalty Income", account_type: "income", parent_id: "i1" },
  { id: "i4", code: "FEE_INCOME", name: "Fee Income", account_type: "income", parent_id: "i1" },
  { id: "x1", code: "EXPENSES", name: "Expenses", account_type: "expense", parent_id: null },
  { id: "x2", code: "SALARY_EXPENSE", name: "Salary Expense", account_type: "expense", parent_id: "x1" },
  { id: "x3", code: "OFFICE_EXPENSE", name: "Office Expense", account_type: "expense", parent_id: "x1" },
];

const MOCK_PNL = { totalIncome: 230000, totalExpense: 90000, netProfit: 140000 };
const PREVIOUS_RETAINED = 85000;

const MOCK_AUDIT: AuditEntry[] = [
  { id: "au1", user: "Admin", action: "Created journal rule", timestamp: "2026-03-25 13:42", entity: "loan_disbursement" },
  { id: "au2", user: "Treasurer", action: "Approved transaction", timestamp: "2026-03-25 13:30", entity: "TXN-00482" },
  { id: "au3", user: "Admin", action: "Locked period", timestamp: "2026-03-25 12:15", entity: "2026-02" },
  { id: "au4", user: "System", action: "Auto penalty applied", timestamp: "2026-03-25 11:00", entity: "LN-0091" },
  { id: "au5", user: "Field Officer", action: "Submitted collection", timestamp: "2026-03-25 10:45", entity: "TXN-00481" },
  { id: "au6", user: "Admin", action: "Added CoA account", timestamp: "2026-03-24 16:30", entity: "PROVISION_EXPENSE" },
  { id: "au7", user: "Treasurer", action: "Reversed entry", timestamp: "2026-03-24 15:00", entity: "TXN-00479" },
  { id: "au8", user: "System", action: "Daily reconciliation", timestamp: "2026-03-24 00:05", entity: "SYSTEM" },
  { id: "au9", user: "Admin", action: "Updated interest rate", timestamp: "2026-03-23 14:20", entity: "tenant_rules" },
  { id: "au10", user: "System", action: "Investor profit calc", timestamp: "2026-03-23 00:05", entity: "MONTHLY_CRON" },
];

const TYPE_COLORS: Record<string, string> = {
  asset: "text-blue-300",
  liability: "text-orange-300",
  equity: "text-purple-300",
  income: "text-[#48FF73]",
  expense: "text-red-300",
};

// ═══════════════════════════════════════
// TREE BUILDER UTILITY
// ═══════════════════════════════════════

function buildTree(flat: Omit<CoaNode, "children">[]): CoaNode[] {
  try {
    const map = new Map<string, CoaNode>();
    const roots: CoaNode[] = [];
    for (const item of flat) {
      map.set(item.id, { ...item, children: [] });
    }
    for (const node of map.values()) {
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
// TREE NODE COMPONENT
// ═══════════════════════════════════════

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
        <span className={`text-[11px] font-mono ${TYPE_COLORS[node.account_type] ?? "text-white/70"}`}>
          {node.code}
        </span>
        <span className="text-xs text-white/80 truncate">{node.name}</span>
      </button>
      {expanded && hasChildren && node.children.map((child) => (
        <TreeNode key={child.id} node={child} depth={depth + 1} />
      ))}
    </div>
  );
};

// ═══════════════════════════════════════
// STATUS BADGE COMPONENT
// ═══════════════════════════════════════

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

// ═══════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════

const AccountingDashboard = () => {
  const navigate = useNavigate();

  // ── Intelligence Layer State ──
  const [rules, setRules] = useState<JournalRule[]>(INITIAL_RULES);
  const [showRules, setShowRules] = useState(false);
  const [showTree, setShowTree] = useState(false);
  const [showAudit, setShowAudit] = useState(false);
  const [lockedPeriods, setLockedPeriods] = useState<string[]>(["2026-01", "2026-02"]);
  const [showPeriods, setShowPeriods] = useState(false);
  const [showRetained, setShowRetained] = useState(false);

  // ── Derived calculations ──
  const totalDebit = trialRows.reduce((s, r) => s + r.debit, 0);
  const totalCredit = trialRows.reduce((s, r) => s + r.credit, 0);
  const totalIncome = income.reduce((s, r) => s + r.amount, 0);
  const totalExpense = expenses.reduce((s, r) => s + r.amount, 0);
  const netProfit = totalIncome - totalExpense;
  const totalAssets = assets.reduce((s, r) => s + r.amount, 0);
  const totalLiabEq = liabilitiesEquity.reduce((s, r) => s + r.amount, 0);

  // ── Intelligence derived status ──
  const rulesStatus = useMemo<"active" | "warning">(() => {
    try { return rules.length < 3 ? "warning" : "active"; } catch { return "warning"; }
  }, [rules]);

  const periodStatus = useMemo<"active" | "locked">(() => {
    try { return lockedPeriods.length > 0 ? "locked" : "active"; } catch { return "active"; }
  }, [lockedPeriods]);

  const retainedEarnings = useMemo(() => {
    try { return PREVIOUS_RETAINED + MOCK_PNL.netProfit; } catch { return 0; }
  }, []);

  const coaTree = useMemo(() => buildTree(MOCK_COA), []);

  // ── Actions ──
  const addRule = useCallback(() => {
    try {
      const newRule: JournalRule = {
        id: `r${Date.now()}`,
        trigger_type: "new_rule",
        debit_account: "CASH",
        credit_account: "FEE_INCOME",
        description: "New custom rule (edit me)",
      };
      setRules((prev) => [...prev, newRule]);
    } catch { /* silent */ }
  }, []);

  const removeRule = useCallback((id: string) => {
    try { setRules((prev) => prev.filter((r) => r.id !== id)); } catch { /* silent */ }
  }, []);

  const lockPeriod = useCallback((month: string) => {
    try { setLockedPeriods((prev) => prev.includes(month) ? prev : [...prev, month].sort()); } catch { /* silent */ }
  }, []);

  const unlockPeriod = useCallback((month: string) => {
    try { setLockedPeriods((prev) => prev.filter((p) => p !== month)); } catch { /* silent */ }
  }, []);

  // Available months for locking
  const availableMonths = useMemo(() => {
    try {
      const months: string[] = [];
      for (let m = 1; m <= 3; m++) {
        months.push(`2026-${String(m).padStart(2, "0")}`);
      }
      return months;
    } catch { return []; }
  }, []);

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Animated gradient mesh background */}
      <div className="fixed inset-0 -z-10">
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(135deg, #0052D4 0%, #4364F7 40%, #6FB1FC 70%, #0052D4 100%)",
            backgroundSize: "400% 400%",
            animation: "meshMove 30s ease infinite",
          }}
        />
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 50%, rgba(72,255,115,0.15) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(99,102,241,0.2) 0%, transparent 50%), radial-gradient(circle at 50% 80%, rgba(72,255,115,0.1) 0%, transparent 50%)",
          }}
        />
      </div>

      {/* Mesh animation keyframes */}
      <style>{`@keyframes meshMove{0%,100%{background-position:0% 50%}50%{background-position:100% 50%}}`}</style>

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10 pb-28">
        {/* Back button */}
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-white/60 hover:text-white text-xs mb-6 transition-colors duration-200"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        {/* Page header */}
        <div className="text-center mb-8 sm:mb-12">
          <div className="inline-flex items-center gap-2 bg-white/[0.08] backdrop-blur-xl border border-white/[0.15] rounded-full px-5 py-2 mb-4">
            <Sparkles className="w-4 h-4 text-[#48FF73]" />
            <span className="text-[11px] font-semibold text-white/80 uppercase tracking-widest">
              Accounting Engine
            </span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Accounting Engine
          </h1>
          <p className="text-sm text-white/60 mt-2">
            Real-time financial intelligence
          </p>
        </div>

        {/* Top metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {metrics.map((m, i) => (
            <GlassCard key={i} className="!p-4 sm:!p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="p-2 rounded-xl bg-white/[0.08] border border-white/[0.1]">
                  <m.icon className="w-4 h-4 text-[#48FF73]" />
                </div>
                <span className="text-[10px] font-bold text-[#48FF73]">
                  {m.change}
                </span>
              </div>
              <p className="text-[11px] text-white/50 mb-1">{m.label}</p>
              <p className="text-lg sm:text-xl font-extrabold text-white font-mono">
                {fmt(m.value)}
              </p>
            </GlassCard>
          ))}
        </div>

        {/* Main accounting sections */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-6">
          {/* Trial Balance */}
          <GlassCard>
            <div className="flex items-center gap-2 mb-5">
              <Scale className="w-4 h-4 text-[#48FF73]" />
              <h2 className="text-sm font-bold text-white">Trial Balance</h2>
            </div>
            <div className="space-y-0">
              <div className="flex justify-between text-[10px] font-bold text-white/40 uppercase tracking-wider pb-2 border-b border-white/10 mb-1">
                <span>Account</span>
                <div className="flex gap-6">
                  <span>Debit</span>
                  <span>Credit</span>
                </div>
              </div>
              {trialRows.map((r, i) => (
                <div
                  key={i}
                  className="flex justify-between items-center py-1.5 hover:bg-white/5 rounded-lg px-2 transition-colors duration-200"
                >
                  <span className="text-[12px] text-white/80">{r.name}</span>
                  <div className="flex gap-4">
                    <span className="text-[12px] font-mono font-semibold text-white/90 w-20 text-right">
                      {r.debit ? fmt(r.debit) : "—"}
                    </span>
                    <span className="text-[12px] font-mono font-semibold text-white/90 w-20 text-right">
                      {r.credit ? fmt(r.credit) : "—"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-white/10 flex justify-between items-center px-2">
              <span className="text-xs font-bold text-white">Total</span>
              <div className="flex gap-4">
                <span className="text-xs font-mono font-extrabold text-[#48FF73] w-20 text-right">
                  {fmt(totalDebit)}
                </span>
                <span className="text-xs font-mono font-extrabold text-[#48FF73] w-20 text-right">
                  {fmt(totalCredit)}
                </span>
              </div>
            </div>
            {totalDebit === totalCredit && (
              <div className="mt-3 flex items-center gap-2 bg-[#48FF73]/10 text-[#48FF73] text-[10px] font-bold px-3 py-1.5 rounded-lg">
                <span className="w-1.5 h-1.5 rounded-full bg-[#48FF73] animate-pulse" />
                Balanced ✓
              </div>
            )}
          </GlassCard>

          {/* Profit & Loss */}
          <GlassCard>
            <div className="flex items-center gap-2 mb-5">
              <BarChart3 className="w-4 h-4 text-[#48FF73]" />
              <h2 className="text-sm font-bold text-white">Profit & Loss</h2>
            </div>
            <div className="mb-4">
              <p className="text-[10px] font-bold text-white/40 uppercase tracking-wider mb-2">
                Income
              </p>
              {income.map((r, i) => (
                <div
                  key={i}
                  className="flex justify-between items-center py-1.5 hover:bg-white/5 rounded-lg px-2 transition-colors duration-200"
                >
                  <span className="text-[12px] text-white/80">{r.name}</span>
                  <span className="text-[12px] font-mono font-semibold text-[#48FF73]">
                    {fmt(r.amount)}
                  </span>
                </div>
              ))}
            </div>
            <div className="mb-4">
              <p className="text-[10px] font-bold text-white/40 uppercase tracking-wider mb-2">
                Expenses
              </p>
              {expenses.map((r, i) => (
                <div
                  key={i}
                  className="flex justify-between items-center py-1.5 hover:bg-white/5 rounded-lg px-2 transition-colors duration-200"
                >
                  <span className="text-[12px] text-white/80">{r.name}</span>
                  <span className="text-[12px] font-mono font-semibold text-red-300">
                    {fmt(r.amount)}
                  </span>
                </div>
              ))}
            </div>
            <div className="pt-3 border-t border-white/10 flex justify-between items-center px-2">
              <span className="text-xs font-bold text-white">Net Profit</span>
              <span className="text-sm font-mono font-extrabold text-[#48FF73]">
                {fmt(netProfit)}
              </span>
            </div>
          </GlassCard>

          {/* Balance Sheet */}
          <GlassCard>
            <div className="flex items-center gap-2 mb-5">
              <FileSpreadsheet className="w-4 h-4 text-[#48FF73]" />
              <h2 className="text-sm font-bold text-white">Balance Sheet</h2>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[10px] font-bold text-white/40 uppercase tracking-wider mb-2">
                  Assets
                </p>
                {assets.map((r, i) => (
                  <div
                    key={i}
                    className="flex justify-between items-center py-1.5 hover:bg-white/5 rounded-lg px-2 transition-colors duration-200"
                  >
                    <span className="text-[12px] text-white/80">{r.name}</span>
                    <span className="text-[12px] font-mono font-semibold text-white/90">
                      {fmt(r.amount)}
                    </span>
                  </div>
                ))}
                <div className="mt-3 pt-3 border-t border-white/10 flex justify-between items-center px-2">
                  <span className="text-xs font-bold text-white">Total</span>
                  <span className="text-sm font-mono font-extrabold text-[#48FF73]">
                    {fmt(totalAssets)}
                  </span>
                </div>
              </div>
              <div>
                <p className="text-[10px] font-bold text-white/40 uppercase tracking-wider mb-2">
                  Liabilities + Equity
                </p>
                {liabilitiesEquity.map((r, i) => (
                  <div
                    key={i}
                    className="flex justify-between items-center py-1.5 hover:bg-white/5 rounded-lg px-2 transition-colors duration-200"
                  >
                    <span className="text-[12px] text-white/80">{r.name}</span>
                    <span className="text-[12px] font-mono font-semibold text-white/90">
                      {fmt(r.amount)}
                    </span>
                  </div>
                ))}
                <div className="mt-3 pt-3 border-t border-white/10 flex justify-between items-center px-2">
                  <span className="text-xs font-bold text-white">Total</span>
                  <span className="text-sm font-mono font-extrabold text-[#48FF73]">
                    {fmt(totalLiabEq)}
                  </span>
                </div>
              </div>
            </div>
            {totalAssets === totalLiabEq && (
              <div className="mt-5 flex items-center gap-2 bg-[#48FF73]/10 text-[#48FF73] text-xs font-bold px-3 py-2 rounded-lg">
                <span className="w-2 h-2 rounded-full bg-[#48FF73] animate-pulse" />
                Assets = Liabilities + Equity ✓
              </div>
            )}
          </GlassCard>
        </div>

        {/* ═══════════════════════════════════════ */}
        {/* FINANCIAL INTELLIGENCE LAYER            */}
        {/* ═══════════════════════════════════════ */}
        <div className="mt-12 sm:mt-16">
          {/* Section Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 bg-white/[0.08] backdrop-blur-xl border border-white/[0.15] rounded-full px-5 py-2 mb-4">
              <ShieldCheck className="w-4 h-4 text-[#48FF73]" />
              <span className="text-[11px] font-semibold text-white/80 uppercase tracking-widest">
                Intelligence Layer
              </span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Financial Intelligence Layer
            </h2>
            <p className="text-sm text-white/60 mt-2 max-w-md mx-auto">
              Autonomous Control & Audit System
            </p>
          </div>

          {/* Intelligence Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

            {/* ─── 1. Journal Rules Engine ─── */}
            <GlassCard>
              <div className="flex items-start justify-between mb-4">
                <div className="p-2.5 rounded-xl bg-white/[0.08] border border-white/[0.1]">
                  <BookOpen className="w-5 h-5 text-[#48FF73]" />
                </div>
                <StatusBadgeIntel status={rulesStatus} />
              </div>
              <h3 className="text-base font-bold text-white mb-1">Journal Rules Engine</h3>
              <p className="text-xs text-white/50 leading-relaxed mb-1">
                {rules.length} active rules. Auto-maps transactions to double-entry journals.
              </p>

              {showRules && (
                <div className="mt-3 space-y-2 max-h-52 overflow-y-auto pr-1">
                  {rules.map((rule) => (
                    <div key={rule.id} className="flex items-center justify-between bg-white/[0.05] rounded-lg px-3 py-2 border border-white/[0.08]">
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-mono font-bold text-[#48FF73] truncate">{rule.trigger_type}</p>
                        <p className="text-[10px] text-white/40">
                          DR: {rule.debit_account} → CR: {rule.credit_account}
                        </p>
                      </div>
                      <button
                        onClick={() => removeRule(rule.id)}
                        className="ml-2 p-1 rounded hover:bg-red-400/20 transition-colors"
                      >
                        <Trash2 className="w-3 h-3 text-red-300/60 hover:text-red-300" />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={addRule}
                    className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-white/20 text-white/40 hover:text-white/70 hover:border-white/30 text-[10px] transition-colors"
                  >
                    <Plus className="w-3 h-3" /> Add Rule
                  </button>
                </div>
              )}

              <button
                onClick={() => setShowRules(!showRules)}
                className="w-full mt-4 flex items-center justify-center gap-2 bg-[#48FF73] text-black font-bold text-xs px-4 py-2.5 rounded-full hover:scale-[0.97] active:scale-[0.94] transition-transform duration-200 shadow-[0_0_20px_rgba(72,255,115,0.2)]"
              >
                <Settings className="w-3.5 h-3.5" />
                {showRules ? "Hide Rules" : "Configure"}
              </button>
            </GlassCard>

            {/* ─── 2. Account Hierarchy Tree ─── */}
            <GlassCard>
              <div className="flex items-start justify-between mb-4">
                <div className="p-2.5 rounded-xl bg-white/[0.08] border border-white/[0.1]">
                  <Network className="w-5 h-5 text-[#48FF73]" />
                </div>
                <StatusBadgeIntel status="active" />
              </div>
              <h3 className="text-base font-bold text-white mb-1">Account Hierarchy Tree</h3>
              <p className="text-xs text-white/50 leading-relaxed mb-1">
                {MOCK_COA.length} accounts across 5 categories. Expandable parent-child view.
              </p>

              {showTree && (
                <div className="mt-3 max-h-60 overflow-y-auto pr-1 border border-white/[0.08] rounded-lg bg-white/[0.03] py-2">
                  {coaTree.map((root) => (
                    <TreeNode key={root.id} node={root} />
                  ))}
                </div>
              )}

              <button
                onClick={() => setShowTree(!showTree)}
                className="w-full mt-4 flex items-center justify-center gap-2 bg-[#48FF73] text-black font-bold text-xs px-4 py-2.5 rounded-full hover:scale-[0.97] active:scale-[0.94] transition-transform duration-200 shadow-[0_0_20px_rgba(72,255,115,0.2)]"
              >
                <Eye className="w-3.5 h-3.5" />
                {showTree ? "Hide Tree" : "View"}
              </button>
            </GlassCard>

            {/* ─── 3. Retained Earnings Control ─── */}
            <GlassCard>
              <div className="flex items-start justify-between mb-4">
                <div className="p-2.5 rounded-xl bg-white/[0.08] border border-white/[0.1]">
                  <PiggyBank className="w-5 h-5 text-[#48FF73]" />
                </div>
                <StatusBadgeIntel status={retainedEarnings > 0 ? "active" : "warning"} />
              </div>
              <h3 className="text-base font-bold text-white mb-1">Retained Earnings Control</h3>
              <p className="text-xs text-white/50 leading-relaxed mb-1">
                Auto-calculates from previous retained + current net profit.
              </p>

              {showRetained && (
                <div className="mt-3 space-y-2">
                  <div className="flex justify-between items-center bg-white/[0.05] rounded-lg px-3 py-2.5 border border-white/[0.08]">
                    <span className="text-[11px] text-white/60">Previous Retained</span>
                    <span className="text-xs font-mono font-bold text-white/80">{fmt(PREVIOUS_RETAINED)}</span>
                  </div>
                  <div className="flex justify-between items-center bg-white/[0.05] rounded-lg px-3 py-2.5 border border-white/[0.08]">
                    <span className="text-[11px] text-white/60">+ Net Profit (P&L)</span>
                    <span className="text-xs font-mono font-bold text-[#48FF73]">{fmt(MOCK_PNL.netProfit)}</span>
                  </div>
                  <div className="flex justify-between items-center bg-[#48FF73]/10 rounded-lg px-3 py-3 border border-[#48FF73]/20">
                    <span className="text-xs font-bold text-white">= Retained Earnings</span>
                    <span className="text-sm font-mono font-extrabold text-[#48FF73]">{fmt(retainedEarnings)}</span>
                  </div>
                  <div className="text-[10px] text-white/30 text-center mt-1">
                    {fmt(PREVIOUS_RETAINED)} + {fmt(MOCK_PNL.netProfit)} = {fmt(retainedEarnings)}
                  </div>
                </div>
              )}

              <button
                onClick={() => setShowRetained(!showRetained)}
                className="w-full mt-4 flex items-center justify-center gap-2 bg-[#48FF73] text-black font-bold text-xs px-4 py-2.5 rounded-full hover:scale-[0.97] active:scale-[0.94] transition-transform duration-200 shadow-[0_0_20px_rgba(72,255,115,0.2)]"
              >
                <Play className="w-3.5 h-3.5" />
                {showRetained ? "Hide" : "Run"}
              </button>
            </GlassCard>

            {/* ─── 4. Period Lock System ─── */}
            <GlassCard>
              <div className="flex items-start justify-between mb-4">
                <div className="p-2.5 rounded-xl bg-white/[0.08] border border-white/[0.1]">
                  <Lock className="w-5 h-5 text-[#48FF73]" />
                </div>
                <StatusBadgeIntel status={periodStatus} />
              </div>
              <h3 className="text-base font-bold text-white mb-1">Period Lock System</h3>
              <p className="text-xs text-white/50 leading-relaxed mb-1">
                {lockedPeriods.length} period{lockedPeriods.length !== 1 ? "s" : ""} locked. Prevents retroactive ledger changes.
              </p>

              {showPeriods && (
                <div className="mt-3 space-y-2">
                  {availableMonths.map((month) => {
                    const isLocked = lockedPeriods.includes(month);
                    return (
                      <div key={month} className="flex items-center justify-between bg-white/[0.05] rounded-lg px-3 py-2.5 border border-white/[0.08]">
                        <div className="flex items-center gap-2">
                          <Clock className="w-3.5 h-3.5 text-white/40" />
                          <span className="text-xs font-mono text-white/80">{month}</span>
                        </div>
                        <button
                          onClick={() => isLocked ? unlockPeriod(month) : lockPeriod(month)}
                          className={`flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full transition-all duration-200 ${
                            isLocked
                              ? "bg-red-400/15 text-red-300 hover:bg-red-400/25"
                              : "bg-[#48FF73]/15 text-[#48FF73] hover:bg-[#48FF73]/25"
                          }`}
                        >
                          {isLocked ? <><LockOpen className="w-3 h-3" /> Unlock</> : <><Lock className="w-3 h-3" /> Lock</>}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              <button
                onClick={() => setShowPeriods(!showPeriods)}
                className="w-full mt-4 flex items-center justify-center gap-2 bg-[#48FF73] text-black font-bold text-xs px-4 py-2.5 rounded-full hover:scale-[0.97] active:scale-[0.94] transition-transform duration-200 shadow-[0_0_20px_rgba(72,255,115,0.2)]"
              >
                <Settings className="w-3.5 h-3.5" />
                {showPeriods ? "Hide" : "Configure"}
              </button>
            </GlassCard>

            {/* ─── 5. Audit Trail Monitor ─── */}
            <GlassCard className="md:col-span-2">
              <div className="flex items-start justify-between mb-4">
                <div className="p-2.5 rounded-xl bg-white/[0.08] border border-white/[0.1]">
                  <ShieldCheck className="w-5 h-5 text-[#48FF73]" />
                </div>
                <StatusBadgeIntel status="active" />
              </div>
              <h3 className="text-base font-bold text-white mb-1">Audit Trail Monitor</h3>
              <p className="text-xs text-white/50 leading-relaxed mb-1">
                Last {MOCK_AUDIT.length} activities. SHA-256 hash-chained, append-only.
              </p>

              {showAudit && (
                <div className="mt-3 space-y-1.5 max-h-64 overflow-y-auto pr-1">
                  {MOCK_AUDIT.map((entry) => (
                    <div key={entry.id} className="flex items-center gap-3 bg-white/[0.04] rounded-lg px-3 py-2 border border-white/[0.06] hover:bg-white/[0.07] transition-colors">
                      <div className="p-1.5 rounded-lg bg-white/[0.06]">
                        <User className="w-3 h-3 text-white/40" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-bold text-white/80">{entry.user}</span>
                          <span className="text-[10px] text-white/30">→</span>
                          <span className="text-[11px] text-white/60 truncate">{entry.action}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] font-mono text-[#48FF73]/60">{entry.entity}</span>
                          <span className="text-[9px] text-white/25">{entry.timestamp}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <button
                onClick={() => setShowAudit(!showAudit)}
                className="w-full sm:w-auto mt-4 flex items-center justify-center gap-2 bg-[#48FF73] text-black font-bold text-xs px-6 py-2.5 rounded-full hover:scale-[0.97] active:scale-[0.94] transition-transform duration-200 shadow-[0_0_20px_rgba(72,255,115,0.2)]"
              >
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
    </div>
  );
};

export default AccountingDashboard;
