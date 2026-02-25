import { useMemo } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Line, ComposedChart
} from "recharts";
import { TrendingUp } from "lucide-react";

interface Props {
  clientId: string;
  loanIds: string[];
  dateRange?: { from: Date | null; to: Date | null };
}

/* ── Insightful Tooltip ── */
const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;

  const savings = payload.find((p: any) => p.dataKey === "savings")?.value ?? 0;
  const loanPaid = payload.find((p: any) => p.dataKey === "loanPaid")?.value ?? 0;
  const isPrediction = payload[0]?.payload?.isPrediction;

  let insight = "";
  if (isPrediction) {
    insight = `ভবিষ্যৎ প্রজেকশন — আনুমানিক সঞ্চয় ৳${Number(savings).toLocaleString()}`;
  } else if (savings > loanPaid) {
    insight = `চমৎকার! আপনার সঞ্চয় ঋণ পরিশোধের চেয়ে বেশি 🎉`;
  } else if (loanPaid > 0) {
    insight = `এই মাসে মোট ৳${Number(loanPaid).toLocaleString()} পরিশোধিত হয়েছে`;
  }

  return (
    <div className="rounded-xl px-4 py-3 text-xs shadow-2xl border border-border/50 bg-popover text-popover-foreground"
      style={{ backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)" }}>
      <p className="font-semibold text-foreground mb-1.5">{label}</p>
      {payload.filter((e: any) => e.dataKey !== "predSavings" && e.dataKey !== "predLoan").map((entry: any, i: number) => {
        const color = entry.dataKey === "savings" ? "hsl(var(--success, 142 71% 45%))" : "hsl(var(--primary))";
        const nameLabel = entry.dataKey === "savings" ? "সঞ্চয়" : "ঋণ পরিশোধ";
        return (
          <div key={i} className="flex items-center justify-between gap-4 py-0.5">
            <span className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
              <span className="text-muted-foreground">{nameLabel}</span>
            </span>
            <span className="font-mono font-bold text-foreground">৳{Number(entry.value).toLocaleString()}</span>
          </div>
        );
      })}
      {insight && (
        <p className="mt-2 pt-1.5 border-t border-border/30 text-muted-foreground text-[10px] leading-relaxed italic">
          {insight}
        </p>
      )}
    </div>
  );
};

/* ── Glowing Dot ── */
const GlowDot = ({ cx, cy, fill, showAchievement, large }: any) => {
  if (!cx || !cy) return null;
  const r = large ? 6 : 3.5;
  const rOuter = large ? 12 : 7;
  return (
    <g>
      <circle cx={cx} cy={cy} r={rOuter} fill={fill} opacity={0.18} />
      <circle cx={cx} cy={cy} r={r} fill={fill} stroke="hsl(var(--card))" strokeWidth={1.5} />
      {showAchievement && (
        <text x={cx} y={cy - 14} textAnchor="middle" fontSize="10" className="select-none">⭐</text>
      )}
    </g>
  );
};

export default function FinancialJourneyChart({ clientId, loanIds, dateRange }: Props) {
  const { lang } = useLanguage();
  const bn = lang === "bn";

  // Fetch loan schedules — all history
  const { data: schedules } = useQuery({
    queryKey: ["journey-schedules", loanIds.join(",")],
    queryFn: async () => {
      if (!loanIds.length) return [];
      const { data, error } = await supabase
        .from("loan_schedules")
        .select("due_date, principal_due, interest_due, principal_paid, interest_paid, status, paid_date")
        .in("loan_id", loanIds)
        .order("due_date", { ascending: true })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
    enabled: loanIds.length > 0,
  });

  // Fetch savings transactions — last 12 months minimum
  const { data: savingsTxns } = useQuery({
    queryKey: ["journey-savings-txns", clientId],
    queryFn: async () => {
      const twelveMonthsAgo = new Date();
      twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
      const { data, error } = await supabase
        .from("financial_transactions" as any)
        .select("created_at, transaction_type, amount, approval_status")
        .eq("member_id", clientId)
        .in("transaction_type", ["savings_deposit", "savings_withdrawal"])
        .eq("approval_status", "approved")
        .gte("created_at", twelveMonthsAgo.toISOString())
        .order("created_at", { ascending: true })
        .limit(500);
      if (error) throw error;
      return (data as any[]) ?? [];
    },
    enabled: !!clientId,
  });

  const chartData = useMemo(() => {
    if (!schedules?.length && !savingsTxns?.length) return [];

    const monthMap = new Map<string, { loanPaid: number; savings: number; onTime: boolean; allOnTime: boolean }>();
    let cumulativePaid = 0;
    const monthOnTime = new Map<string, { total: number; onTimeCount: number }>();

    for (const sch of schedules ?? []) {
      const monthKey = sch.due_date.slice(0, 7);
      const paid = Number(sch.principal_paid) + Number(sch.interest_paid);
      cumulativePaid += paid;

      const isOnTime = sch.status === "paid" && sch.paid_date
        ? new Date(sch.paid_date) <= new Date(sch.due_date)
        : sch.status === "paid";

      if (!monthOnTime.has(monthKey)) monthOnTime.set(monthKey, { total: 0, onTimeCount: 0 });
      const mOT = monthOnTime.get(monthKey)!;
      if (sch.status === "paid") { mOT.total++; if (isOnTime) mOT.onTimeCount++; }

      if (!monthMap.has(monthKey)) {
        monthMap.set(monthKey, { loanPaid: cumulativePaid, savings: 0, onTime: isOnTime, allOnTime: true });
      } else {
        const existing = monthMap.get(monthKey)!;
        existing.loanPaid = cumulativePaid;
        if (!isOnTime) existing.onTime = false;
      }
    }

    // Cumulative savings
    let cumSavings = 0;
    const savingsMap = new Map<string, number>();
    for (const tx of savingsTxns ?? []) {
      const monthKey = tx.created_at.slice(0, 7);
      const amt = Number(tx.amount);
      cumSavings += tx.transaction_type === "savings_deposit" ? amt : -amt;
      savingsMap.set(monthKey, Math.max(cumSavings, 0));
    }

    // If no data from either source, ensure we show at least last 6 months with zeros
    const allMonths = new Set([...monthMap.keys(), ...savingsMap.keys()]);
    
    // Ensure minimum 6 months of data points
    if (allMonths.size < 6) {
      const now = new Date();
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = d.toISOString().slice(0, 7);
        allMonths.add(key);
      }
    }

    const sorted = Array.from(allMonths).sort();
    let lastSavings = 0;
    let lastLoan = 0;

    const baseData = sorted
      .filter(month => {
        if (!dateRange?.from && !dateRange?.to) return true;
        const d = new Date(month + "-01");
        if (dateRange?.from && d < dateRange.from) return false;
        if (dateRange?.to && d > dateRange.to) return false;
        return true;
      })
      .map(month => {
        const entry = monthMap.get(month);
        const savings = savingsMap.get(month) ?? lastSavings;
        const loanPaid = entry?.loanPaid ?? lastLoan;
        lastSavings = savings;
        lastLoan = loanPaid;

        const mOT = monthOnTime.get(month);
        const perfectMonth = mOT ? (mOT.total > 0 && mOT.total === mOT.onTimeCount) : false;

        return {
          month,
          label: new Date(month + "-01").toLocaleDateString(bn ? "bn-BD" : "en-US", { month: "short", year: "2-digit" }),
          loanPaid: Math.round(loanPaid),
          savings: Math.round(savings),
          onTime: entry?.onTime ?? true,
          perfectMonth,
          isPrediction: false,
          predSavings: null as number | null,
          predLoan: null as number | null,
        };
      });

    if (!baseData.length) return [];

    // Single data point: just return it (we'll render large dots)
    if (baseData.length === 1) return baseData;

    // ── Predictive Ghost Line (3 months into future) ──
    const lastEntry = baseData[baseData.length - 1];
    const prevEntry = baseData[baseData.length - 2];
    const savingsTrend = lastEntry.savings - prevEntry.savings;
    const loanTrend = lastEntry.loanPaid - prevEntry.loanPaid;

    lastEntry.predSavings = lastEntry.savings;
    lastEntry.predLoan = lastEntry.loanPaid;

    for (let i = 1; i <= 3; i++) {
      const lastMonth = new Date(lastEntry.month + "-01");
      lastMonth.setMonth(lastMonth.getMonth() + i);
      const futureMonth = lastMonth.toISOString().slice(0, 7);

      baseData.push({
        month: futureMonth,
        label: lastMonth.toLocaleDateString(bn ? "bn-BD" : "en-US", { month: "short", year: "2-digit" }),
        loanPaid: 0,
        savings: 0,
        onTime: true,
        perfectMonth: false,
        isPrediction: true,
        predSavings: Math.round(Math.max(lastEntry.savings + savingsTrend * i, 0)),
        predLoan: Math.round(Math.max(lastEntry.loanPaid + loanTrend * i, 0)),
      });
    }

    return baseData;
  }, [schedules, savingsTxns, bn, dateRange]);

  const isSinglePoint = chartData.length === 1;

  if (!chartData.length) return null;

  return (
    <div className="card-elevated rounded-2xl p-5 animate-slide-up" style={{ animationDelay: "0.08s" }}>
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp className="w-5 h-5 text-primary" />
        <h3 className="text-sm font-bold text-foreground tracking-wide">
          {bn ? "আর্থিক যাত্রা" : "Financial Journey"}
        </h3>
        <span className="text-muted-foreground/50 text-[10px] ml-auto">{bn ? "ভবিষ্যৎ প্রজেকশন সহ" : "with forecast"}</span>
      </div>

      <div className="h-[260px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="savingsGradJourney" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(142, 71%, 45%)" stopOpacity={0.3} />
                <stop offset="100%" stopColor="hsl(142, 71%, 45%)" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="loanGradJourney" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.2} />
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10 }}
              className="text-muted-foreground"
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 9 }}
              className="text-muted-foreground"
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => v >= 1000 ? `৳${(v / 1000).toFixed(0)}k` : `৳${v}`}
            />
            <Tooltip content={<CustomTooltip />} />

            {/* Savings Area */}
            <Area
              type="monotone"
              dataKey="savings"
              name="savings"
              stroke="hsl(142, 71%, 45%)"
              strokeWidth={2.5}
              fill="url(#savingsGradJourney)"
              isAnimationActive={true}
              animationDuration={2000}
              animationEasing="ease-out"
              connectNulls={false}
              dot={(props: any) => {
                const entry = chartData[props.index];
                if (!entry || entry.isPrediction) return <g key={props.index} />;
                return <GlowDot key={props.index} cx={props.cx} cy={props.cy} fill="hsl(142, 71%, 45%)" showAchievement={entry.perfectMonth} large={isSinglePoint} />;
              }}
              activeDot={{ r: 5, stroke: "hsl(142, 71%, 45%)", strokeWidth: 2 }}
            />

            {/* Loan Paid Area */}
            <Area
              type="monotone"
              dataKey="loanPaid"
              name="loanPaid"
              stroke="hsl(var(--primary))"
              strokeWidth={2.5}
              fill="url(#loanGradJourney)"
              isAnimationActive={true}
              animationDuration={2000}
              animationEasing="ease-out"
              connectNulls={false}
              dot={(props: any) => {
                const entry = chartData[props.index];
                if (!entry || entry.isPrediction) return <g key={props.index} />;
                const color = entry.onTime ? "hsl(var(--primary))" : "hsl(var(--destructive))";
                return <GlowDot key={props.index} cx={props.cx} cy={props.cy} fill={color} large={isSinglePoint} />;
              }}
              activeDot={{ r: 5, stroke: "hsl(var(--primary))", strokeWidth: 2 }}
            />

            {/* Predictive Ghost Lines */}
            {!isSinglePoint && (
              <>
                <Line type="monotone" dataKey="predSavings" stroke="hsl(142, 71%, 45%)" strokeWidth={1.5} strokeDasharray="6 4" strokeOpacity={0.5} dot={false} isAnimationActive animationDuration={2000} connectNulls={false} />
                <Line type="monotone" dataKey="predLoan" stroke="hsl(var(--primary))" strokeWidth={1.5} strokeDasharray="6 4" strokeOpacity={0.5} dot={false} isAnimationActive animationDuration={2000} connectNulls={false} />
              </>
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-5 mt-3 text-[10px]">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ background: "hsl(142, 71%, 45%)" }} />
          <span className="text-muted-foreground">{bn ? "সঞ্চয়" : "Savings"}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-primary" />
          <span className="text-muted-foreground">{bn ? "ঋণ পরিশোধ" : "Loan Paid"}</span>
        </span>
        {!isSinglePoint && (
          <span className="flex items-center gap-1.5">
            <span className="w-3 border-t border-dashed border-muted-foreground/40" />
            <span className="text-muted-foreground/60">{bn ? "ভবিষ্যৎ" : "Forecast"}</span>
          </span>
        )}
        <span className="flex items-center gap-1">
          <span className="text-[9px]">⭐</span>
          <span className="text-muted-foreground/60">{bn ? "১০০% সময়মতো" : "100% On-time"}</span>
        </span>
      </div>
    </div>
  );
}
