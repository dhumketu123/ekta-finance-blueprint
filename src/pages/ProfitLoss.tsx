import { useMemo } from "react";
import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { TableSkeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, DollarSign, PieChart, Info } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { PieChart as RechartsPie, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { useApprovedExpensesByCategory } from "@/hooks/useOperationalExpenses";

// ── Ledger account config ─────────────────────────────────────────────────────
const INCOME_ACCOUNTS = ["LOAN_INTEREST", "PENALTY_INCOME", "ADMISSION_FEE_INCOME", "INSURANCE_PREMIUM_INCOME"];
const LEDGER_EXPENSE_ACCOUNTS = ["INSURANCE_PAYABLE", "ADJUSTMENT_ACCOUNT"];

const ACCOUNT_LABELS: Record<string, { bn: string; en: string }> = {
  LOAN_INTEREST: { bn: "ঋণ সুদ আয়", en: "Loan Interest Income" },
  PENALTY_INCOME: { bn: "জরিমানা আয়", en: "Penalty Income" },
  ADMISSION_FEE_INCOME: { bn: "ভর্তি ফি আয়", en: "Admission Fee Income" },
  INSURANCE_PREMIUM_INCOME: { bn: "বীমা প্রিমিয়াম আয়", en: "Insurance Premium Income" },
  INSURANCE_PAYABLE: { bn: "বীমা দাবি ব্যয়", en: "Insurance Claim Expense" },
  ADJUSTMENT_ACCOUNT: { bn: "সমন্বয় ব্যয়", en: "Adjustment Expense" },
};

// ── Donut chart colour palette ────────────────────────────────────────────────
const DONUT_COLORS = [
  "#e05c4b", "#f59e0b", "#10b981", "#3b82f6",
  "#8b5cf6", "#ec4899", "#06b6d4",
];

// ── Helper: format currency ───────────────────────────────────────────────────
const fmtAmt = (n: number) =>
  `৳${Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;

// ── Custom Donut tooltip ──────────────────────────────────────────────────────
const DonutTooltip = ({ active, payload }: { active?: boolean; payload?: any[] }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-lg text-xs">
      <p className="font-semibold">{d.name}</p>
      <p className="text-destructive font-mono">{fmtAmt(d.value)}</p>
    </div>
  );
};

// ── Main page ─────────────────────────────────────────────────────────────────
const ProfitLossPage = () => {
  const { lang } = useLanguage();
  const bn = lang === "bn";

  // 1️⃣ Ledger data (existing income + legacy expense accounts)
  const { data: ledgerData, isLoading: ledgerLoading } = useQuery({
    queryKey: ["profit-loss"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ledger_entries")
        .select("amount, entry_type, accounts(account_code)");
      if (error) throw error;
      return data as any[];
    },
  });

  // 2️⃣ Operational expenses by category (approved only)
  const { data: opExpensesByCategory, isLoading: opLoading } = useApprovedExpensesByCategory();

  const isLoading = ledgerLoading || opLoading;

  // ── Compute P&L numbers ───────────────────────────────────────────────────
  const pnl = useMemo(() => {
    // Ledger-side income + legacy expenses
    const map: Record<string, { debit: number; credit: number }> = {};
    for (const row of ledgerData ?? []) {
      const code = row.accounts?.account_code;
      if (!code) continue;
      if (!map[code]) map[code] = { debit: 0, credit: 0 };
      if (row.entry_type === "debit") map[code].debit += Number(row.amount);
      else map[code].credit += Number(row.amount);
    }

    const incomeItems = INCOME_ACCOUNTS
      .filter((c) => map[c])
      .map((c) => ({ code: c, amount: (map[c]?.credit ?? 0) - (map[c]?.debit ?? 0) }));

    const ledgerExpenseItems = LEDGER_EXPENSE_ACCOUNTS
      .filter((c) => map[c])
      .map((c) => ({ code: c, amount: (map[c]?.debit ?? 0) - (map[c]?.credit ?? 0) }));

    const totalIncome = incomeItems.reduce((s, i) => s + i.amount, 0);
    const totalLedgerExpense = ledgerExpenseItems.reduce((s, i) => s + i.amount, 0);

    // Operational expenses (from financial_transactions / maker-checker)
    const opCategories = opExpensesByCategory ?? [];
    const totalOpExpense = opCategories.reduce((s, c) => s + c.total, 0);

    const totalExpense = totalLedgerExpense + totalOpExpense;

    // TRUE Net Profit = Revenue - (Legacy Expenses + Approved Operational Expenses)
    const netIncome = totalIncome - totalExpense;

    return {
      incomeItems,
      ledgerExpenseItems,
      opCategories,
      totalIncome,
      totalLedgerExpense,
      totalOpExpense,
      totalExpense,
      netIncome,
    };
  }, [ledgerData, opExpensesByCategory]);

  // ── Donut data (operational expenses only) ─────────────────────────────────
  const donutData = useMemo(() => {
    if (!pnl.opCategories.length) return [];
    return pnl.opCategories.map((c) => ({
      name: bn ? c.labelBn : c.labelEn,
      value: c.total,
      emoji: c.emoji,
    }));
  }, [pnl.opCategories, bn]);

  return (
    <AppLayout>
      <PageHeader
        title={bn ? "আয়-ব্যয় বিবরণী" : "Profit & Loss Statement"}
        description={bn
          ? "সকল আয়, পরিচালন ব্যয় ও নিট মুনাফার সার-সংক্ষেপ"
          : "Complete P&L with revenue, operational expenses & true net profit"}
      />

      {/* ── KPI Summary Row ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6">
        <KpiCard
          icon={<TrendingUp className="w-4 h-4 text-emerald-500" />}
          label={bn ? "মোট আয়" : "Total Revenue"}
          value={fmtAmt(pnl.totalIncome)}
          color="success"
        />
        <KpiCard
          icon={<TrendingDown className="w-4 h-4 text-red-500" />}
          label={bn ? "পরিচালন ব্যয়" : "Operational Expenses"}
          value={fmtAmt(pnl.totalOpExpense)}
          color="destructive"
        />
        <KpiCard
          icon={<TrendingDown className="w-4 h-4 text-amber-500" />}
          label={bn ? "অন্যান্য ব্যয়" : "Other Expenses"}
          value={fmtAmt(pnl.totalLedgerExpense)}
          color="warning"
        />
        <KpiCard
          icon={<DollarSign className="w-4 h-4 text-primary" />}
          label={bn ? "নিট মুনাফা" : "Net Profit"}
          value={(pnl.netIncome < 0 ? "− " : "") + fmtAmt(pnl.netIncome)}
          color={pnl.netIncome >= 0 ? "success" : "destructive"}
          large
        />
      </div>

      {isLoading ? (
        <TableSkeleton rows={6} cols={2} />
      ) : (
        <div className="space-y-6">
          {/* ── Row 1: Income + Donut Chart ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Income table */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-500" />
                  {bn ? "আয় (Income)" : "Revenue"}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableBody>
                    {pnl.incomeItems.map((item) => (
                      <TableRow key={item.code}>
                        <TableCell className="text-xs">
                          {ACCOUNT_LABELS[item.code]?.[bn ? "bn" : "en"] ?? item.code}
                        </TableCell>
                        <TableCell className="text-xs text-right font-mono font-semibold text-emerald-600">
                          {fmtAmt(item.amount)}
                        </TableCell>
                      </TableRow>
                    ))}
                    {pnl.incomeItems.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={2} className="text-xs text-center text-muted-foreground py-6">
                          {bn ? "কোনো আয় নেই" : "No revenue recorded"}
                        </TableCell>
                      </TableRow>
                    )}
                    <TableRow className="bg-emerald-50 dark:bg-emerald-950/30 font-bold border-t-2 border-emerald-200">
                      <TableCell className="text-xs">{bn ? "মোট আয়" : "Total Revenue"}</TableCell>
                      <TableCell className="text-xs text-right font-mono text-emerald-600">
                        {fmtAmt(pnl.totalIncome)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Operational Expense Donut Chart */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <PieChart className="w-4 h-4 text-destructive" />
                  {bn ? "ব্যয় বিতরণ (অনুমোদিত)" : "Expense Distribution (Approved)"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {donutData.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-40 gap-2 text-muted-foreground">
                    <Info className="w-6 h-6 opacity-40" />
                    <p className="text-xs text-center">
                      {bn
                        ? "কোনো অনুমোদিত পরিচালন ব্যয় নেই"
                        : "No approved operational expenses yet"}
                    </p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <RechartsPie>
                      <Pie
                        data={donutData}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={80}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {donutData.map((_, i) => (
                          <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip content={<DonutTooltip />} />
                      <Legend
                        formatter={(value) => (
                          <span className="text-[11px] text-foreground">{value}</span>
                        )}
                        wrapperStyle={{ fontSize: "11px" }}
                      />
                    </RechartsPie>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── Row 2: Operational Expenses Breakdown ── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-destructive" />
                {bn ? "পরিচালন ব্যয় — বিভাগওয়ারি (অনুমোদিত)" : "Operational Expenses by Category (Approved)"}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableBody>
                  {pnl.opCategories.map((cat, i) => (
                    <TableRow key={cat.key}>
                      <TableCell className="text-xs">
                        <div className="flex items-center gap-2">
                          <span
                            className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }}
                          />
                          <span className="text-base leading-none">{cat.emoji}</span>
                          <span>{bn ? cat.labelBn : cat.labelEn}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-right font-mono font-semibold text-destructive">
                        {fmtAmt(cat.total)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {pnl.opCategories.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={2} className="text-xs text-center text-muted-foreground py-6">
                        {bn
                          ? "কোনো অনুমোদিত পরিচালন ব্যয় পাওয়া যায়নি — লেনদেন পাতায় ব্যয় এন্ট্রি করুন"
                          : "No approved operational expenses — log expenses from Transactions page"}
                      </TableCell>
                    </TableRow>
                  )}
                  {pnl.opCategories.length > 0 && (
                    <TableRow className="bg-destructive/5 font-bold border-t-2 border-destructive/20">
                      <TableCell className="text-xs">{bn ? "মোট পরিচালন ব্যয়" : "Total Operational Expense"}</TableCell>
                      <TableCell className="text-xs text-right font-mono text-destructive">
                        {fmtAmt(pnl.totalOpExpense)}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* ── Row 3: Other (Ledger) Expenses ── */}
          {pnl.ledgerExpenseItems.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <TrendingDown className="w-4 h-4 text-amber-500" />
                  {bn ? "অন্যান্য ব্যয় (লেজার অ্যাকাউন্ট)" : "Other Expenses (Ledger Accounts)"}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableBody>
                    {pnl.ledgerExpenseItems.map((item) => (
                      <TableRow key={item.code}>
                        <TableCell className="text-xs">
                          {ACCOUNT_LABELS[item.code]?.[bn ? "bn" : "en"] ?? item.code}
                        </TableCell>
                        <TableCell className="text-xs text-right font-mono font-semibold text-amber-600">
                          {fmtAmt(item.amount)}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-amber-50 dark:bg-amber-950/20 font-bold border-t-2 border-amber-200">
                      <TableCell className="text-xs">{bn ? "মোট" : "Subtotal"}</TableCell>
                      <TableCell className="text-xs text-right font-mono text-amber-600">
                        {fmtAmt(pnl.totalLedgerExpense)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* ── Final Net Profit Calculation Banner ── */}
          <Card
            className="overflow-hidden"
            style={{
              background: pnl.netIncome >= 0
                ? "linear-gradient(135deg, hsl(142 70% 45% / 0.08), hsl(142 70% 45% / 0.03))"
                : "linear-gradient(135deg, hsl(0 84% 60% / 0.08), hsl(0 84% 60% / 0.03))",
              borderColor: pnl.netIncome >= 0
                ? "hsl(142 70% 45% / 0.3)"
                : "hsl(0 84% 60% / 0.3)",
            }}
          >
            <CardContent className="py-5 px-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {bn ? "নিট মুনাফা গণনা" : "Net Profit Formula"}
                  </p>
                  <p className="text-xs text-muted-foreground font-mono">
                    {fmtAmt(pnl.totalIncome)} − ({fmtAmt(pnl.totalLedgerExpense)} + {fmtAmt(pnl.totalOpExpense)})
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {bn
                      ? "মোট আয় − (লেজার ব্যয় + অনুমোদিত পরিচালন ব্যয়)"
                      : "Total Revenue − (Ledger Expenses + Approved Operational Expenses)"}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-muted-foreground mb-1">{bn ? "নিট মুনাফা" : "Net Profit"}</p>
                  <p
                    className="text-3xl font-black font-mono"
                    style={{ color: pnl.netIncome >= 0 ? "hsl(142 70% 40%)" : "hsl(0 84% 55%)" }}
                  >
                    {pnl.netIncome < 0 ? "−" : "+"}{fmtAmt(pnl.netIncome)}
                  </p>
                  <Badge
                    variant="outline"
                    className={`mt-1 text-[10px] ${pnl.netIncome >= 0
                      ? "border-emerald-500/30 text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30"
                      : "border-destructive/30 text-destructive bg-destructive/5"}`}
                  >
                    {pnl.netIncome >= 0
                      ? (bn ? "লাভজনক" : "Profitable")
                      : (bn ? "ক্ষতিতে" : "In Loss")}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </AppLayout>
  );
};

// ── KPI Card sub-component ────────────────────────────────────────────────────
interface KpiCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: "success" | "destructive" | "warning" | "primary";
  large?: boolean;
}

function KpiCard({ icon, label, value, color, large }: KpiCardProps) {
  const colorMap = {
    success: "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800",
    destructive: "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800",
    warning: "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800",
    primary: "bg-primary/5 border-primary/20",
  };
  const textColorMap = {
    success: "text-emerald-600 dark:text-emerald-400",
    destructive: "text-red-600 dark:text-red-400",
    warning: "text-amber-600 dark:text-amber-400",
    primary: "text-primary",
  };
  return (
    <Card className={`border ${colorMap[color]}`}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-2">
          {icon}
          <p className="text-[11px] text-muted-foreground font-medium">{label}</p>
        </div>
        <p className={`font-black font-mono ${large ? "text-xl" : "text-base"} ${textColorMap[color]}`}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

export default ProfitLossPage;
