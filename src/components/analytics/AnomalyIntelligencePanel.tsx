import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useLanguage } from "@/contexts/LanguageContext";
import { toast } from "@/hooks/use-toast";
import {
  AlertTriangle, Shield, ShieldAlert, Lock, Unlock, RefreshCw,
  CheckCircle, Zap, Users, Building2, TrendingUp
} from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface AnomalyAlert {
  id: string;
  event_type: string;
  risk_score: number;
  reason: string;
  metadata: any;
  created_at: string;
  resolved: boolean;
  branch_name: string | null;
  branch_name_bn: string | null;
  officer_name: string | null;
  officer_name_bn: string | null;
  client_name: string | null;
  client_name_bn: string | null;
}

interface BranchRisk {
  branch_id: string;
  branch_name: string;
  branch_name_bn: string;
  unresolved_events: number;
  avg_risk_score: number;
  max_risk_score: number;
  critical_count: number;
  locked: boolean;
}

const eventTypeLabels: Record<string, { en: string; bn: string; icon: React.ReactNode }> = {
  UNUSUAL_PAYMENT_SPIKE: { en: "Payment Spike", bn: "পেমেন্ট স্পাইক", icon: <Zap className="w-3.5 h-3.5" /> },
  RAPID_TRANSACTIONS: { en: "Rapid Transactions", bn: "দ্রুত লেনদেন", icon: <TrendingUp className="w-3.5 h-3.5" /> },
  HIGH_RISK_OFFICER: { en: "High-Risk Officer", bn: "উচ্চ ঝুঁকি অফিসার", icon: <Users className="w-3.5 h-3.5" /> },
};

const getRiskColor = (score: number) => {
  if (score >= 80) return "text-destructive";
  if (score >= 60) return "text-orange-500";
  if (score >= 40) return "text-yellow-500";
  return "text-muted-foreground";
};

const getRiskBadge = (score: number): "destructive" | "secondary" | "default" => {
  if (score >= 80) return "destructive";
  if (score >= 60) return "destructive";
  return "secondary";
};

const AnomalyIntelligencePanel = () => {
  const { lang } = useLanguage();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("alerts");

  const { data: alertsData, isLoading: alertsLoading, refetch: refetchAlerts } = useQuery({
    queryKey: ["anomaly-alerts"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_anomaly_alerts" as any, { p_limit: 50 });
      if (error) throw error;
      return (data as AnomalyAlert[]) || [];
    },
    staleTime: 30_000,
  });

  const { data: branchRiskData, isLoading: branchLoading } = useQuery({
    queryKey: ["branch-risk-summary"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_branch_risk_summary" as any);
      if (error) throw error;
      return (data as BranchRisk[]) || [];
    },
    staleTime: 60_000,
  });

  const { data: officerRiskData } = useQuery({
    queryKey: ["officer-risk-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("officer_risk_profile" as any)
        .select("*, profiles:officer_id(name_en, name_bn)")
        .order("risk_score", { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data as any[]) || [];
    },
    staleTime: 60_000,
  });

  const resolveAlert = useMutation({
    mutationFn: async (eventId: string) => {
      const { data, error } = await supabase.rpc("resolve_anomaly_alert" as any, { p_event_id: eventId });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast({ title: lang === "bn" ? "সমাধান হয়েছে" : "Resolved", description: lang === "bn" ? "সতর্কতা সমাধান করা হয়েছে" : "Alert resolved" });
      queryClient.invalidateQueries({ queryKey: ["anomaly-alerts"] });
      queryClient.invalidateQueries({ queryKey: ["branch-risk-summary"] });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const runOfficerScoring = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("calculate_monthly_officer_risk" as any);
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      toast({ title: lang === "bn" ? "সফল" : "Success", description: `${data?.officers_scored || 0} officers scored` });
      queryClient.invalidateQueries({ queryKey: ["officer-risk-profiles"] });
      queryClient.invalidateQueries({ queryKey: ["anomaly-alerts"] });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const alerts = alertsData || [];
  const unresolvedAlerts = alerts.filter((a) => !a.resolved);
  const branches = branchRiskData || [];
  const lockedBranches = branches.filter((b) => b.locked);

  return (
    <div className="space-y-6">
      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <ShieldAlert className="w-4 h-4 text-destructive" />
              <span className="text-xs font-semibold text-muted-foreground">
                {lang === "bn" ? "অমীমাংসিত সতর্কতা" : "Unresolved Alerts"}
              </span>
            </div>
            <p className="text-2xl font-extrabold text-foreground">{unresolvedAlerts.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Lock className="w-4 h-4 text-destructive" />
              <span className="text-xs font-semibold text-muted-foreground">
                {lang === "bn" ? "লকড ব্রাঞ্চ" : "Locked Branches"}
              </span>
            </div>
            <p className="text-2xl font-extrabold text-foreground">{lockedBranches.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Users className="w-4 h-4 text-orange-500" />
              <span className="text-xs font-semibold text-muted-foreground">
                {lang === "bn" ? "ঝুঁকিপূর্ণ অফিসার" : "Risky Officers"}
              </span>
            </div>
            <p className="text-2xl font-extrabold text-foreground">
              {(officerRiskData || []).filter((o: any) => o.risk_score >= 60).length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Shield className="w-4 h-4 text-primary" />
              <span className="text-xs font-semibold text-muted-foreground">
                {lang === "bn" ? "মোট ইভেন্ট" : "Total Events"}
              </span>
            </div>
            <p className="text-2xl font-extrabold text-foreground">{alerts.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2 flex-wrap">
        <Button variant="outline" size="sm" onClick={() => refetchAlerts()} disabled={alertsLoading}>
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${alertsLoading ? "animate-spin" : ""}`} />
          {lang === "bn" ? "রিফ্রেশ" : "Refresh"}
        </Button>
        <Button variant="outline" size="sm" onClick={() => runOfficerScoring.mutate()} disabled={runOfficerScoring.isPending}>
          <Users className="w-3.5 h-3.5 mr-1.5" />
          {lang === "bn" ? "অফিসার স্কোরিং চালান" : "Run Officer Scoring"}
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="alerts">
            {lang === "bn" ? "সতর্কতা" : "Alerts"}
            {unresolvedAlerts.length > 0 && (
              <Badge variant="destructive" className="ml-1.5 text-[10px]">{unresolvedAlerts.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="branches">
            <Building2 className="w-3.5 h-3.5 mr-1" />
            {lang === "bn" ? "ব্রাঞ্চ ঝুঁকি" : "Branch Risk"}
          </TabsTrigger>
          <TabsTrigger value="officers">
            <Users className="w-3.5 h-3.5 mr-1" />
            {lang === "bn" ? "অফিসার প্রোফাইল" : "Officer Profiles"}
          </TabsTrigger>
        </TabsList>

        {/* Alerts Tab */}
        <TabsContent value="alerts">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-destructive" />
                {lang === "bn" ? "অ্যানোমালি সতর্কতা" : "Anomaly Alerts"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {alerts.length === 0 ? (
                <div className="text-center py-8">
                  <Shield className="w-10 h-10 mx-auto text-muted-foreground/30 mb-2" />
                  <p className="text-sm text-muted-foreground">
                    {lang === "bn" ? "কোনো সতর্কতা নেই 🎉" : "No anomalies detected 🎉"}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {alerts.slice(0, 20).map((alert) => {
                    const typeInfo = eventTypeLabels[alert.event_type] || { en: alert.event_type, bn: alert.event_type, icon: <AlertTriangle className="w-3.5 h-3.5" /> };
                    return (
                      <div
                        key={alert.id}
                        className={`flex items-start gap-3 p-3 rounded-lg border ${alert.resolved ? "bg-muted/30 border-border" : "bg-destructive/5 border-destructive/20"}`}
                      >
                        <div className="mt-0.5">{typeInfo.icon}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="font-semibold text-sm">{lang === "bn" ? typeInfo.bn : typeInfo.en}</span>
                            <Badge variant={getRiskBadge(alert.risk_score)} className="text-[10px]">
                              {alert.risk_score}
                            </Badge>
                            {alert.resolved && (
                              <Badge variant="secondary" className="text-[10px]">
                                <CheckCircle className="w-2.5 h-2.5 mr-0.5" /> {lang === "bn" ? "সমাধান" : "Resolved"}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">{alert.reason}</p>
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                            {alert.officer_name && (
                              <span>👤 {lang === "bn" ? alert.officer_name_bn : alert.officer_name}</span>
                            )}
                            {alert.branch_name && (
                              <span>🏢 {lang === "bn" ? alert.branch_name_bn : alert.branch_name}</span>
                            )}
                            <span>{new Date(alert.created_at).toLocaleDateString(lang === "bn" ? "bn-BD" : "en-US", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                          </div>
                        </div>
                        {!alert.resolved && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="shrink-0 text-xs"
                            onClick={() => resolveAlert.mutate(alert.id)}
                            disabled={resolveAlert.isPending}
                          >
                            <CheckCircle className="w-3.5 h-3.5 mr-1" />
                            {lang === "bn" ? "সমাধান" : "Resolve"}
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Branch Risk Tab */}
        <TabsContent value="branches">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="w-4 h-4 text-primary" />
                {lang === "bn" ? "ব্রাঞ্চ ঝুঁকি সারসংক্ষেপ" : "Branch Risk Summary"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {branches.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  {lang === "bn" ? "কোনো ব্রাঞ্চ ডেটা নেই" : "No branch data"}
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{lang === "bn" ? "ব্রাঞ্চ" : "Branch"}</TableHead>
                      <TableHead>{lang === "bn" ? "ঝুঁকি স্কোর" : "Risk Score"}</TableHead>
                      <TableHead>{lang === "bn" ? "অমীমাংসিত" : "Unresolved"}</TableHead>
                      <TableHead>{lang === "bn" ? "গুরুতর" : "Critical"}</TableHead>
                      <TableHead>{lang === "bn" ? "স্থিতি" : "Status"}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {branches.map((b) => (
                      <TableRow key={b.branch_id}>
                        <TableCell className="font-medium text-sm">
                          {lang === "bn" ? b.branch_name_bn : b.branch_name}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress value={b.max_risk_score} className="h-2 w-16" />
                            <span className={`text-sm font-bold ${getRiskColor(b.max_risk_score)}`}>
                              {b.max_risk_score}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={b.unresolved_events > 0 ? "destructive" : "secondary"} className="text-xs">
                            {b.unresolved_events}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className={b.critical_count > 0 ? "text-destructive font-bold" : "text-muted-foreground"}>
                            {b.critical_count}
                          </span>
                        </TableCell>
                        <TableCell>
                          {b.locked ? (
                            <Badge variant="destructive" className="text-xs gap-1">
                              <Lock className="w-3 h-3" /> {lang === "bn" ? "লকড" : "Locked"}
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs gap-1">
                              <Unlock className="w-3 h-3" /> {lang === "bn" ? "সক্রিয়" : "Active"}
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Officer Profiles Tab */}
        <TabsContent value="officers">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" />
                {lang === "bn" ? "অফিসার ঝুঁকি প্রোফাইল" : "Officer Risk Profiles"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(officerRiskData || []).length === 0 ? (
                <div className="text-center py-6">
                  <p className="text-sm text-muted-foreground mb-3">
                    {lang === "bn" ? "কোনো ডেটা নেই — স্কোরিং চালান" : "No data — run scoring first"}
                  </p>
                  <Button variant="outline" size="sm" onClick={() => runOfficerScoring.mutate()} disabled={runOfficerScoring.isPending}>
                    <Users className="w-3.5 h-3.5 mr-1.5" />
                    {lang === "bn" ? "এখন চালান" : "Run Now"}
                  </Button>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{lang === "bn" ? "অফিসার" : "Officer"}</TableHead>
                      <TableHead>{lang === "bn" ? "ঝুঁকি স্কোর" : "Risk Score"}</TableHead>
                      <TableHead>{lang === "bn" ? "বিলম্ব %" : "Late %"}</TableHead>
                      <TableHead>{lang === "bn" ? "সমন্বয়" : "Adjustments"}</TableHead>
                      <TableHead>{lang === "bn" ? "স্তর" : "Level"}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(officerRiskData || []).map((o: any) => (
                      <TableRow key={o.id}>
                        <TableCell className="font-medium text-sm">
                          {lang === "bn" ? o.profiles?.name_bn : o.profiles?.name_en}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress value={o.risk_score} className="h-2 w-16" />
                            <span className={`text-sm font-bold ${getRiskColor(o.risk_score)}`}>
                              {o.risk_score}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{o.late_collection_pct}%</TableCell>
                        <TableCell className="text-sm">{o.adjustment_frequency}</TableCell>
                        <TableCell>
                          <Badge
                            variant={o.risk_level === "critical" ? "destructive" : o.risk_level === "high" ? "destructive" : "secondary"}
                            className="text-xs capitalize"
                          >
                            {o.risk_level}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AnomalyIntelligencePanel;
