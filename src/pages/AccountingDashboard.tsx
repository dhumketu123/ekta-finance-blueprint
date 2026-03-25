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

const AccountingDashboard = () => {
  const navigate = useNavigate();
  const totalDebit = trialRows.reduce((s, r) => s + r.debit, 0);
  const totalCredit = trialRows.reduce((s, r) => s + r.credit, 0);
  const totalIncome = income.reduce((s, r) => s + r.amount, 0);
  const totalExpense = expenses.reduce((s, r) => s + r.amount, 0);
  const netProfit = totalIncome - totalExpense;
  const totalAssets = assets.reduce((s, r) => s + r.amount, 0);
  const totalLiabEq = liabilitiesEquity.reduce((s, r) => s + r.amount, 0);

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
            background:
              "radial-gradient(ellipse at 20% 50%, rgba(72,255,115,0.15) 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, rgba(99,179,237,0.2) 0%, transparent 50%), radial-gradient(ellipse at 50% 80%, rgba(139,92,246,0.1) 0%, transparent 50%)",
          }}
        />
        {/* Subtle grid overlay */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />
      </div>

      <style>{`
        @keyframes meshMove {
          0%, 100% { background-position: 0% 50%; }
          25% { background-position: 100% 0%; }
          50% { background-position: 100% 100%; }
          75% { background-position: 0% 100%; }
        }
      `}</style>

      {/* Content */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-10 pb-28">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8 sm:mb-12">
          <button
            onClick={() => navigate(-1)}
            className="flex-shrink-0 w-11 h-11 rounded-xl bg-white/10 backdrop-blur border border-white/20 flex items-center justify-center hover:bg-white/20 transition-all duration-300 active:scale-95"
          >
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <div>
            <div className="flex items-center gap-2.5">
              <Sparkles className="w-6 h-6 text-[#48FF73]" />
              <h1 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight">
                Accounting Engine
              </h1>
            </div>
            <p className="text-white/60 text-sm sm:text-base mt-1 ml-8 sm:ml-9">
              Real-time financial intelligence
            </p>
          </div>
        </div>

        {/* Metric Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5 mb-8 sm:mb-10">
          {metrics.map((m, i) => (
            <GlassCard key={i} className="!p-4 sm:!p-6">
              <div className="flex items-start justify-between mb-3">
                <div className="p-2 sm:p-2.5 rounded-xl bg-white/10 group-hover:bg-[#48FF73]/20 transition-colors duration-500">
                  <m.icon className="w-4 h-4 sm:w-5 sm:h-5 text-[#48FF73]" />
                </div>
                <span className="text-[10px] sm:text-xs font-bold text-[#48FF73] bg-[#48FF73]/10 px-2 py-0.5 rounded-full">
                  {m.change}
                </span>
              </div>
              <p className="text-[10px] sm:text-xs font-semibold text-white/50 uppercase tracking-widest mb-1">
                {m.label}
              </p>
              <p className="text-lg sm:text-2xl lg:text-3xl font-extrabold text-white tracking-tight">
                {fmt(m.value)}
              </p>
            </GlassCard>
          ))}
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 sm:gap-6">
          {/* Trial Balance */}
          <GlassCard className="lg:col-span-1">
            <div className="flex items-center gap-2.5 mb-5">
              <Scale className="w-5 h-5 text-[#48FF73]" />
              <h2 className="text-lg font-bold text-white">Trial Balance</h2>
            </div>
            <div className="overflow-x-auto -mx-6 px-6">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left text-[11px] font-semibold text-white/40 uppercase tracking-wider pb-3">
                      Account
                    </th>
                    <th className="text-right text-[11px] font-semibold text-white/40 uppercase tracking-wider pb-3">
                      Debit
                    </th>
                    <th className="text-right text-[11px] font-semibold text-white/40 uppercase tracking-wider pb-3">
                      Credit
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {trialRows.map((r, i) => (
                    <tr
                      key={i}
                      className="border-b border-white/5 hover:bg-white/5 transition-colors duration-200"
                    >
                      <td className="py-2.5 text-white/90 font-medium text-[13px]">
                        {r.name}
                      </td>
                      <td className="py-2.5 text-right font-mono text-[13px] text-white/80">
                        {r.debit > 0 ? fmt(r.debit) : "—"}
                      </td>
                      <td className="py-2.5 text-right font-mono text-[13px] text-white/80">
                        {r.credit > 0 ? fmt(r.credit) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-[#48FF73]/30">
                    <td className="pt-3 text-white font-extrabold text-sm">
                      Total
                    </td>
                    <td className="pt-3 text-right font-mono font-extrabold text-sm text-[#48FF73]">
                      {fmt(totalDebit)}
                    </td>
                    <td className="pt-3 text-right font-mono font-extrabold text-sm text-[#48FF73]">
                      {fmt(totalCredit)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            {totalDebit === totalCredit && (
              <div className="mt-4 flex items-center gap-2 bg-[#48FF73]/10 text-[#48FF73] text-xs font-bold px-3 py-2 rounded-lg">
                <span className="w-2 h-2 rounded-full bg-[#48FF73] animate-pulse" />
                Balanced ✓
              </div>
            )}
          </GlassCard>

          {/* Profit & Loss */}
          <GlassCard className="lg:col-span-1">
            <div className="flex items-center gap-2.5 mb-5">
              <BarChart3 className="w-5 h-5 text-[#48FF73]" />
              <h2 className="text-lg font-bold text-white">Profit & Loss</h2>
            </div>

            {/* Income */}
            <p className="text-[11px] font-semibold text-white/40 uppercase tracking-widest mb-2">
              Income
            </p>
            <div className="space-y-1.5 mb-4">
              {income.map((r, i) => (
                <div
                  key={i}
                  className="flex justify-between items-center py-1.5 px-3 rounded-lg hover:bg-white/5 transition-colors duration-200"
                >
                  <span className="text-[13px] text-white/80">{r.name}</span>
                  <span className="text-[13px] font-mono font-semibold text-[#48FF73]">
                    {fmt(r.amount)}
                  </span>
                </div>
              ))}
              <div className="flex justify-between items-center py-2 px-3 border-t border-white/10">
                <span className="text-sm font-bold text-white">
                  Total Income
                </span>
                <span className="text-sm font-mono font-extrabold text-[#48FF73]">
                  {fmt(totalIncome)}
                </span>
              </div>
            </div>

            {/* Expenses */}
            <p className="text-[11px] font-semibold text-white/40 uppercase tracking-widest mb-2">
              Expenses
            </p>
            <div className="space-y-1.5 mb-4">
              {expenses.map((r, i) => (
                <div
                  key={i}
                  className="flex justify-between items-center py-1.5 px-3 rounded-lg hover:bg-white/5 transition-colors duration-200"
                >
                  <span className="text-[13px] text-white/80">{r.name}</span>
                  <span className="text-[13px] font-mono font-semibold text-red-400">
                    {fmt(r.amount)}
                  </span>
                </div>
              ))}
              <div className="flex justify-between items-center py-2 px-3 border-t border-white/10">
                <span className="text-sm font-bold text-white">
                  Total Expense
                </span>
                <span className="text-sm font-mono font-extrabold text-red-400">
                  {fmt(totalExpense)}
                </span>
              </div>
            </div>

            {/* Net Profit */}
            <div className="mt-2 p-4 rounded-xl bg-[#48FF73]/10 border border-[#48FF73]/20">
              <div className="flex justify-between items-center">
                <span className="text-sm font-bold text-white">
                  Net Profit
                </span>
                <span className="text-xl font-mono font-extrabold text-[#48FF73]">
                  {fmt(netProfit)}
                </span>
              </div>
            </div>
          </GlassCard>

          {/* Balance Sheet */}
          <GlassCard className="lg:col-span-1">
            <div className="flex items-center gap-2.5 mb-5">
              <FileSpreadsheet className="w-5 h-5 text-[#48FF73]" />
              <h2 className="text-lg font-bold text-white">Balance Sheet</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {/* Assets */}
              <div>
                <p className="text-[11px] font-semibold text-white/40 uppercase tracking-widest mb-3">
                  Assets
                </p>
                <div className="space-y-1.5">
                  {assets.map((r, i) => (
                    <div
                      key={i}
                      className="flex justify-between items-center py-1.5 hover:bg-white/5 rounded-lg px-2 transition-colors duration-200"
                    >
                      <span className="text-[12px] text-white/80">
                        {r.name}
                      </span>
                      <span className="text-[12px] font-mono font-semibold text-white/90">
                        {fmt(r.amount)}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 pt-3 border-t border-white/10 flex justify-between items-center px-2">
                  <span className="text-xs font-bold text-white">Total</span>
                  <span className="text-sm font-mono font-extrabold text-[#48FF73]">
                    {fmt(totalAssets)}
                  </span>
                </div>
              </div>

              {/* Liabilities + Equity */}
              <div>
                <p className="text-[11px] font-semibold text-white/40 uppercase tracking-widest mb-3">
                  Liabilities & Equity
                </p>
                <div className="space-y-1.5">
                  {liabilitiesEquity.map((r, i) => (
                    <div
                      key={i}
                      className="flex justify-between items-center py-1.5 hover:bg-white/5 rounded-lg px-2 transition-colors duration-200"
                    >
                      <span className="text-[12px] text-white/80">
                        {r.name}
                      </span>
                      <span className="text-[12px] font-mono font-semibold text-white/90">
                        {fmt(r.amount)}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 pt-3 border-t border-white/10 flex justify-between items-center px-2">
                  <span className="text-xs font-bold text-white">Total</span>
                  <span className="text-sm font-mono font-extrabold text-[#48FF73]">
                    {fmt(totalLiabEq)}
                  </span>
                </div>
              </div>
            </div>

            {/* Balance check */}
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
            {/* 1. Journal Rules Engine */}
            <GlassCard>
              <div className="flex items-start justify-between mb-4">
                <div className="p-2.5 rounded-xl bg-white/[0.08] border border-white/[0.1]">
                  <BookOpen className="w-5 h-5 text-[#48FF73]" />
                </div>
                <span className="inline-flex items-center gap-1.5 bg-[#48FF73]/15 text-[#48FF73] text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#48FF73] animate-pulse" />
                  Active
                </span>
              </div>
              <h3 className="text-base font-bold text-white mb-1.5">
                Journal Rules Engine
              </h3>
              <p className="text-xs text-white/50 leading-relaxed mb-5">
                Automated double-entry mapping for every transaction type. Rules auto-classify debits & credits based on CoA structure.
              </p>
              <button className="w-full flex items-center justify-center gap-2 bg-[#48FF73] text-black font-bold text-xs px-4 py-2.5 rounded-full hover:scale-[0.97] active:scale-[0.94] transition-transform duration-200 shadow-[0_0_20px_rgba(72,255,115,0.2)]">
                <Settings className="w-3.5 h-3.5" />
                Configure
              </button>
            </GlassCard>

            {/* 2. Account Hierarchy Tree */}
            <GlassCard>
              <div className="flex items-start justify-between mb-4">
                <div className="p-2.5 rounded-xl bg-white/[0.08] border border-white/[0.1]">
                  <Network className="w-5 h-5 text-[#48FF73]" />
                </div>
                <span className="inline-flex items-center gap-1.5 bg-[#48FF73]/15 text-[#48FF73] text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#48FF73] animate-pulse" />
                  Active
                </span>
              </div>
              <h3 className="text-base font-bold text-white mb-1.5">
                Account Hierarchy Tree
              </h3>
              <p className="text-xs text-white/50 leading-relaxed mb-5">
                Chart of Accounts with parent-child relationships. 15 default accounts across Asset, Liability, Equity, Income & Expense.
              </p>
              <button className="w-full flex items-center justify-center gap-2 bg-[#48FF73] text-black font-bold text-xs px-4 py-2.5 rounded-full hover:scale-[0.97] active:scale-[0.94] transition-transform duration-200 shadow-[0_0_20px_rgba(72,255,115,0.2)]">
                <Eye className="w-3.5 h-3.5" />
                View
              </button>
            </GlassCard>

            {/* 3. Retained Earnings Control */}
            <GlassCard>
              <div className="flex items-start justify-between mb-4">
                <div className="p-2.5 rounded-xl bg-white/[0.08] border border-white/[0.1]">
                  <PiggyBank className="w-5 h-5 text-[#48FF73]" />
                </div>
                <span className="inline-flex items-center gap-1.5 bg-yellow-400/15 text-yellow-300 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-yellow-300 animate-pulse" />
                  Warning
                </span>
              </div>
              <h3 className="text-base font-bold text-white mb-1.5">
                Retained Earnings Control
              </h3>
              <p className="text-xs text-white/50 leading-relaxed mb-5">
                Track accumulated net income after distributions. Auto-calculates from P&L close and owner dividend payouts.
              </p>
              <button className="w-full flex items-center justify-center gap-2 bg-[#48FF73] text-black font-bold text-xs px-4 py-2.5 rounded-full hover:scale-[0.97] active:scale-[0.94] transition-transform duration-200 shadow-[0_0_20px_rgba(72,255,115,0.2)]">
                <Play className="w-3.5 h-3.5" />
                Run
              </button>
            </GlassCard>

            {/* 4. Period Lock System */}
            <GlassCard>
              <div className="flex items-start justify-between mb-4">
                <div className="p-2.5 rounded-xl bg-white/[0.08] border border-white/[0.1]">
                  <Lock className="w-5 h-5 text-[#48FF73]" />
                </div>
                <span className="inline-flex items-center gap-1.5 bg-red-400/15 text-red-300 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-300" />
                  Locked
                </span>
              </div>
              <h3 className="text-base font-bold text-white mb-1.5">
                Period Lock System
              </h3>
              <p className="text-xs text-white/50 leading-relaxed mb-5">
                Freeze closed accounting periods to prevent retroactive modifications. Ensures regulatory compliance & audit integrity.
              </p>
              <button className="w-full flex items-center justify-center gap-2 bg-[#48FF73] text-black font-bold text-xs px-4 py-2.5 rounded-full hover:scale-[0.97] active:scale-[0.94] transition-transform duration-200 shadow-[0_0_20px_rgba(72,255,115,0.2)]">
                <Settings className="w-3.5 h-3.5" />
                Configure
              </button>
            </GlassCard>

            {/* 5. Audit Trail Monitor */}
            <GlassCard className="md:col-span-2">
              <div className="flex items-start justify-between mb-4">
                <div className="p-2.5 rounded-xl bg-white/[0.08] border border-white/[0.1]">
                  <ShieldCheck className="w-5 h-5 text-[#48FF73]" />
                </div>
                <span className="inline-flex items-center gap-1.5 bg-[#48FF73]/15 text-[#48FF73] text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#48FF73] animate-pulse" />
                  Active
                </span>
              </div>
              <h3 className="text-base font-bold text-white mb-1.5">
                Audit Trail Monitor
              </h3>
              <p className="text-xs text-white/50 leading-relaxed mb-5">
                SHA-256 hash-chained, append-only ledger with full tamper detection. Every entry is cryptographically linked to its predecessor for bank-grade integrity.
              </p>
              <button className="w-full sm:w-auto flex items-center justify-center gap-2 bg-[#48FF73] text-black font-bold text-xs px-6 py-2.5 rounded-full hover:scale-[0.97] active:scale-[0.94] transition-transform duration-200 shadow-[0_0_20px_rgba(72,255,115,0.2)]">
                <Eye className="w-3.5 h-3.5" />
                View Audit Log
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
