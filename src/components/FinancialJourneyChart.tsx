import { useMemo, useCallback } from "react";
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

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl px-4 py-3 text-xs shadow-2xl border border-white/20"
      style={{
        background: "rgba(30, 41, 59, 0.92)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
      }}>
      <p className="font-semibold text-white/90 mb-1.5">{label}</p>
      {payload.map((entry: any, i: number) => {
        const color = entry.name === "savings" ? "#22c55e" : entry.name === "loanBalance" ? "#3b82f6" : "#f97316";
        return (
          <div key={i} className="flex items-center justify-between gap-4 py-0.5">
            <span className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
              <span className="text-white/70">{entry.name === "savings" ? "সঞ্চয়" : "লাভ/বকেয়া"}</span>
            </span>
            <span className="font-mono font-bold text-white">৳{Number(entry.value).toLocaleString()}</span>
          </div>
        );
      })}
    </div>
  );
};

const GlowDot = ({ cx, cy, fill }: any) => {
  if (!cx || !cy) return null;
  return (
    <g>
      <circle cx={cx} cy={cy} r={6} fill={fill} opacity={0.25} />
      <circle cx={cx} cy={cy} r={3} fill={fill} stroke="white" strokeWidth={1.5} />
    </g>
  );
};

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
    <div className="rounded-2xl p-6 animate-slide-up border border-white/10"
      style={{
        background: "linear-gradient(145deg, #0f172a 0%, #1e293b 100%)",
        boxShadow: "0 8px 32px -8px rgba(0,0,0,0.5)",
        animationDelay: "0.08s",
      }}>
      <div className="flex items-center gap-2 mb-5">
        <TrendingUp className="w-5 h-5 text-emerald-400" />
        <h3 className="text-sm font-bold text-white/90 tracking-wide">
          {bn ? "আর্থিক অগ্রগতি রেখাচিত্র" : "Financial Progress Chart"}
          <span className="text-white/40 font-normal ml-1 text-xs">(Financial Progress Chart)</span>
        </h3>
      </div>

      <div className="h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="savingsGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22c55e" stopOpacity={0.45} />
                <stop offset="100%" stopColor="#22c55e" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="loanGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.25} />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "rgba(255,255,255,0.5)" }}
              axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
              tickLine={false}
            />
            <YAxis
              yAxisId="loan"
              orientation="right"
              tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => `৳${(v / 1000).toFixed(0)},000`}
            />
            <YAxis
              yAxisId="savings"
              orientation="left"
              tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => `৳${(v / 1000).toFixed(0)},000`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              yAxisId="savings"
              type="monotone"
              dataKey="savings"
              name="savings"
              stroke="#22c55e"
              strokeWidth={2.5}
              fill="url(#savingsGrad)"
              isAnimationActive={true}
              animationDuration={1800}
              animationEasing="ease-out"
              dot={(props: any) => {
                const entry = chartData[props.index];
                if (!entry) return <></>;
                return <GlowDot cx={props.cx} cy={props.cy} fill="#22c55e" />;
              }}
              activeDot={{ r: 5, stroke: "#22c55e", strokeWidth: 2, fill: "#0f172a" }}
            />
            <Area
              yAxisId="loan"
              type="monotone"
              dataKey="loanBalance"
              name="loanBalance"
              stroke="#3b82f6"
              strokeWidth={2.5}
              fill="url(#loanGrad)"
              isAnimationActive={true}
              animationDuration={1800}
              animationEasing="ease-out"
              dot={(props: any) => {
                const entry = chartData[props.index];
                if (!entry) return <></>;
                const color = entry.onTime ? "#3b82f6" : "#f97316";
                return <GlowDot cx={props.cx} cy={props.cy} fill={color} />;
              }}
              activeDot={{ r: 5, stroke: "#3b82f6", strokeWidth: 2, fill: "#0f172a" }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Bottom Legend */}
      <div className="flex items-center justify-center gap-6 mt-4 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
          <span className="text-white/60">{bn ? "সঞ্চয়" : "Savings"}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-orange-500" />
          <span className="text-white/60">{bn ? "লাভ/বকেয়া" : "Loan Balance"}</span>
        </span>
      </div>
    </div>
  );
}
