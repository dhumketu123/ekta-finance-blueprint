import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { MetricCardSkeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip,
  AreaChart, Area, XAxis, YAxis, CartesianGrid, BarChart, Bar, Legend,
} from "recharts";
import {
  TrendingUp, Users, AlertTriangle, ShieldAlert, Banknote,
  Activity, Flame, ArrowUpRight, ArrowDownRight, Percent, Clock,
  BarChart3, Target,
} from "lucide-react";
import { format } from "date-fns";

// ── Types ──
type TransactionBucket = "repayments" | "interest" | "penalty";

// ── TX TYPE MAPPING (future-proof) ──
const TX_TYPE_MAP: Record<string, TransactionBucket> = {
  loan_repayment: "repayments",
  loan_principal: "repayments",
  loan_interest: "interest",
  loan_penalty: "penalty",
  savings_deposit: "repayments",
  savings_withdrawal: "repayments",
};

// ── Hooks ──

const useRiskDistribution = () =>
  useQuery({
    queryKey: ["live_risk_distribution"],
    queryFn: async () => {
      const { data, error } = await supabase.from("credit_scores").select("risk_level");
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data ?? []).forEach((r) => {
        counts[r.risk_level || "unknown"] = (counts[r.risk_level || "unknown"] || 0) + 1;
      });
      return Object.entries(counts).map(([name, value]) => ({ name, value }));
    },
    staleTime: 30_000,
  });

const useCollectionTrend = (days: number) =>
  useQuery({
    queryKey: ["live_collection_trend", days],
    queryFn: async () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      const { data, error } = await supabase
        .from("transactions")
        .select("transaction_date, amount, type")
        .is("deleted_at", null)
        .gte("transaction_date", startDate.toISOString().slice(0, 10))
        .order("transaction_date", { ascending: true });
      if (error) throw error;

      const dailyMap = new Map<string, { repayments: number; interest: number; penalty: number; count: number }>();
      (data ?? []).forEach((tx: any) => {
        const day = new Date(tx.transaction_date).toISOString().slice(0, 10);
        const entry = dailyMap.get(day) || { repayments: 0, interest: 0, penalty: 0, count: 0 };
        entry.count++;
        const amt = Number(tx.amount) || 0;
        const bucket = TX_TYPE_MAP[tx.type] || "repayments";
        entry[bucket] += amt;
        dailyMap.set(day, entry);
      });

      return Array.from(dailyMap.entries())
        .map(([date, d]) => ({
          date: format(new Date(date), "dd MMM"),
          rawDate: date,
          repayments: Math.round(d.repayments),
          interest: Math.round(d.interest),
          penalty: Math.round(d.penalty),
          total: Math.round(d.repayments + d.interest + d.penalty),
          count: d.count,
        }))
        .sort((a, b) => a.rawDate.localeCompare(b.rawDate));
    },
    staleTime: 30_000,
  });

const useTopClients = (days: number) =>
  useQuery({
    queryKey: ["live_top_clients", days],
    queryFn: async () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      const { data, error } = await supabase
        .from("transactions")
        .select("client_id, amount")
        .is("deleted_at", null)
        .gte("transaction_date", startDate.toISOString().slice(0, 10));
      if (error) throw error;

      const clientMap = new Map<string, { total: number; count: number }>();
      (data ?? []).forEach((tx: any) => {
        const entry = clientMap.get(tx.client_id) || { total: 0, count: 0 };
        entry.total += Number(tx.amount) || 0;
        entry.count++;
        clientMap.set(tx.client_id, entry);
      });

      const sorted = Array.from(clientMap.entries())
        .map(([id, d]) => ({ client_id: id, total: Math.round(d.total), count: d.count }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 10);

      if (sorted.length === 0) return [];
      const ids = sorted.map((s) => s.client_id);
      const { data: clients } = await supabase.from("clients").select("id, name_bn, name_en").in("id", ids);
      const nameMap = new Map((clients ?? []).map((c) => [c.id, { bn: c.name_bn, en: c.name_en }]));
      return sorted.map((s) => ({
        ...s,
        name: nameMap.get(s.client_id)?.bn || nameMap.get(s.client_id)?.en || `Client_${s.client_id.slice(0, 6)}`,
      }));
    },
    staleTime: 30_000,
  });

const useLoanKPIs = () =>
  useQuery({
    queryKey: ["live_loan_kpis"],
    queryFn: async () => {
      const { data: loans, error } = await supabase
        .from("loans")
        .select("status, total_principal, total_interest, outstanding_principal, penalty_amount, emi_amount")
        .is("deleted_at", null);
      if (error) throw error;

      const summary: Record<string, { count: number; amount: number }> = {};
      let totalOutstanding = 0;
      let totalPenalty = 0;
      let totalEmi = 0;
      let emiCount = 0;

      (loans ?? []).forEach((l: any) => {
        const s = l.status || "unknown";
        if (!summary[s]) summary[s] = { count: 0, amount: 0 };
        summary[s].count++;
        summary[s].amount += Number(l.total_principal) || 0;
        totalOutstanding += Number(l.outstanding_principal) || 0;
        totalPenalty += Number(l.penalty_amount) || 0;
        if (l.emi_amount > 0) {
          totalEmi += Number(l.emi_amount);
          emiCount++;
        }
      });

      return {
        summary,
        totalOutstanding: Math.round(totalOutstanding),
        totalPenalty: Math.round(totalPenalty),
        avgEmi: emiCount > 0 ? Math.round(totalEmi / emiCount) : 0,
        totalLoans: (loans ?? []).length,
        activeRate: summary.active ? Math.round((summary.active.count / (loans ?? []).length) * 100) : 0,
        defaultRate: summary.default ? Math.round((summary.default.count / (loans ?? []).length) * 100) : 0,
      };
    },
    staleTime: 60_000,
  });

// ── Colors ──
const RISK_COLORS: Record<string, string> = {
  critical: "hsl(0, 84%, 60%)",
  high: "hsl(25, 95%, 53%)",
  medium: "hsl(45, 93%, 47%)",
  low: "hsl(142, 71%, 45%)",
  unknown: "hsl(215, 14%, 60%)",
};

const STATUS_LABELS: Record<string, string> = {
  active: "সক্রিয়",
  closed: "বন্ধ",
  default: "ডিফল্ট",
  overdue: "ওভারডিউ",
};

// ── Auto-alert hook ──
const useRiskAlerts = (riskData: { name: string; value: number }[] = []) => {
  const prevAlertRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    riskData.forEach((r) => {
      if ((r.name === "critical" || r.name === "high") && r.value > 0) {
        const key = `${r.name}-${r.value}`;
        if (!prevAlertRef.current.has(key)) {
          prevAlertRef.current.add(key);
          console.log(`[RISK ALERT] ${r.name}: ${r.value} clients flagged`);
        }
      }
    });
  }, [riskData]);
};

// ── Component ──
export default function LiveTrendingTab() {
  const [period, setPeriod] = useState<7 | 30>(7);

  const { data: riskData, isLoading: riskLoading, error: riskError } = useRiskDistribution();
  const { data: trendData, isLoading: trendLoading, error: trendError } = useCollectionTrend(period);
  const { data: topClients } = useTopClients(period);
  const { data: loanKPIs, isLoading: loanLoading } = useLoanKPIs();

  const { data: prevTrendData } = useCollectionTrend(period * 2);

  useRiskAlerts(riskData);

  const metrics = useMemo(() => {
    if (!trendData || trendData.length === 0)
      return { totalCurrent: 0, avgDaily: 0, txCount: 0, trend: "stable" as const, growthPct: 0, avgRepayment: 0 };

    const totalCurrent = trendData.reduce((s, d) => s + d.total, 0);
    const avgDaily = Math.round(totalCurrent / trendData.length);
    const txCount = trendData.reduce((s, d) => s + d.count, 0);
    const avgRepayment = txCount > 0 ? Math.round(totalCurrent / txCount) : 0;

    let totalPrev = 0;
    if (prevTrendData && prevTrendData.length > 0) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - period);
      const cutoffStr = cutoff.toISOString().slice(0, 10);
      totalPrev = prevTrendData.filter((d) => d.rawDate < cutoffStr).reduce((s, d) => s + d.total, 0);
    }

    const growthPct = totalPrev > 0 ? Math.round(((totalCurrent - totalPrev) / totalPrev) * 100) : 0;
    const trend = growthPct > 5 ? ("up" as const) : growthPct < -5 ? ("down" as const) : ("stable" as const);

    return { totalCurrent, avgDaily, txCount, trend, growthPct, avgRepayment };
  }, [trendData, prevTrendData, period]);

  const totalRisk = useMemo(() => (riskData ?? []).reduce((s, d) => s + d.value, 0), [riskData]);
  const highRiskCount = useMemo(
    () => (riskData ?? []).filter((r) => r.name === "critical" || r.name === "high").reduce((s, r) => s + r.value, 0),
    [riskData]
  );

  if (riskError || trendError) {
    return (
      <div className="flex items-center justify-center p-8 text-destructive">
        <AlertTriangle className="h-5 w-5 mr-2" />
        <span className="text-sm">ডেটা লোড করতে সমস্যা হয়েছে। পুনরায় চেষ্টা করুন।</span>
      </div>
    );
  }

  if (riskLoading || trendLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <MetricCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Period Toggle */}
      <div className="flex items-center gap-2">
        <Clock className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">সময়কাল:</span>
        <div className="flex gap-1">
          {([7, 30] as const).map((p) => (
            <Button
              key={p}
              size="sm"
              variant={period === p ? "default" : "outline"}
              className="h-7 text-xs"
              onClick={() => setPeriod(p)}
            >
              {p} দিন
            </Button>
          ))}
        </div>
        {metrics.trend !== "stable" && (
          <Badge
            variant={metrics.trend === "up" ? "default" : "destructive"}
            className="ml-auto text-xs gap-1"
          >
            {metrics.trend === "up" ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {metrics.growthPct > 0 ? "+" : ""}
            {metrics.growthPct}% গত পিরিয়ডের তুলনায়
          </Badge>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          title="মোট সংগ্রহ"
          value={`৳${metrics.totalCurrent.toLocaleString()}`}
          icon={<Banknote className="h-5 w-5" />}
          subtitle={`${period} দিনে`}
          variant={metrics.trend === "up" ? "success" : metrics.trend === "down" ? "destructive" : "default"}
        />
        <MetricCard
          title="দৈনিক গড়"
          value={`৳${metrics.avgDaily.toLocaleString()}`}
          icon={<TrendingUp className="h-5 w-5" />}
          subtitle={`${metrics.txCount} ট্রানজেকশন`}
        />
        <MetricCard
          title="গড় রিপেমেন্ট"
          value={`৳${metrics.avgRepayment.toLocaleString()}`}
          icon={<Target className="h-5 w-5" />}
          subtitle="প্রতি ট্রানজেকশনে"
        />
        <MetricCard
          title="হাই রিস্ক"
          value={`${highRiskCount}`}
          icon={<AlertTriangle className="h-5 w-5" />}
          subtitle={`মোট ${totalRisk} জন স্কোরড`}
          variant={highRiskCount > 50 ? "destructive" : highRiskCount > 20 ? "warning" : "default"}
        />
      </div>

      {/* KPI Row */}
      {loanKPIs && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard
            title="বকেয়া আসল"
            value={`৳${loanKPIs.totalOutstanding.toLocaleString()}`}
            icon={<BarChart3 className="h-5 w-5" />}
            subtitle={`${loanKPIs.totalLoans}টি লোন`}
            variant="warning"
          />
          <MetricCard
            title="মোট জরিমানা"
            value={`৳${loanKPIs.totalPenalty.toLocaleString()}`}
            icon={<ShieldAlert className="h-5 w-5" />}
            subtitle="সকল লোনে"
            variant={loanKPIs.totalPenalty > 10000 ? "destructive" : "default"}
          />
          <MetricCard
            title="সক্রিয় হার"
            value={`${loanKPIs.activeRate}%`}
            icon={<Percent className="h-5 w-5" />}
            subtitle={`ডিফল্ট ${loanKPIs.defaultRate}%`}
            variant={loanKPIs.activeRate > 80 ? "success" : "warning"}
          />
          <MetricCard
            title="গড় EMI"
            value={`৳${loanKPIs.avgEmi.toLocaleString()}`}
            icon={<Activity className="h-5 w-5" />}
            subtitle="মাসিক কিস্তি"
          />
        </div>
      )}

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Collection Trend */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              {period}-দিনের সংগ্রহ ট্রেন্ড
              {metrics.trend === "up" && <ArrowUpRight className="h-4 w-4 text-emerald-500" />}
              {metrics.trend === "down" && <ArrowDownRight className="h-4 w-4 text-destructive" />}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={trendData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="interestGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(142, 71%, 45%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(142, 71%, 45%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" opacity={0.3} />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `৳${(v / 1000).toFixed(0)}k`} />
                <RechartsTooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }}
                  formatter={(value: number, name: string) => [
                    `৳${value.toLocaleString()}`,
                    name === "repayments" ? "আসল" : name === "interest" ? "সুদ" : "জরিমানা",
                  ]}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v) => (v === "repayments" ? "আসল" : v === "interest" ? "সুদ" : "জরিমানা")} />
                <Area type="monotone" dataKey="repayments" stroke="hsl(var(--primary))" fill="url(#trendGrad)" strokeWidth={2} />
                <Area type="monotone" dataKey="interest" stroke="hsl(142, 71%, 45%)" fill="url(#interestGrad)" strokeWidth={1.5} />
                <Area type="monotone" dataKey="penalty" stroke="hsl(var(--destructive))" fill="none" strokeWidth={1.5} strokeDasharray="5 5" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Risk Pie */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-destructive" />
              রিস্ক বিতরণ
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={riskData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value" nameKey="name">
                  {(riskData ?? []).map((entry) => (
                    <Cell key={entry.name} fill={RISK_COLORS[entry.name] || RISK_COLORS.unknown} />
                  ))}
                </Pie>
                <RechartsTooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }}
                  formatter={(value: number, name: string) => [
                    `${value} জন (${totalRisk > 0 ? Math.round((value / totalRisk) * 100) : 0}%)`,
                    name === "critical" ? "🔴 ক্রিটিকাল" : name === "high" ? "🟠 হাই" : name === "medium" ? "🟡 মিডিয়াম" : "🟢 লো",
                  ]}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {(riskData ?? []).map((r) => (
                <div key={r.name} className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: RISK_COLORS[r.name] || RISK_COLORS.unknown }} />
                  <span className="text-xs text-muted-foreground capitalize">{r.name}</span>
                  <Badge variant="outline" className="text-[10px] ml-auto">{r.value}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top Clients */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Flame className="h-4 w-4 text-orange-500" />
              ট্রেন্ডিং ক্লায়েন্ট ({period} দিন)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="max-h-72">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>নাম</TableHead>
                    <TableHead className="text-right">সংগ্রহ</TableHead>
                    <TableHead className="text-right">TX</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(topClients ?? []).map((c, i) => (
                    <TableRow key={c.client_id}>
                      <TableCell>
                        <Badge variant={i < 3 ? "default" : "outline"} className="text-[10px]">{i + 1}</Badge>
                      </TableCell>
                      <TableCell className="text-sm font-medium truncate max-w-[150px]">{c.name}</TableCell>
                      <TableCell className="text-right text-sm font-mono">৳{c.total.toLocaleString()}</TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">{c.count}</TableCell>
                    </TableRow>
                  ))}
                  {(topClients ?? []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground text-sm py-6">
                        কোনো ট্রেন্ডিং ক্লায়েন্ট নেই
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Loan Summary */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              লোন স্ট্যাটাস সারাংশ
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loanLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => <div key={i} className="h-8 bg-muted animate-pulse rounded" />)}
              </div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart
                    data={Object.entries(loanKPIs?.summary ?? {}).map(([status, d]) => ({
                      status: STATUS_LABELS[status] || status,
                      count: d.count,
                      amount: Math.round(d.amount / 1000),
                    }))}
                    margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" opacity={0.3} />
                    <XAxis dataKey="status" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <RechartsTooltip
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }}
                      formatter={(value: number, name: string) => [
                        name === "amount" ? `৳${value}k` : `${value}টি`,
                        name === "amount" ? "পরিমাণ" : "সংখ্যা",
                      ]}
                    />
                    <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="count" />
                    <Bar dataKey="amount" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} name="amount" />
                  </BarChart>
                </ResponsiveContainer>
                <div className="grid grid-cols-2 gap-3 mt-3">
                  {Object.entries(loanKPIs?.summary ?? {}).map(([status, d]) => (
                    <div key={status} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                      <div>
                        <p className="text-xs font-medium">{STATUS_LABELS[status] || status}</p>
                        <p className="text-[10px] text-muted-foreground">{d.count}টি লোন</p>
                      </div>
                      <p className="text-sm font-mono font-bold">৳{Math.round(d.amount).toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
