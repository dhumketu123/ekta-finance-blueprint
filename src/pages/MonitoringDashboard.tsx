import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { MetricCardSkeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Activity, CheckCircle, XCircle, Clock, RefreshCw, Zap, AlertTriangle,
  BarChart3, Server, ShieldAlert, Rocket, HeartPulse, Wrench, Info,
  ChevronLeft, ChevronRight, Dna, Database, Code2, Settings2, Flag, BrainCircuit,
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AnomalyIntelligencePanel from "@/components/analytics/AnomalyIntelligencePanel";
import LedgerIntegrityPanel from "@/components/analytics/LedgerIntegrityPanel";
import LaunchReadinessPanel from "@/components/ops/LaunchReadinessPanel";
import {
  useSystemHealth, useAutoFixLogs, useHealthHistory,
  useHealthTrend, useHealthRealtime,
} from "@/hooks/useSystemHealth";
import { format } from "date-fns";
import { useAiBrainContext } from "@/hooks/useAiBrainContext";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  ResponsiveContainer, Legend, BarChart, Bar, Tooltip as RechartsTooltip,
} from "recharts";

const STATUS_ICON: Record<string, string> = { pass: "✓", warn: "⚠", fail: "✗" };
const STATUS_COLOR: Record<string, string> = {
  pass: "text-emerald-600",
  warn: "text-amber-500",
  fail: "text-destructive",
};

const useNotificationStats = () =>
  useQuery({
    queryKey: ["monitoring_notification_stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notification_logs")
        .select("delivery_status, channel, event_type, retry_count, created_at")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data;
    },
    staleTime: 30_000,
  });

const useAuditLogs = () =>
  useQuery({
    queryKey: ["monitoring_audit_logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("action_type, created_at, details")
        .in("action_type", ["predict_loan_risk", "savings_reconciliation_alert", "ledger_entry"])
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
    staleTime: 60_000,
  });

const useLoanStats = () =>
  useQuery({
    queryKey: ["monitoring_loan_stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("loans")
        .select("status")
        .is("deleted_at", null);
      if (error) throw error;
      return data;
    },
    staleTime: 60_000,
  });

// ── Live Health Tab Component ──
const LiveHealthTab = () => {
  const { data: health, isLoading: healthLoading } = useSystemHealth(true, 15_000);
  const { data: autoFixLogs = [] } = useAutoFixLogs(15);
  const { data: healthHistory = [] } = useHealthHistory(50);
  const trend = useHealthTrend(health);
  useHealthRealtime();

  const trendChartData = useMemo(() => {
    return trend.data.map((p) => ({
      time: format(new Date(p.timestamp), "HH:mm"),
      পাস: p.pass,
      সতর্কতা: p.warn,
      ব্যর্থ: p.fail,
      latency_ms: p.latency_ms ?? 0,
    }));
  }, [trend.data]);

  // Latency chart from health checks
  const latencyData = useMemo(() => {
    if (!health?.checks) return [];
    return health.checks.map((c) => ({
      name: c.name,
      latency: c.latency_ms ?? 0,
    }));
  }, [health]);

  if (healthLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {Array.from({ length: 4 }).map((_, i) => <MetricCardSkeleton key={i} />)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overall Status + Summary Cards */}
      {health && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className={
            health.status === "healthy" ? "border-emerald-500/50"
            : health.status === "degraded" ? "border-amber-500/50"
            : "border-destructive/50"
          }>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-3">
                <HeartPulse className={`h-6 w-6 ${
                  health.status === "healthy" ? "text-emerald-500"
                  : health.status === "degraded" ? "text-amber-500"
                  : "text-destructive"
                }`} />
                <div>
                  <p className="text-lg font-bold capitalize">{health.status}</p>
                  <p className="text-xs text-muted-foreground">সামগ্রিক অবস্থা</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-3">
                <CheckCircle className="h-5 w-5 text-emerald-500" />
                <div>
                  <p className="text-2xl font-bold">{health.summary.pass}</p>
                  <p className="text-xs text-muted-foreground">পাস</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                <div>
                  <p className="text-2xl font-bold">{health.summary.warn}</p>
                  <p className="text-xs text-muted-foreground">সতর্কতা</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-3">
                <XCircle className="h-5 w-5 text-destructive" />
                <div>
                  <p className="text-2xl font-bold">{health.summary.fail}</p>
                  <p className="text-xs text-muted-foreground">ব্যর্থ</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Check List Table + Thresholds */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Check List */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              হেলথ চেক তালিকা
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="max-h-80">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>স্ট্যাটাস</TableHead>
                    <TableHead>চেক নাম</TableHead>
                    <TableHead>লেটেন্সি</TableHead>
                    <TableHead>বিবরণ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {health?.checks?.map((check) => (
                    <TableRow key={check.name}>
                      <TableCell>
                        <span className={`text-sm font-bold ${STATUS_COLOR[check.status]}`}>
                          {STATUS_ICON[check.status]}
                        </span>
                      </TableCell>
                      <TableCell className="font-medium text-sm">{check.name}</TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground font-mono">
                          {check.latency_ms ?? "—"}ms
                        </span>
                      </TableCell>
                      <TableCell>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-xs text-muted-foreground truncate max-w-[200px] block cursor-help">
                                {check.detail || "—"}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="left" className="max-w-sm">
                              <p className="text-xs">{check.detail}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Thresholds Panel */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              থ্রেশোল্ড কনফিগ
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Stuck Sync Timeout</span>
                <Badge variant="outline">{health?.thresholds?.stuck_running_minutes ?? 30} মিনিট</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Stale Threshold</span>
                <Badge variant="outline">{health?.thresholds?.stale_hours ?? 6} ঘণ্টা</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">মোট লেটেন্সি</span>
                <Badge variant="secondary">{health?.total_latency_ms ?? "—"}ms</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Run ID</span>
                <span className="text-[10px] font-mono text-muted-foreground truncate max-w-[120px]">
                  {health?.run_id?.slice(0, 8) ?? "—"}
                </span>
              </div>
            </div>

            <div className="pt-2 border-t">
              <p className="text-xs font-medium mb-2 text-muted-foreground">লেটেন্সি ব্রেকডাউন</p>
              {latencyData.length > 0 && (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={latencyData} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                    <XAxis type="number" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} unit="ms" />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 9 }} width={85} tickLine={false} axisLine={false} />
                    <RechartsTooltip
                      formatter={(v: number) => [`${v}ms`, "লেটেন্সি"]}
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}
                    />
                    <Bar dataKey="latency" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} barSize={14} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Trend Chart + Auto-Fix Logs side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Trend Chart */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">হেলথ ট্রেন্ড</CardTitle>
              {trend.totalPages > 1 && (
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-6 w-6" disabled={trend.page >= trend.totalPages - 1} onClick={trend.nextPage}>
                    <ChevronLeft className="h-3 w-3" />
                  </Button>
                  <span className="text-[10px] text-muted-foreground">{trend.page + 1}/{trend.totalPages}</span>
                  <Button variant="ghost" size="icon" className="h-6 w-6" disabled={trend.page <= 0} onClick={trend.prevPage}>
                    <ChevronRight className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {trendChartData.length < 2 ? (
              <p className="text-center py-8 text-muted-foreground text-sm">ট্রেন্ড ডেটা সংগ্রহ হচ্ছে...</p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={trendChartData} margin={{ top: 20, right: 40, left: 0, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" opacity={0.3} />
                  <XAxis
                    dataKey="time"
                    tick={{ fontSize: 12 }}
                    label={{ value: "সময়", position: "insideBottom", offset: -10, fontSize: 12 }}
                  />
                  <YAxis
                    yAxisId="left"
                    allowDecimals={false}
                    tick={{ fontSize: 12 }}
                    label={{ value: "চেক সংখ্যা", angle: -90, position: "insideLeft", fontSize: 12 }}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tick={{ fontSize: 12 }}
                    domain={[0, "dataMax + 100"]}
                    label={{ value: "লেটেন্সি", angle: 90, position: "insideRight", fontSize: 12 }}
                  />
                  <RechartsTooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}
                    formatter={(value: number, name: string) => [
                      name === "latency_ms" ? `${value}ms` : `${value} checks`,
                      name === "latency_ms" ? "লেটেন্সি" : name,
                    ]}
                    labelFormatter={(label) => `সময়: ${label}`}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                  <Line yAxisId="left" type="monotone" dataKey="পাস" stroke="#16a34a" strokeWidth={1.5} dot={false} />
                  <Line yAxisId="left" type="monotone" dataKey="সতর্কতা" stroke="#facc15" strokeWidth={1.5} dot={false} />
                  <Line yAxisId="left" type="monotone" dataKey="ব্যর্থ" stroke="#dc2626" strokeWidth={1.5} dot={false} />
                  <Line yAxisId="right" type="monotone" dataKey="latency_ms" stroke="#3b82f6" strokeWidth={1.5} dot={false} name="লেটেন্সি (ms)" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Auto-Fix Logs */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Wrench className="h-4 w-4 text-primary" />
              অটো-ফিক্স লগ
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="max-h-64">
              {autoFixLogs.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground text-sm">কোনো অটো-ফিক্স চালানো হয়নি</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>অ্যাকশন</TableHead>
                      <TableHead>চেক</TableHead>
                      <TableHead>ফলাফল</TableHead>
                      <TableHead>সময়</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {autoFixLogs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="text-xs font-medium">{log.action_name}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{log.triggered_by_check}</TableCell>
                        <TableCell>
                          {log.success ? (
                            <Badge variant="default" className="text-[10px]">✅ সফল</Badge>
                          ) : (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger>
                                  <Badge variant="destructive" className="text-[10px]">❌ ব্যর্থ</Badge>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs">
                                  <p className="text-xs">{log.error_message || "Unknown error"}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </TableCell>
                        <TableCell className="text-[10px] text-muted-foreground">
                          {format(new Date(log.created_at), "dd MMM HH:mm")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

// ── Main Dashboard ──
const MonitoringDashboard = () => {
  const { lang } = useLanguage();
  const { data: notifLogs, isLoading: notifLoading, refetch: refetchNotif, isFetching } = useNotificationStats();
  const { data: auditLogs, isLoading: auditLoading, refetch: refetchAudit } = useAuditLogs();
  const { data: loanStats, isLoading: loanLoading } = useLoanStats();

  const isLoading = notifLoading || auditLoading || loanLoading;

  const stats = useMemo(() => {
    if (!notifLogs) return { total: 0, sent: 0, failed: 0, queued: 0, retried: 0, sms: 0, whatsapp: 0, deliveryRate: 0 };
    const total = notifLogs.length;
    const sent = notifLogs.filter(n => n.delivery_status === "sent" || n.delivery_status === "delivered").length;
    const failed = notifLogs.filter(n => n.delivery_status === "failed").length;
    const queued = notifLogs.filter(n => n.delivery_status === "queued").length;
    const retried = notifLogs.filter(n => n.retry_count > 0).length;
    const sms = notifLogs.filter(n => n.channel === "sms").length;
    const whatsapp = notifLogs.filter(n => n.channel === "whatsapp").length;
    const deliveryRate = total > 0 ? ((sent / total) * 100) : 0;
    return { total, sent, failed, queued, retried, sms, whatsapp, deliveryRate };
  }, [notifLogs]);

  const loanHealth = useMemo(() => {
    if (!loanStats) return { active: 0, closed: 0, defaulted: 0, total: 0 };
    const active = loanStats.filter(l => l.status === "active").length;
    const closed = loanStats.filter(l => l.status === "closed").length;
    const defaulted = loanStats.filter(l => l.status === "default").length;
    return { active, closed, defaulted, total: loanStats.length };
  }, [loanStats]);

  const cronRuns = useMemo(() => {
    if (!auditLogs) return [];
    return auditLogs.map(log => ({ type: log.action_type, time: log.created_at, details: log.details as any }));
  }, [auditLogs]);

  const failedByEvent = useMemo(() => {
    if (!notifLogs) return [];
    const map: Record<string, number> = {};
    notifLogs.filter(n => n.delivery_status === "failed").forEach(n => { map[n.event_type] = (map[n.event_type] || 0) + 1; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [notifLogs]);

  const refetchAll = () => { refetchNotif(); refetchAudit(); };

  const cronLabels: Record<string, { en: string; bn: string }> = {
    predict_loan_risk: { en: "Risk Scoring", bn: "ঝুঁকি স্কোরিং" },
    savings_reconciliation_alert: { en: "Savings Reconciliation", bn: "সঞ্চয় সমন্বয়" },
    ledger_entry: { en: "Ledger Entry", bn: "লেজার এন্ট্রি" },
  };

// ── AI Knowledge Tab ──
const AiKnowledgeTab = () => {
  const { lang } = useLanguage();
  const [syncing, setSyncing] = useState(false);
  const [filterCat, setFilterCat] = useState<string | null>(null);

  const {
    entries, relations, history, stats, isLoading, syncAndRefresh,
    queryByCategory,
  } = useAiBrainContext();

  const handleSync = async () => {
    setSyncing(true);
    try {
      await syncAndRefresh();
    } catch {
      // toast handled inside hook
    } finally {
      setSyncing(false);
    }
  };

  const displayEntries = filterCat ? queryByCategory(filterCat) : entries;

  const categoryIcons: Record<string, React.ReactNode> = {
    database_table: <Database className="w-4 h-4 text-blue-500" />,
    edge_function: <Code2 className="w-4 h-4 text-purple-500" />,
    business_rule: <Settings2 className="w-4 h-4 text-orange-500" />,
    feature_flag: <Flag className="w-4 h-4 text-emerald-500" />,
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <BrainCircuit className="w-5 h-5 text-primary" />
            {lang === "bn" ? "AI ব্রেইন কনটেক্সট লেয়ার" : "AI Brain Context Layer"}
          </h3>
          <p className="text-xs text-muted-foreground">
            {lang === "bn"
              ? `মার্জড ভিউ — ${stats.totalEntries} এন্ট্রি, ${relations.length} রিলেশন, ${history.length} হিস্টোরি স্ন্যাপশট`
              : `Merged view — ${stats.totalEntries} entries, ${relations.length} relations, ${history.length} history snapshots`}
          </p>
        </div>
        <Button size="sm" onClick={handleSync} disabled={syncing} className="gap-1.5">
          <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? (lang === "bn" ? "সিঙ্ক হচ্ছে..." : "Syncing...") : (lang === "bn" ? "ব্রেইন সিঙ্ক" : "Brain Sync")}
        </Button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <Card className={`cursor-pointer transition-colors ${filterCat === null ? "ring-2 ring-primary" : ""}`} onClick={() => setFilterCat(null)}>
          <CardContent className="pt-4 pb-3">
            <p className="text-2xl font-bold">{stats.totalEntries}</p>
            <p className="text-xs text-muted-foreground">{lang === "bn" ? "মোট এন্ট্রি" : "Total"}</p>
          </CardContent>
        </Card>
        {Object.entries(stats.byCategory).map(([cat, count]) => (
          <Card key={cat} className={`cursor-pointer transition-colors ${filterCat === cat ? "ring-2 ring-primary" : ""}`} onClick={() => setFilterCat(filterCat === cat ? null : cat)}>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2">
                {categoryIcons[cat] || <Info className="w-4 h-4" />}
                <div>
                  <p className="text-xl font-bold">{String(count)}</p>
                  <p className="text-xs text-muted-foreground capitalize">{cat.replace(/_/g, " ")}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-2xl font-bold">{stats.avgCriticality}</p>
            <p className="text-xs text-muted-foreground">{lang === "bn" ? "গড় ক্রিটিক্যালিটি" : "Avg Criticality"}</p>
          </CardContent>
        </Card>
      </div>

      {/* Merged knowledge table */}
      {isLoading ? (
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <MetricCardSkeleton key={i} />)}
        </div>
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              {filterCat
                ? `${lang === "bn" ? "ফিল্টার:" : "Filter:"} ${filterCat.replace(/_/g, " ")} (${displayEntries.length})`
                : (lang === "bn" ? "AI কনটেক্সট ডেটা" : "AI Context Data")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[130px]">{lang === "bn" ? "ক্যাটাগরি" : "Category"}</TableHead>
                    <TableHead>{lang === "bn" ? "নাম" : "Name"}</TableHead>
                    <TableHead className="hidden md:table-cell">{lang === "bn" ? "বিবরণ" : "Description"}</TableHead>
                    <TableHead className="w-[60px] text-center">{lang === "bn" ? "ভার্সন" : "Ver"}</TableHead>
                    <TableHead className="w-[70px] text-center">{lang === "bn" ? "ক্রিটিক্যালিটি" : "Crit"}</TableHead>
                    <TableHead className="w-[60px] text-center">{lang === "bn" ? "স্ট্যাটাস" : "Status"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayEntries.map((entry: any, idx: number) => (
                    <TableRow key={`${entry.entity_category}-${entry.entity_name}-${idx}`}>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          {categoryIcons[entry.entity_category] || <Info className="w-3 h-3" />}
                          <Badge variant="outline" className="text-[10px]">{entry.entity_category?.replace(/_/g, " ")}</Badge>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{entry.entity_name}</TableCell>
                      <TableCell className="hidden md:table-cell text-xs text-muted-foreground max-w-[300px] truncate">{entry.description}</TableCell>
                      <TableCell className="text-center text-xs">{entry.version}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant={entry.criticality_score >= 4 ? "destructive" : entry.criticality_score >= 2 ? "secondary" : "outline"} className="text-[10px]">
                          {entry.criticality_score}/5
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={entry.is_active ? "default" : "secondary"} className="text-[10px]">
                          {entry.is_active ? "✓" : "✗"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* Dependency & History summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-1.5">
              <Dna className="w-4 h-4 text-primary" />
              {lang === "bn" ? "ডিপেন্ডেন্সি গ্রাফ" : "Dependency Graph"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{relations.length}</p>
            <p className="text-xs text-muted-foreground">{lang === "bn" ? "মোট রিলেশন (গ্রাফ ট্রাভার্সাল ডেপথ: ৩)" : "Total relations (traversal depth: 3)"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-primary" />
              {lang === "bn" ? "ভার্সন হিস্টোরি" : "Version History"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{history.length}</p>
            <p className="text-xs text-muted-foreground">{lang === "bn" ? "মোট স্ন্যাপশট (সফট ডিলিট + অটো-ভার্সন)" : "Total snapshots (soft-delete + auto-version)"}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};


const SystemDnaTab = () => {
  const { lang } = useLanguage();
  const [populating, setPopulating] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);

  const { data: dnaEntries = [], isLoading, refetch } = useQuery({
    queryKey: ["system_dna_entries"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_dna")
        .select("*")
        .order("category")
        .order("entity_name");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });

  const handlePopulate = async () => {
    setPopulating(true);
    try {
      const { data, error } = await supabase.functions.invoke("populate-system-dna");
      if (error) throw error;
      setLastResult(data);
      refetch();
    } catch (e: any) {
      setLastResult({ status: "error", message: e?.message });
    } finally {
      setPopulating(false);
    }
  };

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    dnaEntries.forEach((e: any) => { counts[e.category] = (counts[e.category] || 0) + 1; });
    return counts;
  }, [dnaEntries]);

  const categoryIcons: Record<string, React.ReactNode> = {
    database_table: <Database className="w-4 h-4 text-blue-500" />,
    edge_function: <Code2 className="w-4 h-4 text-purple-500" />,
    business_rule: <Settings2 className="w-4 h-4 text-orange-500" />,
    feature_flag: <Flag className="w-4 h-4 text-emerald-500" />,
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">{lang === "bn" ? "সিস্টেম DNA ইনডেক্স" : "System DNA Index"}</h3>
          <p className="text-xs text-muted-foreground">{lang === "bn" ? "অ্যাপ্লিকেশনের আর্কিটেকচার, ডাটাবেস, এবং বিজনেস রুলসের স্ট্রাকচারড ইনডেক্স" : "Structured index of app architecture, database, and business rules"}</p>
        </div>
        <Button size="sm" onClick={handlePopulate} disabled={populating} className="gap-1.5">
          <Dna className={`w-4 h-4 ${populating ? "animate-spin" : ""}`} />
          {populating ? (lang === "bn" ? "পপুলেট হচ্ছে..." : "Populating...") : (lang === "bn" ? "DNA পপুলেট করুন" : "Populate DNA")}
        </Button>
      </div>

      {lastResult && (
        <Card className={lastResult.status === "success" ? "border-emerald-500/50" : "border-destructive/50"}>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              {lastResult.status === "success" ? <CheckCircle className="w-4 h-4 text-emerald-500" /> : <XCircle className="w-4 h-4 text-destructive" />}
              <span className="text-sm font-medium">{lastResult.message}</span>
            </div>
            {lastResult.stats && (
              <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                <span>📊 {lang === "bn" ? "টেবিল" : "Tables"}: {lastResult.stats.tables}</span>
                <span>⚡ {lang === "bn" ? "এজ ফাংশন" : "Edge Fns"}: {lastResult.stats.edge_functions}</span>
                <span>📋 {lang === "bn" ? "বিজনেস রুল" : "Rules"}: {lastResult.stats.business_rules}</span>
                <span>🚩 {lang === "bn" ? "ফিচার ফ্ল্যাগ" : "Flags"}: {lastResult.stats.feature_flags}</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Object.entries(categoryCounts).map(([cat, count]) => (
          <Card key={cat}>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2">
                {categoryIcons[cat] || <Info className="w-4 h-4" />}
                <div>
                  <p className="text-xl font-bold">{count}</p>
                  <p className="text-xs text-muted-foreground capitalize">{cat.replace(/_/g, " ")}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* DNA Entries Table */}
      {isLoading ? (
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <MetricCardSkeleton key={i} />)}
        </div>
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{lang === "bn" ? `মোট ${dnaEntries.length} এন্ট্রি ইনডেক্সড` : `${dnaEntries.length} Total Entries Indexed`}</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[140px]">{lang === "bn" ? "ক্যাটাগরি" : "Category"}</TableHead>
                    <TableHead>{lang === "bn" ? "নাম" : "Name"}</TableHead>
                    <TableHead className="hidden md:table-cell">{lang === "bn" ? "বিবরণ" : "Description"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dnaEntries.map((entry: any) => (
                    <TableRow key={entry.id}>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          {categoryIcons[entry.category] || <Info className="w-3 h-3" />}
                          <Badge variant="outline" className="text-[10px]">{entry.category.replace(/_/g, " ")}</Badge>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{entry.entity_name}</TableCell>
                      <TableCell className="hidden md:table-cell text-xs text-muted-foreground max-w-[300px] truncate">{entry.description}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

  if (isLoading) {
    return (
      <AppLayout>
        <PageHeader title={lang === "bn" ? "সিস্টেম মনিটরিং" : "System Monitoring"} description={lang === "bn" ? "সার্ভার স্বাস্থ্য ও ডেলিভারি পরিসংখ্যান" : "Server health & delivery metrics"} badge={lang === "bn" ? "🖥️ সিস্টেম অপস" : "🖥️ System Ops"} />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          {Array.from({ length: 8 }).map((_, i) => <MetricCardSkeleton key={i} />)}
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <PageHeader
        title={lang === "bn" ? "সিস্টেম মনিটরিং" : "System Monitoring"}
        description={lang === "bn" ? "ডেলিভারি, ক্রন জব, লাইভ হেলথ, অ্যানোমালি ইন্টেলিজেন্স" : "Delivery, cron jobs, live health & anomaly intelligence"}
        badge={lang === "bn" ? "🖥️ সিস্টেম অপস" : "🖥️ System Ops"}
        actions={
          <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={refetchAll} disabled={isFetching}>
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
            {lang === "bn" ? "রিফ্রেশ" : "Refresh"}
          </Button>
        }
      />

      <Tabs defaultValue="health">
        <TabsList className="flex-wrap">
          <TabsTrigger value="health" className="gap-1.5">
            <HeartPulse className="w-3.5 h-3.5" />
            {lang === "bn" ? "লাইভ হেলথ" : "Live Health"}
          </TabsTrigger>
          <TabsTrigger value="overview">{lang === "bn" ? "ওভারভিউ" : "Overview"}</TabsTrigger>
          <TabsTrigger value="anomaly" className="gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5" />
            {lang === "bn" ? "অ্যানোমালি" : "Anomaly Intel"}
          </TabsTrigger>
          <TabsTrigger value="integrity" className="gap-1.5">
            <Activity className="w-3.5 h-3.5" />
            {lang === "bn" ? "ইন্টেগ্রিটি" : "Ledger Integrity"}
          </TabsTrigger>
          <TabsTrigger value="launch" className="gap-1.5">
            <Rocket className="w-3.5 h-3.5" />
            {lang === "bn" ? "লঞ্চ রেডিনেস" : "Launch Readiness"}
          </TabsTrigger>
          <TabsTrigger value="dna" className="gap-1.5">
            <Dna className="w-3.5 h-3.5" />
            {lang === "bn" ? "সিস্টেম DNA" : "System DNA"}
          </TabsTrigger>
          <TabsTrigger value="ai-knowledge" className="gap-1.5">
            <BrainCircuit className="w-3.5 h-3.5" />
            {lang === "bn" ? "AI নলেজ" : "AI Knowledge"}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="health" className="space-y-6">
          <LiveHealthTab />
        </TabsContent>

        <TabsContent value="overview" className="space-y-6">
          {/* Delivery KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
            <MetricCard title={lang === "bn" ? "মোট বিজ্ঞপ্তি" : "Total Notifications"} value={stats.total} icon={<Activity className="w-5 h-5" />} />
            <MetricCard title={lang === "bn" ? "সফল ডেলিভারি" : "Delivered"} value={stats.sent} subtitle={`${stats.deliveryRate.toFixed(1)}% ${lang === "bn" ? "হার" : "rate"}`} icon={<CheckCircle className="w-5 h-5" />} variant="success" />
            <MetricCard title={lang === "bn" ? "ব্যর্থ" : "Failed"} value={stats.failed} subtitle={`${stats.retried} ${lang === "bn" ? "পুনরায় চেষ্টা" : "retried"}`} icon={<XCircle className="w-5 h-5" />} variant="destructive" />
            <MetricCard title={lang === "bn" ? "অপেক্ষমান" : "Queued"} value={stats.queued} icon={<Clock className="w-5 h-5" />} variant="warning" />
          </div>

          {/* System Health Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
            <div className="card-elevated p-5">
              <div className="flex items-center gap-2 mb-3">
                <Zap className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-bold text-card-foreground">{lang === "bn" ? "ডেলিভারি রেট" : "Delivery Rate"}</h3>
              </div>
              <div className="text-center mb-3">
                <p className={`text-4xl font-extrabold ${stats.deliveryRate >= 90 ? "text-success" : stats.deliveryRate >= 70 ? "text-yellow-500" : "text-destructive"}`}>
                  {stats.deliveryRate.toFixed(1)}%
                </p>
              </div>
              <Progress value={stats.deliveryRate} className="h-3 rounded-full" />
              <div className="flex justify-between text-xs text-muted-foreground mt-2">
                <span>SMS: {stats.sms}</span>
                <span>WhatsApp: {stats.whatsapp}</span>
              </div>
            </div>

            <div className="card-elevated p-5">
              <div className="flex items-center gap-2 mb-3">
                <BarChart3 className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-bold text-card-foreground">{lang === "bn" ? "ঋণ পোর্টফোলিও" : "Loan Portfolio"}</h3>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">{lang === "bn" ? "সক্রিয়" : "Active"}</span>
                  <Badge variant="secondary" className="text-xs">{loanHealth.active}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">{lang === "bn" ? "বন্ধ" : "Closed"}</span>
                  <Badge variant="secondary" className="text-xs">{loanHealth.closed}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-destructive">{lang === "bn" ? "ডিফল্ট" : "Defaulted"}</span>
                  <Badge variant="destructive" className="text-xs">{loanHealth.defaulted}</Badge>
                </div>
                {loanHealth.total > 0 && (
                  <Progress value={((loanHealth.active) / loanHealth.total) * 100} className="h-2" />
                )}
              </div>
            </div>

            <div className="card-elevated p-5">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-4 h-4 text-destructive" />
                <h3 className="text-sm font-bold text-card-foreground">{lang === "bn" ? "ব্যর্থতার ধরন" : "Failure Breakdown"}</h3>
              </div>
              {failedByEvent.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">{lang === "bn" ? "কোনো ব্যর্থতা নেই 🎉" : "No failures 🎉"}</p>
              ) : (
                <div className="space-y-2">
                  {failedByEvent.map(([event, count]) => (
                    <div key={event} className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground truncate max-w-[140px]">{event}</span>
                      <Badge variant="destructive" className="text-[10px]">{count}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Recent Cron */}
          <div className="card-elevated overflow-hidden">
            <div className="p-4 border-b border-border flex items-center gap-2">
              <Server className="w-4 h-4 text-primary" />
              <h3 className="text-base font-bold text-card-foreground">{lang === "bn" ? "সাম্প্রতিক ব্যাকগ্রাউন্ড কাজ" : "Recent Background Jobs"}</h3>
            </div>
            {cronRuns.length === 0 ? (
              <div className="p-8 text-center">
                <Server className="w-10 h-10 mx-auto text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground">{lang === "bn" ? "কোনো ক্রন লগ পাওয়া যায়নি" : "No cron logs found"}</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{lang === "bn" ? "কাজের ধরন" : "Job Type"}</TableHead>
                    <TableHead>{lang === "bn" ? "সময়" : "Time"}</TableHead>
                    <TableHead>{lang === "bn" ? "বিবরণ" : "Details"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cronRuns.map((run, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <Badge variant="outline" className="text-xs font-medium">
                          {cronLabels[run.type]?.[lang] ?? run.type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <p className="text-xs text-muted-foreground">
                          {new Date(run.time).toLocaleDateString(lang === "bn" ? "bn-BD" : "en-US", { day: "numeric", month: "short" })}
                          {" "}
                          {new Date(run.time).toLocaleTimeString(lang === "bn" ? "bn-BD" : "en-US", { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </TableCell>
                      <TableCell>
                        {run.details && (
                          <span className="text-xs text-muted-foreground">
                            {run.type === "predict_loan_risk" && run.details.total_scored != null && `${run.details.total_scored} scored, ${run.details.high_risk_count} high-risk`}
                            {run.type === "savings_reconciliation_alert" && run.details.mismatch_count != null && `${run.details.mismatch_count} mismatches`}
                            {run.type === "ledger_entry" && run.details.entry_count != null && `${run.details.entry_count} entries`}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </TabsContent>

        <TabsContent value="anomaly">
          <AnomalyIntelligencePanel />
        </TabsContent>

        <TabsContent value="integrity">
          <LedgerIntegrityPanel />
        </TabsContent>

        <TabsContent value="launch">
          <LaunchReadinessPanel />
        </TabsContent>
        <TabsContent value="dna">
          <SystemDnaTab />
        </TabsContent>
        <TabsContent value="ai-knowledge">
          <AiKnowledgeTab />
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
};

export default MonitoringDashboard;
