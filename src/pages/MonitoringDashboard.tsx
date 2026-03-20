import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";
import { MetricCard } from "@/components/dashboard/MetricCard";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { MetricCardSkeleton } from "@/components/ui/skeleton";
import { Activity, CheckCircle, XCircle, Clock, RefreshCw, Zap, AlertTriangle, BarChart3, Server, ShieldAlert, Rocket } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AnomalyIntelligencePanel from "@/components/analytics/AnomalyIntelligencePanel";
import LedgerIntegrityPanel from "@/components/analytics/LedgerIntegrityPanel";
import LaunchReadinessPanel from "@/components/ops/LaunchReadinessPanel";

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

const MonitoringDashboard = () => {
  const { lang } = useLanguage();
  const { data: notifLogs, isLoading: notifLoading, refetch: refetchNotif, isFetching } = useNotificationStats();
  const { data: auditLogs, isLoading: auditLoading, refetch: refetchAudit } = useAuditLogs();
  const { data: loanStats, isLoading: loanLoading } = useLoanStats();

  const isLoading = notifLoading || auditLoading || loanLoading;

  // Notification KPIs
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

  // Loan health
  const loanHealth = useMemo(() => {
    if (!loanStats) return { active: 0, closed: 0, defaulted: 0, total: 0 };
    const active = loanStats.filter(l => l.status === "active").length;
    const closed = loanStats.filter(l => l.status === "closed").length;
    const defaulted = loanStats.filter(l => l.status === "default").length;
    return { active, closed, defaulted, total: loanStats.length };
  }, [loanStats]);

  // Recent cron runs
  const cronRuns = useMemo(() => {
    if (!auditLogs) return [];
    return auditLogs.map(log => ({
      type: log.action_type,
      time: log.created_at,
      details: log.details as any,
    }));
  }, [auditLogs]);

  // Top failed event types
  const failedByEvent = useMemo(() => {
    if (!notifLogs) return [];
    const map: Record<string, number> = {};
    notifLogs.filter(n => n.delivery_status === "failed").forEach(n => {
      map[n.event_type] = (map[n.event_type] || 0) + 1;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [notifLogs]);

  const refetchAll = () => { refetchNotif(); refetchAudit(); };

  const cronLabels: Record<string, { en: string; bn: string }> = {
    predict_loan_risk: { en: "Risk Scoring", bn: "ঝুঁকি স্কোরিং" },
    savings_reconciliation_alert: { en: "Savings Reconciliation", bn: "সঞ্চয় সমন্বয়" },
    ledger_entry: { en: "Ledger Entry", bn: "লেজার এন্ট্রি" },
  };

  if (isLoading) {
    return (
      <AppLayout>
        <PageHeader title={lang === "bn" ? "সিস্টেম মনিটরিং" : "System Monitoring"} description={lang === "bn" ? "সার্ভার স্বাস্থ্য ও ডেলিভারি পরিসংখ্যান" : "Server health & delivery metrics"} />
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
        description={lang === "bn" ? "ডেলিভারি, ক্রন জব, অ্যানোমালি ইন্টেলিজেন্স" : "Delivery, cron jobs & anomaly intelligence"}
        actions={
          <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={refetchAll} disabled={isFetching}>
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
            {lang === "bn" ? "রিফ্রেশ" : "Refresh"}
          </Button>
        }
      />

      <Tabs defaultValue="overview">
        <TabsList>
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
        </TabsList>

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
            {/* Delivery Rate Gauge */}
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

            {/* Loan Portfolio Health */}
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

            {/* Failed by Event Type */}
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

          {/* Recent Cron Job Runs */}
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
      </Tabs>
    </AppLayout>
  );
};

export default MonitoringDashboard;
