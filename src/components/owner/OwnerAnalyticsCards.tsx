import { memo, Suspense, lazy, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Scale, Sparkles, Target, TrendingUp, Wallet, PiggyBank, Briefcase,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { differenceInYears } from "date-fns";

// Lazy load heavy Recharts components
const LazyPieChart = lazy(() =>
  import("recharts").then((m) => ({ default: m.PieChart }))
);
const LazyPie = lazy(() =>
  import("recharts").then((m) => ({ default: m.Pie }))
);
const LazyCell = lazy(() =>
  import("recharts").then((m) => ({ default: m.Cell }))
);
const LazyResponsiveContainer = lazy(() =>
  import("recharts").then((m) => ({ default: m.ResponsiveContainer }))
);
const LazyTooltip = lazy(() =>
  import("recharts").then((m) => ({ default: m.Tooltip }))
);

const DONUT_COLORS = ["hsl(var(--primary))", "hsl(var(--warning))", "hsl(var(--muted))"];
const PARTNERSHIP_END = new Date("2040-05-23");
const PROJECTED_YOY_GROWTH = 0.12;

const formatBDT = (v: number) => `৳${v.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const ChartFallback = () => (
  <div className="h-48 flex items-center justify-center">
    <Skeleton className="h-32 w-32 rounded-full" />
  </div>
);

interface OwnerAnalyticsCardsProps {
  totalCapital: number;
  totalProfitEarned: number;
  totalPaid: number;
  totalPending: number;
  bn: boolean;
}

const OwnerAnalyticsCards = memo(({
  totalCapital, totalProfitEarned, totalPaid, totalPending, bn,
}: OwnerAnalyticsCardsProps) => {
  const donutData = useMemo(() => [
    { name: bn ? "মূলধন" : "Capital Injected", value: totalCapital },
    { name: bn ? "মুনাফা প্রাপ্ত" : "Dividend Withdrawn", value: totalPaid },
    { name: bn ? "বকেয়া" : "Pending", value: totalPending },
  ].filter((d) => d.value > 0), [totalCapital, totalPaid, totalPending, bn]);

  const yearsRemaining = useMemo(() => Math.max(0, differenceInYears(PARTNERSHIP_END, new Date())), []);
  const projectedValue = useMemo(() => totalCapital * Math.pow(1 + PROJECTED_YOY_GROWTH, yearsRemaining), [totalCapital, yearsRemaining]);

  const metrics = useMemo(() => [
    { label: bn ? "মোট মুনাফা" : "Total Profit", value: formatBDT(totalProfitEarned), icon: <TrendingUp className="w-4 h-4" />, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10" },
    { label: bn ? "প্রাপ্ত" : "Received", value: formatBDT(totalPaid), icon: <Wallet className="w-4 h-4" />, color: "text-primary", bg: "bg-primary/10" },
    { label: bn ? "বকেয়া" : "Pending", value: formatBDT(totalPending), icon: <PiggyBank className="w-4 h-4" />, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/10" },
    { label: bn ? "মোট মূলধন" : "Total Capital", value: formatBDT(totalCapital), icon: <Briefcase className="w-4 h-4" />, color: "text-foreground", bg: "bg-muted/40" },
  ], [totalProfitEarned, totalPaid, totalPending, totalCapital, bn]);

  return (
    <>
      {/* Charts Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Donut Chart */}
        <Card className="border border-border/60">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center gap-2 text-primary">
              <Scale className="w-4 h-4" />
              <h3 className="text-xs font-bold uppercase tracking-wider">
                {bn ? "ক্যাপিটাল বনাম ডিভিডেন্ড" : "Capital vs Dividend"}
              </h3>
            </div>
            {donutData.length > 0 ? (
              <Suspense fallback={<ChartFallback />}>
                <div className="h-48">
                  <LazyResponsiveContainer width="100%" height="100%">
                    <LazyPieChart>
                      <LazyPie data={donutData} cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={3} dataKey="value" strokeWidth={0}>
                        {donutData.map((_, idx) => (
                          <LazyCell key={idx} fill={DONUT_COLORS[idx % DONUT_COLORS.length]} />
                        ))}
                      </LazyPie>
                      <LazyTooltip
                        contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "11px" }}
                        formatter={(value: number) => [formatBDT(value)]}
                      />
                    </LazyPieChart>
                  </LazyResponsiveContainer>
                </div>
              </Suspense>
            ) : (
              <div className="h-48 flex items-center justify-center text-xs text-muted-foreground">
                {bn ? "এখনো কোনো ডেটা নেই" : "No data yet"}
              </div>
            )}
            <div className="space-y-1.5">
              {donutData.map((d, i) => (
                <div key={d.name} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: DONUT_COLORS[i] }} />
                    <span className="text-muted-foreground">{d.name}</span>
                  </div>
                  <span className="font-semibold">{formatBDT(d.value)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* AI Wealth Projection */}
        <Card className={cn("border border-border/60 relative overflow-hidden", "bg-gradient-to-br from-primary/5 to-transparent")}>
          <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full bg-primary/5 blur-2xl" />
          <CardContent className="relative p-5 space-y-5">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-primary/10">
                <Sparkles className="w-4 h-4 text-primary" />
              </div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-primary">
                {bn ? "AI সম্পদ প্রজেকশন" : "AI Wealth Projection"}
              </h3>
            </div>
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-background/60 border border-border/40 space-y-1">
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                  {bn ? "বর্তমান মোট বিনিয়োগ" : "Current Total Investment"}
                </p>
                <p className="text-2xl font-extrabold text-foreground">{formatBDT(totalCapital)}</p>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Target className="w-3.5 h-3.5" />
                <span>{bn ? "বার্ষিক প্রত্যাশিত বৃদ্ধি: ১২%" : "Assumed annual growth: 12% YoY"}</span>
              </div>
              <div className="p-4 rounded-xl bg-primary/10 border border-primary/20 space-y-1">
                <p className="text-[10px] text-primary font-bold uppercase tracking-widest">
                  {bn ? "২০৪০ সালে প্রজেক্টেড মূল্য" : "Projected Value in 2040"}
                </p>
                <p className="text-3xl font-black text-primary tracking-tight">
                  {formatBDT(Math.round(projectedValue))}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {bn
                    ? `${yearsRemaining} বছরে আনুমানিক ${((projectedValue / Math.max(totalCapital, 1) - 1) * 100).toFixed(0)}% বৃদ্ধি`
                    : `~${((projectedValue / Math.max(totalCapital, 1) - 1) * 100).toFixed(0)}% growth over ${yearsRemaining} years`}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 gap-3">
        {metrics.map((m) => (
          <Card key={m.label} className="border border-border/50">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={cn("p-2 rounded-lg shrink-0", m.bg)}>
                <span className={m.color}>{m.icon}</span>
              </div>
              <div className="min-w-0">
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider truncate">{m.label}</p>
                <p className={cn("text-lg font-bold tracking-tight", m.color)}>{m.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
});

OwnerAnalyticsCards.displayName = "OwnerAnalyticsCards";
export default OwnerAnalyticsCards;
