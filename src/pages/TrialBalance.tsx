import { useMemo } from "react";
import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";

import { TableSkeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

const ACCOUNT_LABELS: Record<string, { bn: string; en: string }> = {
  CASH_ON_HAND: { bn: "নগদ তহবিল", en: "Cash on Hand" },
  LOAN_PRINCIPAL: { bn: "ঋণ আসল", en: "Loan Principal" },
  LOAN_INTEREST: { bn: "ঋণ সুদ", en: "Loan Interest" },
  PENALTY_INCOME: { bn: "জরিমানা আয়", en: "Penalty Income" },
  SAVINGS_LIABILITY: { bn: "সঞ্চয় দায়", en: "Savings Liability" },
  SHARE_CAPITAL: { bn: "শেয়ার মূলধন", en: "Share Capital" },
  INSURANCE_PAYABLE: { bn: "বীমা প্রদেয়", en: "Insurance Payable" },
  ADMISSION_FEE_INCOME: { bn: "ভর্তি ফি আয়", en: "Admission Fee Income" },
  INSURANCE_PREMIUM_INCOME: { bn: "বীমা প্রিমিয়াম আয়", en: "Insurance Premium Income" },
  ADJUSTMENT_ACCOUNT: { bn: "সমন্বয় হিসাব", en: "Adjustment Account" },
  DISBURSEMENT_OUTFLOW: { bn: "বিতরণ বহির্গমন", en: "Disbursement Outflow" },
};

const TrialBalancePage = () => {
  const { lang } = useLanguage();

  const { data: ledgerData, isLoading } = useQuery({
    queryKey: ["trial-balance"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ledger_entries")
        .select("amount, entry_type, accounts(account_code)");
      if (error) throw error;
      return data as any[];
    },
  });

  const trialBalance = useMemo(() => {
    if (!ledgerData) return { accounts: [], totalDebit: 0, totalCredit: 0, balanced: true };

    const map: Record<string, { debit: number; credit: number }> = {};
    for (const row of ledgerData) {
      const code = row.accounts?.account_code;
      if (!code) continue;
      if (!map[code]) map[code] = { debit: 0, credit: 0 };
      if (row.entry_type === 'debit') map[code].debit += Number(row.amount);
      else map[code].credit += Number(row.amount);
    }

    const accounts = Object.entries(map)
      .map(([code, vals]) => ({ code, ...vals }))
      .sort((a, b) => a.code.localeCompare(b.code));

    const totalDebit = accounts.reduce((s, a) => s + a.debit, 0);
    const totalCredit = accounts.reduce((s, a) => s + a.credit, 0);

    return { accounts, totalDebit, totalCredit, balanced: Math.abs(totalDebit - totalCredit) < 0.01 };
  }, [ledgerData]);

  return (
    <AppLayout>
      <PageHeader
        title={lang === "bn" ? "ট্রায়াল ব্যালেন্স" : "Trial Balance"}
        description={lang === "bn" ? "সকল হিসাবের মোট ডেবিট ও ক্রেডিট সারাংশ" : "Summary of total debit & credit for all accounts"}
        badge={lang === "bn" ? "⚖️ ট্রায়াল ব্যালেন্স" : "⚖️ Trial Balance"}
        actions={
          <Badge variant={trialBalance.balanced ? "default" : "destructive"} className="gap-1.5 text-xs py-1 px-3">
            {trialBalance.balanced ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
            {trialBalance.balanced
              ? (lang === "bn" ? "ব্যালেন্স সঠিক" : "Balanced")
              : (lang === "bn" ? "অমিল!" : "Imbalanced!")}
          </Badge>
        }
      />

      {isLoading ? <TableSkeleton rows={8} cols={3} /> : (
        <div className="card-elevated overflow-hidden rounded-xl border border-border/60 shadow-md">
          <table className="w-full table-fixed text-sm">
            <thead>
              <tr className="bg-primary text-primary-foreground">
                <th className="text-left text-xs font-semibold tracking-wide uppercase p-3.5 w-[50%]">{lang === "bn" ? "হিসাব কোড" : "Account Code"}</th>
                <th className="text-right text-xs font-semibold tracking-wide uppercase p-3.5 w-[25%]">{lang === "bn" ? "ডেবিট (৳)" : "Debit (৳)"}</th>
                <th className="text-right text-xs font-semibold tracking-wide uppercase p-3.5 w-[25%]">{lang === "bn" ? "ক্রেডিট (৳)" : "Credit (৳)"}</th>
              </tr>
            </thead>
            <tbody>
              {trialBalance.accounts.map((acc, i) => (
                <tr key={acc.code} className={`border-b border-border/40 last:border-0 hover:bg-accent/40 transition-colors duration-200 ${i % 2 === 0 ? "bg-background" : "bg-muted/30"}`}>
                  <td className="p-3.5">
                    <p className="text-xs font-semibold text-foreground truncate">{ACCOUNT_LABELS[acc.code]?.[lang === "bn" ? "bn" : "en"] ?? acc.code}</p>
                    <p className="text-[10px] text-muted-foreground font-mono mt-0.5">{acc.code}</p>
                  </td>
                  <td className="p-3.5 text-right">
                    <span className={`text-xs font-mono font-bold ${acc.debit > 0 ? "text-primary" : "text-muted-foreground/50"}`}>
                      {acc.debit > 0 ? `৳${acc.debit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "—"}
                    </span>
                  </td>
                  <td className="p-3.5 text-right">
                    <span className={`text-xs font-mono font-bold ${acc.credit > 0 ? "text-destructive" : "text-muted-foreground/50"}`}>
                      {acc.credit > 0 ? `৳${acc.credit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "—"}
                    </span>
                  </td>
                </tr>
              ))}
              <tr className="bg-primary/10 border-t-2 border-primary/30">
                <td className="p-3.5 text-xs font-extrabold text-foreground">{lang === "bn" ? "মোট" : "Total"}</td>
                <td className="p-3.5 text-right">
                  <span className="text-xs font-mono font-extrabold text-primary">৳{trialBalance.totalDebit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                </td>
                <td className="p-3.5 text-right">
                  <span className="text-xs font-mono font-extrabold text-destructive">৳{trialBalance.totalCredit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Mobile cards */}
      {!isLoading && (
        <div className="md:hidden space-y-3 mt-4">
          {trialBalance.accounts.map((acc) => (
            <div key={acc.code} className="card-elevated p-4 space-y-2">
              <p className="text-xs font-medium">{ACCOUNT_LABELS[acc.code]?.[lang === "bn" ? "bn" : "en"] ?? acc.code}</p>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">{lang === "bn" ? "ডেবিট" : "Debit"}</span>
                <span className="font-mono font-bold">৳{acc.debit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">{lang === "bn" ? "ক্রেডিট" : "Credit"}</span>
                <span className="font-mono font-bold">৳{acc.credit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </AppLayout>
  );
};

export default TrialBalancePage;
