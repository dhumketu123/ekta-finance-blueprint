import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import PageHeader from "@/components/PageHeader";
import { useKnowledgeNodes, useKnowledgeStats, useSyncLogs, useRunKnowledgeSync } from "@/hooks/useKnowledgeGraph";
import { useKnowledgeDashboardAutoRefresh } from "@/hooks/useKnowledgeDashboardAutoRefresh";
import { useSystemHealth, useHealthTrend, useHealthRealtime } from "@/hooks/useSystemHealth";
import {
  Brain, Database, Code2, Shield, Activity,
  RefreshCw, Layers, Zap, GitBranch, BarChart3,
  CheckCircle2, AlertTriangle, Clock, Cpu, HeartPulse,
  ChevronDown, ChevronLeft, ChevronRight, Info,
} from "lucide-react";
import { format } from "date-fns";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Legend } from "recharts";

const NODE_TYPE_CONFIG: Record<string, { icon: typeof Brain; label: string; color: string }> = {
  table: { icon: Database, label: "টেবিল", color: "bg-blue-500/15 text-blue-600" },
  trigger: { icon: Zap, label: "ট্রিগার", color: "bg-amber-500/15 text-amber-600" },
  function: { icon: Code2, label: "ফাংশন", color: "bg-purple-500/15 text-purple-600" },
  component: { icon: Layers, label: "কম্পোনেন্ট", color: "bg-emerald-500/15 text-emerald-600" },
  hook: { icon: GitBranch, label: "হুক", color: "bg-cyan-500/15 text-cyan-600" },
  business_rule: { icon: Shield, label: "বিজনেস রুল", color: "bg-red-500/15 text-red-600" },
  kpi: { icon: BarChart3, label: "KPI", color: "bg-orange-500/15 text-orange-600" },
  edge_function: { icon: Cpu, label: "এজ ফাংশন", color: "bg-indigo-500/15 text-indigo-600" },
};

const CriticalityBar = ({ value }: { value: number }) => (
  <div className="flex items-center gap-2">
    <Progress value={value * 10} className="h-2 w-16" />
    <span className="text-xs font-mono text-muted-foreground">{value}/10</span>
  </div>
);

const STATUS_ICON: Record<string, string> = { pass: "✓", warn: "⚠", fail: "✗" };
const STATUS_COLOR: Record<string, string> = {
  pass: "text-emerald-600",
  warn: "text-amber-500",
  fail: "text-destructive",
};

export default function KnowledgeDashboard() {
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedType, setSelectedType] = useState<string | undefined>();
  const [healthExpanded, setHealthExpanded] = useState(false);

  const { data: stats, isLoading: statsLoading } = useKnowledgeStats();
  const { data: nodes = [], isLoading: nodesLoading } = useKnowledgeNodes(selectedType);
  const { data: syncLogs = [] } = useSyncLogs();
  const syncMutation = useRunKnowledgeSync();
  useKnowledgeDashboardAutoRefresh();
  const { data: health } = useSystemHealth();
  const trend = useHealthTrend(health);
  useHealthRealtime();

  const filteredNodes = useMemo(() => {
    if (!selectedType) return nodes;
    return nodes.filter((n) => n.node_type === selectedType);
  }, [nodes, selectedType]);

  const lastSync = syncLogs[0];

  // Format trend data for chart
  const chartData = useMemo(() => {
    return trend.data.map((p) => ({
      time: format(new Date(p.timestamp), "HH:mm"),
      পাস: p.pass,
      সতর্কতা: p.warn,
      ব্যর্থ: p.fail,
    }));
  }, [trend.data]);

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <PageHeader
          title="🧠 AI Knowledge Engine"
          description="সিস্টেম নলেজ গ্রাফ ও ডেটা ফাউন্ডেশন"
        />
        <Button
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending}
          className="gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${syncMutation.isPending ? "animate-spin" : ""}`} />
          {syncMutation.isPending ? "সিঙ্ক হচ্ছে..." : "সিঙ্ক চালান"}
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Brain className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats?.totalNodes ?? "—"}</p>
                <p className="text-xs text-muted-foreground">মোট নোড</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-destructive/10">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats?.highCriticalCount ?? "—"}</p>
                <p className="text-xs text-muted-foreground">উচ্চ-ক্রিটিক্যাল</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Activity className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats?.avgCriticality ?? "—"}</p>
                <p className="text-xs text-muted-foreground">গড় ক্রিটিক্যালিটি</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <CheckCircle2 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {lastSync ? (lastSync.status === "completed" ? "✅" : "⏳") : "—"}
                </p>
                <p className="text-xs text-muted-foreground">শেষ সিঙ্ক</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Expandable System Health Card with max-height scroll + aria */}
      {health && (
        <Collapsible open={healthExpanded} onOpenChange={setHealthExpanded}>
          <Card
            className={
              health.status === "unhealthy" ? "border-destructive"
              : health.status === "degraded" ? "border-amber-500"
              : "border-emerald-500/50"
            }
            role="region"
            aria-label="সিস্টেম হেলথ স্ট্যাটাস"
          >
            <CollapsibleTrigger asChild>
              <CardContent
                className="pt-4 pb-3 cursor-pointer hover:bg-muted/30 transition-colors"
                role="button"
                aria-expanded={healthExpanded}
                aria-controls="health-details"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setHealthExpanded(!healthExpanded);
                  }
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <HeartPulse className={`h-5 w-5 ${
                      health.status === "healthy" ? "text-emerald-500"
                      : health.status === "degraded" ? "text-amber-500"
                      : "text-destructive"
                    }`} aria-hidden="true" />
                    <div>
                      <p className="font-semibold text-sm">
                        সিস্টেম হেলথ: {health.status === "healthy" ? "✅ সুস্থ" : health.status === "degraded" ? "⚠️ ক্ষয়প্রাপ্ত" : "❌ অসুস্থ"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        ✓ {health.summary.pass} পাস · ⚠ {health.summary.warn} সতর্কতা · ✗ {health.summary.fail} ব্যর্থ · {health.total_latency_ms}ms
                      </p>
                    </div>
                  </div>
                  <ChevronDown
                    className={`h-4 w-4 text-muted-foreground transition-transform ${healthExpanded ? "rotate-180" : ""}`}
                    aria-hidden="true"
                  />
                </div>
              </CardContent>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent id="health-details" className="pt-0 pb-4 border-t">
                <ScrollArea className="max-h-64 mt-3">
                  <div
                    className="grid grid-cols-1 md:grid-cols-2 gap-3"
                    role="list"
                    aria-label="হেলথ চেক তালিকা"
                  >
                    <TooltipProvider>
                      {health.checks?.map((check) => (
                        <Tooltip key={check.name}>
                          <TooltipTrigger asChild>
                            <div
                              className="flex items-center justify-between p-2 rounded-md bg-muted/40 focus:ring-2 focus:ring-primary focus:outline-none"
                              role="listitem"
                              tabIndex={0}
                              aria-label={`${check.name}: ${check.status === "pass" ? "পাস" : check.status === "warn" ? "সতর্কতা" : "ব্যর্থ"}`}
                            >
                              <div className="flex items-center gap-2">
                                <span className={`text-sm font-bold ${STATUS_COLOR[check.status]}`} aria-hidden="true">
                                  {STATUS_ICON[check.status]}
                                </span>
                                <span className="text-sm font-medium">{check.name}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                {check.latency_ms != null && (
                                  <span className="text-xs text-muted-foreground">{check.latency_ms}ms</span>
                                )}
                                <Info className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                              </div>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs">
                            <p className="text-xs">{check.detail || "কোনো বিবরণ নেই"}</p>
                          </TooltipContent>
                        </Tooltip>
                      ))}
                    </TooltipProvider>
                  </div>
                </ScrollArea>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}

      {/* Type Distribution */}
      {stats?.byType && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">নোড বিতরণ (টাইপ অনুযায়ী)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              <Badge
                variant={!selectedType ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => setSelectedType(undefined)}
              >
                সব ({stats.totalNodes})
              </Badge>
              {Object.entries(stats.byType).map(([type, count]) => {
                const cfg = NODE_TYPE_CONFIG[type];
                return (
                  <Badge
                    key={type}
                    variant={selectedType === type ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => setSelectedType(type === selectedType ? undefined : type)}
                  >
                    {cfg?.label || type} ({count})
                  </Badge>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">নোড তালিকা</TabsTrigger>
          <TabsTrigger value="sync">সিঙ্ক লগ</TabsTrigger>
          <TabsTrigger value="trend">হেলথ ট্রেন্ড</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>টাইপ</TableHead>
                      <TableHead>নাম</TableHead>
                      <TableHead>ক্যাটাগরি</TableHead>
                      <TableHead>ক্রিটিক্যালিটি</TableHead>
                      <TableHead>সম্পর্ক</TableHead>
                      <TableHead>শেষ সিঙ্ক</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(nodesLoading || statsLoading) ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          লোড হচ্ছে...
                        </TableCell>
                      </TableRow>
                    ) : filteredNodes.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          কোনো নোড নেই — "সিঙ্ক চালান" ক্লিক করুন
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredNodes.slice(0, 50).map((node) => {
                        const cfg = NODE_TYPE_CONFIG[node.node_type];
                        const Icon = cfg?.icon || Brain;
                        return (
                          <TableRow key={node.id}>
                            <TableCell>
                              <Badge className={cfg?.color || "bg-muted"} variant="secondary">
                                <Icon className="h-3 w-3 mr-1" />
                                {cfg?.label || node.node_type}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-medium">{node.node_label}</TableCell>
                            <TableCell className="text-muted-foreground text-sm">{node.category}</TableCell>
                            <TableCell><CriticalityBar value={node.criticality} /></TableCell>
                            <TableCell>
                              <span className="text-xs text-muted-foreground">
                                {node.relationships?.length || 0} টি
                              </span>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {format(new Date(node.last_synced_at), "dd MMM HH:mm")}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sync" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>স্ট্যাটাস</TableHead>
                    <TableHead>টাইপ</TableHead>
                    <TableHead>নোড</TableHead>
                    <TableHead>সময়</TableHead>
                    <TableHead>তারিখ</TableHead>
                    <TableHead>ত্রুটি</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {syncLogs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        কোনো সিঙ্ক লগ নেই
                      </TableCell>
                    </TableRow>
                  ) : (
                    syncLogs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell>
                          <Badge variant={log.status === "completed" ? "default" : log.status === "running" ? "secondary" : "destructive"}>
                            {log.status === "completed" ? "✅ সম্পূর্ণ" : log.status === "running" ? "⏳ চলছে" : "❌ ব্যর্থ"}
                          </Badge>
                        </TableCell>
                        <TableCell>{log.sync_type}</TableCell>
                        <TableCell>{log.nodes_processed}</TableCell>
                        <TableCell>{log.duration_ms ? `${log.duration_ms}ms` : "—"}</TableCell>
                        <TableCell className="text-xs">
                          {format(new Date(log.started_at), "dd MMM yyyy HH:mm")}
                        </TableCell>
                        <TableCell>
                          {log.errors && log.errors.length > 0 ? (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger>
                                  <Badge variant="destructive" className="text-xs">{log.errors.length} ত্রুটি</Badge>
                                </TooltipTrigger>
                                <TooltipContent side="left" className="max-w-sm">
                                  <ul className="text-xs space-y-1">
                                    {log.errors.slice(0, 5).map((e, i) => <li key={i}>• {e}</li>)}
                                    {log.errors.length > 5 && <li>...আরো {log.errors.length - 5}টি</li>}
                                  </ul>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 24h Health Trend Tab with pagination */}
        <TabsContent value="trend" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">২৪ ঘণ্টার হেলথ ট্রেন্ড</CardTitle>
                {trend.totalPages > 1 && (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      disabled={trend.page >= trend.totalPages - 1}
                      onClick={trend.nextPage}
                      aria-label="পূর্ববর্তী পৃষ্ঠা"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      {trend.page + 1}/{trend.totalPages}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      disabled={trend.page <= 0}
                      onClick={trend.prevPage}
                      aria-label="পরবর্তী পৃষ্ঠা"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {chartData.length < 2 ? (
                <p className="text-center py-8 text-muted-foreground text-sm">
                  ট্রেন্ড ডেটা সংগ্রহ হচ্ছে — কিছুক্ষণ পর আবার দেখুন
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={250}>
                  <AreaChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="time" className="text-xs" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Legend />
                    <Area type="monotone" dataKey="পাস" stackId="1" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.3)" />
                    <Area type="monotone" dataKey="সতর্কতা" stackId="1" stroke="#f59e0b" fill="#f59e0b33" />
                    <Area type="monotone" dataKey="ব্যর্থ" stackId="1" stroke="hsl(var(--destructive))" fill="hsl(var(--destructive) / 0.3)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
