import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { MetricCardSkeleton } from "@/components/ui/skeleton";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip,
  AreaChart, Area, XAxis, YAxis, CartesianGrid, BarChart, Bar, Legend,
} from "recharts";
import {
  TrendingUp, Users, AlertTriangle, ShieldAlert, Banknote,
  Activity, Flame, ArrowUpRight, ArrowDownRight,
} from "lucide-react";
import { format, subDays } from "date-fns";

// ── Hooks ──

const useRiskDistribution = () =>
  useQuery({
    queryKey: ["live_risk_distribution"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("credit_scores")
        .select("risk_level");
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data ?? []).forEach((r) => {
        const level = r.risk_level || "unknown";
        counts[level] = (counts[level] || 0) + 1;
      });
      return Object.entries(counts).map(([name, value]) => ({ name, value }));
    },
    staleTime: 30_000,
  });

const useWeeklyTrend = () =>
  useQuery({
    queryKey: ["live_weekly_trend"],
    queryFn: async () => {
      const sevenDaysAgo = subDays(new Date(), 7);
      const { data, error } = await supabase
        .from("transactions")
        .select("transaction_date, amount, type")
        .is("deleted_at", null)
        .gte("transaction_date", format(sevenDaysAgo, "yyyy-MM-dd"))
        .order("transaction_date", { ascending: true });
      if (error) throw error;

      const dailyMap = new Map<string, { repayments: number; interest: number; penalty: number; count: number }>();
      (data ?? []).forEach((tx: any) => {
        const day = tx.transaction_date;
        const entry = dailyMap.get(day) || { repayments: 0, interest: 0, penalty: 0, count: 0 };
        entry.count++;
        const amt = Number(tx.amount) || 0;
        if (tx.type === "loan_repayment") entry.repayments += amt;
        else if (tx.type === "loan_interest") entry.interest += amt;
        else if (tx.type === "loan_penalty") entry.penalty += amt;
        else entry.repayments += amt;
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

const useTopClients = () =>
  useQuery({
    queryKey: ["live_top_clients"],
    queryFn: async () => {
      const sevenDaysAgo = subDays(new Date(), 7);
      const { data, error } = await supabase
        .from("transactions")
        .select("client_id, amount")
        .is("deleted_at", null)
        .gte("transaction_date", format(sevenDaysAgo, "yyyy-MM-dd"));
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

      // Fetch client names
      if (sorted.length === 0) return [];
      const ids = sorted.map((s) => s.client_id);
      const { data: clients } = await supabase
        .from("clients")
        .select("id, name_bn, name_en")
        .in("id", ids);

      const nameMap = new Map((clients ?? []).map((c) => [c.id, { bn: c.name_bn, en: c.name_en }]));
      return sorted.map((s) => ({
        ...s,
        name: nameMap.get(s.client_id)?.bn || nameMap.get(s.client_id)?.en || "—",
      }));
    },
    staleTime: 30_000,
  });

const useLoanSummary = () =>
  useQuery({
    queryKey: ["live_loan_summary"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("loans")
        .select("status, total_principal")
        .is("deleted_at", null);
      if (error) throw error;

      const summary: Record<string, { count: number; amount: number }> = {};
      (data ?? []).forEach((l: any) => {
        const s = l.status || "unknown";
        if (!summary[s]) summary[s] = { count: 0, amount: 0 };
        summary[s].count++;
        summary[s].amount += Number(l.total_principal) || 0;
      });
      return summary;
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

// ── Component ──

export default function LiveTrendingTab() {
  const { data: riskData, isLoading: riskLoading } = useRiskDistribution();
  const { data: trendData, isLoading: trendLoading } = useWeeklyTrend();
  const { data: topClients, isLoading: topLoading } = useTopClients();
  const { data: loanSummary, isLoading: loanLoading } = useLoanSummary();

  const summaryMetrics = useMemo(() => {
    if (!trendData || trendData.length === 0) return { totalWeek: 0, avgDaily: 0, txCount: 0, trend: "stable" as const };
    const totalWeek = trendData.reduce((s, d) => s + d.total, 0);
    const avgDaily = Math.round(totalWeek / trendData.length);
    const txCount = trendData.reduce((s, d) => s + d.count, 0);
    const mid = Math.floor(trendData.length / 2);
    const firstHalf = trendData.slice(0, mid).reduce((s, d) => s + d.total, 0);
    const secondHalf = trendData.slice(mid).reduce((s, d) => s + d.total, 0);
    const trend = secondHalf > firstHalf * 1.05 ? "up" as const : secondHalf < firstHalf * 0.95 ? "down" as const : "stable" as const;
    return { totalWeek, avgDaily, txCount, trend };
  }, [trendData]);

  const totalRisk = useMemo(() => (riskData ?? []).reduce((s, d) => s + d.value, 0), [riskData]);

  if (riskLoading || trendLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => <MetricCardSkeleton key={i} />)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          title="সাপ্তাহিক সংগ্রহ"
          value={`৳${summaryMetrics.totalWeek.toLocaleString()}`}
          icon={<Banknote className="h-5 w-5" />}
          subtitle={summaryMetrics.trend === "up" ? "📈 বৃদ্ধি" : summaryMetrics.trend === "down" ? "📉 হ্রাস" : "📊 স্থিতিশীল"}
        />
        <MetricCard
          title="দৈনিক গড়"
          value={`৳${summaryMetrics.avgDaily.toLocaleString()}`}
          icon={<TrendingUp className="h-5 w-5" />}
          subtitle={`${summaryMetrics.txCount} ট্রানজেকশন`}
        />
        <MetricCard
          title="হাই রিস্ক"
          value={`${(riskData ?? []).filter((r) => r.name === "critical" || r.name === "high").reduce((s, r) => s + r.value, 0)}`}
          icon={<AlertTriangle className="h-5 w-5" />}
          subtitle={`মোট ${totalRisk} জন`}
        />
        <MetricCard
          title="মোট লোন"
          value={`${Object.values(loanSummary ?? {}).reduce((s, v) => s + v.count, 0)}`}
          icon={<Activity className="h-5 w-5" />}
          subtitle={`৳${Math.round(Object.values(loanSummary ?? {}).reduce((s, v) => s + v.amount, 0)).toLocaleString()}`}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 7-Day Collection Trend */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              ৭-দিনের সংগ্রহ ট্রেন্ড
              {summaryMetrics.trend === "up" && <ArrowUpRight className="h-4 w-4 text-emerald-500" />}
              {summaryMetrics.trend === "down" && <ArrowDownRight className="h-4 w-4 text-destructive" />}
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
                    <stop offset="5%" stopColor="hsl(var(--success))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--success))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" opacity={0.3} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `৳${(v / 1000).toFixed(0)}k`} />
                <RechartsTooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                  formatter={(value: number, name: string) => [`৳${value.toLocaleString()}`, name === "repayments" ? "আসল" : name === "interest" ? "সুদ" : "জরিমানা"]}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v) => v === "repayments" ? "আসল" : v === "interest" ? "সুদ" : "জরিমানা"} />
                <Area type="monotone" dataKey="repayments" stroke="hsl(var(--primary))" fill="url(#trendGrad)" strokeWidth={2} />
                <Area type="monotone" dataKey="interest" stroke="hsl(var(--success))" fill="url(#interestGrad)" strokeWidth={1.5} />
                <Area type="monotone" dataKey="penalty" stroke="hsl(var(--destructive))" fill="none" strokeWidth={1.5} strokeDasharray="5 5" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Risk Pie Chart */}
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
                <Pie
                  data={riskData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={3}
                  dataKey="value"
                  nameKey="name"
                >
                  {(riskData ?? []).map((entry) => (
                    <Cell key={entry.name} fill={RISK_COLORS[entry.name] || RISK_COLORS.unknown} />
                  ))}
                </Pie>
                <RechartsTooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
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
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: RISK_COLORS[r.name] || RISK_COLORS.unknown }} />
                  <span className="text-xs text-muted-foreground capitalize">{r.name}</span>
                  <Badge variant="outline" className="text-[10px] ml-auto">{r.value}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom Row: Top Clients + Loan Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top 10 Trending Clients */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Flame className="h-4 w-4 text-orange-500" />
              ট্রেন্ডিং ক্লায়েন্ট (৭ দিন)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="max-h-72">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>নাম</TableHead>
                    <TableHead className="text-right">সংগ্রহ</TableHead>
                    <TableHead className="text-right">TX</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(topClients ?? []).map((c, i) => (
                    <TableRow key={c.client_id}>
                      <TableCell>
                        <Badge variant={i < 3 ? "default" : "outline"} className="text-[10px]">
                          {i + 1}
                        </Badge>
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

        {/* Loan Status Summary */}
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
                    data={Object.entries(loanSummary ?? {}).map(([status, d]) => ({
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
                      contentStyle={{
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                        fontSize: "12px",
                      }}
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
                  {Object.entries(loanSummary ?? {}).map(([status, d]) => (
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
