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

  // Generate insightful Bengali sentence
  let insight = "";
  if (isPrediction) {
    insight = `ভবিষ্যৎ প্রজেকশন — আনুমানিক সঞ্চয় ৳${Number(savings).toLocaleString()}`;
  } else if (savings > loanPaid) {
    insight = `চমৎকার! আপনার সঞ্চয় ঋণ পরিশোধের চেয়ে বেশি 🎉`;
  } else if (loanPaid > 0) {
    insight = `এই মাসে মোট ৳${Number(loanPaid).toLocaleString()} পরিশোধিত হয়েছে`;
  }

  return (
    <div className="rounded-xl px-4 py-3 text-xs shadow-2xl border border-white/20"
      style={{
        background: "rgba(15, 23, 42, 0.88)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
      }}>
      <p className="font-semibold text-white/90 mb-1.5">{label}</p>
      {payload.filter((e: any) => e.dataKey !== "predSavings" && e.dataKey !== "predLoan").map((entry: any, i: number) => {
        const color = entry.dataKey === "savings" ? "#10b981" : "#3b82f6";
        const nameLabel = entry.dataKey === "savings" ? "সঞ্চয়" : "ঋণ পরিশোধ";
        return (
          <div key={i} className="flex items-center justify-between gap-4 py-0.5">
            <span className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
              <span className="text-white/70">{nameLabel}</span>
            </span>
            <span className="font-mono font-bold text-white">৳{Number(entry.value).toLocaleString()}</span>
          </div>
        );
      })}
      {insight && (
        <p className="mt-2 pt-1.5 border-t border-white/10 text-white/60 text-[10px] leading-relaxed italic">
          {insight}
        </p>
      )}
    </div>
  );
};

/* ── Glowing Dot with Achievement Icon ── */
const GlowDot = ({ cx, cy, fill, showAchievement }: any) => {
  if (!cx || !cy) return null;
  return (
    <g>
      <circle cx={cx} cy={cy} r={7} fill={fill} opacity={0.18} />
      <circle cx={cx} cy={cy} r={3.5} fill={fill} stroke="white" strokeWidth={1.5} />
      {showAchievement && (
        <text x={cx} y={cy - 12} textAnchor="middle" fontSize="10" className="select-none">⭐</text>
      )}
    </g>
  );
};

export default function FinancialJourneyChart({ clientId, loanIds, dateRange }: Props) {
  const { lang } = useLanguage();
  const bn = lang === "bn";

  // Fetch loan schedules
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

  // Fetch savings transactions
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

    const monthMap = new Map<string, { loanPaid: number; savings: number; onTime: boolean; allOnTime: boolean }>();
    let cumulativePaid = 0;

    // Track per-month on-time counts
    const monthOnTime = new Map<string, { total: number; onTimeCount: number }>();

    for (const sch of schedules) {
      const monthKey = sch.due_date.slice(0, 7);
      const paid = Number(sch.principal_paid) + Number(sch.interest_paid);
      cumulativePaid += paid;

      const isOnTime = sch.status === "paid" && sch.paid_date
        ? new Date(sch.paid_date) <= new Date(sch.due_date)
        : sch.status === "paid";

      if (!monthOnTime.has(monthKey)) {
        monthOnTime.set(monthKey, { total: 0, onTimeCount: 0 });
      }
      const mOT = monthOnTime.get(monthKey)!;
      if (sch.status === "paid") {
        mOT.total++;
        if (isOnTime) mOT.onTimeCount++;
      }

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

    // Merge
    const allMonths = new Set([...monthMap.keys(), ...savingsMap.keys()]);
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

    if (baseData.length < 2) return baseData;

    // ── Predictive Ghost Line (3 months into future) ──
    const lastEntry = baseData[baseData.length - 1];
    const prevEntry = baseData[baseData.length - 2];
    const savingsTrend = lastEntry.savings - prevEntry.savings;
    const loanTrend = lastEntry.loanPaid - prevEntry.loanPaid;

    // Bridge: last real point also starts the prediction
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

  if (!chartData.length) return null;

  return (
    <div className="rounded-2xl p-5 animate-slide-up border border-white/10"
      style={{
        background: "linear-gradient(145deg, #0f172a 0%, #1e293b 100%)",
        boxShadow: "0 8px 32px -8px rgba(0,0,0,0.5)",
        animationDelay: "0.08s",
      }}>
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp className="w-5 h-5 text-emerald-400" />
        <h3 className="text-sm font-bold text-white/90 tracking-wide">
          {bn ? "আর্থিক যাত্রা" : "Financial Journey"}
        </h3>
        <span className="text-white/30 text-[10px] ml-auto">{bn ? "ভবিষ্যৎ প্রজেকশন সহ" : "with forecast"}</span>
      </div>

      <div className="h-[260px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="savingsGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.4} />
                <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="loanGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: "rgba(255,255,255,0.45)" }}
              axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 9, fill: "rgba(255,255,255,0.35)" }}
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
              stroke="#10b981"
              strokeWidth={2.5}
              fill="url(#savingsGrad)"
              isAnimationActive={true}
              animationDuration={2000}
              animationEasing="ease-out"
              connectNulls={false}
              dot={(props: any) => {
                const entry = chartData[props.index];
                if (!entry || entry.isPrediction) return <g key={props.index} />;
                return <GlowDot key={props.index} cx={props.cx} cy={props.cy} fill="#10b981" showAchievement={entry.perfectMonth} />;
              }}
              activeDot={{ r: 5, stroke: "#10b981", strokeWidth: 2, fill: "#0f172a" }}
            />

            {/* Loan Paid Area */}
            <Area
              type="monotone"
              dataKey="loanPaid"
              name="loanPaid"
              stroke="#3b82f6"
              strokeWidth={2.5}
              fill="url(#loanGrad)"
              isAnimationActive={true}
              animationDuration={2000}
              animationEasing="ease-out"
              connectNulls={false}
              dot={(props: any) => {
                const entry = chartData[props.index];
                if (!entry || entry.isPrediction) return <g key={props.index} />;
                const color = entry.onTime ? "#3b82f6" : "#ef4444";
                return <GlowDot key={props.index} cx={props.cx} cy={props.cy} fill={color} />;
              }}
              activeDot={{ r: 5, stroke: "#3b82f6", strokeWidth: 2, fill: "#0f172a" }}
            />

            {/* Predictive Ghost Lines (dotted) */}
            <Line
              type="monotone"
              dataKey="predSavings"
              stroke="#10b981"
              strokeWidth={1.5}
              strokeDasharray="6 4"
              strokeOpacity={0.5}
              dot={false}
              isAnimationActive={true}
              animationDuration={2000}
              connectNulls={false}
            />
            <Line
              type="monotone"
              dataKey="predLoan"
              stroke="#3b82f6"
              strokeWidth={1.5}
              strokeDasharray="6 4"
              strokeOpacity={0.5}
              dot={false}
              isAnimationActive={true}
              animationDuration={2000}
              connectNulls={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-5 mt-3 text-[10px]">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ background: "#10b981" }} />
          <span className="text-white/55">{bn ? "সঞ্চয়" : "Savings"}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ background: "#3b82f6" }} />
          <span className="text-white/55">{bn ? "ঋণ পরিশোধ" : "Loan Paid"}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 border-t border-dashed" style={{ borderColor: "rgba(255,255,255,0.4)" }} />
          <span className="text-white/40">{bn ? "ভবিষ্যৎ" : "Forecast"}</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="text-[9px]">⭐</span>
          <span className="text-white/40">{bn ? "১০০% সময়মতো" : "100% On-time"}</span>
        </span>
      </div>
    </div>
  );
}
