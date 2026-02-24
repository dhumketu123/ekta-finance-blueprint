import { useMemo } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceDot
} from "recharts";
import { TrendingUp } from "lucide-react";

interface Props {
  clientId: string;
  loanIds: string[];
}

export default function FinancialJourneyChart({ clientId, loanIds }: Props) {
  const { lang } = useLanguage();
  const bn = lang === "bn";

  // Fetch loan schedules for loan balance trajectory
  const { data: schedules } = useQuery({
    queryKey: ["journey-schedules", loanIds.join(",")],
    queryFn: async () => {
      if (!loanIds.length) return [];
      const { data, error } = await supabase
        .from("loan_schedules")
        .select("due_date, principal_due, interest_due, principal_paid, interest_paid, status, paid_date")
        .in("loan_id", loanIds)
        .order("due_date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: loanIds.length > 0,
  });

  // Fetch savings transactions for cumulative savings line
  const { data: savingsTxns } = useQuery({
    queryKey: ["journey-savings-txns", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_transactions" as any)
        .select("created_at, transaction_type, amount, approval_status")
        .eq("member_id", clientId)
        .in("transaction_type", ["savings_deposit", "savings_withdrawal"])
        .eq("approval_status", "approved")
        .order("created_at", { ascending: true })
        .limit(500);
      if (error) throw error;
      return (data as any[]) ?? [];
    },
    enabled: !!clientId,
  });

  const chartData = useMemo(() => {
    if (!schedules?.length) return [];

    // Build a map of months -> loan balance decline
    const monthMap = new Map<string, { loanBalance: number; savings: number; onTime: boolean }>();

    // Calculate running loan balance
    let totalLoanBalance = schedules.reduce(
      (s, sch) => s + Number(sch.principal_due) + Number(sch.interest_due), 0
    );
    const initialBalance = totalLoanBalance;

    for (const sch of schedules) {
      const monthKey = sch.due_date.slice(0, 7); // YYYY-MM
      const paid = Number(sch.principal_paid) + Number(sch.interest_paid);
      totalLoanBalance -= paid;

      const isOnTime = sch.status === "paid" && sch.paid_date
        ? new Date(sch.paid_date) <= new Date(sch.due_date)
        : sch.status === "paid";

      if (!monthMap.has(monthKey)) {
        monthMap.set(monthKey, { loanBalance: Math.max(totalLoanBalance, 0), savings: 0, onTime: isOnTime });
      } else {
        const existing = monthMap.get(monthKey)!;
        existing.loanBalance = Math.max(totalLoanBalance, 0);
        if (!isOnTime) existing.onTime = false;
      }
    }

    // Build cumulative savings by month
    let cumSavings = 0;
    const savingsMap = new Map<string, number>();
    for (const tx of savingsTxns ?? []) {
      const monthKey = tx.created_at.slice(0, 7);
      const amt = Number(tx.amount);
      cumSavings += tx.transaction_type === "savings_deposit" ? amt : -amt;
      savingsMap.set(monthKey, Math.max(cumSavings, 0));
    }

    // Merge into chart data
    const allMonths = new Set([...monthMap.keys(), ...savingsMap.keys()]);
    const sorted = Array.from(allMonths).sort();

    let lastSavings = 0;
    let lastLoan = initialBalance;

    return sorted.map(month => {
      const entry = monthMap.get(month);
      const savings = savingsMap.get(month) ?? lastSavings;
      const loanBalance = entry?.loanBalance ?? lastLoan;
      lastSavings = savings;
      lastLoan = loanBalance;

      return {
        month,
        label: new Date(month + "-01").toLocaleDateString(bn ? "bn-BD" : "en-US", { month: "short", year: "2-digit" }),
        loanBalance: Math.round(loanBalance),
        savings: Math.round(savings),
        onTime: entry?.onTime ?? true,
      };
    });
  }, [schedules, savingsTxns, bn]);

  if (!chartData.length) return null;

  const delayedDots = chartData.filter(d => !d.onTime);

  return (
    <div className="card-elevated p-5 animate-slide-up" style={{ animationDelay: "0.08s" }}>
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp className="w-4 h-4 text-primary" />
        <h3 className="text-xs font-bold uppercase tracking-wider text-primary">
          {bn ? "আর্থিক যাত্রা" : "Financial Journey"}
        </h3>
        <div className="flex items-center gap-3 ml-auto text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: "hsl(var(--success))" }} />
            {bn ? "সঞ্চয়" : "Savings"}
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: "hsl(var(--primary))" }} />
            {bn ? "ঋণ ব্যালেন্স" : "Loan Balance"}
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-warning" />
            {bn ? "বিলম্বিত" : "Delayed"}
          </span>
        </div>
      </div>

      <div className="h-[220px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="savingsGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--success))" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(var(--success))" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="loanGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
            <YAxis
              yAxisId="loan"
              orientation="right"
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              tickFormatter={(v: number) => `৳${(v / 1000).toFixed(0)}k`}
            />
            <YAxis
              yAxisId="savings"
              orientation="left"
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              tickFormatter={(v: number) => `৳${(v / 1000).toFixed(0)}k`}
            />
            <Tooltip
              contentStyle={{
                background: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "0.75rem",
                fontSize: "11px",
                boxShadow: "var(--shadow-card)",
              }}
              formatter={(value: number, name: string) => [
                `৳${value.toLocaleString()}`,
                name === "savings" ? (bn ? "সঞ্চয়" : "Savings") : (bn ? "ঋণ ব্যালেন্স" : "Loan Balance"),
              ]}
            />
            <Area
              yAxisId="savings"
              type="monotone"
              dataKey="savings"
              stroke="hsl(var(--success))"
              strokeWidth={2}
              fill="url(#savingsGrad)"
            />
            <Area
              yAxisId="loan"
              type="monotone"
              dataKey="loanBalance"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              fill="url(#loanGrad)"
            />
            {/* Delayed payment markers */}
            {delayedDots.map((d, i) => (
              <ReferenceDot
                key={i}
                x={d.label}
                y={d.loanBalance}
                yAxisId="loan"
                r={5}
                fill="hsl(var(--warning))"
                stroke="hsl(var(--warning))"
                strokeWidth={2}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
