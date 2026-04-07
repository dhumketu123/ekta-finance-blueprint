import { useState, useMemo, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import PageHeader from "@/components/PageHeader";
import { useKnowledgeNodes, useKnowledgeStats, useSyncLogs, useRunKnowledgeSync, useKnowledgeRealtime } from "@/hooks/useKnowledgeGraph";
import { useQueryClient } from "@tanstack/react-query";
import {
  Brain, Database, Code2, Shield, Activity,
  RefreshCw, Layers, Zap, GitBranch, BarChart3,
  CheckCircle2, AlertTriangle, Clock, Cpu,
} from "lucide-react";
import { format } from "date-fns";

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

export default function KnowledgeDashboard() {
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedType, setSelectedType] = useState<string | undefined>();

  const { data: stats, isLoading: statsLoading } = useKnowledgeStats();
  const { data: nodes = [], isLoading: nodesLoading } = useKnowledgeNodes(selectedType);
  const { data: syncLogs = [] } = useSyncLogs();
  const syncMutation = useRunKnowledgeSync();
  const queryClient = useQueryClient();
  useKnowledgeRealtime();

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ["knowledge_graph"] });
      queryClient.invalidateQueries({ queryKey: ["knowledge_stats"] });
      queryClient.invalidateQueries({ queryKey: ["knowledge_sync_logs"] });
    }, 30_000);
    return () => clearInterval(interval);
  }, [queryClient]);

  const filteredNodes = useMemo(() => {
    if (!selectedType) return nodes;
    return nodes.filter((n) => n.node_type === selectedType);
  }, [nodes, selectedType]);

  const lastSync = syncLogs[0];

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
              <div className="p-2 rounded-lg bg-amber-500/10">
                <Activity className="h-5 w-5 text-amber-500" />
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
              <div className="p-2 rounded-lg bg-emerald-500/10">
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
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
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {syncLogs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        কোনো সিঙ্ক লগ নেই
                      </TableCell>
                    </TableRow>
                  ) : (
                    syncLogs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell>
                          <Badge variant={log.status === "completed" ? "default" : "destructive"}>
                            {log.status === "completed" ? "✅ সম্পূর্ণ" : log.status === "running" ? "⏳ চলছে" : "❌ ব্যর্থ"}
                          </Badge>
                        </TableCell>
                        <TableCell>{log.sync_type}</TableCell>
                        <TableCell>{log.nodes_processed}</TableCell>
                        <TableCell>{log.duration_ms ? `${log.duration_ms}ms` : "—"}</TableCell>
                        <TableCell className="text-xs">
                          {format(new Date(log.started_at), "dd MMM yyyy HH:mm")}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
