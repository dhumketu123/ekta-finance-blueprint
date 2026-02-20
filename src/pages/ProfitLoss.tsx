import { useMemo } from "react";
import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableSkeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, DollarSign } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

const INCOME_ACCOUNTS = ["LOAN_INTEREST", "PENALTY_INCOME", "ADMISSION_FEE_INCOME", "INSURANCE_PREMIUM_INCOME"];
const EXPENSE_ACCOUNTS = ["INSURANCE_PAYABLE", "ADJUSTMENT_ACCOUNT"];

const ACCOUNT_LABELS: Record<string, { bn: string; en: string }> = {
  LOAN_INTEREST: { bn: "ঋণ সুদ আয়", en: "Loan Interest Income" },
  PENALTY_INCOME: { bn: "জরিমানা আয়", en: "Penalty Income" },
  ADMISSION_FEE_INCOME: { bn: "ভর্তি ফি আয়", en: "Admission Fee Income" },
  INSURANCE_PREMIUM_INCOME: { bn: "বীমা প্রিমিয়াম আয়", en: "Insurance Premium Income" },
  INSURANCE_PAYABLE: { bn: "বীমা দাবি ব্যয়", en: "Insurance Claim Expense" },
  ADJUSTMENT_ACCOUNT: { bn: "সমন্বয় ব্যয়", en: "Adjustment Expense" },
};

const ProfitLossPage = () => {
  const { lang } = useLanguage();

  const { data: ledgerData, isLoading } = useQuery({
    queryKey: ["profit-loss"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ledger_entries")
        .select("amount, entry_type, accounts(account_code)");
      if (error) throw error;
      return data as any[];
    },
  });

  const pnl = useMemo(() => {
    if (!ledgerData) return { incomeItems: [], expenseItems: [], totalIncome: 0, totalExpense: 0, netIncome: 0 };

    const map: Record<string, { debit: number; credit: number }> = {};
    for (const row of ledgerData) {
      const code = row.accounts?.account_code;
      if (!code) continue;
      if (!map[code]) map[code] = { debit: 0, credit: 0 };
      if (row.entry_type === 'debit') map[code].debit += Number(row.amount);
      else map[code].credit += Number(row.amount);
    }

    // Income = credit side of income accounts
    const incomeItems = INCOME_ACCOUNTS
      .filter((code) => map[code])
      .map((code) => ({ code, amount: (map[code]?.credit ?? 0) - (map[code]?.debit ?? 0) }));

    // Expense = debit side of expense accounts
    const expenseItems = EXPENSE_ACCOUNTS
      .filter((code) => map[code])
      .map((code) => ({ code, amount: (map[code]?.debit ?? 0) - (map[code]?.credit ?? 0) }));

    const totalIncome = incomeItems.reduce((s, i) => s + i.amount, 0);
    const totalExpense = expenseItems.reduce((s, i) => s + i.amount, 0);

    return { incomeItems, expenseItems, totalIncome, totalExpense, netIncome: totalIncome - totalExpense };
  }, [ledgerData]);

  const formatAmount = (n: number) => `৳${Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;

  return (
    <AppLayout>
      <PageHeader
        title={lang === "bn" ? "আয়-ব্যয় বিবরণী" : "Profit & Loss Statement"}
        description={lang === "bn" ? "আয় ও ব্যয় হিসাব থেকে নিট আয় গণনা" : "Net income calculation from income & expense accounts"}
      />

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card className="border-success/30 bg-success/5">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-success/10"><TrendingUp className="w-5 h-5 text-success" /></div>
            <div>
              <p className="text-xs text-muted-foreground">{lang === "bn" ? "মোট আয়" : "Total Income"}</p>
              <p className="text-lg font-bold text-success">{formatAmount(pnl.totalIncome)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-destructive/10"><TrendingDown className="w-5 h-5 text-destructive" /></div>
            <div>
              <p className="text-xs text-muted-foreground">{lang === "bn" ? "মোট ব্যয়" : "Total Expense"}</p>
              <p className="text-lg font-bold text-destructive">{formatAmount(pnl.totalExpense)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className={`border-primary/30 ${pnl.netIncome >= 0 ? "bg-success/5" : "bg-destructive/5"}`}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10"><DollarSign className="w-5 h-5 text-primary" /></div>
            <div>
              <p className="text-xs text-muted-foreground">{lang === "bn" ? "নিট আয়" : "Net Income"}</p>
              <p className={`text-lg font-bold ${pnl.netIncome >= 0 ? "text-success" : "text-destructive"}`}>
                {pnl.netIncome < 0 ? "-" : ""}{formatAmount(pnl.netIncome)}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {isLoading ? <TableSkeleton rows={6} cols={2} /> : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Income */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-success" />
                {lang === "bn" ? "আয়" : "Income"}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableBody>
                  {pnl.incomeItems.map((item) => (
                    <TableRow key={item.code}>
                      <TableCell className="text-xs">{ACCOUNT_LABELS[item.code]?.[lang === "bn" ? "bn" : "en"] ?? item.code}</TableCell>
                      <TableCell className="text-xs text-right font-mono font-medium text-success">{formatAmount(item.amount)}</TableCell>
                    </TableRow>
                  ))}
                  {pnl.incomeItems.length === 0 && (
                    <TableRow><TableCell colSpan={2} className="text-xs text-center text-muted-foreground py-4">{lang === "bn" ? "কোনো আয় নেই" : "No income"}</TableCell></TableRow>
                  )}
                  <TableRow className="bg-success/5 font-bold border-t-2">
                    <TableCell className="text-xs">{lang === "bn" ? "মোট আয়" : "Total Income"}</TableCell>
                    <TableCell className="text-xs text-right font-mono text-success">{formatAmount(pnl.totalIncome)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Expense */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-destructive" />
                {lang === "bn" ? "ব্যয়" : "Expenses"}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableBody>
                  {pnl.expenseItems.map((item) => (
                    <TableRow key={item.code}>
                      <TableCell className="text-xs">{ACCOUNT_LABELS[item.code]?.[lang === "bn" ? "bn" : "en"] ?? item.code}</TableCell>
                      <TableCell className="text-xs text-right font-mono font-medium text-destructive">{formatAmount(item.amount)}</TableCell>
                    </TableRow>
                  ))}
                  {pnl.expenseItems.length === 0 && (
                    <TableRow><TableCell colSpan={2} className="text-xs text-center text-muted-foreground py-4">{lang === "bn" ? "কোনো ব্যয় নেই" : "No expenses"}</TableCell></TableRow>
                  )}
                  <TableRow className="bg-destructive/5 font-bold border-t-2">
                    <TableCell className="text-xs">{lang === "bn" ? "মোট ব্যয়" : "Total Expense"}</TableCell>
                    <TableCell className="text-xs text-right font-mono text-destructive">{formatAmount(pnl.totalExpense)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}
    </AppLayout>
  );
};

export default ProfitLossPage;
